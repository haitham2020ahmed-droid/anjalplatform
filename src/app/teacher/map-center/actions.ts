"use server";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { skillsByIds } from "@/server/plans/wizard";
import { suggestMapPlan } from "@/server/plans/map-suggest";
import { fromFormData, readPlanForm, readQuestionPicks } from "@/server/plans/plan-form";
import { applyEdits, picksOf, sendProgramPlan } from "@/server/plans/send";
import { dismissMapDraft, mapDraftsForClass, sendMapDraft } from "@/server/plans/map-drafts";

/** MAP page → Send: the suggestion is made again on the server, the teacher's edits applied, sent as MAP work. */
export async function sendMapPlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const { get, getAll } = fromFormData(f);
  const subject = get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING";
  const form = readPlanForm(get, getAll, [subject]);
  const { t } = await getT();
  let msg: string;
  try {
    const sug = await suggestMapPlan(repo, actor, { classId: form.classId, studentIds: form.studentIds, subject });
    const plan = applyEdits(sug.skills, form.keep, await skillsByIds(repo, actor, form.add), sug.students.map((s) => s.id));
    const r = await sendProgramPlan(repo, actor, { classId: form.classId, program: "MAP", title: form.title, picks: picksOf(plan), dueAt: form.dueAt, note: form.note, questionIds: readQuestionPicks(get, plan.map((k) => k.id)), excludeMastered: form.excludeMastered });
    msg = t("Plan ready: {skills} skill(s) for {students} student(s). They see it in My Plans and My Work.", { skills: r.skills, students: r.students });
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    msg = t(e.message);
  }
  redirect(`/teacher/map-center?${new URLSearchParams({ tab: "plan", classId: form.classId, subject, msg })}`);
}

/** "Drafts ready to review" → Send (after the preview): this one draft goes to its student now. */
export async function sendMapDraftAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), subject = f.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING";
  const { t } = await getT();
  let msg: string;
  try {
    const r = await sendMapDraft(repo, actor, String(f.get("planId") ?? ""));
    msg = t("MAP plan sent: {n} practice set(s).", { n: r.sets });
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    msg = t(e.message);
  }
  redirect(`/teacher/map-center?${new URLSearchParams({ tab: "plan", mode: "individual", classId, subject, msg })}`);
}

/** "Drafts ready to review" → Dismiss: the draft leaves the list (nothing is sent or deleted). */
export async function dismissMapDraftAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), subject = f.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING";
  const { t } = await getT();
  let msg: string;
  try { await dismissMapDraft(repo, actor, String(f.get("planId") ?? "")); msg = t("Draft dismissed."); }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = t(e.message); }
  redirect(`/teacher/map-center?${new URLSearchParams({ tab: "plan", mode: "individual", classId, subject, msg })}`);
}

/** Individual plans → "Send all": every draft of the class for this subject goes to its student (after the preview). */
export async function sendAllMapDraftsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), subject = f.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING";
  const { t } = await getT();
  let msg: string;
  try {
    const drafts = (await mapDraftsForClass(repo, actor, classId)).filter((d) => d.subject === subject);
    let sent = 0;
    for (const d of drafts) { try { await sendMapDraft(repo, actor, d.id); sent++; } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; } }
    msg = t("Sent {n} individual MAP plan(s).", { n: sent });
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    msg = t(e.message);
  }
  redirect(`/teacher/map-center?${new URLSearchParams({ tab: "plan", mode: "individual", classId, subject, msg })}`);
}
