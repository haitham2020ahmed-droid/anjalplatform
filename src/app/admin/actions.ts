"use server";
/**
 * Phase 11 admin actions. Each action only parses the form; permission, school scope,
 * validation and audit are enforced inside the services (src/server/admin/*).
 */
import { revalidatePath } from "next/cache";
import { resolve } from "node:path";
import { z } from "zod";
import { env } from "@/lib/env";
import { repo, requireActor } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { archiveQuestion, createDraft, reviewQuestion, reviseQuestion, submitForReview, updateDraft, type EditorInput } from "@/server/admin/questions";
import { applyRoster, planRoster, type RosterPlan } from "@/server/admin/roster-import";

export type Result = { ok?: boolean; error?: string; message?: string; temporaryPassword?: string; id?: string };
const id = z.string().min(1).max(191);
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

async function run(paths: string[], fn: () => Promise<Partial<Result> | void>): Promise<Result> {
  try {
    const r = (await fn()) ?? {};
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403 || e instanceof z.ZodError) return { error: e instanceof z.ZodError ? "Some fields are missing or invalid." : (e as Error).message };
    throw e;
  }
}

// ------------------------------------------------------------------ users

export async function createUserAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  return run(["/admin/users"], async () => {
    const r = await createUser(repo, actor, {
      role: z.enum(MANAGED_ROLES).parse(f.get("role")), username: str(f, "username"), displayName: str(f, "displayName"), email: str(f, "email") || null,
      studentNumber: str(f, "studentNumber"), gradeLevel: Number(f.get("gradeLevel") || 0), classId: str(f, "classId") || null, title: str(f, "title") || null,
    });
    return { id: r.userId, temporaryPassword: r.temporaryPassword };
  });
}

export async function updateUserAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const userId = id.parse(f.get("userId"));
  return run(["/admin/users", `/admin/users/${userId}`], () =>
    updateUser(repo, actor, userId, { displayName: str(f, "displayName"), email: str(f, "email") || null, ...(f.has("title") ? { title: str(f, "title") || null } : {}) }).then(() => ({ message: "Saved." })),
  );
}

export async function setActiveAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const userId = id.parse(f.get("userId"));
  await run(["/admin/users", `/admin/users/${userId}`], () => updateUser(repo, actor, userId, { isActive: f.get("active") === "true" }));
}

export async function teacherClassesAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "classes:manage" });
  const userId = id.parse(f.get("userId"));
  return run([`/admin/users/${userId}`], () => setTeacherClasses(repo, actor, userId, f.getAll("classId").map((v) => id.parse(v))).then(() => ({ message: "Classes saved." })));
}

export async function moveStudentAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "classes:manage" });
  const userId = id.parse(f.get("userId"));
  return run([`/admin/users/${userId}`, "/admin/users"], () => moveStudent(repo, actor, userId, str(f, "classId") || null).then(() => ({ message: "Class updated." })));
}

export async function linkParentAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "students:manage" });
  const parentUserId = id.parse(f.get("parentUserId"));
  return run([`/admin/users/${parentUserId}`], () => linkParent(repo, actor, parentUserId, id.parse(f.get("studentUserId")), str(f, "relationship") || null).then(() => ({ message: "Child linked." })));
}

export async function unlinkParentAction(f: FormData): Promise<void> {
  const actor = await requireActor({ permission: "students:manage" });
  const parentUserId = id.parse(f.get("parentUserId"));
  await run([`/admin/users/${parentUserId}`], () => unlinkParent(repo, actor, parentUserId, id.parse(f.get("studentUserId"))));
}

// --------------------------------------------------------------- settings

const numOrEmpty = (v: FormDataEntryValue | null) => (v === null || v === "" ? undefined : Number(v));

export async function engineSettingsAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "settings:engine" });
  if (f.get("reset") === "true") return run(["/admin/settings"], () => updateEngineSettings(repo, actor, { reset: true }).then(() => ({ message: "Defaults restored." })));
  const adaptive: Record<string, unknown> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("a.") && v !== "") adaptive[k.slice(2)] = v;
  const band = (k: string) => numOrEmpty(f.get(`m.bands.${k}`));
  return run(["/admin/settings"], () =>
    updateEngineSettings(repo, actor, {
      adaptive,
      mastery: {
        bands: { beginning: band("beginning") ?? 0, developing: band("developing")!, approaching: band("approaching")!, proficient: band("proficient")!, mastered: band("mastered")! },
        minAttemptsForProficient: numOrEmpty(f.get("m.minAttemptsForProficient")), minAttemptsForMastered: numOrEmpty(f.get("m.minAttemptsForMastered")),
      },
    }).then(() => ({ message: "Engine settings saved." })),
  );
}

export async function brandingAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "settings:school" });
  return run(["/admin/settings"], async () => {
    await updateBranding(repo, actor, { nameAr: str(f, "nameAr") || null });
    const file = f.get("logo");
    if (f.get("removeLogo") === "true") await removeLogo(repo, actor);
    else if (file instanceof File && file.size > 0) await uploadLogo(repo, actor, new Uint8Array(await file.arrayBuffer()), resolve(env.REPORT_BRANDING_DIR));
    return { message: "Branding saved." };
  });
}

export async function yearAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "settings:school" });
  const names = f.getAll("termName").map(String), starts = f.getAll("termStart").map(String), ends = f.getAll("termEnd").map(String);
  const terms = names.map((name, i) => ({ name, start: starts[i] ?? "", end: ends[i] ?? "" })).filter((t) => t.name.trim() || t.start || t.end);
  return run(["/admin/settings"], () =>
    saveAcademicYear(repo, actor, { name: str(f, "name"), start: str(f, "start"), end: str(f, "end"), isCurrent: f.get("isCurrent") === "on", terms }).then(() => ({ message: "Calendar saved." })),
  );
}

export async function createClassAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "classes:manage" });
  return run(["/admin/settings", "/admin/users"], () => createClass(repo, actor, { name: str(f, "name"), gradeLevel: Number(f.get("gradeLevel")) }).then(() => ({ message: "Class created." })));
}

export async function renameClassAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "classes:manage" });
  return run(["/admin/settings"], () => renameClass(repo, actor, id.parse(f.get("classId")), str(f, "name")).then(() => ({ message: "Renamed." })));
}

export async function archiveClassAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "classes:manage" });
  return run(["/admin/settings"], () => archiveClass(repo, actor, id.parse(f.get("classId"))).then(() => ({ message: "Class archived." })));
}

// ---------------------------------------------------------------- roster

export async function previewRosterAction(f: FormData): Promise<{ plan?: RosterPlan; error?: string }> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a .csv or .xlsx file." };
  try {
    return { plan: await planRoster(repo, actor, file.name, new Uint8Array(await file.arrayBuffer())) };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403) return { error: (e as Error).message };
    throw e;
  }
}

export async function applyRosterAction(f: FormData): Promise<{ credentialsCsv?: string; summary?: string; error?: string }> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the file again." };
  try {
    const r = await applyRoster(repo, actor, file.name, new Uint8Array(await file.arrayBuffer()), z.string().regex(/^[0-9a-f]{64}$/).parse(f.get("sha256")));
    revalidatePath("/admin/users");
    return { credentialsCsv: r.credentialsCsv, summary: `${r.created} created, ${r.updated} updated, ${r.classesCreated} classes created, ${r.links} parent links.` };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403 || e instanceof z.ZodError) return { error: (e as Error).message };
    throw e;
  }
}

// -------------------------------------------------------------- questions

const editorSchema = z.object({
  skillId: id, type: z.string(), stem: z.string().max(2000), level: z.coerce.number().int().min(1).max(7), standardCode: z.string().max(40).nullish(),
  passageId: z.string().max(191).nullish(), hint: z.string().max(500).nullish(), whyCorrect: z.string().max(1000), tip: z.string().max(500).nullish(),
  estimatedSeconds: z.coerce.number().int().min(10).max(600).optional(), aiDrafted: z.boolean().optional(),
  options: z.array(z.object({ label: z.string().max(4), text: z.string().max(500), correct: z.boolean(), rationale: z.string().max(500).nullable() })).max(8).optional(),
  answer: z.boolean().optional(), answers: z.array(z.string().max(200)).max(10).optional(),
  sequence: z.array(z.string().max(300)).max(12).optional(), segments: z.array(z.string().max(300)).max(20).optional(),
  errorIndex: z.number().int().min(0).max(19).optional(), correction: z.string().max(300).optional(),
  pairs: z.array(z.object({ left: z.string().max(200), right: z.string().max(200) })).max(10).optional(),
});

export async function saveQuestionAction(questionId: string | null, input: unknown): Promise<Result> {
  const actor = await requireActor({ permission: "questions:edit" });
  return run(["/admin/questions"], async () => {
    const parsed = editorSchema.parse(input) as EditorInput;
    if (questionId) {
      await updateDraft(repo, actor, id.parse(questionId), parsed);
      revalidatePath(`/admin/questions/${questionId}`);
      return { id: questionId, message: "Saved." };
    }
    return { id: await createDraft(repo, actor, parsed), message: "Draft created." };
  });
}

export async function questionStepAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "questions:read" });
  const qid = id.parse(f.get("questionId"));
  const step = z.enum(["submit", "approve", "reject", "archive", "revise"]).parse(f.get("step"));
  return run(["/admin/questions", `/admin/questions/${qid}`], async () => {
    if (step === "submit") await submitForReview(repo, actor, qid);
    if (step === "approve" || step === "reject") await reviewQuestion(repo, actor, qid, step, str(f, "note") || null);
    if (step === "archive") await archiveQuestion(repo, actor, qid, str(f, "note"));
    if (step === "revise") return { id: await reviseQuestion(repo, actor, qid), message: "New version created." };
    return { message: { submit: "Sent for review.", approve: "Published.", reject: "Sent back to the author.", archive: "Archived." }[step] };
  });
}

// ------------------------------------------------------- AI question bank

import { aiProvider } from "@/server/ai/runtime";
import { generateMissing, generateQuestions, type GenerateResult } from "@/server/admin/ai-bank";
import { approveAiDraft, rejectAiDraft } from "@/server/admin/questions";

export type AiResult = { error?: string; result?: GenerateResult; nothingNeeded?: boolean };

export async function generateAiAction(input: { skillId: string; standardId: string; lessonId: string | null; count: number }): Promise<AiResult> {
  const actor = await requireActor({ permission: "questions:generate" });
  try {
    const p = z.object({ skillId: id, standardId: id, lessonId: id.nullable(), count: z.number().int().min(1).max(20) }).parse(input);
    const result = await generateQuestions(repo, actor, aiProvider(), p);
    revalidatePath("/admin/question-bank");
    revalidatePath("/admin/questions");
    return { result };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403 || e instanceof z.ZodError) return { error: e instanceof z.ZodError ? "Choose a skill, a standard and 1–20 questions." : (e as Error).message };
    throw e;
  }
}

export async function generateMissingAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "questions:generate" });
  return run(["/admin/question-bank", "/admin/questions"], async () => {
    const r = await generateMissing(repo, actor, aiProvider(), id.parse(f.get("skillId")));
    if ("nothingNeeded" in r) return { message: "Nothing needed: this skill has reached its target (counting drafts awaiting review)." };
    return { message: `${r.saved.length} draft(s) saved for review${r.rejected.length ? `; ${r.rejected.length} rejected by validation` : ""}.` };
  });
}

export async function aiReviewAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "questions:review" });
  const qid = id.parse(f.get("questionId"));
  return run(["/admin/questions", `/admin/questions/${qid}`, "/admin/question-bank"], async () => {
    if (f.get("decision") === "approve") {
      await approveAiDraft(repo, actor, qid);
      return { message: "Approved: students can now practise this question." };
    }
    await rejectAiDraft(repo, actor, qid, str(f, "reason"));
    return { message: "Rejected: the question will not be used." };
  });
}
