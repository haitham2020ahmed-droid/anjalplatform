/**
 * NAFS Item Analysis (/admin/nafs-item-analysis): src/server/nafs/item-analysis.ts — the NAFS bank questions
 * students most often get WRONG, from the adaptive practice answers, worst first. Grade 6 teacher / admin only
 * (the same NAFS access as the NAFS center itself); never shown to students or parents.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { MAX_ROWS, MIN_ITEM_ATTEMPTS, mostMissedNafsQuestions } from "../src/server/nafs/item-analysis";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("NAFS Item Analysis", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher6: Actor; let teacher4: Actor; let student: Actor; let schoolId: string;
  let easyId: string; let hardId: string; let fewId: string;
  const now = new Date("2026-10-24T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await a("demo.admin"); teacher4 = await a("demo.teacher.4a"); teacher6 = await a("demo.teacher.6a");
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);

    const type = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    const g6 = (await repo.findMany("Grade", { schoolId, level: 6 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g6.id }))[0];
    const skill = (await repo.findMany("Skill", { curriculumId: cur.id, isActive: true }))[0];
    const mk = async (stem: string) => s((await repo.create("Question", { skillId: skill.id, typeId: type.id, stem, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: now, updatedAt: now })).id);
    hardId = await mk("A question nearly everyone gets wrong.");
    easyId = await mk("A question nearly everyone gets right.");
    fewId = await mk("A question only answered a couple of times.");

    const practice = await repo.create("NafsPractice", { schoolId, createdById: teacher6.userId, title: "Fixture practice", targets: ["NAFS.RC.MAIN"], classId: (await repo.findMany("Class", { schoolId, gradeId: g6.id }))[0].id, createdAt: now });
    const run = await repo.create("NafsPracticeRun", { practiceId: practice.id, studentId: anyStudent.id, classId: practice.classId, state: {}, asked: 0, correct: 0, seconds: 0, startedAt: now, updatedAt: now });
    const answers = [
      ...Array.from({ length: 8 }, () => ({ questionId: hardId, correct: false })),
      ...Array.from({ length: 2 }, () => ({ questionId: hardId, correct: true })),
      ...Array.from({ length: 1 }, () => ({ questionId: easyId, correct: false })),
      ...Array.from({ length: 9 }, () => ({ questionId: easyId, correct: true })),
      ...Array.from({ length: 1 }, () => ({ questionId: fewId, correct: false })), // below MIN_ITEM_ATTEMPTS: excluded
    ];
    await repo.createMany("NafsPracticeAnswer", answers.map((a, i) => ({ runId: run.id, practiceId: practice.id, studentId: anyStudent.id, questionId: a.questionId, target: "NAFS.RC.MAIN", difficulty: 1, choice: a.correct ? 0 : 1, correct: a.correct, ms: 1000, at: new Date(now.getTime() + i * 1000) })));
  });

  test("students and a non-Grade-6 teacher are refused", async () => {
    await assert.rejects(mostMissedNafsQuestions(repo, student), ForbiddenError);
    await assert.rejects(mostMissedNafsQuestions(repo, teacher4), ForbiddenError);
  });

  test("Grade 6 teachers and admins see the worst-missed questions first, below the minimum attempts excluded", async () => {
    for (const actor of [teacher6, admin]) {
      const rows = await mostMissedNafsQuestions(repo, actor);
      assert.ok(rows.length >= 2);
      assert.ok(!rows.some((r) => r.id === fewId), `fewer than ${MIN_ITEM_ATTEMPTS} attempts: excluded`);
      const hard = rows.find((r) => r.id === hardId)!;
      const easy = rows.find((r) => r.id === easyId)!;
      assert.ok(hard, "the question with 10 attempts is included");
      assert.equal(hard.attempts, 10);
      assert.equal(hard.wrong, 8);
      assert.equal(hard.missRate, 80);
      assert.equal(easy.attempts, 10);
      assert.equal(easy.missRate, 10);
      assert.ok(rows.indexOf(hard) < rows.indexOf(easy), "worst miss rate first");
    }
  });

  test("minAttempts and limit options narrow the result", async () => {
    const all = await mostMissedNafsQuestions(repo, admin, { minAttempts: 1 });
    assert.ok(all.some((r) => r.id === fewId), "with a lower minimum, the low-attempt question is included");
    const top1 = await mostMissedNafsQuestions(repo, admin, { limit: 1 });
    assert.equal(top1.length, 1);
    assert.equal(top1[0].id, hardId);
  });

  test("no NAFS practice at all: an empty list, not an error", async () => {
    const { repo: freshRepo } = await demoDatabase();
    const fresh = await resolveActor(freshRepo, (await freshRepo.findUnique("User", { username: "demo.admin" }))!);
    const rows = await mostMissedNafsQuestions(freshRepo, fresh);
    assert.deepEqual(rows, []);
  });

  test("at most MAX_ROWS rows are ever returned", async () => {
    const rows = await mostMissedNafsQuestions(repo, admin, { limit: MAX_ROWS + 50 });
    assert.ok(rows.length <= MAX_ROWS);
  });
});
