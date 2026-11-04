/**
 * ⭐ One star system (1 Nov 2026), review fixes: work finishes with the ⭐ the same way an answer finishes it —
 * 30+ counted answers (+ the teacher's count) when the ⭐ comes during the work, at once when the ⭐ came BEFORE the
 * work was set (no repeating a mastered skill), 50 answers regardless.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assignmentStatus } from "../src/server/teacher/assign";
import { isReviewWork, REVIEW_WORK_PASS, REVIEW_WORK_QUESTIONS } from "../src/server/practice/completion";

const NOW = new Date("2027-01-10T10:00:00Z");
const base = { dueAt: null, now: NOW };
describe("⭐ work completion = the answer's own rule", () => {
  test("⭐ earned during the work: Done only at 30+ answers", () => {
    assert.equal(assignmentStatus({ ...base, answered: 0, star: { mastered: true, score: 100 } }).status, "NOT_STARTED", "0 answers: not Done");
    assert.equal(assignmentStatus({ ...base, answered: 12, star: { mastered: true, score: 100 } }).status, "IN_PROGRESS");
    assert.equal(assignmentStatus({ ...base, answered: 30, star: { mastered: true, score: 100 } }).status, "COMPLETED");
  });
  test("the teacher's count is needed too", () => {
    assert.equal(assignmentStatus({ ...base, answered: 30, correct: 20, count: 25, star: { mastered: true, score: 100 } }).status, "IN_PROGRESS");
    assert.equal(assignmentStatus({ ...base, answered: 32, correct: 25, count: 25, star: { mastered: true, score: 100 } }).status, "COMPLETED");
  });
  test("⭐ from BEFORE the work: never Done at once — it is a 20-question review", () => {
    assert.equal(isReviewWork({ status: "MASTERED", masteredAt: "2027-01-01T00:00:00Z" }, "2027-01-05T00:00:00Z"), true);
    assert.equal(isReviewWork({ status: "MASTERED", masteredAt: "2027-01-06T00:00:00Z" }, "2027-01-05T00:00:00Z"), false, "⭐ earned after the work was set");
    assert.equal(isReviewWork({ status: "NEEDS_REVIEW", masteredAt: "2027-01-01T00:00:00Z" }, "2027-01-05T00:00:00Z"), false);
    assert.equal(assignmentStatus({ ...base, answered: 0, star: { mastered: true, score: 100 } }).status, "NOT_STARTED");
    assert.deepEqual([REVIEW_WORK_QUESTIONS, REVIEW_WORK_PASS], [20, 16]);
  });
  test("50 answers finish it regardless; no ⭐ and under 50 never does", () => {
    assert.equal(assignmentStatus({ ...base, answered: 50, star: { mastered: false, score: 40 } }).status, "COMPLETED");
    assert.equal(assignmentStatus({ ...base, answered: 49, star: { mastered: false, score: 99 } }).status, "IN_PROGRESS");
  });
});
