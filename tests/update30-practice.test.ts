import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { atSchool, practiceAnalytics, riyadhDay } from "../src/server/analytics/practice";
import { demoDatabase } from "./helpers/db";

describe("📊 Practice analytics (IXL-style), fake answers", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let classId: string; let ids: string[]; let skillA: string; let skillB: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await as("test.teacher.1"); other = await as("test.teacher.3");
    const r = await teacherRoster(repo, teacher); classId = r[0].id; ids = r[0].students.map((x) => x.id);
    const qs = await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["id", "skillId"] });
    skillA = String(qs[0].skillId); skillB = String(qs.find((q) => q.skillId !== skillA)!.skillId);
    const qa = qs.filter((q) => q.skillId === skillA).slice(0, 3), qb = qs.filter((q) => q.skillId === skillB).slice(0, 2);
    const answer = async (sid: string, q: Record<string, unknown>, at: string, ok: boolean, ms = 30_000) => {
      const ses = await repo.create("PracticeSession", { studentId: sid, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(at) });
      await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: sid, questionId: q.id, skillId: q.skillId, response: {}, isCorrect: ok, responseMs: ms, difficultyB: 0, createdAt: new Date(at) });
    };
    // student 0: 8 answers on skill A at school (Sunday 2026-10-04 09:00 Riyadh = 06:00Z), getting better; 2 on B at home
    for (let i = 0; i < 8; i++) await answer(ids[0], qa[i % qa.length], `2026-10-04T06:${String(i).padStart(2, "0")}:00Z`, i >= 3);
    await answer(ids[0], qb[0], "2026-10-04T17:00:00Z", false, 20 * 60_000);   // 20 min counts as 5
    await answer(ids[0], qb[1], "2026-10-04T17:05:00Z", true);
    // students 1 and 2 miss the same question (a trouble spot); student 3 outside the range
    await answer(ids[1], qa[0], "2026-10-05T07:00:00Z", false);
    await answer(ids[2], qa[0], "2026-10-05T07:10:00Z", false);
    await answer(ids[3], qa[0], "2026-09-01T07:10:00Z", true);
    await repo.create("StudentSkillMastery", { studentId: ids[0], skillId: skillA, score: 92, band: "MASTERED", attempts: 8, correct: 5, isMastered: true, masteredAt: new Date("2026-10-04T07:00:00Z"), updatedAt: new Date() });
  });

  test("school time is Sunday–Thursday 07:00–14:00 in Riyadh", () => {
    assert.equal(atSchool("2026-10-04T06:00:00Z"), true, "Sunday 09:00 Riyadh");
    assert.equal(atSchool("2026-10-04T17:00:00Z"), false, "Sunday 20:00");
    assert.equal(atSchool("2026-10-09T06:00:00Z"), false, "Friday");
    assert.equal(riyadhDay("2026-10-04T22:30:00Z"), "2026-10-05", "after midnight in Riyadh");
  });

  test("the class in a date range: totals, school/home, days, skills, students, trouble spots", async () => {
    const a = await practiceAnalytics(repo, teacher, { classId, from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-08T23:59:59Z") });
    assert.equal(a.totals.questions, 12);
    assert.equal(a.totals.activeStudents, 3);
    assert.deepEqual([a.totals.schoolQuestions, a.totals.homeQuestions], [10, 2]);
    assert.equal(a.totals.mastered, 1);
    assert.deepEqual(a.days.map((d) => [d.day, d.questions]), [["2026-10-04", 10], ["2026-10-05", 2]]);
    assert.equal(a.skills[0].skillId, skillA);
    const s0 = a.students.find((x) => x.id === ids[0])!;
    assert.equal(s0.minutes, Math.round((9 * 30_000 + 5 * 60_000) / 60_000), "one answer capped at 5 minutes");
    const dA = s0.detail.find((d) => d.skillId === skillA)!;
    assert.equal(dA.change, 60, "first five answers 40% → last five 100%");
    assert.equal(dA.mastered, true);
    assert.equal(a.trouble[0].missedBy, 3, "missed by students 0, 1 and 2");
  });

  test("one student, and only the teacher's classes", async () => {
    const a = await practiceAnalytics(repo, teacher, { classId, from: new Date("2026-10-01"), to: new Date("2026-10-08T23:59:59Z"), studentId: ids[0] });
    assert.equal(a.students.length, 1);
    assert.equal(a.totals.questions, 10);
    await assert.rejects(practiceAnalytics(repo, other, { classId, from: new Date("2026-10-01"), to: new Date("2026-10-08") }), ForbiddenError);
    const none = await practiceAnalytics(repo, teacher, { classId, from: new Date("2026-08-01"), to: new Date("2026-08-31") });
    assert.equal(none.totals.questions, 0);
  });
});
