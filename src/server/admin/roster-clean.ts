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
export type RosterScope = { kind: "SCHOOL" } | { kind: "GRADE"; grade: number } | { kind: "CLASS"; classId: string } | { kind: "STUDENTS"; ids: string[] };

/** Every table that holds a student's data (deleted before the student). */
const STUDENT_TABLES = ["AdaptiveDecisionLog", "QuestionAttempt", "PracticeSession", "StudentAbility", "AbilitySnapshot", "StudentSkillMastery", "StudentReadingRange",
  "AssignmentStudent", "ExternalAssessmentResult", "MapResult", "Recommendation", "InterventionAlert", "StudentBadge", "XpEvent", "StudentDailyActivity", "DiagnosticResult",
  "DiagnosticScore", "FluencyCheck", "FluencyPractice", "WeeklyCheck",
  "StudentLevel", "StudentReadingLexile", "ReadMasterAttempt", "StudentCategoryLevel", "RespondAssignmentStudent", "MapPlan", "StudentAlert", "StudentWord",
  "WorkComment", "ExitTicketAnswer", "MapSimSession", "TeacherNote", "WritingSubmission", "FamilyReport", "ParentStudent", "ClassMembership"] as const;
// QuestionFlag is kept: it is about the question (the bank's quality), not the student

/** Rows the platform rebuilds from the answers: not in the roster backup (they made it 15 MB per class). */
const BACKUP_DERIVED = ["AdaptiveDecisionLog", "AbilitySnapshot", "Recommendation", "StudentDailyActivity"] as const;
const ANSWER_COLUMNS = ["sessionId", "studentId", "questionId", "skillId", "response", "isCorrect", "partialCredit", "responseMs", "usedHint", "rapidGuess", "createdAt"];

function adminOnly(actor: Actor): void {
  assertCan(actor, "students:manage");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins clean the roster.");
}

/** The scope from a form or a link: ?scope=grade&grade=4 · ?scope=class&classId=… · ?scope=student&id=… · whole school. */
export function parseScope(get: (k: string) => string | null | undefined): RosterScope {
  const kind = String(get("scope") ?? "");
  if (kind === "grade" && get("grade")) return { kind: "GRADE", grade: Number(get("grade")) };
  if (kind === "class" && get("classId")) return { kind: "CLASS", classId: String(get("classId")) };
  if (kind === "student" && get("id")) return { kind: "STUDENTS", ids: [String(get("id"))] };
  return { kind: "SCHOOL" };
}
export function scopeQuery(scope: RosterScope): string {
  return new URLSearchParams({ scope: scope.kind === "STUDENTS" ? "student" : scope.kind.toLowerCase(), ...(scope.kind === "GRADE" ? { grade: String(scope.grade) } : {}), ...(scope.kind === "CLASS" ? { classId: scope.classId } : {}), ...(scope.kind === "STUDENTS" ? { id: scope.ids[0] } : {}) }).toString();
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
  } else if (scope.kind === "STUDENTS") {
    const want = new Set(scope.ids.map(String));
    list = list.filter((x) => want.has(s(x.id)));
  }
  return list;
}

/**
 * Answers per student, COUNTED by the database (index on studentId) instead of loading every
 * attempt row of the school; a few counts run at a time.
 */
async function answerCounts(repo: Repo, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 20) {
    const part = ids.slice(i, i + 20);
    const counts = await Promise.all(part.map((id) => repo.count("QuestionAttempt", { studentId: id })));
    part.forEach((id, k) => out.set(id, counts[k]));
  }
  return out;
}

export interface CleanPreview { students: number; withHistory: number; answers: number; assignments: number; mapScores: number; label: string; confirm: string }

export async function previewClean(repo: Repo, actor: Actor, scope: RosterScope): Promise<CleanPreview> {
  const list = await scopeStudents(repo, actor, scope);
  const ids = list.map((x) => s(x.id));
  const [answers, assignments, mapScores] = ids.length ? await Promise.all([
    answerCounts(repo, ids),
    repo.count("AssignmentStudent", { studentId: { in: ids } }),
    repo.count("MapResult", { studentId: { in: ids } }),
  ]) : [new Map<string, number>(), 0, 0];
  let label = "the whole school";
  if (scope.kind === "GRADE") label = `Grade ${scope.grade}`;
  if (scope.kind === "CLASS") label = `class ${s((await repo.findUnique("Class", { id: scope.classId }))?.name)}`;
  if (scope.kind === "STUDENTS") label = `${ids.length} chosen student(s)`;
  return { students: ids.length, withHistory: [...answers.values()].filter((n) => n > 0).length, answers: [...answers.values()].reduce((t, n) => t + n, 0), assignments, mapScores, label, confirm: `DELETE ${ids.length} STUDENTS` };
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
    // readiness S-15 (15 MB for one class): the engine's decision trail and other rows the platform rebuilds from the
    // answers are left out, and answers keep only the columns needed to read or re-import them
    for (const t of STUDENT_TABLES) {
      if ((BACKUP_DERIVED as readonly string[]).includes(t)) continue;
      tables[t] = await repo.findMany(t, { studentId: { in: ids } }, t === "QuestionAttempt" ? { select: ANSWER_COLUMNS } : undefined);
    }
    const players = await repo.findMany("LiveGamePlayer", { studentId: { in: ids } });
    tables.LiveGamePlayer = players;
    tables.LiveGameAnswer = players.length ? await repo.findMany("LiveGameAnswer", { playerId: { in: players.map((p) => p.id) } }) : [];
  }
  const users = userIds.length ? (await repo.findMany("User", { id: { in: userIds } })).map(({ passwordHash: _p, ...u }) => u) : [];
  return { kind: "roster-backup", createdAt: new Date().toISOString(), scope, students: list, users, tables, leftOut: { tables: [...BACKUP_DERIVED], why: "rebuilt by the platform from the answers (decision log, ability snapshots, recommendations, daily activity)" } };
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

/** Undo an archive: the students can sign in again and go back to the class they left when archived. */
export async function restoreStudents(repo: Repo, actor: Actor, ids: string[], now = new Date()): Promise<number> {
  adminOnly(actor);
  const list = (await repo.findMany("Student", { schoolId: actor.schoolId, id: { in: ids.map(String) } })).filter((x) => x.deletedAt);
  if (!list.length) return 0;
  await repo.transaction(async (tx) => {
    for (const st of list) {
      const at = new Date(st.deletedAt as string | Date).getTime();
      const last = (await tx.findMany("ClassMembership", { studentId: st.id })).filter((m) => m.leftAt && Math.abs(new Date(m.leftAt as string | Date).getTime() - at) < 60_000)[0];
      const klass = last ? await tx.findUnique("Class", { id: last.classId }) : null;
      if (last && klass && !klass.deletedAt && !(await tx.findMany("ClassMembership", { studentId: st.id, leftAt: null })).length) await tx.updateMany("ClassMembership", { classId: last.classId, studentId: st.id }, { leftAt: null });
      await tx.updateMany("Student", { id: st.id }, { deletedAt: null });
      await tx.updateMany("User", { id: st.userId }, { isActive: true, deletedAt: null });
    }
    await tx.create("AuditLog", { actorId: actor.userId, action: "roster.restore", entityType: "Student", entityId: null, after: { count: list.length }, createdAt: now });
  });
  return list.length;
}

export interface RosterStudent { id: string; userId: string; name: string; username: string; number: string; grade: number; className: string; archived: boolean; answers: number }
/** The roster to manage one by one (archived students too, to restore them). */
export async function rosterList(repo: Repo, actor: Actor, scope: RosterScope): Promise<RosterStudent[]> {
  const list = await scopeStudents(repo, actor, scope, true);
  if (!list.length) return [];
  const ids = list.map((x) => s(x.id));
  const [users, grades, mem, attempts] = await Promise.all([
    repo.findMany("User", { id: { in: list.map((x) => s(x.userId)) } }, { select: ["id", "username", "displayName"] }),
    repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] }),
    repo.findMany("ClassMembership", { studentId: { in: ids }, leftAt: null }, { select: ["studentId", "classId"] }),
    answerCounts(repo, ids),
  ]);
  const classes = mem.length ? await repo.findMany("Class", { id: { in: [...new Set(mem.map((m) => s(m.classId)))] } }, { select: ["id", "name"] }) : [];
  const n = attempts;
  return list.map((st) => {
    const u = users.find((x) => x.id === st.userId);
    const m = mem.find((x) => x.studentId === st.id);
    return { id: s(st.id), userId: s(st.userId), name: s(u?.displayName), username: s(u?.username), number: s(st.studentNumber), grade: Number(grades.find((g) => g.id === st.gradeId)?.level ?? 0), className: s(classes.find((c) => c.id === m?.classId)?.name), archived: Boolean(st.deletedAt), answers: n.get(s(st.id)) ?? 0 };
  }).sort((a, b) => Number(a.archived) - Number(b.archived) || a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
}
