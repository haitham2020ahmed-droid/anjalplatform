/**
 * 👀 Admin → Class visit (src/server/teacher/extras.ts classVisit): the head of department looks at a teacher's
 * class as the teacher sees it — read only, admin only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignSkill } from "../src/server/teacher/assign";
import { classVisit } from "../src/server/teacher/extras";
import { createUser } from "../src/server/admin/users";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");

describe("admin · class visit", () => {
  let repo: SqliteRepo; let admin: Actor; let teacherA: Actor; let teacherB: Actor; let student: Actor;
  let classA: string; let classB: string; let schoolId: string;
  const now = new Date("2026-10-20T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 3 }));
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacherA = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    teacherB = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4b" }))!);
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
    const tA = await repo.findUnique("Teacher", { userId: teacherA.userId });
    const tB = await repo.findUnique("Teacher", { userId: teacherB.userId });
    classA = s((await repo.findMany("ClassTeacher", { teacherId: tA!.id }))[0].classId);
    classB = s((await repo.findMany("ClassTeacher", { teacherId: tB!.id }))[0].classId);
  });

  test("no teacher chosen: the teacher list only, no visit", async () => {
    const r = await classVisit(repo, admin, null, null);
    assert.ok(r.teachers.some((t) => t.id === teacherA.userId));
    assert.ok(r.teachers.some((t) => t.id === teacherB.userId));
    assert.equal(r.visit, null);
  });

  test("a teacher chosen, no class given: defaults to their first class, with the class's live data", async () => {
    const skillId = s((await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["skillId"] }))[0].skillId);
    await assignSkill(repo, teacherA, { classId: classA, skillId, source: "CURRICULUM", title: "Theme practice" }, now);
    const r = await classVisit(repo, admin, teacherA.userId, null, now);
    assert.equal(r.visit!.teacher.id, teacherA.userId);
    assert.equal(r.visit!.klass!.id, classA);
    assert.equal(r.visit!.klass!.students, 3);
    assert.equal(r.visit!.work.length, 1);
    assert.equal(r.visit!.work[0].total, 3);
    assert.equal(r.visit!.alerts.open, 0);
  });

  test("a teacher with no classes at all: visit has an empty, read-only shell (no class, no work, no crash)", async () => {
    const { userId } = await createUser(repo, admin, { role: "TEACHER", username: "t.new.visit", displayName: "New Teacher" }, now);
    const r = await classVisit(repo, admin, userId, null, now);
    assert.equal(r.visit!.teacher.id, userId);
    assert.equal(r.visit!.classes.length, 0);
    assert.equal(r.visit!.klass, null);
    assert.equal(r.visit!.work.length, 0);
  });

  test("permission gate: only the head of department (admin) may open a class visit", async () => {
    await assert.rejects(classVisit(repo, teacherB, teacherA.userId, classA), ForbiddenError);
    await assert.rejects(classVisit(repo, student, teacherA.userId, classA), ForbiddenError);
  });
});
