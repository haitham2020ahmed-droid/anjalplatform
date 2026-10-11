import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { learningLoop } from "../src/server/insights/learning-loop";
import { demoDatabase } from "./helpers/db";

describe("🔄 Learning Intelligence Loop", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor; let classId: string; let ids: string[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("test.admin"); teacher = await as("test.teacher.1"); other = await as("test.teacher.3");
    const r = await teacherRoster(repo, teacher); classId = r[0].id; ids = r[0].students.map((x) => x.id);
    const d = new Date(Date.now() - 20 * 86_400_000);
    // student 0: MAP with areas (Informational weakest) + a sent plan + practice in that area; student 1: MAP only
    for (const sid of ids.slice(0, 2)) {
      await repo.create("MapResult", { studentId: sid, testDate: d, subject: "Reading", goalName: null, rit: 196, achievementPercentile: 45, termName: "Fall 2026", importedAt: d });
      for (const [g, rit] of [["Literary Text", 200], ["Informational Text", 186], ["Vocabulary", 198]] as const) await repo.create("MapResult", { studentId: sid, testDate: d, subject: "Reading", goalName: g, rit, termName: "Fall 2026", importedAt: d });
    }
    await repo.create("MapPlan", { schoolId: admin.schoolId, classId, studentId: ids[0], subject: "READING", term: "Fall 2026", status: "SENT", items: [], createdAt: d });
    const q = (await repo.findMany("Question", { status: "PUBLISHED" }))[0];
    await repo.updateMany("Question", { id: q.id }, { mapTest: "Reading", mapInstructionalArea: "Informational Text", mapAreaSource: "ADMIN" });
    const ses = await repo.create("PracticeSession", { studentId: ids[0], mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    for (let i = 0; i < 12; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: ids[0], questionId: q.id, skillId: q.skillId, response: {}, isCorrect: i % 3 !== 0, responseMs: 20_000, difficultyB: 0, createdAt: new Date() });
  });

  test("each student is placed at the step that moves them on; the stages add up", async () => {
    const l = await learningLoop(repo, teacher, classId);
    assert.equal(l.stages.length, 6);
    assert.equal(l.students.length, ids.length);
    const s0 = l.students.find((x) => x.id === ids[0])!, s1 = l.students.find((x) => x.id === ids[1])!, s2 = l.students.find((x) => x.id === ids[2])!;
    assert.deepEqual(s0.weakest?.key, "INFO");
    assert.deepEqual([s0.plan, s0.practice7, s0.inWeakArea7, s0.stage], ["SENT", 12, 12, "CHECK"], "measured, planned, practised in the weakest area → the Weekly Check");
    assert.equal(s1.stage, "PLAN");
    assert.equal(s2.stage, "MEASURE");
    assert.equal(l.stages.find((s) => s.key === "ANALYZE")!.metrics.find((m) => m.label === "Informational Text")!.value, "2");
    assert.equal(l.areaNeeds.find((a) => a.key === "INFO")!.practice, 12);
    assert.ok(l.score >= 0 && l.score <= 100);
  });

  test("teachers see their classes only; the admin sees the whole school", async () => {
    await assert.rejects(learningLoop(repo, other, classId), ForbiddenError);
    const school = await learningLoop(repo, admin, null);
    assert.ok(school.students.length > ids.length);
    assert.equal(school.scope, "Whole school");
  });
});
