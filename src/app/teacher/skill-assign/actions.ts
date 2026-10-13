"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignSkillByLevel } from "@/server/teacher/skill-assign";
import { assignQuestions, assignSkill } from "@/server/teacher/assign";
import { buildSkillSet } from "@/server/curriculum/question-finder";
import { parseQuestionIdsField, programOf } from "@/components/skill-picker/helpers";

const day = (v: FormDataEntryValue | null) => { const t = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T23:59:59`) : null; };

export async function assignSkillAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), skillId = String(f.get("skillId") ?? ""), mode = f.get("mode") === "MANUAL" ? "MANUAL" : "AUTOMATIC";
  let msg: string;
  try {
    const levels = Object.fromEntries([...f.keys()].filter((k) => k.startsWith("lv:")).map((k) => [k.slice(3), String(f.get(k) ?? "")]));
    const r = await assignSkillByLevel(repo, actor, { classId, skillId, mode, levels, skip: f.getAll("skip").map(String), dueAt: day(f.get("dueAt")), note: String(f.get("note") ?? "") || null, max: Number(f.get("max") ?? 20) || 20, program: programOf(f.get("program")), questionIds: parseQuestionIdsField(f.get("questionIds")) });
    const parts = r.groups.map((g) => `${g.level ? { BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" }[g.level] + ": " : ""}${g.students} student(s)`);
    msg = `✅ Assigned. ${parts.join(" · ")}.${r.notes.length ? ` ${r.notes.join(" ")}` : ""}`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = e.message; else throw e; }
  redirect(`/teacher/skill-assign?${new URLSearchParams({ classId, skillId, ...(mode === "MANUAL" ? { manual: "1" } : {}), msg })}`);
}

// ------------------------------------------------------------------ 🔎 Questions from the bank (Curriculum → Question Bank)

const back = (f: FormData, msg: string) => {
  const p = new URLSearchParams({ classId: String(f.get("classId") ?? ""), skillId: String(f.get("skillId") ?? ""), msg });
  const lessonId = String(f.get("lessonId") ?? ""); if (lessonId) p.set("lessonId", lessonId);
  return `/teacher/skill-assign?${p}`;
};

/** “Assign adaptive practice on this skill”: the adaptive engine picks by mastery, answers, difficulty and weakness. */
export async function assignAdaptiveFromBankAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  let msg: string;
  try {
    const r = await assignSkill(repo, actor, { classId: String(f.get("classId") ?? ""), skillId: String(f.get("skillId") ?? ""), dueAt: day(f.get("dueAt")), note: String(f.get("note") ?? "") || null });
    msg = `✅ Adaptive practice assigned to ${r.students} student${r.students === 1 ? "" : "s"}.`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = e.message; else throw e; }
  redirect(back(f, msg));
}

/** “Assign a ready set of N questions”: a balanced set from the bank (lesson-linked first, then the skill, optional revision). */
export async function assignReadySetFromBankAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  let msg: string;
  try {
    const classId = String(f.get("classId") ?? ""), skillId = String(f.get("skillId") ?? ""), lessonId = String(f.get("lessonId") ?? "") || null;
    const set = await buildSkillSet(repo, actor, { skillId, lessonId, classId, n: Number(f.get("n") ?? 10) || 10, includeRevision: f.get("revision") === "1" });
    if (!set.questionIds.length) throw new ValidationError("No auto-marked questions were found for this skill.");
    const skill = await repo.findUnique("Skill", { id: skillId });
    const r = await assignQuestions(repo, actor, { classId, questionIds: set.questionIds, title: `${String(skill?.name ?? "Skill")} (ready set)`, dueAt: day(f.get("dueAt")), note: String(f.get("note") ?? "") || null });
    msg = `✅ A set of ${r.questions} question${r.questions === 1 ? "" : "s"} assigned to ${r.students} student${r.students === 1 ? "" : "s"}.${set.notes.length ? ` ${set.notes.join(" ")}` : ""}`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = e.message; else throw e; }
  redirect(back(f, msg));
}
