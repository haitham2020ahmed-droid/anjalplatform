/**
 * User management (Phase 11): create, edit, deactivate users; teacher ↔ class
 * assignments; student class moves; parent ↔ child links.
 *
 * Rules
 *  - Everything is scoped to the admin's own school. SUPER_ADMIN accounts are never
 *    created, edited or listed here.
 *  - Students and parents need students:manage; teachers and school admins need
 *    teachers:manage; class assignments and moves need classes:manage.
 *  - New accounts get a readable temporary password, shown once to the admin and
 *    stored only as a hash; the user must change it at first login.
 *  - Deactivating a user signs them out everywhere. Nobody can deactivate themself.
 *  - No hard deletes: student history (answers, mastery, MAP results) must survive.
 *  - Every change is audited with before/after values (secrets redacted).
 */
import { audit } from "../audit";
import { resetLevelsForNewGrade, withdrawOldClassWork } from "./student-move";
import { hashPassword } from "../auth/password";
import { temporaryPassword } from "../auth/passwords-admin";
import { studentPasswordIsUsername } from "./student-cards";
import { assertCan, can, ForbiddenError, permissionMessage, type Actor, type Permission, type Role } from "../auth/rbac";
import { revokeAllSessions } from "../auth/sessions";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { freeStudentNumbers, isUniqueClash } from "./quick-students";

export const MANAGED_ROLES = ["SCHOOL_ADMIN", "TEACHER", "STUDENT", "PARENT"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,}$/;
const STUDENT_NO = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
const CONTROL = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Trims, removes control and bidi-override characters, collapses spaces. */
export function cleanName(v: unknown, field = "Name", max = 100): string {
  const s = String(v ?? "").replace(CONTROL, "").replace(/\s+/g, " ").trim();
  if (!s) throw new ValidationError(`${field} is required.`);
  if (s.length > max) throw new ValidationError(`${field} must be ${max} characters or fewer.`);
  return s;
}

export function cleanUsername(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (!USERNAME.test(s)) throw new ValidationError("Usernames are 3–40 characters: lowercase letters, digits, dot, dash or underscore, starting with a letter or digit.");
  return s;
}

const permFor = (role: string): Permission => (role === "STUDENT" || role === "PARENT" ? "students:manage" : "teachers:manage");

export function schoolOf(actor: Actor): string {
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  return actor.schoolId;
}

/** The target user, if this admin may manage them (same school, managed role, permission for that role). */
export async function manageableUser(repo: Repo, actor: Actor, userId: string): Promise<Row> {
  const u = await repo.findUnique("User", { id: userId });
  if (!u || u.deletedAt || u.role === "SUPER_ADMIN" || u.schoolId !== schoolOf(actor)) throw new ForbiddenError("User not found.");
  assertCan(actor, permFor(String(u.role)));
  return u;
}

async function classInSchool(repo: Repo, actor: Actor, classId: string): Promise<Row> {
  const c = await repo.findUnique("Class", { id: classId });
  if (!c || c.deletedAt || c.schoolId !== schoolOf(actor)) throw new ValidationError("Class not found in this school.");
  return c;
}

// ------------------------------------------------------------ who has it?

/**
 * A clash with an account the admin may not see in the normal list (an archived = "removed" student, or a deactivated
 * account): the message names the account and `href` opens it in Users with "Show removed / inactive" on, where it can
 * be restored. Never "already exists" about an account nobody can find (owner r83).
 */
export class AccountClashError extends ValidationError {
  constructor(message: string, readonly href: string) { super(message); }
}

export interface AccountHolder { userId: string; studentId: string | null; name: string; username: string; place: string; state: "active" | "inactive" | "removed"; removedOn: string | null; schoolId: string | null }

const day = (v: unknown) => (v ? new Date(v as string | Date).toISOString().slice(0, 10) : null);
const time = (v: unknown) => (v ? new Date(v as string | Date).getTime() : 0);

async function holderOf(repo: Repo, u: Row, st: Row | null): Promise<AccountHolder> {
  let place = "no class";
  if (st) {
    // the open class, else the class the student was in last (archived students left it when archived)
    const ms = await repo.findMany("ClassMembership", { studentId: st.id }, { select: ["classId", "leftAt"] });
    const last = ms.find((m) => !m.leftAt) ?? [...ms].sort((a, b) => time(b.leftAt) - time(a.leftAt))[0];
    const c = last ? await repo.findUnique("Class", { id: last.classId }) : null;
    if (c) place = String(c.name);
  }
  const removed = Boolean(u.deletedAt || st?.deletedAt);
  return {
    userId: String(u.id), studentId: st ? String(st.id) : null, name: String(u.displayName), username: String(u.username), place,
    state: removed ? "removed" : u.isActive === false || u.isActive === 0 ? "inactive" : "active",
    removedOn: removed ? day(u.deletedAt ?? st?.deletedAt) : null, schoolId: u.schoolId ? String(u.schoolId) : null,
  };
}

/** Who has this student number in the school (archived students too). */
export async function studentNumberHolder(repo: Repo, schoolId: string, studentNumber: string): Promise<AccountHolder | null> {
  const st = await repo.findUnique("Student", { schoolId, studentNumber });
  if (!st) return null;
  const u = await repo.findUnique("User", { id: st.userId });
  return u ? holderOf(repo, u, st) : null;
}

/** Who has this username (any school; the caller describes only same-school holders). */
export async function usernameHolder(repo: Repo, username: string): Promise<AccountHolder | null> {
  const u = await repo.findUnique("User", { username });
  if (!u) return null;
  const st = u.role === "STUDENT" ? await repo.findUnique("Student", { userId: u.id }) : null;
  return holderOf(repo, u, st);
}

/** "Sara Ali (4A, removed on 2026-10-01)" · "Sara Ali (no class, inactive)" · "Sara Ali (4A)" · a teacher: "Noura Saleh". */
export function holderText(h: AccountHolder): string {
  const parts = [h.studentId ? h.place : "", h.state === "removed" ? `removed on ${h.removedOn}` : h.state === "inactive" ? "inactive" : ""].filter(Boolean);
  return parts.length ? `${h.name} (${parts.join(", ")})` : h.name;
}

/** Users, filtered to this one account, with removed / inactive accounts shown (Restore is there). */
export const holderHref = (h: AccountHolder) => `/admin/users?${new URLSearchParams({ inactive: "1", q: h.username })}`;

export function studentNumberClash(h: AccountHolder, number: string): AccountClashError {
  const tail = h.state === "removed" ? " Restore that account, or leave the number empty to get a new one." : " Leave the number empty to get a new one.";
  return new AccountClashError(`Student number ${number} is used by ${holderText(h)}.${tail}`, holderHref(h));
}

/** Throws a clear message when the username is used: who has it (same school) and a link to that account. */
export async function assertUsernameFree(repo: Repo, schoolId: string, username: string): Promise<void> {
  const h = await usernameHolder(repo, username);
  if (!h) return;
  if (h.schoolId !== schoolId) throw new ValidationError(`Username "${username}" is already taken.`);
  const tail = h.state === "removed" ? " Restore that account instead, or choose another username." : " Choose another username.";
  throw new AccountClashError(`Username "${username}" is already taken by ${holderText(h)}.${tail}`, holderHref(h));
}

// ------------------------------------------------------------------- list

export interface UserListItem {
  userId: string;
  username: string;
  displayName: string;
  role: ManagedRole;
  isActive: boolean;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  studentNumber: string | null;
  grade: number | null;
  className: string | null;
  classes: string[]; // teachers: classes taught
  children: string[]; // parents: children's names
  /** students: for Restore */
  studentId: string | null;
  /** archived ("removed", Clean roster): listed only with "Show removed / inactive" */
  removedOn: string | null;
}

export async function listUsers(repo: Repo, actor: Actor, filter: { role?: ManagedRole; q?: string; includeInactive?: boolean } = {}): Promise<UserListItem[]> {
  const schoolId = schoolOf(actor);
  const canStudents = can(actor, "students:manage");
  const canStaff = can(actor, "teachers:manage");
  if (!canStudents && !canStaff) throw new ForbiddenError(permissionMessage("students:manage"), "students:manage");
  const roles = MANAGED_ROLES.filter((r) => (r === "STUDENT" || r === "PARENT" ? canStudents : canStaff)).filter((r) => !filter.role || r === filter.role);
  let users = (await repo.findMany("User", { schoolId, role: { in: [...roles] } })).filter((u) => filter.includeInactive || (!u.deletedAt && u.isActive));
  const q = (filter.q ?? "").trim().toLowerCase();
  const ids = users.map((u) => u.id);
  const [students, teachers, parents] = await Promise.all([
    ids.length ? repo.findMany("Student", { userId: { in: ids } }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("Teacher", { userId: { in: ids } }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("Parent", { userId: { in: ids } }) : Promise.resolve([] as Row[]),
  ]);
  const [members, classTeachers, links, grades, classes] = await Promise.all([
    students.length ? repo.findMany("ClassMembership", { studentId: { in: students.map((s) => s.id) }, leftAt: null }) : Promise.resolve([] as Row[]),
    teachers.length ? repo.findMany("ClassTeacher", { teacherId: { in: teachers.map((t) => t.id) } }) : Promise.resolve([] as Row[]),
    parents.length ? repo.findMany("ParentStudent", { parentId: { in: parents.map((p) => p.id) } }) : Promise.resolve([] as Row[]),
    repo.findMany("Grade", { schoolId }),
    repo.findMany("Class", { schoolId }),
  ]);
  // removed students left their class when archived: show the class they were in last (one read, removed ones only)
  const gone = students.filter((x) => x.deletedAt || users.find((u) => u.id === x.userId)?.deletedAt).map((x) => String(x.id));
  const lastOf = new Map<string, Row>();
  if (gone.length) for (const m of (await repo.findMany("ClassMembership", { studentId: { in: gone } }, { select: ["studentId", "classId", "leftAt"] })).sort((a, b) => time(a.leftAt) - time(b.leftAt))) lastOf.set(String(m.studentId), m);
  const childStudents = links.length ? await repo.findMany("Student", { id: { in: links.map((l) => l.studentId) } }) : [];
  const childUsers = childStudents.length ? await repo.findMany("User", { id: { in: childStudents.map((s) => s.userId) } }) : [];
  const className = (id: unknown) => String(classes.find((c) => c.id === id)?.name ?? "");
  const items: UserListItem[] = users.map((u) => {
    const st = students.find((s) => s.userId === u.id);
    const te = teachers.find((t) => t.userId === u.id);
    const pa = parents.find((p) => p.userId === u.id);
    const m = st ? members.find((x) => x.studentId === st.id) ?? lastOf.get(String(st.id)) : undefined;
    const removed = u.deletedAt ?? st?.deletedAt ?? null;
    return {
      userId: String(u.id), username: String(u.username), displayName: String(u.displayName), role: String(u.role) as ManagedRole,
      isActive: Boolean(u.isActive), mustChangePassword: Boolean(u.mustChangePassword),
      lastLoginAt: u.lastLoginAt ? new Date(String(u.lastLoginAt instanceof Date ? u.lastLoginAt.toISOString() : u.lastLoginAt)).toISOString() : null,
      studentNumber: st ? String(st.studentNumber) : null,
      grade: st ? Number(grades.find((g) => g.id === st.gradeId)?.level ?? 0) : null,
      className: m ? className(m.classId) : null,
      classes: te ? classTeachers.filter((c) => c.teacherId === te.id).map((c) => className(c.classId)).sort() : [],
      studentId: st ? String(st.id) : null, removedOn: removed ? day(removed) : null,
      children: pa ? links.filter((l) => l.parentId === pa.id).map((l) => String(childUsers.find((cu) => cu.id === childStudents.find((s) => s.id === l.studentId)?.userId)?.displayName ?? "")) : [],
    };
  });
  return items
    .filter((i) => !q || [i.username, i.displayName, i.studentNumber ?? ""].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => a.role.localeCompare(b.role) || a.displayName.localeCompare(b.displayName));
}

// ----------------------------------------------------------------- create

export interface NewUser {
  role: ManagedRole;
  username: string;
  displayName: string;
  email?: string | null;
  /** students: empty = the next free number of the school's series (AJ26-001 …) */
  studentNumber?: string;
  gradeLevel?: number;
  classId?: string | null;
  /** teachers */
  title?: string | null;
}

export async function createUser(repo: Repo, actor: Actor, input: NewUser, now = new Date()): Promise<{ userId: string; temporaryPassword: string; studentNumber: string | null }> {
  const schoolId = schoolOf(actor);
  if (!(MANAGED_ROLES as readonly string[]).includes(input.role)) throw new ValidationError("Choose a role.");
  assertCan(actor, permFor(input.role));
  const username = cleanUsername(input.username);
  const displayName = cleanName(input.displayName);
  const email = input.email ? String(input.email).trim().toLowerCase() : null;
  if (email && !EMAIL.test(email)) throw new ValidationError("Email address is not valid.");
  await assertUsernameFree(repo, schoolId, username);
  if (email) {
    const other = await repo.findUnique("User", { email });
    if (other) {
      const h = other.schoolId === schoolId ? await usernameHolder(repo, String(other.username)) : null;
      if (!h) throw new ValidationError("That email address is already used by another account.");
      throw new AccountClashError(`That email address is already used by ${holderText(h)}.`, holderHref(h));
    }
  }

  let gradeId: string | null = null;
  let studentNumber: string | null = null;
  let autoNumber = false;
  if (input.role === "STUDENT") {
    studentNumber = String(input.studentNumber ?? "").trim();
    if (!studentNumber) autoNumber = true;
    else {
      if (!STUDENT_NO.test(studentNumber)) throw new ValidationError("Student number: letters, digits and dashes only (or leave it empty to get one automatically).");
      const h = await studentNumberHolder(repo, schoolId, studentNumber);
      if (h) throw studentNumberClash(h, studentNumber);
    }
    const grade = (await repo.findMany("Grade", { schoolId, level: Number(input.gradeLevel) }))[0];
    if (!grade) throw new ValidationError("Choose a grade that exists in this school.");
    gradeId = String(grade.id);
    if (input.classId) {
      const c = await classInSchool(repo, actor, input.classId);
      if (c.gradeId !== gradeId) throw new ValidationError("The class belongs to a different grade.");
    }
  }

  // the school's choice for students: password = username (no forced change), else a temporary one
  const sameAsUsername = input.role === "STUDENT" && (await studentPasswordIsUsername(repo, schoolId));
  const temp = sameAsUsername ? username : temporaryPassword();
  const passwordHash = await hashPassword(temp);
  let userId = "";
  // an automatic number taken at the same moment by someone else (two admins, a teacher): take the next one and retry
  for (let attempt = 0; ; attempt++) {
    if (autoNumber) studentNumber = (await freeStudentNumbers(repo, schoolId, attempt + 1, now))[attempt];
    try {
      userId = await repo.transaction(async (tx) => {
        const u = await tx.create("User", { username, displayName, email, role: input.role, schoolId, passwordHash, mustChangePassword: !sameAsUsername, isActive: true, createdAt: now, updatedAt: now });
        if (input.role === "TEACHER") await tx.create("Teacher", { userId: u.id, schoolId, title: input.title ? cleanName(input.title, "Title", 20) : null });
        if (input.role === "PARENT") await tx.create("Parent", { userId: u.id });
        if (input.role === "STUDENT") {
          const st = await tx.create("Student", { userId: u.id, schoolId, gradeId, studentNumber, createdAt: now });
          if (input.classId) await tx.create("ClassMembership", { classId: input.classId, studentId: st.id, joinedAt: now });
        }
        return String(u.id);
      });
      break;
    } catch (e) {
      if (!isUniqueClash(e)) throw e;
      const userTaken = Boolean(await repo.findUnique("User", { username }));
      if (!autoNumber || userTaken || attempt >= 4) {
        if (userTaken) await assertUsernameFree(repo, schoolId, username);
        if (studentNumber) { const h = await studentNumberHolder(repo, schoolId, studentNumber); if (h) throw studentNumberClash(h, studentNumber); }
        throw new ValidationError("Someone saved the same account at the same moment. Try again.");
      }
    }
  }
  await audit(repo, { actorId: actor.userId, action: "user.create", entityType: "User", entityId: userId, after: { username, displayName, role: input.role, studentNumber, autoNumber, classId: input.classId ?? null }, at: now });
  return { userId, temporaryPassword: temp, studentNumber };
}

// ----------------------------------------------------------------- update

export async function updateUser(repo: Repo, actor: Actor, userId: string, patch: { displayName?: string; email?: string | null; isActive?: boolean; title?: string | null }, now = new Date()): Promise<void> {
  const u = await manageableUser(repo, actor, userId);
  const data: Row = {};
  if (patch.displayName !== undefined) data.displayName = cleanName(patch.displayName);
  if (patch.email !== undefined) {
    const email = patch.email ? String(patch.email).trim().toLowerCase() : null;
    if (email && !EMAIL.test(email)) throw new ValidationError("Email address is not valid.");
    const other = email ? await repo.findUnique("User", { email }) : null;
    if (other && other.id !== userId) throw new ValidationError("That email address is already used by another account.");
    data.email = email;
  }
  if (patch.isActive !== undefined) {
    if (!patch.isActive && userId === actor.userId) throw new ValidationError("You cannot deactivate your own account.");
    data.isActive = patch.isActive;
  }
  if (Object.keys(data).length) await repo.updateMany("User", { id: userId }, { ...data, updatedAt: now });
  if (patch.title !== undefined && u.role === "TEACHER") await repo.updateMany("Teacher", { userId }, { title: patch.title ? cleanName(patch.title, "Title", 20) : null });
  if (patch.isActive === false && u.isActive) await revokeAllSessions(repo, userId);
  const before = Object.fromEntries(Object.keys(data).map((k) => [k, u[k] ?? null]));
  await audit(repo, { actorId: actor.userId, action: patch.isActive === false ? "user.deactivate" : patch.isActive === true && !u.isActive ? "user.reactivate" : "user.update", entityType: "User", entityId: userId, before, after: { ...data, ...(patch.title !== undefined ? { title: patch.title } : {}) }, at: now });
}

// ------------------------------------------------------- classes and links

/** Replace the set of classes a teacher teaches (classes:manage). */
export async function setTeacherClasses(repo: Repo, actor: Actor, teacherUserId: string, classIds: string[], now = new Date()): Promise<void> {
  assertCan(actor, "classes:manage");
  const u = await manageableUser(repo, actor, teacherUserId);
  if (u.role !== "TEACHER") throw new ValidationError("Only teachers can be assigned to classes.");
  const t = (await repo.findUnique("Teacher", { userId: teacherUserId }))!;
  const wanted = [...new Set(classIds)];
  for (const id of wanted) await classInSchool(repo, actor, id);
  const current = (await repo.findMany("ClassTeacher", { teacherId: t.id })).map((c) => String(c.classId));
  await repo.transaction(async (tx) => {
    const remove = current.filter((c) => !wanted.includes(c));
    if (remove.length) await tx.deleteMany("ClassTeacher", { teacherId: t.id, classId: { in: remove } });
    for (const c of wanted.filter((c) => !current.includes(c))) await tx.create("ClassTeacher", { classId: c, teacherId: t.id });
  });
  await audit(repo, { actorId: actor.userId, action: "teacher.classes.set", entityType: "Teacher", entityId: String(t.id), before: { classIds: current }, after: { classIds: wanted }, at: now });
}

/**
 * Move a student to a class (or remove from all classes with classId = null).
 * The old membership is closed (leftAt), not deleted, so class history stays correct.
 * Moving into a class of another grade also changes the student's grade (promotion).
 * Returns how many of the student's open assignments in their old class(es) were withdrawn (owner request, Oct
 * 2026: the count used to be computed and thrown away, so a teacher seeing an assignment vanish from a moved
 * student's My Work had no way to connect it back to the move).
 */
export async function moveStudent(repo: Repo, actor: Actor, studentUserId: string, classId: string | null, now = new Date()): Promise<{ withdrawn: number }> {
  assertCan(actor, "classes:manage");
  const u = await manageableUser(repo, actor, studentUserId);
  if (u.role !== "STUDENT") throw new ValidationError("Only students can be moved between classes.");
  const st = (await repo.findUnique("Student", { userId: studentUserId }))!;
  const target = classId ? await classInSchool(repo, actor, classId) : null;
  const open = await repo.findMany("ClassMembership", { studentId: st.id, leftAt: null });
  if (target && open.length === 1 && open[0].classId === classId) return { withdrawn: 0 };
  const withdrawn = await repo.transaction(async (tx) => {
    for (const m of open) await tx.updateMany("ClassMembership", { classId: m.classId, studentId: st.id }, { leftAt: now });
    if (target) {
      const prior = await tx.findUnique("ClassMembership", { classId: target.id, studentId: st.id });
      if (prior) await tx.updateMany("ClassMembership", { classId: target.id, studentId: st.id }, { leftAt: null, joinedAt: now });
      else await tx.create("ClassMembership", { classId: target.id, studentId: st.id, joinedAt: now });
      if (target.gradeId !== st.gradeId) {
        await tx.updateMany("Student", { id: st.id }, { gradeId: target.gradeId });
        await resetLevelsForNewGrade(tx, String(st.id), actor.userId, now, String(st.gradeId), String(target.gradeId));
      }
    }
    // unfinished work of the old class leaves the student's list (S-9)
    return withdrawOldClassWork(tx, String(st.id), open.map((m) => String(m.classId)), target ? String(target.id) : null);
  });
  await audit(repo, { actorId: actor.userId, action: "student.class.move", entityType: "Student", entityId: String(st.id), before: { classIds: open.map((m) => String(m.classId)), gradeId: st.gradeId }, after: { classId, gradeId: target?.gradeId ?? st.gradeId, withdrawn }, at: now });
  return { withdrawn };
}

export async function linkParent(repo: Repo, actor: Actor, parentUserId: string, studentUserId: string, relationship: string | null, now = new Date()): Promise<void> {
  const p = await manageableUser(repo, actor, parentUserId);
  const s = await manageableUser(repo, actor, studentUserId);
  if (p.role !== "PARENT" || s.role !== "STUDENT") throw new ValidationError("Link a parent account to a student account.");
  const parent = (await repo.findUnique("Parent", { userId: parentUserId }))!;
  const st = (await repo.findUnique("Student", { userId: studentUserId }))!;
  const rel = relationship ? cleanName(relationship, "Relationship", 30).toLowerCase() : null;
  await repo.upsert("ParentStudent", { parentId: parent.id, studentId: st.id }, { relationship: rel }, { relationship: rel });
  await audit(repo, { actorId: actor.userId, action: "parent.link", entityType: "Student", entityId: String(st.id), after: { parentId: parent.id, relationship: rel }, at: now });
}

export async function unlinkParent(repo: Repo, actor: Actor, parentUserId: string, studentUserId: string, now = new Date()): Promise<void> {
  await manageableUser(repo, actor, parentUserId);
  await manageableUser(repo, actor, studentUserId);
  const parent = await repo.findUnique("Parent", { userId: parentUserId });
  const st = await repo.findUnique("Student", { userId: studentUserId });
  if (!parent || !st) throw new ValidationError("Link a parent account to a student account.");
  const n = await repo.deleteMany("ParentStudent", { parentId: parent.id, studentId: st.id });
  if (n) await audit(repo, { actorId: actor.userId, action: "parent.unlink", entityType: "Student", entityId: String(st.id), before: { parentId: parent.id }, at: now });
}

export type { Role };
