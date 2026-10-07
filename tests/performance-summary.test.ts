import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { schoolPerformance } from "../src/server/admin/performance";
import { teacherCurriculum } from "../src/server/teacher/assign";
import { demoDatabase } from "./helpers/db";

describe("admin performance summary; teacher curriculum question counts", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, student: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "light" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher, student] = await Promise.all(["test.admin", "test.teacher.1", "test.student.005"].map(a));
  });

  test("the admin sees every teacher and class with real numbers", async () => {
    const p = await schoolPerformance(repo, admin);
    assert.deepEqual([p.totals.teachers, p.totals.classes, p.totals.students, p.totals.assignments], [6, 6, 200, 30]);
    assert.ok(p.totals.activeThisWeek > 0, "students practised this week");
    assert.ok(p.totals.overdue > 0 && p.totals.completion !== null);
    assert.equal(p.teachers.length, 6);
    assert.equal(p.teachers.reduce((n, t) => n + t.students, 0), 200, "every student counted once per teacher's classes");
    assert.ok(p.classes.every((c) => c.teachers.length === 1 && c.students > 0));
    const sumOverdue = p.classes.reduce((n, c) => n + c.overdue, 0);
    assert.equal(sumOverdue, p.totals.overdue, "class figures add up to the school totals");
    assert.ok(p.weakSkills.every((k, i, all) => i === 0 || all[i - 1].avgMastery <= k.avgMastery), "weakest first");
    assert.ok(p.attention.every((x) => x.overdue >= 2 || (x.avgMastery !== null && x.avgMastery < 40)));
  });

  test("only admins can see it", async () => {
    await assert.rejects(schoolPerformance(repo, teacher), ForbiddenError);
    await assert.rejects(schoolPerformance(repo, student), ForbiddenError);
  });

  test("the teacher's curriculum shows each skill's published question count", async () => {
    const view = (await teacherCurriculum(repo, teacher))!;
    const skills = view.units.flatMap((u) => u.skills);
    const withQuestions = skills.filter((k) => k.questions > 0);
    assert.ok(withQuestions.length > 0);
    for (const k of withQuestions.slice(0, 5)) assert.equal(k.questions, await repo.count("Question", { skillId: k.id, status: "PUBLISHED", deletedAt: null }));
  });
});
