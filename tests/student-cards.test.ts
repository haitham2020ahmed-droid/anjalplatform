import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { verifyPassword } from "../src/server/auth/password";
import { resetPassword } from "../src/server/auth/passwords-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { setStudentPasswordsToUsername, studentCards, studentPasswordIsUsername, stopUsernamePasswords } from "../src/server/admin/student-cards";
import { createUser } from "../src/server/admin/users";
import { demoDatabase } from "./helpers/db";

describe("🪪 student sign-in cards and password = username", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor;
  const st = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(st));
  });

  test("cards: every active student of the school, by class; one class or one grade", async () => {
    const all = await studentCards(repo, admin);
    assert.equal(all.length, 200);
    assert.ok(all.every((c) => c.username.startsWith("test.student.") && c.className !== "No class"));
    const cls = (await repo.findMany("ClassMembership", { studentId: (await repo.findUnique("Student", { userId: all[0].userId }))!.id }))[0].classId;
    const one = await studentCards(repo, admin, { classId: String(cls) });
    assert.ok(one.length >= 33 && one.length <= 34 && one.every((c) => c.className === one[0].className));
    const g = await studentCards(repo, admin, { grade: all[0].grade });
    assert.ok(g.length > 0 && g.every((c) => c.grade === all[0].grade));
  });

  test("only a school admin; staff passwords never change", async () => {
    await assert.rejects(studentCards(repo, teacher), ForbiddenError);
    await assert.rejects(setStudentPasswordsToUsername(repo, teacher), ForbiddenError);
  });

  test("password = username for every student, no forced change; new students and resets too", async () => {
    const teacherHash = String((await repo.findUnique("User", { username: "test.teacher.1" }))!.passwordHash);
    const r = await setStudentPasswordsToUsername(repo, admin);
    assert.equal(r.updated, 200);
    assert.equal(await studentPasswordIsUsername(repo, admin.schoolId), true);
    const u = (await repo.findUnique("User", { username: "test.student.007" }))!;
    assert.equal(await verifyPassword("test.student.007", String(u.passwordHash)), true);
    assert.equal(u.mustChangePassword, false);
    assert.equal(String((await repo.findUnique("User", { username: "test.teacher.1" }))!.passwordHash), teacherHash, "staff untouched");
    // a new student
    const grade = Number((await repo.findUnique("Grade", { id: (await repo.findMany("Student", { schoolId: admin.schoolId }))[0].gradeId }))!.level);
    const made = await createUser(repo, admin, { role: "STUDENT", username: "new.kid.one", displayName: "New Kid", studentNumber: "NK-9001", gradeLevel: grade });
    assert.equal(made.temporaryPassword, "new.kid.one");
    const nk = (await repo.findUnique("User", { username: "new.kid.one" }))!;
    assert.equal(nk.mustChangePassword, false);
    // a teacher reset puts the username back
    const reset = await resetPassword(repo, admin, String(u.id));
    assert.equal(reset.temporaryPassword, "test.student.007");
    // turned off: resets give a temporary password again
    await stopUsernamePasswords(repo, admin);
    const again = await resetPassword(repo, admin, String(u.id));
    assert.notEqual(again.temporaryPassword, "test.student.007");
  });
});
