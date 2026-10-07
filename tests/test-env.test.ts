import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { parseSchema } from "../scripts/db/schema-ddl";
import { join } from "node:path";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError } from "../src/server/auth/rbac";
import { resetTestEnvironment, seedTestEnvironment, testEnvironmentReport, TEST_SCHOOL_CODE } from "../src/server/seeding/test-env";
import { assignSkill, teacherCurriculum, weeklyAssignments } from "../src/server/teacher/assign";
import { assignedSkills } from "../src/server/student/assigned";
import { listQuestions } from "../src/server/admin/questions";
import { demoDatabase } from "./helpers/db";

const NOW = new Date("2027-04-14T09:00:00Z");

describe("test environment: seed and reset", () => {
  let repo: SqliteRepo;
  let before0: Record<string, number>;
  const tables = [...parseSchema(join(process.cwd(), "prisma/schema.prisma")).models.keys()];
  const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await repo.count(t, {})] as const)));
  before(async () => {
    ({ repo } = await demoDatabase());
    before0 = await snapshot();
  });

  test("seed: 1 admin, 6 teachers, 200 students, 6 classes, real assignments and every status", async () => {
    const r = await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), now: NOW });
    assert.deepEqual([r.admins, r.teachers, r.students, r.classes], [1, 6, 200, 6]);
    assert.ok(r.questions > 1000, "the Test School has its own copy of the question bank");
    assert.equal(r.assignments, 30, "5 per class: whole class ×3 (one overdue), selected students, one student");
    for (const st of ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "OVERDUE"]) assert.ok(r.statuses[st] > 0, `${st}: ${r.statuses[st]}`);
    assert.ok(r.notifications >= r.statuses.NOT_STARTED, "students were notified");
    assert.ok(r.answers > 50, "practice went through the real engine");
    await assert.rejects(seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), now: NOW }), /already exists/);
  });

  test("test accounts work like real ones, and stay inside the Test School", async () => {
    const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const t1 = await actor("test.teacher.1");
    const view = (await teacherCurriculum(repo, t1))!;
    assert.deepEqual(view.classes.map((c) => c.name), ["TEST 4A"], "a test teacher sees only their own class");
    assert.equal(view.students.length, 34);
    const weekly = await weeklyAssignments(repo, t1, new Date(NOW.getTime() - 3 * 86_400_000), NOW);
    assert.ok(weekly.length >= 4);
    const st = await actor("test.student.002");
    const home = await assignedSkills(repo, st, NOW);
    assert.ok(home.items.length >= 3 && home.summary.completed >= 1, JSON.stringify(home.summary));
    const demoClass = (await repo.findMany("Class", {})).find((c) => String(c.name).startsWith("DEMO"))!;
    await assert.rejects(teacherCurriculum(repo, t1, String(demoClass.id)), ForbiddenError, "cannot reach another school's class");
    const demoTeacher = await actor("demo.teacher.4a");
    const testClass = (await repo.findMany("Class", { name: "TEST 4A" }))[0];
    await assert.rejects(assignSkill(repo, demoTeacher, { classId: String(testClass.id), skillId: "x" }), ForbiddenError, "and the other way round");
    const testAdmin = await actor("test.admin");
    const demoAdmin = await actor("demo.admin");
    const [a, b] = await Promise.all([listQuestions(repo, testAdmin, { status: "PUBLISHED", limit: 0 }), listQuestions(repo, demoAdmin, { status: "PUBLISHED", limit: 0 })]);
    assert.ok(a.total > 1000);
    assert.notEqual(a.total, 0); void b;
  });

  test("reset removes the Test School completely and touches nothing else", async () => {
    const out = await resetTestEnvironment(repo);
    assert.ok(out.User >= 207 && out.Question > 1000, JSON.stringify(out));
    assert.equal(await repo.findUnique("School", { code: TEST_SCHOOL_CODE }), null);
    const after = await snapshot();
    // shared catalogues (reading passages, question types) are created by the seed only when missing
    // and are never deleted: in production they already exist, so nothing changes there
    const SHARED = new Set(["ReadingPassage", "QuestionType"]);
    const changed = tables.filter((t) => !SHARED.has(t) && after[t] !== before0[t]).map((t) => `${t}: ${before0[t]} → ${after[t]}`);
    assert.deepEqual(changed, [], "every table is back to its count before seeding");
    for (const t of SHARED) assert.ok(after[t] >= before0[t], `${t} is never reduced`);
    assert.deepEqual((await testEnvironmentReport(repo)).students, 0);
    assert.deepEqual(await resetTestEnvironment(repo), {}, "a second reset does nothing");
  });

  test("reset refuses a school that is not marked as test data", async () => {
    const real = (await repo.findMany("School", {}))[0];
    await repo.updateMany("School", { id: real.id }, { isDemo: false });
    await assert.rejects(resetTestEnvironment(repo, join(process.cwd(), "prisma/schema.prisma"), String(real.code)), /not marked as test data/);
  });
});
