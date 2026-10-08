/**
 * 🧹 Clean roster (admins): remove a school's / grade's / class's students before loading a new roster.
 *   - ARCHIVE (recommended, reversible by an admin): sign-in disabled, out of their classes, everything kept.
 *   - DELETE (permanent): the students and ALL their data in every table, after a typed confirmation;
 *     a JSON backup can be downloaded first. Audit entries are kept (their actor is cleared).
 * Teachers, parents and other schools are never touched.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";

const s = (v: unknown) => String(v ?? "");
export type RosterScope = { kind: "SCHOOL" } | { kind: "GRADE"; grade: number } | { kind: "CLASS"; classId: string };

/** Every table that holds a student's data (deleted before the student). */
const STUDENT_TABLES = ["AdaptiveDecisionLog", "QuestionAttempt", "PracticeSession", "StudentAbility", "AbilitySnapshot", "StudentSkillMastery", "StudentReadingRange",
  "AssignmentStudent", "ExternalAssessmentResult", "MapResult", "Recommendation", "InterventionAlert", "StudentBadge", "XpEvent", "StudentDailyActivity", "DiagnosticResult",
  "StudentLevel", "StudentReadingLexile", "ReadMasterAttempt", "ParentStudent", "ClassMembership"] as const;

function adminOnly(actor: Actor): void {
  assertCan(actor, "students:manage");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins clean the roster.");
}

/** The students in scope (this school only). */
export async function scopeStudents(repo: Repo, actor: Actor, scope: RosterScope, includeArchived = false): Promise<Row[]> {
  adminOnly(actor);
  let list = await repo.findMany("Student", { schoolId: actor.schoolId });
  if (!includeArchived) list = list.filter((x) => !x.deletedAt);
  if (scope.kind === "GRADE") {
    const g = (await repo.findMany("Grade", { schoolId: actor.schoolId, level: scope.grade }))[0];
    list = g ? list.filter((x) => x.gradeId === g.id) : [];
  } else if (scope.kind === "CLASS") {
    const klass = await repo.findUnique("Class", { id: scope.classId });
    if (!klass || klass.schoolId !== actor.schoolId) throw new ForbiddenError("Class not found.");
    const inClass = new Set((await repo.findMany("ClassMembership", { classId: scope.classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)));
    list = list.filter((x) => inClass.has(s(x.id)));
  }
  return list;
}

export interface CleanPreview { students: number; withHistory: number; answers: number; assignments: number; mapScores: number; label: string; confirm: string }

export async function previewClean(repo: Repo, actor: Actor, scope: RosterScope): Promise<CleanPreview> {
  const list = await scopeStudents(repo, actor, scope);
  const ids = list.map((x) => s(x.id));
  const [answers, assignments, mapScores] = ids.length ? await Promise.all([
    repo.findMany("QuestionAttempt", { studentId: { in: ids } }, { select: ["studentId"] }),
    repo.count("AssignmentStudent", { studentId: { in: ids } }),
    repo.count("MapResult", { studentId: { in: ids } }),
  ]) : [[], 0, 0];
  let label = "the whole school";
  if (scope.kind === "GRADE") label = `Grade ${scope.grade}`;
  if (scope.kind === "CLASS") label = `class ${s((await repo.findUnique("Class", { id: scope.classId }))?.name)}`;
  return { students: ids.length, withHistory: new Set(answers.map((a) => s(a.studentId))).size, answers: answers.length, assignments, mapScores, label, confirm: `DELETE ${ids.length} STUDENTS` };
}

/** Reversible: sign-in disabled, signed out, out of their classes; all their data kept. */
export async function archiveStudents(repo: Repo, actor: Actor, scope: RosterScope, now = new Date()): Promise<number> {
  const list = await scopeStudents(repo, actor, scope);
  if (!list.length) return 0;
  const ids = list.map((x) => s(x.id)), userIds = list.map((x) => s(x.userId));
  await repo.transaction(async (tx) => {
    await tx.updateMany("ClassMembership", { studentId: { in: ids }, leftAt: null }, { leftAt: now });
    await tx.updateMany("Student", { id: { in: ids } }, { deletedAt: now });
    for (const u of await tx.findMany("User", { id: { in: userIds } }, { select: ["id", "sessionVersion"] }))
      await tx.updateMany("User", { id: u.id }, { isActive: false, deletedAt: now, sessionVersion: Number(u.sessionVersion ?? 0) + 1 });
    await tx.deleteMany("Session", { userId: { in: userIds } });
    await tx.create("AuditLog", { actorId: actor.userId, action: "roster.archive", entityType: "Student", entityId: null, after: { count: ids.length, scope }, createdAt: now });
  });
  return ids.length;
}

/** Everything that DELETE would remove, as JSON (password hashes left out). */
export async function rosterBackup(repo: Repo, actor: Actor, scope: RosterScope): Promise<Record<string, unknown>> {
  const list = await scopeStudents(repo, actor, scope, true);
  const ids = list.map((x) => s(x.id)), userIds = list.map((x) => s(x.userId));
  const tables: Record<string, Row[]> = {};
  if (ids.length) {
    for (const t of STUDENT_TABLES) tables[t] = await repo.findMany(t, { studentId: { in: ids } });
    const players = await repo.findMany("LiveGamePlayer", { studentId: { in: ids } });
    tables.LiveGamePlayer = players;
    tables.LiveGameAnswer = players.length ? await repo.findMany("LiveGameAnswer", { playerId: { in: players.map((p) => p.id) } }) : [];
  }
  const users = userIds.length ? (await repo.findMany("User", { id: { in: userIds } })).map(({ passwordHash: _p, ...u }) => u) : [];
  return { kind: "roster-backup", createdAt: new Date().toISOString(), scope, students: list, users, tables };
}

/** Permanent: the students and all their data. The typed confirmation must match exactly. */
export async function deleteStudentsPermanently(repo: Repo, actor: Actor, scope: RosterScope, confirmation: string, now = new Date()): Promise<{ students: number; rows: number }> {
  const list = await scopeStudents(repo, actor, scope, true);
  const expected = `DELETE ${list.length} STUDENTS`;
  if (!list.length) throw new ValidationError("There are no students in this scope.");
  if (s(confirmation).trim().toUpperCase() !== expected) throw new ValidationError(`To delete permanently, type exactly: ${expected}`);
  const ids = list.map((x) => s(x.id)), userIds = list.map((x) => s(x.userId));
  let rows = 0;
  await repo.transaction(async (tx) => {
    const players = await tx.findMany("LiveGamePlayer", { studentId: { in: ids } }, { select: ["id"] });
    if (players.length) { rows += await tx.deleteMany("LiveGameAnswer", { playerId: { in: players.map((p) => p.id) } }); rows += await tx.deleteMany("LiveGamePlayer", { id: { in: players.map((p) => p.id) } }); }
    for (const t of STUDENT_TABLES) rows += await tx.deleteMany(t, { studentId: { in: ids } });
    rows += await tx.deleteMany("Student", { id: { in: ids } });
    await tx.updateMany("AuditLog", { actorId: { in: userIds } }, { actorId: null });   // keep the history, without the person
    rows += await tx.deleteMany("Session", { userId: { in: userIds } });
    rows += await tx.deleteMany("Notification", { userId: { in: userIds } });
    rows += await tx.deleteMany("User", { id: { in: userIds } });
    await tx.create("AuditLog", { actorId: actor.userId, action: "roster.delete", entityType: "Student", entityId: null, after: { count: ids.length, scope }, createdAt: now });
  });
  return { students: ids.length, rows };
}
