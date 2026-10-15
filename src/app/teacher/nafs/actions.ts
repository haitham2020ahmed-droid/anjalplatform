"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { aiEnv } from "@/server/ai/env";
import { getT } from "@/i18n/server";
import { assignNafsTestOnline, builderPractice, builderRows, buildNafsAutomatic, buildNafsFull, buildNafsMinistry, buildNafsSimulation, cleanDifficultyMix, createFullNafsPractice, moreForStandard, replaceNafsQuestion, saveFullNafsTest, type BuilderRow, type FullSettings, type MinistrySettings } from "@/server/nafs/build";
import { createNafsPractice, deleteNafsPractice } from "@/server/nafs/practice";
import { nafsBankPage, retagNafsQuestion, reviewNafsDraft, saveNafsQuestion, setNafsFamilyLink, setNafsHidden, type BankPage, type BankSource, type NafsQuestionInput } from "@/server/nafs/bank";
import { changeNafsTime, deleteNafsTest, markWrittenAnswer, releaseNafsResults, saveNafsAnswers, saveNafsTest, updateNafsAssignment, type SaveTestInput } from "@/server/nafs/tests";
import { generateNafsDrafts, type AiNafsInput } from "@/server/nafs/ai";
import { assignBooklets, ensureBookletTests } from "@/server/nafs/booklet-center";
import type { SimulationSettings } from "@/server/nafs/framework";
import { log } from "@/server/monitoring/log";
import { logError } from "@/server/teacher/extras";

/**
 * 🇸🇦 The NAFS section's actions. Every one asks the server again: the actor (teacher or admin), NAFS access (Grade 6
 * teachers and admins: assertNafs inside each server function), the school, and for classes / students the actor's
 * own Grade 6 classes. Bubble-sheet answers arrive as answers only — never an image.
 */
const STAFF = { roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as ("TEACHER" | "SCHOOL_ADMIN" | "SUPER_ADMIN")[] };
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;
const str = (v: FormDataEntryValue | null) => String(v ?? "");
const dateOf = (v: unknown, end = false): Date | null => { let t = String(v ?? "").trim(); if (!t) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t += end ? "T23:59:59" : "T00:00:00"; const d = new Date(t); return Number.isNaN(d.getTime()) ? null : d; };
const back = (href: string, msg: string) => redirect(`${href}${href.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
/** Only a link inside the NAFS center is followed back (else the given default). */
const inCenter = (href: string, fallback: string) => (href.startsWith("/teacher/nafs") && !href.startsWith("//") ? href : fallback);

/**
 * 🧯 r78 (owner: "after Assign a WHITE PAGE appears"): an action that throws shows Next.js's error page. Every NAFS
 * action now ends on the teacher's page with a message, whatever fails:
 *   - Next.js's own signals (redirect, not found) pass through — they ARE the answer;
 *   - a known refusal (ValidationError / ForbiddenError) → its own text;
 *   - anything else (the database, a timeout, a bug) → logged (server log + the school's error log) and a friendly line.
 */
const isNextControl = (e: unknown): boolean => {
  const d = (e as { digest?: unknown } | null)?.digest;
  return typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK") || d === "NEXT_NOT_FOUND");
};
const FAILED = "Something went wrong — try again";
async function messageOf(e: unknown, action: string): Promise<string> {
  const { t } = await getT().catch(() => ({ t: (x: string) => x }));
  if (known(e)) return t((e as Error).message);
  log("error", "nafs.action.failed", { action, error: e instanceof Error ? e : String(e) });
  void logError(repo, { source: "SERVER", message: `nafs ${action}: ${e instanceof Error ? e.message : String(e)}`, path: "/teacher/nafs" });
  return t(FAILED);
}
/** A form action: `fn` ends with its own redirect; any error comes back to `ret()` as a message. */
async function guard(action: string, ret: () => string, fn: () => Promise<void>): Promise<void> {
  let msg: string;
  try { await fn(); return; } catch (e) { if (isNextControl(e)) throw e; msg = await messageOf(e, action); }
  back(ret(), msg);
}
/** A client-called action: its value, or { error } — never a thrown error (Next.js signals pass through). */
async function wrap<T>(fn: () => Promise<T>, action = "call"): Promise<{ ok?: T; error?: string }> {
  try { return { ok: await fn() }; } catch (e) { if (isNextControl(e)) throw e; return { error: await messageOf(e, action) }; }
}

// ------------------------------------------------------------------ bank

export async function saveQuestionAction(input: NafsQuestionInput): Promise<{ ok?: { id: string; copied: boolean }; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(() => saveNafsQuestion(repo, actor, {
    id: input?.id ? String(input.id) : null, nafsCode: String(input?.nafsCode ?? ""), process: input?.process ? String(input.process) : null,
    standard: input?.standard ? String(input.standard) : null, kind: input?.kind === "WRITTEN" ? "WRITTEN" : "MCQ",
    model: input?.model ? String(input.model) : null, rubric: Array.isArray(input?.rubric) ? input.rubric.map(String).slice(0, 3) : null,
    stem: String(input?.stem ?? ""), options: Array.isArray(input?.options) ? input.options.map(String) : [], correct: Number(input?.correct),
    explanation: input?.explanation ? String(input.explanation) : null, passageTitle: input?.passageTitle ? String(input.passageTitle) : null,
    passageText: input?.passageText ? String(input.passageText) : null, textType: input?.textType === "LIT" || input?.textType === "INFO" ? input.textType : null,
    difficulty: input?.difficulty ? Number(input.difficulty) : null,
  }));
}

export async function hideQuestionAction(form: FormData): Promise<void> {
  const hidden = str(form.get("hidden")) === "1";
  const ret = inCenter(str(form.get("back")), "/teacher/nafs?tab=bank");
  await guard("hideQuestion", () => ret, async () => {
    const actor = await requireActor(STAFF);
    const { t } = await getT();
    await setNafsHidden(repo, actor, str(form.get("id")), hidden);
    revalidatePath("/teacher/nafs");
    back(ret, t(hidden ? "Hidden from the NAFS bank (not deleted)." : "Shown in the NAFS bank again."));
  });
}

export async function retagAction(form: FormData): Promise<void> {
  const ret = inCenter(str(form.get("back")), "/teacher/nafs?tab=bank");
  await guard("retag", () => ret, async () => {
    const actor = await requireActor(STAFF);
    const { t } = await getT();
    await retagNafsQuestion(repo, actor, str(form.get("id")), str(form.get("code")), str(form.get("process")) || null, new Date(), form.has("standard") ? str(form.get("standard")) || null : undefined);
    back(ret, t("Saved."));
  });
}

export async function reviewDraftAction(form: FormData): Promise<void> {
  const ret = inCenter(str(form.get("back")), "/teacher/nafs?tab=bank&src=DRAFT");
  const approve = str(form.get("approve")) === "1";
  await guard("reviewDraft", () => ret, async () => {
    const actor = await requireActor(STAFF);
    const { t } = await getT();
    await reviewNafsDraft(repo, actor, str(form.get("id")), approve);
    back(ret, t(approve ? "Approved: the question can now be used in NAFS tests." : "Rejected: the draft is hidden (not deleted)."));
  });
}

/** Admin: link / unlink a NAFS skill and a platform skill. */
export async function linkFamilyAction(form: FormData): Promise<void> {
  const ret = "/teacher/nafs?tab=skills";
  await guard("linkFamily", () => ret, async () => {
    const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
    const { t } = await getT();
    await setNafsFamilyLink(repo, actor, { code: str(form.get("code")), familyId: str(form.get("familyId")), linked: str(form.get("linked")) === "1" });
    back(ret, t("Saved."));
  });
}

/** The builder's "Add from the bank" list (a page at a time). */
export async function bankSearchAction(input: { code?: string | null; q?: string | null; page?: number; source?: BankSource; standard?: string | null; difficulty?: number | null; set?: string | null }): Promise<{ ok?: BankPage; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(() => nafsBankPage(repo, actor, { code: input?.code ? String(input.code) : null, q: input?.q ? String(input.q) : null, page: Number(input?.page) || 1, source: input?.source === "OWN" || input?.source === "PLATFORM" ? input.source : "ALL", standard: input?.standard ? String(input.standard) : null, difficulty: input?.difficulty ? Number(input.difficulty) : null, set: input?.set ? String(input.set) : null }));
}

/**
 * The questions behind a checklist's selection (Adaptive practice, the builder): the chosen standards / skills, a
 * difficulty, words — a page at a time, each with its options for the preview.
 */
export async function targetQuestionsAction(input: { targets: string[]; difficulty?: number | null; q?: string | null; page?: number; mcqOnly?: boolean }): Promise<{ ok?: BankPage; error?: string }> {
  const actor = await requireActor(STAFF);
  const targets = Array.isArray(input?.targets) ? input.targets.map(String).slice(0, 40) : [];
  if (!targets.length) return { ok: { rows: [], total: 0, page: 1, pages: 1 } };
  return wrap(() => nafsBankPage(repo, actor, { targets, difficulty: input?.difficulty ? Number(input.difficulty) : null, q: input?.q ? String(input.q) : null, page: Number(input?.page) || 1, size: 10, kind: input?.mcqOnly ? "MCQ" : null }));
}

/** "✨ Write new with AI" in the builder: approve the drafts the teacher kept and add them to the list. */
export async function approveDraftsAction(ids: string[]): Promise<{ ok?: BuilderRow[]; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const list = (Array.isArray(ids) ? ids.map(String) : []).slice(0, 8);
    for (const id of list) await reviewNafsDraft(repo, actor, id, true);
    return builderRows(repo, actor, list);
  });
}

/** The builder's "Practice" purpose: adaptive practice on the list's standards / skills. */
export async function builderPracticeAction(input: { title: string; classId: string; targets?: string[] | null; studentIds?: string[] | null; questionIds?: string[] | null; wholeBank?: boolean; full?: boolean; maxQuestions?: number | null; timeLimitMin?: number | null; dueAt?: string | null; difficulty?: unknown; confirmUncovered?: boolean }): Promise<{ ok?: { id: string; students: number }; error?: string }> {
  const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
  return wrap(async () => {
    const r = await builderPractice(repo, actor, {
      title: String(input?.title ?? ""), classId: String(input?.classId ?? ""), targets: Array.isArray(input?.targets) ? input.targets.map(String) : null,
      studentIds: Array.isArray(input?.studentIds) ? input.studentIds.map(String).filter(Boolean) : null, questionIds: Array.isArray(input?.questionIds) ? input.questionIds.map(String) : null,
      wholeBank: Boolean(input?.wholeBank), full: Boolean(input?.full), maxQuestions: input?.maxQuestions ? Number(input.maxQuestions) : null, timeLimitMin: input?.timeLimitMin ? Number(input.timeLimitMin) : null,
      dueAt: dateOf(input?.dueAt, true), difficulty: input?.difficulty ?? null, confirmUncovered: Boolean(input?.confirmUncovered),
    });
    revalidatePath("/teacher/nafs");
    return r;
  });
}

// ------------------------------------------------------------------ tests: build, change, save

export async function simulationAction(input: { settings?: Partial<SimulationSettings>; classId?: string | null; seed?: string; difficulty?: unknown; codes?: string[] | null }): Promise<{ ok?: { rows: BuilderRow[]; notes: string[]; settings: SimulationSettings }; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const b = await buildNafsSimulation(repo, actor, { settings: input?.settings ?? null, classId: input?.classId ? String(input.classId) : null, seed: String(input?.seed ?? Date.now()), difficulty: cleanDifficultyMix(input?.difficulty), codes: Array.isArray(input?.codes) ? input.codes.map(String) : null });
    return { rows: await builderRows(repo, actor, b.questionIds), notes: b.notes, settings: b.settings };
  });
}

export async function ministryAction(input: { settings?: Partial<MinistrySettings>; classId?: string | null; seed?: string; difficulty?: unknown }): Promise<{ ok?: { rows: BuilderRow[]; notes: string[]; settings: MinistrySettings }; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const b = await buildNafsMinistry(repo, actor, { settings: input?.settings ?? null, classId: input?.classId ? String(input.classId) : null, seed: String(input?.seed ?? Date.now()), difficulty: cleanDifficultyMix(input?.difficulty) });
    return { rows: await builderRows(repo, actor, b.questionIds), notes: b.notes, settings: b.settings };
  });
}

export async function automaticAction(input: { codes: string[]; total?: number | null; perSkill?: Record<string, number> | null; classId?: string | null; seed?: string; difficulty?: unknown }): Promise<{ ok?: { rows: BuilderRow[]; notes: string[] }; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const b = await buildNafsAutomatic(repo, actor, { codes: Array.isArray(input?.codes) ? input.codes.map(String) : [], total: input?.total ?? null, perSkill: input?.perSkill ?? null, classId: input?.classId ? String(input.classId) : null, seed: String(input?.seed ?? Date.now()), difficulty: cleanDifficultyMix(input?.difficulty) });
    return { rows: await builderRows(repo, actor, b.questionIds), notes: b.notes };
  });
}

// ------------------------------------------------------------------ adaptive practice (Tool 1)

/** "Give adaptive practice": the targets (or the questions chosen in the bank), the class / students, the limits. */
export async function createPracticeAction(form: FormData): Promise<void> {
  // r69: the Suggested plan's one-click assign comes back to the plan (r78: on success AND on any error)
  const backTo = str(form.get("back"));
  const plan = backTo.startsWith("/teacher/nafs?") ? backTo : null;
  await guard("createPractice", () => plan ?? "/teacher/nafs?tab=adaptive", async () => {
    const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
    const { t } = await getT();
    const r = await createNafsPractice(repo, actor, {
      title: str(form.get("title")), targets: form.getAll("target").map(String), questionIds: form.getAll("pick").map(String).filter(Boolean),
      classId: str(form.get("classId")), studentIds: form.getAll("sid").map(String).filter(Boolean),
      maxQuestions: str(form.get("max")) ? Number(form.get("max")) : null, timeLimitMin: str(form.get("minutes")) ? Number(form.get("minutes")) : null, dueAt: dateOf(form.get("dueAt"), true),
      difficulty: str(form.get("difficulty")) || null,
    });
    revalidatePath("/teacher/nafs");
    back(plan ?? `/teacher/nafs?tab=adaptive&sub=report&open=${encodeURIComponent(r.id)}`, t("Given to {n} student(s). They find it in their NAFS icon.", { n: r.students }));
  });
}

export async function deletePracticeAction(form: FormData): Promise<void> {
  await guard("deletePractice", () => "/teacher/nafs?tab=adaptive", async () => {
    const actor = await requireActor(STAFF);
    const { t } = await getT();
    await deleteNafsPractice(repo, actor, str(form.get("id")));
    back("/teacher/nafs?tab=adaptive", t("Practice removed."));
  });
}

// ------------------------------------------------------------------ "Complete NAFS test (all standards)"

export interface FullBuildResult { rows: BuilderRow[]; notes: string[]; counts: Record<string, number>; available: Record<string, number>; shortage: Record<string, number>; settings: FullSettings }
/** Builds the complete NAFS test (every Ministry standard) for the teacher to audit before saving. */
export async function fullBuildAction(input: { settings?: { questions?: number; minutes?: number; written?: boolean; counts?: Record<string, number> | null }; classId?: string | null; seed?: string; difficulty?: unknown; practice?: boolean }): Promise<{ ok?: FullBuildResult; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const b = await buildNafsFull(repo, actor, { settings: input?.settings ?? null, classId: input?.classId ? String(input.classId) : null, seed: String(input?.seed ?? Date.now()), difficulty: cleanDifficultyMix(input?.difficulty), practice: Boolean(input?.practice) });
    return { rows: await builderRows(repo, actor, b.questionIds), notes: b.notes, counts: b.counts, available: b.available, shortage: b.shortage, settings: b.settings };
  });
}

/** n more questions of one standard (the teacher raised its count). */
export async function fullMoreAction(input: { standard: string; n: number; current: string[]; classId?: string | null; written?: boolean }): Promise<{ ok?: BuilderRow[]; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const ids = await moreForStandard(repo, actor, { standard: String(input?.standard ?? ""), n: Number(input?.n), current: Array.isArray(input?.current) ? input.current.map(String) : [], classId: input?.classId ? String(input.classId) : null, written: Boolean(input?.written), seed: String(Date.now()) });
    return builderRows(repo, actor, ids);
  });
}

export async function saveFullTestAction(input: Omit<SaveTestInput, "mode"> & { confirmUncovered?: boolean }): Promise<{ ok?: string; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(() => saveFullNafsTest(repo, actor, {
    id: input?.id ? String(input.id) : null, title: String(input?.title ?? ""), questionIds: Array.isArray(input?.questionIds) ? input.questionIds.map(String) : [],
    marks: input?.marks ?? null, timeLimitMin: input?.timeLimitMin ?? null, settings: input?.settings ?? null, confirmUncovered: Boolean(input?.confirmUncovered),
  }));
}

export async function fullPracticeAction(input: { title: string; classId: string; studentIds?: string[] | null; questionIds?: string[] | null; wholeBank?: boolean; maxQuestions?: number | null; timeLimitMin?: number | null; dueAt?: string | null; confirmUncovered?: boolean }): Promise<{ ok?: { id: string; students: number }; error?: string }> {
  const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
  return wrap(async () => {
    const r = await createFullNafsPractice(repo, actor, {
      title: String(input?.title ?? ""), classId: String(input?.classId ?? ""), studentIds: Array.isArray(input?.studentIds) ? input.studentIds.map(String).filter(Boolean) : null,
      questionIds: Array.isArray(input?.questionIds) ? input.questionIds.map(String) : null, wholeBank: Boolean(input?.wholeBank),
      maxQuestions: input?.maxQuestions ? Number(input.maxQuestions) : null, timeLimitMin: input?.timeLimitMin ? Number(input.timeLimitMin) : null, dueAt: dateOf(input?.dueAt, true),
      confirmUncovered: Boolean(input?.confirmUncovered),
    });
    revalidatePath("/teacher/nafs");
    return r;
  });
}

export async function replaceAction(input: { questionId: string; current: string[]; classId?: string | null; sameStandard?: boolean }): Promise<{ ok?: BuilderRow; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(async () => {
    const id = await replaceNafsQuestion(repo, actor, { questionId: String(input?.questionId ?? ""), current: Array.isArray(input?.current) ? input.current.map(String) : [], classId: input?.classId ? String(input.classId) : null, seed: String(Date.now()), sameStandard: Boolean(input?.sameStandard) });
    return (await builderRows(repo, actor, [id]))[0];
  });
}

export async function rowsAction(ids: string[]): Promise<{ ok?: BuilderRow[]; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(() => builderRows(repo, actor, Array.isArray(ids) ? ids.map(String) : []));
}

export async function saveTestAction(input: SaveTestInput): Promise<{ ok?: string; error?: string }> {
  // a complete NAFS test is always saved with its coverage check
  if (String(input?.mode ?? "") === "FULL") return saveFullTestAction({ ...input, confirmUncovered: false });
  const actor = await requireActor(STAFF);
  return wrap(() => saveNafsTest(repo, actor, {
    id: input?.id ? String(input.id) : null, title: String(input?.title ?? ""), mode: String(input?.mode ?? "MANUAL"),
    questionIds: Array.isArray(input?.questionIds) ? input.questionIds.map(String) : [], marks: input?.marks ?? null, timeLimitMin: input?.timeLimitMin ?? null, settings: input?.settings ?? null,
  }));
}

export async function aiDraftsAction(input: AiNafsInput): Promise<{ ok?: { ids: string[]; error?: string }; error?: string }> {
  const actor = await requireActor(STAFF);
  return wrap(() => generateNafsDrafts(repo, actor, {
    codes: Array.isArray(input?.codes) ? input.codes.map(String) : [], count: Number(input?.count), topic: input?.topic ? String(input.topic) : null,
    withPassage: Boolean(input?.withPassage), textType: input?.textType === "LIT" || input?.textType === "INFO" ? input.textType : null,
    standard: input?.standard ? String(input.standard) : null,
  }, { env: aiEnv() }));
}

export async function deleteTestAction(form: FormData): Promise<void> {
  await guard("deleteTest", () => "/teacher/nafs?tab=test", async () => {
    const actor = await requireActor(STAFF);
    const { t } = await getT();
    await deleteNafsTest(repo, actor, str(form.get("id")));
    back("/teacher/nafs?tab=test", t("Test removed."));
  });
}

// ------------------------------------------------------------------ online, results

export async function assignOnlineAction(form: FormData): Promise<void> {
  const testId = str(form.get("testId"));
  const ret = `/teacher/nafs/tests/${encodeURIComponent(testId)}`;
  await guard("assignOnline", () => ret, async () => {
    const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
    const { t } = await getT();
    const who = str(form.get("who")) === "some" ? form.getAll("sid").map(String).filter(Boolean) : null;
    if (who && !who.length) back(ret, t("Choose at least one student."));
    const r = await assignNafsTestOnline(repo, actor, { testId, classId: str(form.get("classId")), openAt: dateOf(form.get("openAt")), dueAt: dateOf(form.get("dueAt"), true), timeLimitMin: str(form.get("minutes")) ? Number(form.get("minutes")) : null, studentIds: who });
    if (r.adaptive) back(`/teacher/nafs?tab=adaptive&sub=report&open=${encodeURIComponent(r.practiceId ?? "")}`, t("Adaptive test given online to {n} student(s): each one starts at Medium and the questions adapt. Results are under Practice.", { n: r.students }));
    back(ret, t("Given online to {n} student(s). They find it in their NAFS icon.", { n: r.students }));
  });
}

/**
 * r69 Ministry booklets: the ticked booklets (one or several) → "Assign online" to a class / chosen students (each
 * booklet whole, its own time and dates), or "Get ready to print" (each booklet becomes a NAFS test: print, key, sheets).
 */
export async function assignBookletsAction(form: FormData): Promise<void> {
  const ret0 = str(form.get("back"));
  const ret = ret0.startsWith("/teacher/nafs?") ? ret0 : "/teacher/nafs?tab=booklets";
  const codes = form.getAll("b").map(String).filter(Boolean);
  // on an error: back to the form with the booklets still ticked (the message before the #assign anchor)
  const ticked = `${ret}${codes.map((c) => `&b=${encodeURIComponent(c)}`).join("")}`;
  let msg = "";
  try {
    const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
    const { t } = await getT();
    if (!codes.length) back(ret, t("Choose at least one booklet."));
    let to = "";
    if (str(form.get("do")) === "print") {
      const made = await ensureBookletTests(repo, actor, codes);
      to = `/teacher/nafs?tab=booklets&ready=${made.map((m) => encodeURIComponent(m.testId)).join(",")}&msg=${encodeURIComponent(t("{n} booklet(s) ready to print.", { n: made.length }))}`;
    } else {
      const sids = form.getAll("sid").map(String).filter(Boolean);
      const r = await assignBooklets(repo, actor, { codes, classId: str(form.get("classId")), studentIds: sids.length ? sids : null, minutes: str(form.get("minutes")) ? Number(form.get("minutes")) : null, openAt: dateOf(form.get("openAt")), dueAt: dateOf(form.get("dueAt"), true) });
      to = `${ret}&msg=${encodeURIComponent(t("{n} booklet(s) given online to {s} student(s). They find them in their NAFS icon.", { n: r.booklets, s: r.students }))}`;
    }
    revalidatePath("/teacher/nafs");
    redirect(to);
  } catch (e) { if (isNextControl(e)) throw e; msg = await messageOf(e, "assignBooklets"); }
  redirect(`${ticked}&msg=${encodeURIComponent(msg)}#assign`);
}

/** One assignment's time and open / due dates. */
export async function updateAssignmentAction(form: FormData): Promise<void> {
  const testId = str(form.get("testId"));
  const ret = `/teacher/nafs/tests/${encodeURIComponent(testId)}`;
  await guard("updateAssignment", () => ret, async () => {
    const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
    const { t } = await getT();
    await updateNafsAssignment(repo, actor, { testId, classId: str(form.get("classId")), openAt: dateOf(form.get("openAt")), dueAt: dateOf(form.get("dueAt"), true), timeLimitMin: str(form.get("minutes")) ? Number(form.get("minutes")) : null });
    back(ret, t("Saved."));
  });
}

/**
 * ⏱ r69 live time during a timed NAFS test: minutes more / fewer for the class or one student, a new time limit,
 * "end in N minutes", "end now", or no end time. The students' timers follow within a few seconds.
 */
export async function nafsTimeAction(form: FormData): Promise<void> {
  const testId = str(form.get("testId")), classId = str(form.get("classId"));
  const ret = `/teacher/nafs/tests/${encodeURIComponent(testId)}`;
  const op = str(form.get("op"));
  await guard("nafsTime", () => ret, async () => {
    const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
    const { t } = await getT();
    if (op === "limit") await changeNafsTime(repo, actor, { testId, classId, setMinutes: true, minutes: str(form.get("minutes")) ? Number(form.get("minutes")) : null });
    else if (op === "endin") { const m = Math.round(Number(form.get("in"))); if (!Number.isFinite(m) || m < 1 || m > 600) back(ret, t("Choose the end time.")); await changeNafsTime(repo, actor, { testId, classId, setEnd: true, endsAt: new Date(Date.now() + m * 60_000) }); }
    else if (op === "endnow") await changeNafsTime(repo, actor, { testId, classId, setEnd: true, endsAt: new Date() });
    else if (op === "noend") await changeNafsTime(repo, actor, { testId, classId, setEnd: true, endsAt: null });
    else await changeNafsTime(repo, actor, { testId, classId, shift: Number(form.get("shift")) * (str(form.get("sign")) === "-" ? -1 : 1), studentId: str(form.get("studentId")) || null });
    back(ret, t("Time changed. The students' timers update in a few seconds."));
  });
}

/** The marking queue: the teacher's rubric score (0 / 1 / 2) for one short written answer. */
export async function markWrittenAction(form: FormData): Promise<void> {
  const ret = inCenter(str(form.get("back")), "/teacher/nafs?tab=marking");
  await guard("markWritten", () => ret, async () => {
    const actor = await requireActor(STAFF);
    await markWrittenAnswer(repo, actor, { resultId: str(form.get("resultId")), index: Number(form.get("index")), score: Number(form.get("score")) });
    revalidatePath("/teacher/nafs");
    redirect(ret);
  });
}

export async function releaseAction(form: FormData): Promise<void> {
  const testId = str(form.get("testId"));
  const release = str(form.get("release")) === "1";
  const ret = `/teacher/nafs/tests/${encodeURIComponent(testId)}`;
  await guard("release", () => ret, async () => {
    const actor = await requireActor(STAFF);
    const { t } = await getT();
    await releaseNafsResults(repo, actor, { testId, classId: str(form.get("classId")), release });
    back(ret, t(release ? "Results released: students see their score and the skills to practise." : "Results hidden from the students."));
  });
}

/**
 * Saves one student's answers from a bubble sheet (read in the browser) or the "type answers" grid:
 * { testId, studentId, answers[] } — answers only (0–3 or null), never an image. Graded at once.
 */
export async function saveAnswersAction(input: { testId: string; studentId: string; answers: (number | null)[]; source: "SHEET" | "TYPED"; review?: { unresolved: number; confidence: string; checkedAll: boolean } }): Promise<{ ok?: { correct: number; points: number; maxPoints: number }; error?: string }> {
  const actor = await requireActor(STAFF);
  // 📷 a photo read is saved only after the teacher's review: no answer still to check, and a low-confidence sheet
  // checked answer by answer (the review screen enforces it; this is the server's side of the same rule)
  if (input?.source !== "TYPED") {
    const r = input?.review;
    if (!r || Number(r.unresolved) > 0) return { error: "Some answers still need checking: pick an answer (or No answer) for every highlighted question." };
    if (r.confidence === "LOW" && r.checkedAll !== true) return { error: "This photo was read with low confidence: check every answer against the paper first." };
  }
  return wrap(async () => {
    const g = await saveNafsAnswers(repo, actor, { testId: String(input?.testId ?? ""), studentId: String(input?.studentId ?? ""), answers: input?.answers, source: input?.source === "TYPED" ? "TYPED" : "SHEET" });
    return { correct: g.correct, points: g.points, maxPoints: g.maxPoints };
  });
}
