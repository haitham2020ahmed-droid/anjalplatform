/**
 * ☆ Quick assign (owner r67): one press on a skill's star assigns it to the class (★); pressing ★ again cancels it.
 * The second quick way to assign, next to the full ⭐ Assign windows — on the MAP Year plan, the MAP plan skill cards,
 * the Skills list and the Learn lesson list.
 *
 *   SKILL  → one adaptive set of the skill's questions for the whole class (each student starts at their own level,
 *            as "Automatic" in skill-assign.ts), Assignment.skillId = the skill, so the star knows it is assigned;
 *   LESSON → the Learn lesson for the whole class (learn/teacher.ts assignLearn).
 * The default due date is the end of that school week (Thursday); the teacher may change it before pressing.
 *
 * Un-assign is a SOFT cancel: SKILL → Assignment.deletedAt (teacher/assign.ts cancelAssignment: the set leaves every
 * student's list, answers already given stay); LESSON → LearnAssign.deletedAt and the not-started LearnAssignee rows
 * of that assignment go (started or finished work is kept). `cancelStar` is this module's own minimal cancel, to be
 * unified with the "Assigned" page's cancelAssignment / restoreAssignment (src/server/teacher/assigned.ts) at merge.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { assertClassAccess } from "../teacher/assignments";
import { assignQuestions, cancelAssignment, type Track } from "../teacher/assign";
import { skillPool } from "../teacher/skill-assign";
import { assignLearn } from "../learn/teacher";
import { classMembers } from "../insights/student-data";
import { masteredAmong } from "../skills/status-extras";

const s = (v: unknown) => String(v ?? "");
export type StarKind = "SKILL" | "LESSON";
const DAY = 86_400_000;
const RIYADH = 3 * 3_600_000;

/** the Thursday (yyyy-mm-dd) of the school week of `d`, Riyadh time: the default due date of a quick assign. */
export function endOfSchoolWeek(d: Date): string {
  const local = new Date(d.getTime() + RIYADH);
  const dow = local.getUTCDay(); // 0 = Sunday … 4 = Thursday; on Friday / Saturday: the coming week's Thursday
  const ahead = dow <= 4 ? 4 - dow : 11 - dow;
  return new Date(local.getTime() + ahead * DAY).toISOString().slice(0, 10);
}

/** yyyy-mm-dd → the end of that day; a day already past becomes today (a due date is never in the past). */
export function dueOf(v: unknown, now = new Date()): Date | null {
  const d = s(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const today = endOfDay(new Date(now.getTime() + RIYADH).toISOString().slice(0, 10));
  const at = endOfDay(d);
  return at.getTime() < now.getTime() ? today : at;
}
const endOfDay = (d: string) => new Date(`${d}T23:59:59`);

/** Open star assignments of this class: skill id → assignment id (one read). */
export async function starredSkills(repo: Repo, classId: string, skillIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(skillIds.filter(Boolean))];
  if (!classId || !ids.length) return new Map();
  const rows = await repo.findMany("Assignment", { classId, skillId: { in: ids }, deletedAt: null }, { select: ["id", "skillId", "createdAt"] });
  const out = new Map<string, string>();
  for (const r of rows.sort((a, b) => s(a.createdAt).localeCompare(s(b.createdAt)))) out.set(s(r.skillId), s(r.id));
  return out;
}

/** Open Learn assignments of this class: lesson code → LearnAssign id (one read). */
export async function starredLessons(repo: Repo, classId: string, codes: string[]): Promise<Map<string, string>> {
  const list = [...new Set(codes.filter(Boolean))];
  if (!classId || !list.length) return new Map();
  const rows = await repo.findMany("LearnAssign", { classId, kind: "LESSON", ref: { in: list }, deletedAt: null }, { select: ["id", "ref"] });
  return new Map(rows.map((r) => [s(r.ref), s(r.id)]));
}

export interface StarInput { kind: StarKind; ref: string; classId: string; dueAt?: string | null; track?: Track | null; /** ⭐ leave out the students who already mastered the skill (the teacher answered Yes) */ excludeMastered?: boolean }

/** "5 students already mastered this skill — exclude them?": the class's students with ⭐ on the skill (any copy). */
export async function masteredInClass(repo: Repo, actor: Actor, classId: string, skillId: string): Promise<{ count: number; total: number; studentIds: string[] }> {
  const klass = await assertClassAccess(repo, actor, s(classId));
  const members = await classMembers(repo, s(klass.id));
  const mastered = await masteredAmong(repo, s(klass.schoolId), members, s(skillId));
  return { count: mastered.length, total: members.length, studentIds: mastered };
}
export interface StarResult { id: string; kind: StarKind; ref: string; students: number; dueAt: string | null; already: boolean }

/** ☆ → ★: assigns the skill (or Learn lesson) to the whole class; already assigned → the open assignment (nothing new). */
export async function starAssign(repo: Repo, actor: Actor, input: StarInput, now = new Date()): Promise<StarResult> {
  assertCan(actor, "assignments:create");
  if (actor.role !== "TEACHER") throw new ForbiddenError("Only the class teacher can assign.");
  const klass = await assertClassAccess(repo, actor, s(input.classId));
  const classId = s(klass.id);
  const due = dueOf(input.dueAt, now) ?? dueOf(endOfSchoolWeek(now), now);
  const dueIso = due ? due.toISOString() : null;
  if (input.kind === "LESSON") {
    const open = (await starredLessons(repo, classId, [s(input.ref)])).get(s(input.ref));
    if (open) return { id: open, kind: "LESSON", ref: s(input.ref), students: 0, dueAt: dueIso, already: true };
    const r = await assignLearn(repo, actor, { kind: "LESSON", ref: s(input.ref), classId, target: "CLASS", dueAt: due }, now);
    return { id: r.assignId, kind: "LESSON", ref: s(input.ref), students: r.students, dueAt: dueIso, already: false };
  }
  const skillId = s(input.ref);
  const open = (await starredSkills(repo, classId, [skillId])).get(skillId);
  if (open) return { id: open, kind: "SKILL", ref: skillId, students: 0, dueAt: dueIso, already: true };
  const { skill, byLevel } = await skillPool(repo, s(klass.schoolId), skillId);
  const all = [...byLevel.BELOW, ...byLevel.ON, ...byLevel.ABOVE];
  if (!all.length) throw new ValidationError("This skill has no published questions yet.");
  // ⭐ "exclude them?" → Yes: only the students who have not mastered the skill
  let studentIds: string[] | undefined;
  if (input.excludeMastered) {
    const m = await masteredInClass(repo, actor, classId, skillId);
    const members = await classMembers(repo, classId);
    studentIds = members.filter((id) => !m.studentIds.includes(id));
    if (!studentIds.length) throw new ValidationError("Every student already mastered this skill.");
  }
  const r = await assignQuestions(repo, actor, {
    classId, questionIds: all, title: skill.name, exactTitle: true, track: input.track ?? "CURRICULUM", ...(studentIds ? { studentIds } : {}),
    adaptive: { maxQuestions: Math.min(15, all.length) }, dueAt: due,
  }, now);
  // the star reads Assignment.skillId (one skill per assignment)
  await repo.updateMany("Assignment", { id: r.assignmentId }, { skillId });
  return { id: r.assignmentId, kind: "SKILL", ref: skillId, students: r.students, dueAt: dueIso, already: false };
}

/** ★ → ☆: the soft cancel (see the header). Only the class's teacher. */
export async function cancelStar(repo: Repo, actor: Actor, input: { kind: StarKind; id: string }, now = new Date()): Promise<{ ok: true }> {
  assertCan(actor, "assignments:create");
  if (input.kind === "LESSON") {
    const a: Row | null = await repo.findUnique("LearnAssign", { id: s(input.id) });
    if (!a || a.deletedAt || s(a.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Assignment not found.");
    await assertClassAccess(repo, actor, s(a.classId));
    await repo.updateMany("LearnAssign", { id: s(a.id), deletedAt: null }, { deletedAt: now });
    await repo.deleteMany("LearnAssignee", { assignId: s(a.id), status: "NOT_STARTED" });
    await audit(repo, { actorId: actor.userId, action: "learn.assign.cancel", entityType: "LearnAssign", entityId: s(a.id), after: { deletedAt: now.toISOString() }, at: now });
    return { ok: true };
  }
  await cancelAssignment(repo, actor, s(input.id), now);
  return { ok: true };
}
