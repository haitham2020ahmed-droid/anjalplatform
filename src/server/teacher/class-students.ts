/**
 * ➕ Teachers add students to their own class by name (owner r83), fix a typo in a name, and take a student out of
 * their class.
 *
 *   addStudentsByName      paste names (one per line, up to 40) → accounts in THIS class: grade = the class's grade,
 *                          username from the name (the school's rule, quick-students.ts), the next free student number
 *                          (AJ26-001 …), password per the school's rule (= username, or a temporary one). All or nothing.
 *   renameClassStudent     fix the display name of a student in the teacher's own class
 *   removeFromClass        the student leaves THIS class (ClassMembership.leftAt); the account is never deleted
 *                          (deleting / archiving stays with the admin)
 *   teachersCanAddStudents the school's switch "Teachers can add students" (SchoolSetting; ON when never set)
 *
 * Only the class's own teacher (or the school admin): assertClassAccess. Every change is audited (actor = teacher).
 */
import { audit } from "../audit";
import { hashPassword } from "../auth/password";
import { temporaryPassword } from "../auth/passwords-admin";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { cleanName } from "../admin/users";
import { freeStudentNumbers, isUniqueClash, pickUsername, usernameCandidates } from "../admin/quick-students";
import { studentPasswordIsUsername } from "../admin/student-cards";
import { withdrawOldClassWork } from "../admin/student-move";
import { ownClass } from "./class-accounts";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export const TEACHERS_ADD_STUDENTS_KEY = "teachers.addStudents";
export const MAX_NAMES_AT_ONCE = 40;
export const ADDING_OFF_MESSAGE = "Adding students is turned off for teachers in this school. Ask the school admin.";

// ------------------------------------------------------------------ the school's switch

/** "Teachers can add students": ON unless the admin turned it off. */
export async function teachersCanAddStudents(repo: Repo, schoolId: string | null): Promise<boolean> {
  if (!schoolId) return false;
  const row = await repo.findUnique("SchoolSetting", { schoolId, key: TEACHERS_ADD_STUDENTS_KEY });
  if (!row) return true;
  const v = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
  return (v as { on?: boolean } | null)?.on !== false;
}

export async function setTeachersCanAddStudents(repo: Repo, actor: Actor, on: boolean, now = new Date()): Promise<void> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only the school admin can change this.");
  assertCan(actor, "students:manage");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const value = { on: Boolean(on) };
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId, key: TEACHERS_ADD_STUDENTS_KEY }, { value, updatedBy: actor.userId }, { value, updatedBy: actor.userId });
  await audit(repo, { actorId: actor.userId, action: "school.setting.teachersAddStudents", entityType: "School", entityId: actor.schoolId, after: value, at: now });
}

// ------------------------------------------------------------------ the class's students

export interface ClassStudent { studentId: string; userId: string; name: string; username: string; number: string }

/** The students now in the class (light: three small reads, no passwords). */
export async function classStudentList(repo: Repo, actor: Actor, classId: string): Promise<ClassStudent[]> {
  await ownClass(repo, actor, classId);
  const members = await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] });
  if (!members.length) return [];
  const students = await repo.findMany("Student", { id: { in: members.map((m) => s(m.studentId)) }, deletedAt: null }, { select: ["id", "userId", "studentNumber"] });
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) }, role: "STUDENT", deletedAt: null }, { select: ["id", "username", "displayName", "isActive"] }) : [];
  const byId = new Map(users.filter((u) => u.isActive !== false && u.isActive !== 0).map((u) => [s(u.id), u]));
  return students.filter((x) => byId.has(s(x.userId))).map((x) => {
    const u = byId.get(s(x.userId))!;
    return { studentId: s(x.id), userId: s(u.id), name: s(u.displayName), username: s(u.username), number: s(x.studentNumber) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** The open membership of a student in this class, or a refusal (and an audit row) for anyone else's student. */
async function ownStudent(repo: Repo, actor: Actor, klass: Row, studentId: string, now: Date, what: string): Promise<{ st: Row; u: Row }> {
  const member = studentId ? (await repo.findMany("ClassMembership", { classId: klass.id, studentId, leftAt: null }, { select: ["studentId"] }))[0] : null;
  const st = member ? await repo.findUnique("Student", { id: studentId }) : null;
  const u = st ? await repo.findUnique("User", { id: st.userId }) : null;
  if (!member || !st || !u || u.role !== "STUDENT" || u.deletedAt) {
    await audit(repo, { actorId: actor.userId, action: `${what}.denied`, entityType: "Student", entityId: studentId || null, after: { classId: s(klass.id) }, at: now });
    throw new ForbiddenError("This student is not in your class.");
  }
  return { st, u };
}

// ------------------------------------------------------------------ add by name

export interface AddedByName { userId: string; studentId: string; name: string; username: string; number: string; password: string }
export interface AddByNameResult { className: string; grade: number; created: AddedByName[]; skipped: { name: string; reason: string }[] }

const nameKey = (v: string) => v.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim().split(" ").sort().join(" ");

/** One name per line ("1. Sara Ali" → "Sara Ali"); empty lines are skipped. */
export function parseNames(text: string): string[] {
  return s(text).split(/\r?\n/).map((l) => l.replace(/^\s*\d+\s*[.)\-]\s*/, "").trim()).filter(Boolean);
}

/** Usernames already used that the names could pick (read by the name's base, not the whole table). */
async function usedUsernames(repo: Repo, names: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const bases = new Set<string>(), exact = new Set<string>();
  for (const n of names) { const c = usernameCandidates(n); bases.add(c[0] ?? "student"); for (const x of c) exact.add(x); }
  for (const b of bases) for (const u of await repo.findMany("User", { username: { contains: b } }, { select: ["username"] })) out.add(s(u.username).toLowerCase());
  const list = [...exact];
  for (let i = 0; i < list.length; i += 200) for (const u of await repo.findMany("User", { username: { in: list.slice(i, i + 200) } }, { select: ["username"] })) out.add(s(u.username).toLowerCase());
  return out;
}

export async function addStudentsByName(repo: Repo, actor: Actor, input: { classId: string; text: string }, now = new Date()): Promise<AddByNameResult> {
  const klass = await ownClass(repo, actor, input.classId);
  const schoolId = s(klass.schoolId);
  if (actor.role === "TEACHER" && !(await teachersCanAddStudents(repo, schoolId))) throw new ForbiddenError(ADDING_OFF_MESSAGE);
  const raw = parseNames(input.text);
  if (!raw.length) throw new ValidationError("Write at least one student name (one per line).");
  if (raw.length > MAX_NAMES_AT_ONCE) throw new ValidationError(`Add at most ${MAX_NAMES_AT_ONCE} students at a time.`);
  const names = raw.map((n) => cleanName(n, "Student name"));
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const out: AddByNameResult = { className: s(klass.name), grade, created: [], skipped: [] };

  // names already in the class, or twice in the list: skipped (no double accounts)
  const inClass = new Set((await classStudentList(repo, actor, s(klass.id))).map((x) => nameKey(x.name)));
  const todo: string[] = [];
  for (const n of names) {
    const k = nameKey(n);
    if (inClass.has(k)) { out.skipped.push({ name: n, reason: "already in this class" }); continue; }
    inClass.add(k);
    todo.push(n);
  }
  if (!todo.length) return out;

  const sameAsUsername = await studentPasswordIsUsername(repo, schoolId);
  for (let attempt = 0; ; attempt++) {
    // usernames and numbers are read again on a retry (someone else saved the same one at the same moment)
    const taken = await usedUsernames(repo, todo);
    const numbers = await freeStudentNumbers(repo, schoolId, todo.length + attempt, now);
    const list = todo.map((name, i) => {
      const username = pickUsername(name, taken);
      return { name, username, number: numbers[i + attempt], password: sameAsUsername ? username : temporaryPassword() };
    });
    const hashes: string[] = [];
    for (let i = 0; i < list.length; i += 4) hashes.push(...(await Promise.all(list.slice(i, i + 4).map((x) => hashPassword(x.password)))));
    try {
      const made = await repo.transaction(async (tx) => {
        const rows: AddedByName[] = [];
        for (const [i, x] of list.entries()) {
          const u = await tx.create("User", { username: x.username, displayName: x.name, email: null, role: "STUDENT", schoolId, passwordHash: hashes[i], mustChangePassword: !sameAsUsername, isActive: true, createdAt: now, updatedAt: now });
          const st = await tx.create("Student", { userId: u.id, schoolId, gradeId: klass.gradeId, studentNumber: x.number, createdAt: now });
          await tx.create("ClassMembership", { classId: klass.id, studentId: st.id, joinedAt: now });
          rows.push({ userId: s(u.id), studentId: s(st.id), name: x.name, username: x.username, number: x.number, password: x.password });
        }
        return rows;
      });
      out.created = made;
      break;
    } catch (e) {
      if (!isUniqueClash(e) || attempt >= 3) throw isUniqueClash(e) ? new ValidationError("Someone added students at the same moment. Try again.") : e;
    }
  }
  for (const m of out.created) {
    await audit(repo, { actorId: actor.userId, action: "user.create", entityType: "User", entityId: m.userId, after: { username: m.username, displayName: m.name, role: "STUDENT", studentNumber: m.number, classId: s(klass.id), via: "teacher.add-names", password: sameAsUsername ? "username" : "temporary" }, at: now });
  }
  return out;
}

// ------------------------------------------------------------------ fix a name · leave the class

export async function renameClassStudent(repo: Repo, actor: Actor, input: { classId: string; studentId: string; name: string }, now = new Date()): Promise<{ name: string }> {
  const klass = await ownClass(repo, actor, input.classId);
  const { u } = await ownStudent(repo, actor, klass, input.studentId, now, "student.rename");
  const name = cleanName(input.name, "Student name");
  if (name === s(u.displayName)) return { name };
  await repo.updateMany("User", { id: u.id, role: "STUDENT" }, { displayName: name, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "student.rename", entityType: "User", entityId: s(u.id), before: { displayName: s(u.displayName) }, after: { displayName: name, classId: s(klass.id), via: "teacher.class" }, at: now });
  return { name };
}

/** The student leaves this class (the account and all their work stay; the admin can place them in another class). */
export async function removeFromClass(repo: Repo, actor: Actor, input: { classId: string; studentId: string }, now = new Date()): Promise<void> {
  const klass = await ownClass(repo, actor, input.classId);
  const { st } = await ownStudent(repo, actor, klass, input.studentId, now, "student.class.leave");
  await repo.transaction(async (tx) => {
    await tx.updateMany("ClassMembership", { classId: klass.id, studentId: st.id, leftAt: null }, { leftAt: now });
    await withdrawOldClassWork(tx, s(st.id), [s(klass.id)], null); // this class's unfinished work leaves their list
  });
  await audit(repo, { actorId: actor.userId, action: "student.class.leave", entityType: "Student", entityId: s(st.id), before: { classId: s(klass.id) }, after: { classId: null, via: "teacher.class" }, at: now });
}
