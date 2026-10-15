"use server";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { repo, requireActor } from "@/server/auth/next";
import { proposePlan, skillsByIds } from "@/server/plans/wizard";
import { fromFormData, readPlanForm, readQuestionPicks } from "@/server/plans/plan-form";
import { applyEdits, picksOf, sendProgramPlan } from "@/server/plans/send";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";

/** RTI page → Send: the suggestion is made again on the server, the teacher's edits applied, sent as RTI work. */
export async function sendRtiPlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const { get, getAll } = fromFormData(f);
  const form = readPlanForm(get, getAll);
  const { t } = await getT();
  let msg: string;
  try {
    const p = await proposePlan(repo, actor, { classId: form.classId, studentIds: form.studentIds, type: "RTI" });
    const suggested = p.skills.map((k) => ({ id: k.id, name: k.name, reason: k.reason, studentIds: k.studentIds }));
    const inRti = p.students.filter((s) => suggested.some((k) => k.studentIds.includes(s.id))).map((s) => s.id);
    const plan = applyEdits(suggested, form.keep, await skillsByIds(repo, actor, form.add), inRti.length ? inRti : p.students.map((s) => s.id));
    const r = await sendProgramPlan(repo, actor, { classId: form.classId, program: "RTI", title: form.title, picks: picksOf(plan), dueAt: form.dueAt, startAt: form.startAt, note: form.note, questionIds: readQuestionPicks(get, plan.map((k) => k.id)), excludeMastered: form.excludeMastered, source: form.source });
    msg = t("Plan ready: {skills} skill(s) for {students} student(s). They see it in My Plans and My Work.", { skills: r.skills, students: r.students });
  } catch (e) {
    // r82: any failure → a message on the page (never a frozen button / error page)
    if (isNextControl(e)) throw e;
    msg = await failureMessage(e, "rti", "sendRtiPlan", "/teacher/rti-plan");
  }
  redirect(`/teacher/rti-plan?${new URLSearchParams({ classId: form.classId, msg })}`);
}
