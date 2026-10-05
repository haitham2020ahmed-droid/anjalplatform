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
import { hashPassword } from "../auth/password";
import { temporaryPassword } from "../auth/passwords-admin";
import { assertCan, can, ForbiddenError, type Actor, type Permission, type Role } from "../auth/rbac";
import { revokeAllSessions } from "../auth/sessions";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";

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
}

export async function listUsers(repo: Repo, actor: Actor, filter: { role?: ManagedRole; q?: string; includeInactive?: boolean } = {}): Promise<UserListItem[]> {
  const schoolId = schoolOf(actor);
  const canStudents = can(actor, "students:manage");
  const canStaff = can(actor, "teachers:manage");
  if (!canStudents && !canStaff) throw new ForbiddenError("Missing permission: students:manage");
  const roles = MANAGED_ROLES.filter((r) => (r === "STUDENT" || r === "PARENT" ? canStudents : canStaff)).filter((r) => !filter.role || r === filter.role);
  let users = (await repo.findMany("User", { schoolId, role: { in: [...roles] } })).filter((u) => !u.deletedAt && (filter.includeInactive || u.isActive));
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
  const childStudents = links.length ? await repo.findMany("Student", { id: { in: links.map((l) => l.studentId) } }) : [];
  const childUsers = childStudents.length ? await repo.findMany("User", { id: { in: childStudents.map((s) => s.userId) } }) : [];
  const className = (id: unknown) => String(classes.find((c) => c.id === id)?.name ?? "");
  const items: UserListItem[] = users.map((u) => {
    const st = students.find((s) => s.userId === u.id);
    const te = teachers.find((t) => t.userId === u.id);
    const pa = parents.find((p) => p.userId === u.id);
    const m = st ? members.find((x) => x.studentId === st.id) : undefined;
    return {
      userId: String(u.id), username: String(u.username), displayName: String(u.displayName), role: String(u.role) as ManagedRole,
      isActive: Boolean(u.isActive), mustChangePassword: Boolean(u.mustChangePassword),
      lastLoginAt: u.lastLoginAt ? new Date(String(u.lastLoginAt instanceof Date ? u.lastLoginAt.toISOString() : u.lastLoginAt)).toISOString() : null,
      studentNumber: st ? String(st.studentNumber) : null,
      grade: st ? Number(grades.find((g) => g.id === st.gradeId)?.level ?? 0) : null,
      className: m ? className(m.classId) : null,
      classes: te ? classTeachers.filter((c) => c.teacherId === te.id).map((c) => className(c.classId)).sort() : [],
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
  /** students */
  studentNumber?: string;
  gradeLevel?: number;
  classId?: string | null;
  /** teachers */
  title?: string | null;
}

export async function createUser(repo: Repo, actor: Actor, input: NewUser, now = new Date()): Promise<{ userId: string; temporaryPassword: string }> {
  const schoolId = schoolOf(actor);
  if (!(MANAGED_ROLES as readonly string[]).includes(input.role)) throw new ValidationError("Choose a role.");
  assertCan(actor, permFor(input.role));
  const username = cleanUsername(input.username);
  const displayName = cleanName(input.displayName);
  const email = input.email ? String(input.email).trim().toLowerCase() : null;
  if (email && !EMAIL.test(email)) throw new ValidationError("Email address is not valid.");
  if (await repo.findUnique("User", { username })) throw new ValidationError(`Username "${username}" is already taken.`);
  if (email && (await repo.findUnique("User", { email }))) throw new ValidationError("That email address is already used by another account.");

  let gradeId: string | null = null;
  let studentNumber: string | null = null;
  if (input.role === "STUDENT") {
    studentNumber = String(input.studentNumber ?? "").trim();
    if (!STUDENT_NO.test(studentNumber)) throw new ValidationError("Student number is required (letters, digits and dashes).");
    if (await repo.findUnique("Student", { schoolId, studentNumber })) throw new ValidationError(`Student number ${studentNumber} already exists.`);
    const grade = (await repo.findMany("Grade", { schoolId, level: Number(input.gradeLevel) }))[0];
    if (!grade) throw new ValidationError("Choose a grade that exists in this school.");
    gradeId = String(grade.id);
    if (input.classId) {
      const c = await classInSchool(repo, actor, input.classId);
      if (c.gradeId !== gradeId) throw new ValidationError("The class belongs to a different grade.");
    }
  }

  const temp = temporaryPassword();
  const passwordHash = await hashPassword(temp);
  const userId = await repo.transaction(async (tx) => {
    const u = await tx.create("User", { username, displayName, email, role: input.role, schoolId, passwordHash, mustChangePassword: true, isActive: true, createdAt: now, updatedAt: now });
    if (input.role === "TEACHER") await tx.create("Teacher", { userId: u.id, schoolId, title: input.title ? cleanName(input.title, "Title", 20) : null });
    if (input.role === "PARENT") await tx.create("Parent", { userId: u.id });
    if (input.role === "STUDENT") {
      const st = await tx.create("Student", { userId: u.id, schoolId, gradeId, studentNumber, createdAt: now });
      if (input.classId) await tx.create("ClassMembership", { classId: input.classId, studentId: st.id, joinedAt: now });
    }
    return String(u.id);
  });
  await audit(repo, { actorId: actor.userId, action: "user.create", entityType: "User", entityId: userId, after: { username, displayName, role: input.role, studentNumber, classId: input.classId ?? null }, at: now });
  return { userId, temporaryPassword: temp };
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
 */
export async function moveStudent(repo: Repo, actor: Actor, studentUserId: string, classId: string | null, now = new Date()): Promise<void> {
  assertCan(actor, "classes:manage");
  const u = await manageableUser(repo, actor, studentUserId);
  if (u.role !== "STUDENT") throw new ValidationError("Only students can be moved between classes.");
  const st = (await repo.findUnique("Student", { userId: studentUserId }))!;
  const target = classId ? await classInSchool(repo, actor, classId) : null;
  const open = await repo.findMany("ClassMembership", { studentId: st.id, leftAt: null });
  if (target && open.length === 1 && open[0].classId === classId) return;
  await repo.transaction(async (tx) => {
    for (const m of open) await tx.updateMany("ClassMembership", { classId: m.classId, studentId: st.id }, { leftAt: now });
    if (target) {
      const prior = await tx.findUnique("ClassMembership", { classId: target.id, studentId: st.id });
      if (prior) await tx.updateMany("ClassMembership", { classId: target.id, studentId: st.id }, { leftAt: null, joinedAt: now });
      else await tx.create("ClassMembership", { classId: target.id, studentId: st.id, joinedAt: now });
      if (target.gradeId !== st.gradeId) await tx.updateMany("Student", { id: st.id }, { gradeId: target.gradeId });
    }
  });
  await audit(repo, { actorId: actor.userId, action: "student.class.move", entityType: "Student", entityId: String(st.id), before: { classIds: open.map((m) => String(m.classId)), gradeId: st.gradeId }, after: { classId, gradeId: target?.gradeId ?? st.gradeId }, at: now });
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
