"use server";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { repo, requireActor } from "@/server/auth/next";
import { guardAction } from "@/server/lib/action-guard";
import { skillsByIds } from "@/server/plans/wizard";
import { suggestMapPlan } from "@/server/plans/map-suggest";
import { fromFormData, readPlanForm, readQuestionPicks } from "@/server/plans/plan-form";
import { applyEdits, picksOf, sendProgramPlan } from "@/server/plans/send";
import { dismissMapDraft, mapDraftsForClass, sendMapDraft } from "@/server/plans/map-drafts";
import { sendPlans } from "@/server/map/map-plan";

/**
 * 🧯 r79: every action ends back on the MAP page with a message — a known refusal's own text, anything else logged and
 * "Something went wrong — try again" (never Next.js's error page). Redirects pass through.
 */
const PATH = "/teacher/map-center";
const planTab = (p: Record<string, string>) => (msg: string): never => redirect(`${PATH}?${new URLSearchParams({ tab: "plan", ...p, msg })}`);
const subjectOf = (f: FormData) => (f.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING");

/** MAP page → Send: the suggestion is made again on the server, the teacher's edits applied, sent as MAP work. */
export async function sendMapPlanAction(f: FormData): Promise<void> {
  const { get, getAll } = fromFormData(f);
  const subject = subjectOf(f);
  const form = readPlanForm(get, getAll, [subject]);
  await guardAction("map", "sendMapPlan", PATH, planTab({ classId: form.classId, subject }), async () => {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
    const { t } = await getT();
    const sug = await suggestMapPlan(repo, actor, { classId: form.classId, studentIds: form.studentIds, subject });
    const plan = applyEdits(sug.skills, form.keep, await skillsByIds(repo, actor, form.add), sug.students.map((s) => s.id));
    const r = await sendProgramPlan(repo, actor, { classId: form.classId, program: "MAP", title: form.title, picks: picksOf(plan), dueAt: form.dueAt, startAt: form.startAt, note: form.note, questionIds: readQuestionPicks(get, plan.map((k) => k.id)), excludeMastered: form.excludeMastered, source: form.source });
    return t("Plan ready: {skills} skill(s) for {students} student(s). They see it in My Plans and My Work.", { skills: r.skills, students: r.students });
  });
}

/** "Drafts ready to review" → Send (after the preview): this one draft goes to its student now. */
export async function sendMapDraftAction(f: FormData): Promise<void> {
  const classId = String(f.get("classId") ?? ""), subject = subjectOf(f);
  await guardAction("map", "sendMapDraft", PATH, planTab({ mode: "individual", classId, subject }), async () => {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
    const { t } = await getT();
    const r = await sendMapDraft(repo, actor, String(f.get("planId") ?? ""));
    return t("MAP plan sent: {n} practice set(s).", { n: r.sets });
  });
}

/** "Drafts ready to review" → Dismiss: the draft leaves the list (nothing is sent or deleted). */
export async function dismissMapDraftAction(f: FormData): Promise<void> {
  const classId = String(f.get("classId") ?? ""), subject = subjectOf(f);
  await guardAction("map", "dismissMapDraft", PATH, planTab({ mode: "individual", classId, subject }), async () => {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
    const { t } = await getT();
    await dismissMapDraft(repo, actor, String(f.get("planId") ?? ""));
    return t("Draft dismissed.");
  });
}

/** Individual plans → "Send all": every draft of the class for this subject goes to its student (after the preview). */
export async function sendAllMapDraftsAction(f: FormData): Promise<void> {
  const classId = String(f.get("classId") ?? ""), subject = subjectOf(f);
  await guardAction("map", "sendAllMapDrafts", PATH, planTab({ mode: "individual", classId, subject }), async () => {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
    const { t } = await getT();
    const drafts = (await mapDraftsForClass(repo, actor, classId)).filter((d) => d.subject === subject);
    // ⚡ r79: every draft in one send (the class, its grade and pools, the students read once — not per draft); a
    // draft whose areas have no questions yet is skipped, as before (r74: an automatic MAP draft's source is MAP)
    const r = drafts.length ? await sendPlans(repo, actor, drafts.map((d) => d.id), new Date(), "MAP") : { sent: 0 };
    return t("Sent {n} individual MAP plan(s).", { n: r.sent });
  });
}
