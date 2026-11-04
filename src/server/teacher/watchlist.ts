/**
 * 👁️ A teacher's own student watchlist (Oct 2026, daily-reports consolidation): a student tagged "under
 * observation" by the teacher's own judgement, independent of any report's automatic flags. Toggle semantics —
 * watching an already-watched student again un-watches them (dropping any note).
 */
import type { Repo } from "../seeding/repo";
import { assertCan, canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";

const s = (v: unknown) => String(v ?? "");
const NOTE_MAX = 200;

async function myTeacherId(repo: Repo, actor: Actor): Promise<string> {
  const t = (await repo.findMany("Teacher", { userId: actor.userId }, { select: ["id"] }))[0];
  if (!t) throw new ValidationError("Not a teacher.");
  return s(t.id);
}

export async function toggleWatchStudent(repo: Repo, actor: Actor, studentId: string, note?: string, now = new Date()): Promise<{ watching: boolean }> {
  assertCan(actor, "reports:read");
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || st.deletedAt || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("Not your student.");
  const teacherId = await myTeacherId(repo, actor);
  const existing = (await repo.findMany("StudentWatch", { teacherId, studentId }))[0];
  if (existing) { await repo.deleteMany("StudentWatch", { teacherId, studentId }); return { watching: false }; }
  const trimmed = (note ?? "").trim().slice(0, NOTE_MAX);
  await repo.create("StudentWatch", { teacherId, studentId, note: trimmed || null, createdAt: now });
  return { watching: true };
}

/** 🩹 r94-follow-up (perf-budgets fix, Oct 2026): a cheap count for the Reports hub's "Watchlist" badge — that page
 * only ever reads `.length`, so it shouldn't pay for watchedStudentsFor's name/user enrichment (3 extra calls) on
 * every render. One count query, no student/user lookups. */
export async function watchedStudentCount(repo: Repo, actor: Actor): Promise<number> {
  if (actor.role !== "TEACHER") return 0;
  const teacherId = await myTeacherId(repo, actor).catch(() => null);
  if (!teacherId) return 0;
  return repo.count("StudentWatch", { teacherId });
}

export interface WatchedStudent { studentId: string; name: string; note: string | null; since: string }

export async function watchedStudentsFor(repo: Repo, actor: Actor): Promise<WatchedStudent[]> {
  if (actor.role !== "TEACHER") return [];
  const teacherId = await myTeacherId(repo, actor).catch(() => null);
  if (!teacherId) return [];
  const rows = await repo.findMany("StudentWatch", { teacherId }, { select: ["studentId", "note", "createdAt"] });
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => s(r.studentId)))];
  const students = await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] });
  const users = await repo.findMany("User", { id: { in: students.map((st) => s(st.userId)) } }, { select: ["id", "displayName"] });
  const nameOf = (studentId: string) => { const st = students.find((x) => s(x.id) === studentId); const u = st ? users.find((x) => s(x.id) === s(st.userId)) : null; return s(u?.displayName) || "—"; };
  return rows.map((r) => ({ studentId: s(r.studentId), name: nameOf(s(r.studentId)), note: r.note ? s(r.note) : null, since: new Date(r.createdAt as string).toISOString() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
