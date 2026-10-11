import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { archiveStudents, deleteStudentsPermanently, parseScope, restoreStudents, rosterList, scopeQuery } from "../src/server/admin/roster-clean";
import { demoDatabase } from "./helpers/db";

describe("🧹 Clear Roster: one by one, restore, nothing else touched", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classId: string; let ids: string[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id; ids = r[0].students.map((x) => x.id);
  });

  test("the scope from a link: one student, a class, a grade, the school", () => {
    const one = parseScope((k) => ({ scope: "student", id: "abc" } as Record<string, string>)[k]);
    assert.deepEqual(one, { kind: "STUDENTS", ids: ["abc"] });
    assert.equal(scopeQuery(one), "scope=student&id=abc");
    assert.deepEqual(parseScope(() => null), { kind: "SCHOOL" });
  });

  test("teachers cannot see or clear the roster", async () => {
    await assert.rejects(rosterList(repo, teacher, { kind: "SCHOOL" }), ForbiddenError);
    await assert.rejects(archiveStudents(repo, teacher, { kind: "STUDENTS", ids: [ids[0]] }), ForbiddenError);
  });

  test("archive ONE student, then restore: back in the same class and able to sign in", async () => {
    assert.equal(await archiveStudents(repo, admin, { kind: "STUDENTS", ids: [ids[0]] }), 1);
    let list = await rosterList(repo, admin, { kind: "SCHOOL" });
    assert.equal(list.filter((x) => x.archived).length, 1);
    assert.equal(list.find((x) => x.id === ids[0])!.archived, true);
    assert.equal((await repo.findMany("ClassMembership", { classId, leftAt: null })).length, ids.length - 1, "only that student left the class");
    assert.equal(await restoreStudents(repo, admin, [ids[0]]), 1);
    list = await rosterList(repo, admin, { kind: "CLASS", classId });
    assert.equal(list.length, ids.length);
    const st = await repo.findUnique("Student", { id: ids[0] });
    assert.equal(Boolean((await repo.findUnique("User", { id: st!.userId }))!.isActive), true);
  });

  test("delete ONE student permanently: their data in every table goes; classes, teachers, questions stay", async () => {
    const sid = ids[1];
    const now = new Date();
    await repo.create("WorkComment", { schoolId: admin.schoolId, studentId: sid, authorId: teacher.userId, body: "Well done", createdAt: now });
    await repo.create("FamilyReport", { schoolId: admin.schoolId, studentId: sid, kind: "MANUAL", title: "t", content: {}, status: "DRAFT", createdById: teacher.userId, createdAt: now, updatedAt: now });
    const before = { classes: await repo.count("Class", {}), teachers: await repo.count("Teacher", {}), questions: await repo.count("Question", {}), students: await repo.count("Student", {}) };
    await assert.rejects(deleteStudentsPermanently(repo, admin, { kind: "STUDENTS", ids: [sid] }, "DELETE 2 STUDENTS"));
    const r = await deleteStudentsPermanently(repo, admin, { kind: "STUDENTS", ids: [sid] }, "DELETE 1 STUDENTS");
    assert.equal(r.students, 1);
    assert.equal(await repo.count("WorkComment", { studentId: sid }), 0);
    assert.equal(await repo.count("FamilyReport", { studentId: sid }), 0);
    assert.deepEqual({ classes: await repo.count("Class", {}), teachers: await repo.count("Teacher", {}), questions: await repo.count("Question", {}), students: await repo.count("Student", {}) }, { ...before, students: before.students - 1 });
  });
});
