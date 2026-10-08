import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { archiveStudents, deleteStudentsPermanently, previewClean, rosterBackup } from "../src/server/admin/roster-clean";
import { applyRoster, planRoster } from "../src/server/admin/roster-import";
import { demoDatabase } from "./helpers/db";

describe("🧹 clean roster", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classA: string; let classB: string; let idsA: string[]; let idsB: string[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const all = await repo.findMany("Class", { schoolId: admin.schoolId! });
    const r = await teacherRoster(repo, teacher);
    classA = r[0].id; idsA = r[0].students.map((x) => x.id);
    classB = String(all.find((c) => c.id !== classA)!.id);
    idsB = (await repo.findMany("ClassMembership", { classId: classB, leftAt: null })).map((m) => String(m.studentId));
    // some data for class A students
    for (const sid of idsA.slice(0, 3)) {
      await repo.create("MapResult", { studentId: sid, testDate: new Date(), subject: "Reading", goalName: null, rit: 190, termName: "Fall 2026", importedAt: new Date() });
      await repo.create("StudentLevel", { studentId: sid, level: "ON", source: "TEACHER", updatedAt: new Date() });
    }
  });

  test("admins only; the preview counts the class", async () => {
    await assert.rejects(previewClean(repo, teacher, { kind: "CLASS", classId: classA }), ForbiddenError);
    const p = await previewClean(repo, admin, { kind: "CLASS", classId: classA });
    assert.deepEqual([p.students, p.mapScores, p.confirm], [idsA.length, 3, `DELETE ${idsA.length} STUDENTS`]);
  });

  test("archive: sign-in off, out of the class, every piece of data kept", async () => {
    const n = await archiveStudents(repo, admin, { kind: "CLASS", classId: classA });
    assert.equal(n, idsA.length);
    const u = await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: idsA[0] }))!.userId });
    assert.equal(Boolean(u!.isActive), false);
    assert.equal(await repo.count("ClassMembership", { classId: classA, leftAt: null }), 0);
    assert.equal(await repo.count("MapResult", { studentId: { in: idsA } }), 3, "data kept");
    assert.equal(await repo.count("ClassMembership", { classId: classB, leftAt: null }), idsB.length, "the other class is untouched");
  });

  test("delete permanently: typed confirmation, every table, audit kept, numbers free for a new roster", async () => {
    // archived students are no longer “in the class”: delete them by grade instead
    const g = await repo.findUnique("Grade", { id: (await repo.findUnique("Class", { id: classA }))!.gradeId });
    const scope = { kind: "GRADE" as const, grade: Number(g!.level) };
    const backup = await rosterBackup(repo, admin, scope) as { users: Record<string, unknown>[]; tables: Record<string, unknown[]>; students: { studentNumber: string }[] };
    assert.ok(backup.users.length >= idsA.length && backup.users.every((u) => !("passwordHash" in u)), "backup without password hashes");
    assert.equal((backup.tables.MapResult as unknown[]).length, 3);
    const p = await previewClean(repo, admin, scope);
    const total = (await repo.findMany("Student", { schoolId: admin.schoolId! })).filter((x) => x.gradeId === g!.id).length;
    await assert.rejects(deleteStudentsPermanently(repo, admin, scope, "delete them"), /type exactly: DELETE/);
    const auditBefore = await repo.count("AuditLog", {});
    const r = await deleteStudentsPermanently(repo, admin, scope, `delete ${total} students`);
    assert.equal(r.students, total);
    assert.equal(await repo.count("Student", { id: { in: idsA } }), 0);
    assert.equal(await repo.count("MapResult", { studentId: { in: idsA } }), 0);
    assert.equal(await repo.count("StudentLevel", { studentId: { in: idsA } }), 0);
    assert.ok(await repo.count("AuditLog", {}) > auditBefore, "audit history kept (plus the deletion itself)");
    void p;
    // a new roster with a deleted student's number works
    const csv = `role,username,display_name,student_number,grade,class,email,title,parent_of,relationship\nstudent,new.kid,New Kid,${String(backup.students[0].studentNumber)},${g!.level},NEW-${g!.level}A,,,,\n`;
    const bytes = new TextEncoder().encode(csv);
    const plan = await planRoster(repo, admin, "r.csv", bytes);
    assert.equal(plan.problems.length, 0, JSON.stringify(plan.problems));
    await applyRoster(repo, admin, "r.csv", bytes, createHash("sha256").update(bytes).digest("hex"));
    assert.ok((await repo.findMany("User", { username: "new.kid" })).length);
  });

  test("archive, then the new roster with the same usernames: the students come back active, with new passwords", async () => {
    const r2 = await teacherRoster(repo, teacher);
    const cls = r2.find((c) => c.students.length) ?? null;
    // a fresh class with students, archived, then re-imported by the roster (the recommended workflow)
    const mine = new Set((await repo.findMany("Class", { schoolId: admin.schoolId! })).map((c) => String(c.id)));
    const live = (await repo.findMany("ClassMembership", { leftAt: null })).filter((m) => mine.has(String(m.classId)));
    const target = String(live.find((m) => live.filter((x) => x.classId === m.classId).length >= 2)!.classId);
    const some = live.filter((m) => String(m.classId) === target).slice(0, 2).map((m) => String(m.studentId));
    void cls;
    const users = [];
    for (const sid of some) { const st = (await repo.findUnique("Student", { id: sid }))!; users.push({ st, u: (await repo.findUnique("User", { id: st.userId }))! }); }
    const g = await repo.findUnique("Grade", { id: users[0].st.gradeId });
    await archiveStudents(repo, admin, { kind: "CLASS", classId: target });
    assert.equal(Boolean(users[0].u.isActive) && Boolean((await repo.findUnique("User", { id: users[0].u.id }))!.isActive), false);
    const csv = "role,username,display_name,student_number,grade,class,email,title,parent_of,relationship\n" + users.map(({ st, u }) => `student,${u.username},${u.displayName},${st.studentNumber},${g!.level},BACK-${g!.level},,,,`).join("\n") + "\n";
    const bytes = new TextEncoder().encode(csv);
    const plan = await planRoster(repo, admin, "back.csv", bytes);
    assert.equal(plan.problems.length, 0, JSON.stringify(plan.problems));
    assert.ok(plan.lines.every((l) => l.restore));
    const res = await applyRoster(repo, admin, "back.csv", bytes, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(res.restored, 2);
    for (const { u, st } of users) {
      const now = (await repo.findUnique("User", { id: u.id }))!;
      assert.deepEqual([Boolean(now.isActive), now.deletedAt ?? null, Boolean(now.mustChangePassword)], [true, null, true]);
      assert.notEqual(now.passwordHash, u.passwordHash, "a new temporary password");
      assert.equal((await repo.findUnique("Student", { id: st.id }))!.deletedAt ?? null, null);
      assert.equal(await repo.count("ClassMembership", { studentId: st.id, leftAt: null }), 1, "in their new class");
    }
    assert.ok(res.credentialsCsv.includes(users[0].u.username as string), "their new password is in the credentials file");
  });
});
