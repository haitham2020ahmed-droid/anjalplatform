/**
 * 🪪 Student sign-in cards and the school's "password = username" choice for students.
 *
 * The school decided that every student's password is exactly their username (young students, shared devices,
 * no confusion). This module:
 *   - studentCards                     the active students of the school (or one grade / one class) for the printable
 *                                      cards page (browser "Save as PDF" makes the PDF; Arabic names print correctly);
 *   - setStudentPasswordsToUsername    sets password = username for those students (no forced change, unlocks the
 *                                      account) and, when asked, keeps doing it for students added later;
 *   - studentPasswordIsUsername        the saved choice, read by createUser / roster import for new students.
 * Staff and parent passwords are never touched. Admin only, own school only, audited.
 */
import { audit } from "../audit";
import { hashPassword } from "../auth/password";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo } from "../seeding/repo";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export const STUDENT_PASSWORD_KEY = "students.passwordMode";

export interface StudentCard { userId: string; name: string; username: string; number: string; className: string; grade: number }
export interface CardFilter { classId?: string | null; grade?: number | null }

function adminSchool(actor: Actor): string {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only a school admin can do this.");
  assertCan(actor, "students:manage");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  return actor.schoolId;
}

/** The active students of the school (optionally one grade or one class), sorted by class then name. */
export async function studentCards(repo: Repo, actor: Actor, filter: CardFilter = {}): Promise<StudentCard[]> {
  const schoolId = adminSchool(actor);
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const levelOf = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const classes = await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "name", "gradeId"] });
  const classById = new Map(classes.map((c) => [s(c.id), c]));
  if (filter.classId && !classById.has(filter.classId)) throw new ValidationError("Choose a class of this school.");
  const where: Record<string, unknown> = { schoolId };
  if (filter.grade) {
    const gid = grades.find((g) => Number(g.level) === Number(filter.grade));
    if (!gid) throw new ValidationError("Choose a grade of this school.");
    where.gradeId = s(gid.id);
  }
  let students = await repo.findMany("Student", where, { select: ["id", "userId", "gradeId", "studentNumber"] });
  const ids = students.map((x) => s(x.id));
  const members = ids.length ? await repo.findMany("ClassMembership", { studentId: { in: ids }, leftAt: null }, { select: ["studentId", "classId"] }) : [];
  const classOf = new Map<string, string>();
  for (const m of members) if (classById.has(s(m.classId))) classOf.set(s(m.studentId), s(m.classId));
  if (filter.classId) students = students.filter((x) => classOf.get(s(x.id)) === filter.classId);
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) }, role: "STUDENT", isActive: true, deletedAt: null }, { select: ["id", "username", "displayName"] }) : [];
  const userById = new Map(users.map((u) => [s(u.id), u]));
  const out: StudentCard[] = [];
  for (const st of students) {
    const u = userById.get(s(st.userId));
    if (!u) continue;
    const c = classById.get(classOf.get(s(st.id)) ?? "");
    out.push({ userId: s(u.id), name: s(u.displayName), username: s(u.username), number: s(st.studentNumber), className: c ? s(c.name) : "No class", grade: levelOf.get(s(st.gradeId)) ?? 0 });
  }
  return out.sort((a, b) => a.grade - b.grade || a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
}

/** True when the school chose "a student's password is their username" (also for students added later). */
export async function studentPasswordIsUsername(repo: Repo, schoolId: string | null): Promise<boolean> {
  if (!schoolId) return false;
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: STUDENT_PASSWORD_KEY }))[0];
  const v = row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null;
  return (v as { mode?: string } | null)?.mode === "USERNAME";
}

/** Password = username for the chosen students (scrypt runs 4 at a time). Returns how many were set. */
export async function setStudentPasswordsToUsername(repo: Repo, actor: Actor, filter: CardFilter & { forNewStudents?: boolean } = {}, now = new Date()): Promise<{ updated: number; forNewStudents: boolean }> {
  const schoolId = adminSchool(actor);
  const cards = await studentCards(repo, actor, filter);
  let updated = 0;
  for (let i = 0; i < cards.length; i += 4) {
    const part = cards.slice(i, i + 4);
    const hashes = await Promise.all(part.map((c) => hashPassword(c.username)));
    for (let k = 0; k < part.length; k++) {
      updated += await repo.updateMany("User", { id: part[k].userId, role: "STUDENT", schoolId }, { passwordHash: hashes[k], mustChangePassword: false, failedLogins: 0, lockedUntil: null, passwordChangedAt: now });
    }
  }
  const forNew = filter.forNewStudents !== false;
  if (forNew) await repo.upsert("SchoolSetting", { schoolId, key: STUDENT_PASSWORD_KEY }, { value: { mode: "USERNAME" }, updatedBy: actor.userId }, { value: { mode: "USERNAME" }, updatedBy: actor.userId });
  await audit(repo, { actorId: actor.userId, action: "students.password.username", entityType: "School", entityId: schoolId, after: { updated, classId: filter.classId ?? null, grade: filter.grade ?? null, forNewStudents: forNew }, at: now });
  return { updated, forNewStudents: forNew };
}

/** Back to temporary passwords for students added from now on (existing passwords stay as they are). */
export async function stopUsernamePasswords(repo: Repo, actor: Actor, now = new Date()): Promise<void> {
  const schoolId = adminSchool(actor);
  await repo.deleteMany("SchoolSetting", { schoolId, key: STUDENT_PASSWORD_KEY });
  await audit(repo, { actorId: actor.userId, action: "students.password.username.off", entityType: "School", entityId: schoolId, at: now });
}
