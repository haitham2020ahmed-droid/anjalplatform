/**
 * What happens to a student's work and levels when they change class (readiness S-9, S-10).
 *  - Old-class work that is not finished is withdrawn from the student's list (their AssignmentStudent row goes;
 *    answers already given stay in their history and still count for mastery). Finished work is kept.
 *  - A move into another grade clears the old grade's levels (overall + category): the level is worked out again
 *    for the new grade (Diagnostic, MAP, practice) instead of carrying the old grade's Below / On / Above.
 */
import type { Repo } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");

export async function withdrawOldClassWork(tx: Repo, studentId: string, oldClassIds: string[], keepClassId: string | null): Promise<number> {
  const old = oldClassIds.filter((c) => c && c !== keepClassId);
  if (!old.length) return 0;
  const asg = await tx.findMany("Assignment", { classId: { in: old } }, { select: ["id"] });
  if (!asg.length) return 0;
  const rows = await tx.findMany("AssignmentStudent", { studentId, assignmentId: { in: asg.map((a) => a.id) } }, { select: ["assignmentId", "status", "completedAt"] });
  const open = rows.filter((r) => r.status !== "COMPLETED" && !r.completedAt).map((r) => s(r.assignmentId));
  if (open.length) await tx.deleteMany("AssignmentStudent", { studentId, assignmentId: { in: open } });
  return open.length;
}

/**
 * The mirror of withdrawOldClassWork, for the NEW class (owner report, 3 Nov 2026 — "ليه skills مش ظاهره عند
 * الطالب": a skill assigned to a class before a student joined it never showed up for them). AssignmentStudent
 * rows are written once, at Assign time, from the class roster at that moment — a student added to the class
 * later (a new account placed straight into it, or moved in from another class) was never retroactively linked
 * to that work, with nothing elsewhere catching the gap. This links them to the class's already-open skill and
 * question-set assignments, the same way "reassignSkillAssignmentsForStudents" (teacher/assign.ts) already
 * re-links a student un-removed from one assignment — just for every live assignment of the class at once.
 * Curriculum-plan places are excluded (they live in the plan, not the work list — see student/assigned.ts's
 * `listed`). Already-finished assignments are included too (the student gets it, same as a classmate who
 * finished early); a soft cancel (the Assigned page's Cancel, AssignmentCancel) is not checked here — the
 * student is linked like any other classmate, and the cancel still hides it for everyone the normal way.
 */
export async function addNewClassWork(tx: Repo, studentId: string, classId: string): Promise<number> {
  if (!classId) return 0;
  const asg = (await tx.findMany("Assignment", { classId, deletedAt: null }, { select: ["id", "curriculumPlanId"] })).filter((a) => !a.curriculumPlanId);
  if (!asg.length) return 0;
  const have = new Set((await tx.findMany("AssignmentStudent", { studentId, assignmentId: { in: asg.map((a) => a.id) } }, { select: ["assignmentId"] })).map((r) => s(r.assignmentId)));
  const missing = asg.filter((a) => !have.has(s(a.id)));
  if (!missing.length) return 0;
  await tx.createMany("AssignmentStudent", missing.map((a) => ({ assignmentId: s(a.id), studentId, status: "NOT_STARTED", progress: 0 })));
  return missing.length;
}

export async function resetLevelsForNewGrade(tx: Repo, studentId: string, actorId: string | null, now: Date, fromGradeId: string, toGradeId: string): Promise<void> {
  const [lvl, cats] = await Promise.all([tx.findMany("StudentLevel", { studentId }), tx.findMany("StudentCategoryLevel", { studentId })]);
  if (!lvl.length && !cats.length) return;
  await tx.deleteMany("StudentLevel", { studentId });
  await tx.deleteMany("StudentCategoryLevel", { studentId });
  await tx.create("AuditLog", { actorId, action: "level.reset", entityType: "Student", entityId: studentId, before: { level: lvl[0] ? s(lvl[0].level) : null, categories: cats.map((c) => ({ category: s(c.category), level: s(c.level) })), gradeId: fromGradeId }, after: { reason: "Moved to another grade: the level is worked out again for the new grade.", gradeId: toGradeId }, createdAt: now });
}
