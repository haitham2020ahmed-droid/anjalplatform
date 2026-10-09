/**
 * ⭐ Assign a SKILL (Grammar, Skills, any skill of the master list) with the same two options as the
 * Curriculum Map:
 *   AUTOMATIC → one set for everyone: each student starts at their own level (from their data; On Level without
 *               data) and moves Below ↔ On ↔ Above by their answers (the school's rules).
 *   MANUAL    → the teacher places students in Below / On / Above; each gets only that level's questions.
 * A question's level comes from its difficulty (1–3 Below, 4 On, 5–7 Above).
 */
import type { Repo } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "./assignments";
import { assignQuestions } from "./assign";
import { fromDifficulty } from "../curriculum-map/leveled-run";

const s = (v: unknown) => String(v ?? "");
type Level = "BELOW" | "ON" | "ABOVE";
const NAME: Record<Level, string> = { BELOW: "Below Level", ON: "On Level", ABOVE: "Above Level" };

/** The skill's auto-marked published questions, by level. */
export async function skillPool(repo: Repo, schoolId: string, skillId: string): Promise<{ skill: { id: string; name: string; grade: number }; byLevel: Record<Level, string[]> }> {
  const skill = await repo.findUnique("Skill", { id: skillId });
  if (!skill || skill.deletedAt) throw new ValidationError("Skill not found.");
  const cur = await repo.findUnique("Curriculum", { id: skill.curriculumId });
  const grade = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!grade || s(grade.schoolId) !== schoolId) throw new ForbiddenError("Skill not found.");
  const qs = await repo.findMany("Question", { skillId, status: "PUBLISHED", deletedAt: null }, { select: ["id", "typeId", "difficultyLevel"] });
  const types = qs.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => q.typeId))] } }, { select: ["id", "code", "isAutoScored"] }) : [];
  const manual = new Set(types.filter((t) => t.code === "SHORT_ANSWER" || t.isAutoScored === false).map((t) => s(t.id)));
  const byLevel: Record<Level, string[]> = { BELOW: [], ON: [], ABOVE: [] };
  for (const q of qs) if (!manual.has(s(q.typeId))) byLevel[fromDifficulty(Number(q.difficultyLevel ?? 4))].push(s(q.id));
  return { skill: { id: s(skill.id), name: s(skill.name), grade: Number(grade.level) }, byLevel };
}

export async function assignSkillByLevel(repo: Repo, actor: Actor, input: { classId: string; skillId: string; mode: "AUTOMATIC" | "MANUAL"; levels?: Record<string, string>; skip?: string[]; dueAt?: Date | null; note?: string | null; max?: number }, now = new Date()): Promise<{ groups: { level: Level | null; students: number; questions: number }[]; notes: string[] }> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const classGrade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const { skill, byLevel } = await skillPool(repo, actor.schoolId!, input.skillId);
  if (skill.grade !== classGrade) throw new ValidationError(`This class is Grade ${classGrade}; the skill is Grade ${skill.grade}.`);
  const all = [...byLevel.BELOW, ...byLevel.ON, ...byLevel.ABOVE];
  if (!all.length) throw new ValidationError("This skill has no published questions yet.");
  const members = (await repo.findMany("ClassMembership", { classId: input.classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const skip = new Set(input.skip ?? []);
  const students = members.filter((id) => !skip.has(id));
  if (!students.length) throw new ValidationError("Choose at least one student.");
  const max = Math.max(5, Math.min(50, input.max ?? 20));
  const notes: string[] = [];
  const groups: { level: Level | null; students: number; questions: number }[] = [];
  if (input.mode === "AUTOMATIC") {
    await assignQuestions(repo, actor, { classId: input.classId, studentIds: students, questionIds: all, title: `${skill.name} (adaptive: Below → On → Above)`, exactTitle: true, adaptive: { maxQuestions: Math.min(max, all.length) }, dueAt: input.dueAt ?? null, note: input.note ?? null }, now);
    groups.push({ level: null, students: students.length, questions: all.length });
    for (const l of ["BELOW", "ON", "ABOVE"] as Level[]) if (!byLevel[l].length) notes.push(`${NAME[l]} has no questions yet.`);
    return { groups, notes };
  }
  const levelOf = (id: string): Level => { const v = s(input.levels?.[id]).toUpperCase(); return v === "BELOW" || v === "ABOVE" ? v : "ON"; };
  for (const level of ["BELOW", "ON", "ABOVE"] as Level[]) {
    const who = students.filter((id) => levelOf(id) === level);
    if (!who.length) continue;
    let used = level, ids = byLevel[level];
    if (!ids.length) { used = "ON"; ids = byLevel.ON; }
    if (!ids.length) { used = (["ABOVE", "ON", "BELOW"] as Level[]).find((l) => byLevel[l].length)!; ids = byLevel[used]; }
    if (used !== level) notes.push(`${NAME[level]} has no questions yet: those ${who.length} student(s) got ${NAME[used]} questions.`);
    await assignQuestions(repo, actor, { classId: input.classId, studentIds: who, questionIds: ids.slice(0, max), title: `${skill.name} (${NAME[used]})`, exactTitle: true, dueAt: input.dueAt ?? null, note: input.note ?? null }, now);
    groups.push({ level, students: who.length, questions: Math.min(max, ids.length) });
  }
  return { groups, notes };
}
