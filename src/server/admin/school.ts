/**
 * 🏫 The School page (admin): one tree Grades → Classes → Teacher → Students, and the few actions on it.
 *
 * Every action reuses the existing services (users.ts, settings.ts, quick-students.ts, student-cards.ts,
 * teacher/support.ts), so the rules, scoping and audit stay in one place:
 *   - addGrade                 a grade 1–12 for this school (an inactive one is switched back on)
 *   - createTeacherWithClasses a teacher account (password = username, changed at first sign-in) linked to classes
 *                              in one step, new classes included
 *   - addStudentsToClass       one or more names → student accounts in the class (quick-students rules)
 *   - resetClassPasswords      every student of one class: password = username again
 * Admins only (SCHOOL_ADMIN / SUPER_ADMIN), own school only. Nothing is ever deleted here.
 */
import { audit } from "../audit";
import { hashPassword } from "../auth/password";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { createClass } from "./settings";
import { setStudentPasswordsToUsername } from "./student-cards";
import { quickAddStudents, type QuickResult } from "./quick-students";
import { assertUsernameFree, cleanName, cleanUsername, createUser, schoolOf, setTeacherClasses } from "./users";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Admins only (a teacher or student is refused even with an extra grant). */
export function schoolAdmin(actor: Actor): string {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only a school admin can do this.");
  return schoolOf(actor);
}

export interface TreeStudent { userId: string; name: string; username: string; number: string }
export interface TreeTeacher { teacherId: string; userId: string; name: string; lead: boolean }
export interface TreeClass { id: string; name: string; teachers: TreeTeacher[]; students: TreeStudent[] }
export interface TreeGrade { id: string; level: number; name: string; active: boolean; classes: TreeClass[] }
export interface SchoolTree { grades: TreeGrade[]; teachers: { teacherId: string; userId: string; name: string; classes: number }[]; withoutClass: TreeStudent[]; yearName: string | null }

/** The whole school as a tree (current academic year's classes; active students only). Light: ids and names only. */
export async function schoolTree(repo: Repo, actor: Actor): Promise<SchoolTree> {
  const schoolId = schoolAdmin(actor);
  assertCan(actor, "classes:manage");
  const [grades, years] = await Promise.all([
    repo.findMany("Grade", { schoolId }, { select: ["id", "level", "name", "isActive"] }),
    repo.findMany("AcademicYear", { schoolId }, { select: ["id", "name", "isCurrent"] }),
  ]);
  const year = years.find((y) => y.isCurrent) ?? null;
  const classes = (await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "name", "gradeId", "academicYearId"] })).filter((c) => !year || s(c.academicYearId) === s(year.id));
  const classIds = classes.map((c) => s(c.id));
  const [links, members, teacherUsers] = await Promise.all([
    classIds.length ? repo.findMany("ClassTeacher", { classId: { in: classIds } }, { select: ["classId", "teacherId", "isLead"] }) : Promise.resolve([] as Row[]),
    classIds.length ? repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["classId", "studentId"] }) : Promise.resolve([] as Row[]),
    repo.findMany("User", { schoolId, role: "TEACHER", isActive: true, deletedAt: null }, { select: ["id", "displayName"] }),
  ]);
  const teachers = teacherUsers.length ? await repo.findMany("Teacher", { userId: { in: teacherUsers.map((u) => u.id) } }, { select: ["id", "userId"] }) : [];
  const teacherName = new Map(teacherUsers.map((u) => [s(u.id), s(u.displayName)]));
  const teacherById = new Map(teachers.map((t) => [s(t.id), { teacherId: s(t.id), userId: s(t.userId), name: teacherName.get(s(t.userId)) ?? "" }]));
  const students = await repo.findMany("Student", { schoolId }, { select: ["id", "userId", "studentNumber"] });
  const studentUsers = students.length ? await repo.findMany("User", { schoolId, role: "STUDENT", isActive: true, deletedAt: null }, { select: ["id", "username", "displayName"] }) : [];
  const userById = new Map(studentUsers.map((u) => [s(u.id), u]));
  const studentById = new Map(students.map((x) => [s(x.id), x]));
  const inClass = new Set(members.map((m) => s(m.studentId)));
  const withoutClass: TreeStudent[] = students.filter((x) => userById.has(s(x.userId)) && !inClass.has(s(x.id))).map((x) => {
    const u = userById.get(s(x.userId))!;
    return { userId: s(u.id), name: s(u.displayName), username: s(u.username), number: s(x.studentNumber) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const byClass = new Map<string, TreeStudent[]>();
  for (const m of members) {
    const st = studentById.get(s(m.studentId)); const u = st ? userById.get(s(st.userId)) : undefined;
    if (!st || !u) continue;
    const l = byClass.get(s(m.classId)) ?? [];
    l.push({ userId: s(u.id), name: s(u.displayName), username: s(u.username), number: s(st.studentNumber) });
    byClass.set(s(m.classId), l);
  }
  const tree: TreeGrade[] = grades.map((g) => ({
    id: s(g.id), level: Number(g.level), name: s(g.name) || `Grade ${Number(g.level)}`, active: g.isActive !== false && g.isActive !== 0,
    classes: classes.filter((c) => s(c.gradeId) === s(g.id)).map((c) => ({
      id: s(c.id), name: s(c.name),
      teachers: links.filter((l) => s(l.classId) === s(c.id)).map((l) => { const t = teacherById.get(s(l.teacherId)); return t ? { ...t, lead: l.isLead !== false && l.isLead !== 0 } : null; }).filter((x): x is TreeTeacher => !!x),
      students: (byClass.get(s(c.id)) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  })).sort((a, b) => a.level - b.level);
  const classCount = new Map<string, number>();
  for (const l of links) classCount.set(s(l.teacherId), (classCount.get(s(l.teacherId)) ?? 0) + 1);
  return {
    grades: tree, withoutClass, yearName: year ? s(year.name) : null,
    teachers: [...teacherById.values()].map((t) => ({ ...t, classes: classCount.get(t.teacherId) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** “+ Add grade”: a grade 1–12 (already there and switched off → switched back on). Returns the grade id. */
export async function addGrade(repo: Repo, actor: Actor, level: number, now = new Date()): Promise<string> {
  const schoolId = schoolAdmin(actor);
  assertCan(actor, "classes:manage");
  const lv = Number(level);
  if (!Number.isInteger(lv) || lv < 1 || lv > 12) throw new ValidationError("Choose a grade from 1 to 12.");
  const found = (await repo.findMany("Grade", { schoolId, level: lv }))[0];
  if (found) {
    if (found.isActive === false || found.isActive === 0) {
      await repo.updateMany("Grade", { id: found.id }, { isActive: true });
      await audit(repo, { actorId: actor.userId, action: "grade.reactivate", entityType: "Grade", entityId: s(found.id), after: { level: lv }, at: now });
      return s(found.id);
    }
    throw new ValidationError(`Grade ${lv} already exists.`);
  }
  const g = await repo.create("Grade", { schoolId, level: lv, name: `Grade ${lv}`, isActive: true });
  await audit(repo, { actorId: actor.userId, action: "grade.create", entityType: "Grade", entityId: s(g.id), after: { level: lv }, at: now });
  return s(g.id);
}

/** “+ Add class” under a grade (settings.createClass: current academic year, same name rules). */
export async function addClass(repo: Repo, actor: Actor, input: { name: string; gradeLevel: number }, now = new Date()): Promise<string> {
  schoolAdmin(actor);
  return createClass(repo, actor, input, now);
}

export interface NewTeacher { username: string; displayName: string; title?: string | null; email?: string | null; classIds?: string[]; newClasses?: { name: string; gradeLevel: number }[] }

/**
 * “+ New teacher”: the account (password = username, changed at the first sign-in) and the classes it teaches, in
 * one step. New classes are created first (current year), then the account, then the links (ClassTeacher).
 */
export async function createTeacherWithClasses(repo: Repo, actor: Actor, input: NewTeacher, now = new Date()): Promise<{ userId: string; password: string; classes: number }> {
  const schoolId = schoolAdmin(actor);
  assertCan(actor, "teachers:manage");
  assertCan(actor, "classes:manage");
  // check what can be checked before anything is written
  const username = cleanUsername(input.username);
  cleanName(input.displayName);
  await assertUsernameFree(repo, schoolId, username);
  const extra = (input.newClasses ?? []).filter((c) => s(c.name).trim());
  if (extra.length > 20 || (input.classIds ?? []).length > 60) throw new ValidationError("Too many classes at once.");
  const ids = [...new Set((input.classIds ?? []).map(s).filter(Boolean))];
  if (ids.length) {
    const found = await repo.findMany("Class", { id: { in: ids }, schoolId, deletedAt: null }, { select: ["id"] });
    if (found.length !== ids.length) throw new ValidationError("Class not found in this school.");
  }
  for (const c of extra) ids.push(await createClass(repo, actor, { name: s(c.name), gradeLevel: Number(c.gradeLevel) }, now));
  const r = await createUser(repo, actor, { role: "TEACHER", username, displayName: input.displayName, title: input.title ?? null, email: input.email ?? null }, now);
  // the school's rule for new accounts: the first password is the username (the teacher picks a new one at sign-in)
  await repo.updateMany("User", { id: r.userId, schoolId }, { passwordHash: await hashPassword(username), mustChangePassword: true });
  const unique = [...new Set(ids)];
  if (unique.length) await setTeacherClasses(repo, actor, r.userId, unique, now);
  return { userId: r.userId, password: username, classes: unique.length };
}

/** “Add student”: one name per line (optionally “, number”) → accounts in this class (quick-students rules). */
export async function addStudentsToClass(repo: Repo, actor: Actor, classId: string, text: string, now = new Date()): Promise<QuickResult> {
  schoolAdmin(actor);
  return quickAddStudents(repo, actor, { classId, text }, now);
}

/** “Reset passwords”: every active student of the class gets password = username (only this class; no school setting). */
export async function resetClassPasswords(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<number> {
  const schoolId = schoolAdmin(actor);
  const c = await repo.findUnique("Class", { id: classId });
  if (!c || c.deletedAt || s(c.schoolId) !== schoolId) throw new ValidationError("Choose a class of this school.");
  return (await setStudentPasswordsToUsername(repo, actor, { classId, forNewStudents: false }, now)).updated;
}
