"use server";
/**
 * ✏️ The plan editor's buttons. Every action builds its change again on the server (editor.ts checks the class,
 * the students, the skills and the questions); nothing from the browser is trusted beyond the teacher's choices.
 */
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError, type Actor } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { getT } from "@/i18n/server";
import { isProgram, type Program } from "@/server/plans/program";
import { bulkEdit, createDraft, deleteDraft, deletePlanPermanently, duplicatePlan, editPlan, pausePlan, sendPlan, withdrawPlan, type BulkOp, type PlanEdit, type SectionSpec } from "@/server/plans/editor";
import { isPlanLevel } from "@/server/plans/question-pick";
import { draftFromSuggestion, startPlan } from "@/server/plans/start";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const dateOf = (v: string, end = true): Date | null => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${end ? "23:59:59" : "00:00:00"}`) : null);
const programOf = (v: string): Program | null => (isProgram(v) ? v : null);
const ok = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;
/** Every action checks the session first, in its own body (contracts test). */
const ACCESS: Parameters<typeof requireActor>[0] = { roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" };

/**
 * Runs one change and goes back to the plan (same step and place) with a message. r82: ANY failure (a refusal, the
 * database, a timeout) comes back as a message on the page — never a thrown error, so the button never stays frozen
 * on an error page (server/lib/action-guard.ts: known refusals keep their text, the rest is logged + "try again").
 */
async function back(f: FormData, job: () => Promise<string>): Promise<never> {
  const { t } = await getT();
  const planId = str(f, "planId");
  let msg: string;
  try { msg = t(await job()); } catch (e) { if (isNextControl(e)) throw e; msg = `⚠️ ${await failureMessage(e, "plans", "editor", `/teacher/plans/${planId}`)}`; }
  const q = new URLSearchParams({ msg });
  for (const k of ["step", "add", "q", "as"]) if (str(f, k)) q.set(k, str(f, k));
  redirect(`/teacher/plans/${encodeURIComponent(planId)}?${q}${str(f, "anchor") ? `#${str(f, "anchor")}` : ""}`);
}

const edit = (a: Actor, f: FormData, e: PlanEdit) => back(f, async () => {
  const r = await editPlan(repo, a, str(f, "planId"), e);
  const { t } = await getT();
  return t(r.messageT.t, r.messageT.v) + (r.notified ? ` ${t("The students got the update.")}` : "");
});

export async function saveDetailsAction(f: FormData) {
  const a = await requireActor(ACCESS);
  await edit(a, f, { kind: "details", title: str(f, "title"), note: str(f, "note"), goals: str(f, "goals"), dueAt: dateOf(str(f, "dueAt")), startAt: dateOf(str(f, "startAt"), false) });
}
export async function saveStudentsAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const all = f.get("who") === "class";
  await edit(a, f, { kind: "students", studentIds: all ? (f.getAll("all").map(String)) : f.getAll("sid").map(String) });
}
export async function addSectionAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const spec: SectionSpec = { skillId: str(f, "skillId") || null, placeCode: str(f, "placeCode") || null, count: Number(f.get("count")) || 10, level: isPlanLevel(str(f, "level")) ? (str(f, "level") as SectionSpec["level"]) : null, type: str(f, "type") || null, lesson: f.get("lesson") === "on" };
  await edit(a, f, { kind: "addSection", spec });
}
export async function sectionAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const key = str(f, "key"), op = str(f, "op");
  const e: PlanEdit | null =
    op === "remove" ? { kind: "removeSection", key }
    : op === "up" || op === "down" ? { kind: "moveSection", key, dir: op === "up" ? -1 : 1 }
    : op === "count" ? { kind: "count", key, count: Number(f.get("count")) || 1 }
    : op === "level" ? { kind: "level", key, level: isPlanLevel(str(f, "level")) ? (str(f, "level") as "BELOW") : null }
    : op === "lesson" ? { kind: "lesson", key, on: f.get("on") === "1" }
    : op === "pick" ? { kind: "pickMyself", key, count: Number(f.get("count")) || undefined }
    : op === "auto" ? { kind: "auto", key }
    : op === "students" ? { kind: "sectionStudents", key, studentIds: f.get("who") === "all" ? null : f.getAll("sid").map(String) }
    : null;
  if (!e) return back(f, async () => "Nothing to do.");
  await edit(a, f, e);
}
export async function questionAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const key = str(f, "key"), questionId = str(f, "questionId"), op = str(f, "op");
  const e: PlanEdit | null =
    op === "remove" ? { kind: "removeQuestion", key, questionId }
    : op === "replace" ? { kind: "replaceQuestion", key, questionId }
    : op === "up" || op === "down" ? { kind: "moveQuestion", key, questionId, dir: op === "up" ? -1 : 1 }
    : null;
  if (!e) return back(f, async () => "Nothing to do.");
  await edit(a, f, e);
}
export async function addQuestionsAction(f: FormData) {
  const a = await requireActor(ACCESS);
  await edit(a, f, { kind: "addQuestions", key: str(f, "key"), questionIds: f.getAll("qid").map(String) });
}

export async function sendPlanAction(f: FormData) {
  const a = await requireActor(ACCESS);
  await back(f, async () => { const r = await sendPlan(repo, a, str(f, "planId"), new Date(), String(f.get("source") ?? "")); const { t } = await getT(); return t("Sent: {parts} part(s) to {students} student(s). They see it in My Plans and My Work.", { parts: r.sections, students: r.students }); });
}
export async function pausePlanAction(f: FormData) {
  const a = await requireActor(ACCESS);
  await back(f, async () => { const pause = f.get("pause") === "1"; await pausePlan(repo, a, str(f, "planId"), pause); return pause ? "Paused: students do not see this plan until you resume it." : "Resumed: students see the plan again."; });
}
export async function withdrawPlanAction(f: FormData) {
  const a = await requireActor(ACCESS);
  await back(f, async () => {
    if (f.get("confirm") !== "on") throw new ValidationError("Tick the box to confirm.");
    await withdrawPlan(repo, a, str(f, "planId"));
    return "Withdrawn: the work left the students' lists. Answers already given are kept.";
  });
}
export async function deleteDraftAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const { t } = await getT();
  let target = "/teacher/plans?tab=plans&bucket=DRAFTS&msg=" + encodeURIComponent(t("Draft deleted."));
  try { await deleteDraft(repo, a, str(f, "planId")); } catch (e) { if (!ok(e)) throw e; target = `/teacher/plans/${encodeURIComponent(str(f, "planId"))}?msg=${encodeURIComponent(`⚠️ ${t((e as Error).message)}`)}`; }
  redirect(target);
}
/**
 * 🗑 r87: the two choices directly from the Plans LIST (no need to open the plan first) — "stop but keep it saved"
 * (withdraw, answers kept, the plan stays visible in Finished) or "delete permanently" (gone for good, answers
 * untouched but the plan record itself disappears from every list, no Undo). Both stay on the Plans list after.
 */
export async function withdrawFromListAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const { t } = await getT();
  let msg: string;
  try {
    if (f.get("confirm") !== "on") throw new ValidationError("Tick the box to confirm.");
    await withdrawPlan(repo, a, str(f, "planId"));
    msg = t("Stopped: the work left the students' lists. Answers already given are kept.");
  } catch (e) { if (!ok(e)) throw e; msg = `⚠️ ${t((e as Error).message)}`; }
  redirect(`/teacher/plans?${new URLSearchParams([["tab", "plans"], ["bucket", str(f, "bucket")], ["msg", msg]])}`);
}
export async function deletePlanAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const { t } = await getT();
  let msg: string;
  try {
    if (f.get("confirm") !== "on") throw new ValidationError("Tick the box to confirm.");
    await deletePlanPermanently(repo, a, str(f, "planId"));
    msg = t("Deleted for good. This cannot be undone.");
  } catch (e) { if (!ok(e)) throw e; msg = `⚠️ ${t((e as Error).message)}`; }
  redirect(`/teacher/plans?${new URLSearchParams([["tab", "plans"], ["bucket", str(f, "bucket")], ["msg", msg]])}`);
}

export async function duplicatePlanAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const { t } = await getT();
  let target: string;
  try {
    const id = await duplicatePlan(repo, a, str(f, "planId"), { classId: str(f, "classId") || null, studentIds: f.getAll("sid").map(String) });
    target = `/teacher/plans/${id}?msg=${encodeURIComponent(t("A copy was made as a draft. Change anything, then send it."))}`;
  } catch (e) { if (!ok(e)) throw e; target = `/teacher/plans/${encodeURIComponent(str(f, "planId"))}?step=send&msg=${encodeURIComponent(`⚠️ ${t((e as Error).message)}`)}`; }
  redirect(target);
}

/** 1 Who → 2 What: a new draft (suggested by the platform, the skills given, or empty), then the editor. */
export async function startPlanAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const { t } = await getT();
  const classId = str(f, "classId"), who = str(f, "who");
  const sids = [...new Set(f.getAll("sid").map(String).filter(Boolean))];
  const studentIds = who === "class" ? [] : who === "student" ? sids.slice(0, 1) : sids;
  const rawProgram = str(f, "program");
  const program = programOf(rawProgram);
  // ⚡ Enrichment isn't a Program (it stays null, same safe bucket as Custom) — just one extra flag read off the
  // raw posted value, so it never touches the RTI-tier system or the student-grade-restriction logic; it does set
  // SkillPlan.kind = "ENRICHMENT" (createDraft) so it shows as its own source in By source and My Plans / My Work.
  const enrichment = rawProgram === "ENRICHMENT";
  const skills = [...new Set(f.getAll("add").map(String).filter(Boolean))].slice(0, 20);
  let target: string;
  try {
    if (who !== "class" && !studentIds.length) throw new ValidationError(who === "student" ? "Tick the student in step 1." : "Tick the students of the group in step 1.");
    let planId: string;
    if (skills.length) planId = await createDraft(repo, a, { classId, program, studentIds, sections: skills.map((skillId) => ({ skillId, count: 10, reason: "Struggling skill" })), suggested: true, enrichment });
    else planId = (await startPlan(repo, a, { classId, program, studentIds, mode: str(f, "mode") === "empty" ? "empty" : "suggested", subject: str(f, "subject") === "LANGUAGE" ? "LANGUAGE" : "READING", enrichment, title: enrichment ? t("Enrichment") : undefined })).planId;
    target = `/teacher/plans/${planId}?msg=${encodeURIComponent(t("Draft ready. Check and change anything, then Preview and Send. Nothing reaches students before you press Send."))}`;
  } catch (e) {
    if (!ok(e)) throw e;
    target = `/teacher/plans?${new URLSearchParams([["tab", "new"], ["classId", classId], ["who", who], ["program", str(f, "program")], ...sids.map((x) => ["sid", x] as [string, string]), ["msg", `⚠️ ${t((e as Error).message)}`]])}`;
  }
  redirect(target);
}

/**
 * r86: 🛟 Support plan's fast path — "Send as-is", next to "Create Plan" on /teacher/plans/support. For a clear-cut
 * case (one student, the platform's own struggling-skill list, nothing to customise) this builds the exact same
 * draft startPlanAction would (program RTI, those skills, "Struggling skill" reason) and sends it immediately,
 * instead of the teacher clicking through Who → What → Preview → Send for something they weren't going to change.
 * The slower path (the "Create Plan" link, still on the same row) is never removed — this is only an extra,
 * optional shortcut for the cases where review would just rubber-stamp the same draft.
 */
export async function quickSendSupportPlanAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const { t } = await getT();
  const classId = str(f, "classId"), studentId = str(f, "sid");
  const skills = [...new Set(f.getAll("add").map(String).filter(Boolean))].slice(0, 20);
  const fallback = `/teacher/plans?${new URLSearchParams([["tab", "new"], ["program", "RTI"], ["classId", classId], ["who", "student"], ["sid", studentId], ...skills.map((id) => ["add", id] as [string, string])])}`;
  let target: string;
  try {
    if (!studentId) throw new ValidationError("Choose the student.");
    if (!skills.length) throw new ValidationError("No struggling skill to build a plan from — use Create Plan to choose one yourself.");
    const planId = await createDraft(repo, a, { classId, program: "RTI", studentIds: [studentId], sections: skills.map((skillId) => ({ skillId, count: 10, reason: "Struggling skill" })), suggested: true });
    const r = await sendPlan(repo, a, planId, new Date(), null);
    target = `/teacher/plans/support?classId=${encodeURIComponent(classId)}&msg=${encodeURIComponent(t("Sent: {parts} part(s) to {students} student(s). They see it in My Plans and My Work.", { parts: r.sections, students: r.students }))}`;
  } catch (e) {
    // a refusal (e.g. a program/grade mismatch, nothing buildable) lands the teacher in the full editor to fix it,
    // rather than leaving them stuck on the Support plan page with only an error to read.
    if (!ok(e)) throw e;
    target = `${fallback}&msg=${encodeURIComponent(`⚠️ ${t((e as Error).message)}`)}`;
  }
  redirect(target);
}

/** 💡 A suggestion → a draft to review (the suggestion is made again on the server and found by its id). */
export async function useSuggestionAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const { t } = await getT();
  const classId = str(f, "classId");
  let target: string;
  try {
    const id = await draftFromSuggestion(repo, a, classId, str(f, "suggestion"));
    target = `/teacher/plans/${id}?msg=${encodeURIComponent(t("Draft ready. Check and change anything, then Preview and Send. Nothing reaches students before you press Send."))}`;
  } catch (e) { if (!ok(e)) throw e; target = `/teacher/plans?tab=suggested&classId=${encodeURIComponent(classId)}&msg=${encodeURIComponent(`⚠️ ${t((e as Error).message)}`)}`; }
  redirect(target);
}

/** One edit on several plans (e.g. several students' individual plans). */
export async function bulkEditAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const { t } = await getT();
  const ids = f.getAll("id").map(String);
  const op = str(f, "op");
  const skillId = str(f, "skillId");
  const o: BulkOp | null =
    op === "dueAt" ? { kind: "dueAt", dueAt: dateOf(str(f, "dueAt")) }
    : op === "note" ? { kind: "note", note: str(f, "note") }
    : op === "goals" ? { kind: "goals", goals: str(f, "goals") }
    : op === "addSkill" && skillId ? { kind: "addSkill", skillId, count: Number(f.get("count")) || 10, lesson: f.get("lesson") === "on" }
    : op === "removeSkill" && skillId ? { kind: "removeSkill", skillId }
    : op === "count" && skillId ? { kind: "count", skillId, count: Number(f.get("count")) || 10 }
    : null;
  let msg: string;
  try {
    if (!o) throw new ValidationError("Choose what to change.");
    const r = await bulkEdit(repo, a, ids, o);
    msg = t("Changed {n} plan(s).", { n: r.done }) + (r.skipped.length ? ` ${t("Not changed:")} ${r.skipped.map((x) => `${x.title || "—"} (${t(x.reason)})`).join("; ")}` : "");
  } catch (e) { if (!ok(e)) throw e; msg = `⚠️ ${t((e as Error).message)}`; }
  redirect(`/teacher/plans/bulk?${new URLSearchParams([...ids.map((x) => ["id", x] as [string, string]), ["msg", msg]])}`);
}

/**
 * The program pages' builders (MAP, Support, NAFS, Custom): "Edit everything" saves the previewed plan as a draft
 * and opens it in the editor (every question visible and editable). The skills and students are checked again.
 */
export async function builderDraftAction(f: FormData) {
  const a = await requireActor(ACCESS);
  const { t } = await getT();
  let target: string;
  try {
    const spec = JSON.parse(str(f, "draftSpec") || "{}") as { classId?: string; program?: string | null; skills?: { id: string; studentIds?: string[]; reason?: string; picks?: string[] }[] };
    const classId = String(spec.classId ?? "");
    const all = new Set((spec.skills ?? []).flatMap((k) => k.studentIds ?? []));
    const id = await createDraft(repo, a, {
      classId, program: programOf(String(spec.program ?? "")), studentIds: [...all], title: str(f, "title") || null, note: str(f, "note") || null, dueAt: dateOf(str(f, "dueAt")),
      sections: (spec.skills ?? []).slice(0, 40).map((k) => ({ skillId: String(k.id), count: 10, studentIds: k.studentIds?.length && k.studentIds.length < all.size ? k.studentIds.map(String) : null, reason: k.reason ? String(k.reason) : null, questionIds: k.picks?.length ? k.picks.map(String) : null })),
      suggested: true,
    });
    target = `/teacher/plans/${id}?msg=${encodeURIComponent(t("Draft ready. Check and change anything, then Preview and Send. Nothing reaches students before you press Send."))}`;
  } catch (e) {
    if (!(ok(e) || e instanceof SyntaxError)) throw e;
    target = `/teacher/plans?tab=new&msg=${encodeURIComponent(`⚠️ ${t((e as Error).message)}`)}`;
  }
  redirect(target);
}
