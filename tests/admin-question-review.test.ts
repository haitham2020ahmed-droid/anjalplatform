/**
 * Admin Question Review (/admin/question-review): src/server/questions/tag-review.ts — every question's derived
 * tags (Curriculum Map place, skill, standard, MAP area, RIT) are "Suggested" until an admin marks them "Verified",
 * one skill at a time (a batch). Admin (questions:publish, role-gated) only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { MIN_CALIBRATION_ANSWERS, recalibrateRit, reviewBatch, reviewBatches, unverifyQuestions, verifyBatch, verifyQuestions } from "../src/server/questions/tag-review";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin Question Review (tag review)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let schoolId: string;
  let skillId: string; let qIds: string[];
  const now = new Date("2026-10-24T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await a("demo.admin"); teacher = await a("demo.teacher.4a");
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);

    const type = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const skill = (await repo.findMany("Skill", { curriculumId: cur.id, isActive: true }))[0];
    skillId = s(skill.id);
    qIds = [];
    for (let i = 0; i < 6; i++) qIds.push(s((await repo.create("Question", { skillId, typeId: type.id, stem: `Tag-review fixture question ${i}`, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: now, updatedAt: now })).id));
  });

  test("teachers and students are refused: admin (questions:publish) only", async () => {
    await assert.rejects(reviewBatches(repo, teacher, 4), ForbiddenError);
    await assert.rejects(reviewBatch(repo, student, skillId), ForbiddenError);
    await assert.rejects(verifyQuestions(repo, teacher, qIds), ForbiddenError);
    await assert.rejects(verifyBatch(repo, teacher, skillId), ForbiddenError);
    await assert.rejects(unverifyQuestions(repo, teacher, qIds), ForbiddenError);
    await assert.rejects(recalibrateRit(repo, teacher, 4), ForbiddenError);
  });

  test("reviewBatches / reviewBatch: the fixture skill shows up, all Suggested at first", async () => {
    const batches = await reviewBatches(repo, admin, 4);
    const batch = batches.find((b) => b.skillId === skillId)!;
    assert.ok(batch);
    assert.equal(batch.verified, 0);
    assert.ok(batch.questions >= 6);
    const view = await reviewBatch(repo, admin, skillId);
    assert.equal(view.total, batch.questions);
    assert.equal(view.verified, 0);
    assert.ok(view.sample.every((t) => t.review === "SUGGESTED"));
  });

  test("an unknown skill id is refused with a ValidationError", async () => {
    await assert.rejects(reviewBatch(repo, admin, "no-such-skill"), ValidationError);
  });

  test("verifyQuestions one by one, then undo with unverifyQuestions", async () => {
    const n = await verifyQuestions(repo, admin, [qIds[0], qIds[1]]);
    assert.equal(n, 2);
    const view = await reviewBatch(repo, admin, skillId);
    assert.equal(view.verified, 2);
    const back = await unverifyQuestions(repo, admin, [qIds[0]]);
    assert.equal(back, 1);
    assert.equal((await reviewBatch(repo, admin, skillId)).verified, 1);
  });

  test("verifyBatch verifies the whole skill at once", async () => {
    const n = await verifyBatch(repo, admin, skillId);
    assert.ok(n >= 6);
    const view = await reviewBatch(repo, admin, skillId);
    assert.equal(view.verified, view.total);
    const batches = await reviewBatches(repo, admin, 4);
    assert.equal(batches.find((b) => b.skillId === skillId)!.verified, batches.find((b) => b.skillId === skillId)!.questions);
  });

  test("recalibrateRit: without a MAP score, a student's answers never count towards calibration", async () => {
    const students = await repo.findMany("Student", { schoolId }, { select: ["id"] });
    assert.ok(students.length >= 1);
    // plenty of answers, but no MapResult for any of these students: recalibrateRit needs a real MAP score to anchor the RIT
    for (const st of students) {
      const ses = await repo.create("PracticeSession", { studentId: st.id, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: now, questionCount: MIN_CALIBRATION_ANSWERS, correctCount: 1 });
      for (let i = 0; i < MIN_CALIBRATION_ANSWERS; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: st.id, questionId: qIds[0], skillId, response: {}, isCorrect: i % 2 === 0, rapidGuess: false, responseMs: 5000, difficultyB: 0, createdAt: now });
    }
    const r = await recalibrateRit(repo, admin, 4, now);
    assert.ok(r.questions >= 6);
    assert.equal(r.calibrated, 0, "no MAP score to anchor the RIT: nothing is calibrated");
  });
});
