/**
 * r83 students: "Student number 1 already exists" about a student nobody could find (an archived = removed student),
 * automatic student numbers, clear clash messages with a link + Restore, roster import clashes per row, and teachers
 * adding students to their own class by name (fix a name, take a student out of the class).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { AccountClashError, createUser, listUsers } from "../src/server/admin/users";
import { archiveStudents, restoreStudents } from "../src/server/admin/roster-clean";
import { applyRoster, planRoster } from "../src/server/admin/roster-import";
import { addStudentsByName, classStudentList, removeFromClass, renameClassStudent, setTeachersCanAddStudents, teachersCanAddStudents } from "../src/server/teacher/class-students";
import { classSignInNames, openClassSignIn } from "../src/server/auth/class-signin";
import { demoDatabase } from "./helpers/db";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("r83 students", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classA: string; let classB: string; let gradeA: number; let nameA: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const mine = await teacherRoster(repo, teacher);
    classA = mine[0].id;
    const ka = (await repo.findUnique("Class", { id: classA }))!;
    nameA = String(ka.name);
    gradeA = Number((await repo.findUnique("Grade", { id: ka.gradeId }))!.level);
    const taught = new Set(mine.map((c) => c.id));
    classB = String((await repo.findMany("Class", { schoolId: admin.schoolId! })).find((c) => !taught.has(String(c.id)) && !c.deletedAt)!.id);
  });

  test("admin: an empty student number is given automatically (the school's AJyy-nnn series), one after another", async () => {
    const a = await createUser(repo, admin, { role: "STUDENT", username: "auto.one", displayName: "Auto One", studentNumber: "", gradeLevel: gradeA, classId: classA });
    const b = await createUser(repo, admin, { role: "STUDENT", username: "auto.two", displayName: "Auto Two", gradeLevel: gradeA });
    assert.match(String(a.studentNumber), /^AJ\d{2}-\d{3}$/);
    assert.match(String(b.studentNumber), /^AJ\d{2}-\d{3}$/);
    assert.notEqual(a.studentNumber, b.studentNumber);
    assert.equal(String((await repo.findUnique("Student", { userId: a.userId }))!.studentNumber), a.studentNumber);
  });

  test("number 1 held by a removed student: the message names them (class, removed on) and links to the account; Restore works", async () => {
    const r = await createUser(repo, admin, { role: "STUDENT", username: "sara.old", displayName: "Sara Old", studentNumber: "1", gradeLevel: gradeA, classId: classA });
    const st = (await repo.findUnique("Student", { userId: r.userId }))!;
    await archiveStudents(repo, admin, { kind: "STUDENTS", ids: [String(st.id)] });
    // the cause of the owner's report: the normal list hides her
    assert.ok(!(await listUsers(repo, admin, { q: "sara.old" })).length);
    const err = await createUser(repo, admin, { role: "STUDENT", username: "new.one", displayName: "New One", studentNumber: "1", gradeLevel: gradeA }).then(() => null, (e) => e);
    assert.ok(err instanceof AccountClashError, String(err));
    assert.match(err.message, new RegExp(`Student number 1 is used by Sara Old \\(${nameA}, removed on \\d{4}-\\d{2}-\\d{2}\\)`));
    assert.match(err.href, /\/admin\/users\?inactive=1&q=sara\.old/);
    // "Show removed and inactive accounts" finds her, with Restore
    const found = (await listUsers(repo, admin, { q: "sara.old", includeInactive: true }))[0];
    assert.ok(found && found.removedOn && found.studentId === String(st.id));
    assert.equal(found.className, nameA, "the class she was in last");
    assert.equal(await restoreStudents(repo, admin, [found.studentId!]), 1);
    const back = (await listUsers(repo, admin, { q: "sara.old" }))[0];
    assert.ok(back && back.isActive && !back.removedOn && back.className === nameA);
  });

  test("a deactivated student's number: named as inactive", async () => {
    const r = await createUser(repo, admin, { role: "STUDENT", username: "off.kid", displayName: "Off Kid", studentNumber: "77", gradeLevel: gradeA });
    await repo.updateMany("User", { id: r.userId }, { isActive: false });
    await assert.rejects(createUser(repo, admin, { role: "STUDENT", username: "x.kid", displayName: "X", studentNumber: "77", gradeLevel: gradeA }), /Student number 77 is used by Off Kid \(no class, inactive\)/);
  });

  test("username used by a removed student: a clear message and a link", async () => {
    const r = await createUser(repo, admin, { role: "STUDENT", username: "gone.kid", displayName: "Gone Kid", gradeLevel: gradeA, classId: classA });
    await archiveStudents(repo, admin, { kind: "STUDENTS", ids: [String((await repo.findUnique("Student", { userId: r.userId }))!.id)] });
    const err = await createUser(repo, admin, { role: "STUDENT", username: "gone.kid", displayName: "Someone", gradeLevel: gradeA }).then(() => null, (e) => e);
    assert.ok(err instanceof AccountClashError);
    assert.match(err.message, /Username "gone\.kid" is already taken by Gone Kid \(.+, removed on \d{4}-\d{2}-\d{2}\)\. Restore that account/);
    assert.match(err.href, /q=gone\.kid/);
  });

  test("roster import: a number held by a removed student is reported on its row (name + link); an empty number is given at import", async () => {
    const removed = await createUser(repo, admin, { role: "STUDENT", username: "rm.kid", displayName: "Removed Kid", studentNumber: "555", gradeLevel: gradeA, classId: classA });
    await archiveStudents(repo, admin, { kind: "STUDENTS", ids: [String((await repo.findUnique("Student", { userId: removed.userId }))!.id)] });
    const head = "role,username,display_name,student_number,grade,class,email,title,parent_of,relationship";
    const bad = new TextEncoder().encode(`${head}\nstudent,clash.kid,Clash Kid,555,${gradeA},${nameA},,,,\nstudent,ok.kid,Ok Kid,,${gradeA},${nameA},,,,\n`);
    const plan = await planRoster(repo, admin, "r.csv", bad);
    assert.equal(plan.problems.length, 1, JSON.stringify(plan.problems));
    assert.equal(plan.problems[0].line, 2);
    assert.match(plan.problems[0].message, /Student number 555 is used by Removed Kid \(.+, removed on /);
    assert.match(String(plan.problems[0].href), /q=rm\.kid/);
    const good = new TextEncoder().encode(`${head}\nstudent,ok.kid,Ok Kid,,${gradeA},${nameA},,,,\nstudent,ok.kid2,Ok Kid Two,,${gradeA},${nameA},,,,\n`);
    const p2 = await planRoster(repo, admin, "g.csv", good);
    assert.equal(p2.problems.length, 0, JSON.stringify(p2.problems));
    await applyRoster(repo, admin, "g.csv", good, sha(good));
    const nums = await Promise.all(["ok.kid", "ok.kid2"].map(async (u) => String((await repo.findUnique("Student", { userId: (await repo.findUnique("User", { username: u }))!.id }))!.studentNumber)));
    assert.ok(nums.every((n) => /^AJ\d{2}-\d{3}$/.test(n)) && nums[0] !== nums[1], nums.join());
  });

  test("teacher adds 3 names to their own class: 3 accounts, unique usernames and numbers, in the class, audited, on the QR list", async () => {
    assert.equal(await teachersCanAddStudents(repo, teacher.schoolId), true, "ON by default");
    const auditBefore = await repo.count("AuditLog", { actorId: teacher.userId, action: "user.create" });
    const r = await addStudentsByName(repo, teacher, { classId: classA, text: "1. Lina Saad\nOmar Fahd\n\nLina Saad Two\n" });
    assert.equal(r.created.length, 3);
    assert.equal(new Set(r.created.map((c) => c.username)).size, 3);
    assert.equal(new Set(r.created.map((c) => c.number)).size, 3);
    assert.ok(r.created.every((c) => /^AJ\d{2}-\d{3}$/.test(c.number) && c.password));
    assert.equal(r.created[0].name, "Lina Saad");
    for (const c of r.created) assert.ok(await repo.findUnique("ClassMembership", { classId: classA, studentId: c.studentId }));
    assert.equal(await repo.count("AuditLog", { actorId: teacher.userId, action: "user.create" }), auditBefore + 3);
    const list = await classStudentList(repo, teacher, classA);
    assert.ok(r.created.every((c) => list.some((x) => x.studentId === c.studentId)));
    // printable cards: every field a login card needs
    assert.ok(r.created.every((c) => c.userId && c.username && c.name) && r.className === nameA && r.grade === gradeA);
    // the class QR sign-in list reads the class live
    const qr = await openClassSignIn(repo, teacher, classA);
    const names = await classSignInNames(repo, qr.token);
    assert.ok(names && r.created.every((c) => names.names.some((n) => n.id === c.studentId)));
    // the same names again: skipped, no double accounts
    const again = await addStudentsByName(repo, teacher, { classId: classA, text: "Lina Saad\nOmar Fahd" });
    assert.equal(again.created.length, 0);
    assert.equal(again.skipped.length, 2);
  });

  test("teacher: not into another class; more than 40 names refused; the admin's switch off refuses", async () => {
    await assert.rejects(addStudentsByName(repo, teacher, { classId: classB, text: "Not Mine" }), ForbiddenError);
    await assert.rejects(addStudentsByName(repo, teacher, { classId: classA, text: Array.from({ length: 41 }, (_, i) => `Kid ${i}`).join("\n") }), /at most 40/);
    await assert.rejects(setTeachersCanAddStudents(repo, teacher, false), ForbiddenError);
    await setTeachersCanAddStudents(repo, admin, false);
    assert.equal(await teachersCanAddStudents(repo, teacher.schoolId), false);
    await assert.rejects(addStudentsByName(repo, teacher, { classId: classA, text: "Late Kid" }), /turned off/);
    await setTeachersCanAddStudents(repo, admin, true);
    assert.equal((await addStudentsByName(repo, teacher, { classId: classA, text: "Late Kid" })).created.length, 1);
  });

  test("teacher fixes a name and takes a student out of their own class only (leftAt; the account stays)", async () => {
    const mine = (await classStudentList(repo, teacher, classA)).find((x) => x.name === "Omar Fahd")!;
    await renameClassStudent(repo, teacher, { classId: classA, studentId: mine.studentId, name: "Omar Fahad" });
    assert.equal(String((await repo.findUnique("User", { id: mine.userId }))!.displayName), "Omar Fahad");
    assert.equal(await repo.count("AuditLog", { actorId: teacher.userId, action: "student.rename" }), 1);
    const other = (await repo.findMany("ClassMembership", { classId: classB, leftAt: null }))[0];
    await assert.rejects(renameClassStudent(repo, teacher, { classId: classB, studentId: String(other.studentId), name: "Hack" }), ForbiddenError);
    await assert.rejects(renameClassStudent(repo, teacher, { classId: classA, studentId: String(other.studentId), name: "Hack" }), /not in your class/);
    await assert.rejects(removeFromClass(repo, teacher, { classId: classA, studentId: String(other.studentId) }), /not in your class/);
    await removeFromClass(repo, teacher, { classId: classA, studentId: mine.studentId });
    const m = (await repo.findUnique("ClassMembership", { classId: classA, studentId: mine.studentId }))!;
    assert.ok(m.leftAt, "left the class");
    const u = (await repo.findUnique("User", { id: mine.userId }))!;
    assert.ok(u.isActive && !u.deletedAt, "the account is not deleted");
    assert.ok(!(await classStudentList(repo, teacher, classA)).some((x) => x.studentId === mine.studentId));
  });
});
