/**
 * 🩹 Round 14 (owner, 12 Nov 2026: "fix everything" after the 10-students × 10-activities simulation). FAKE data only.
 *   1. a question the student can never see (needs a passage it lacks) no longer freezes a set or the Diagnostic
 *   2. self-contained stems ("An author writes an article that…", "this passage of time") are not hidden
 *   3. Early Warning: a first placement is not a "level drop"
 *   4. ReadRise: the last 4 first tries averaging under 60% → down 50
 *   5. one guessing-pause alert per student and work within 30 minutes; solo game points capped per question
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { definitelyNeedsPassage } from "../src/lib/passage-detect";
import { loadQuestionItems, servableIds } from "../src/server/practice/items";
import { teacherRoster, assignQuestions } from "../src/server/teacher/assign";
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { createDraft, publishQuestions } from "../src/server/admin/questions";
import { ENGINE, levelDecision } from "../src/server/readrise/engine";
import { notifyGuessPause } from "../src/server/practice/guessing";
import { soloRound } from "../src/server/game/questions";
import { recordSoloPlay, SOLO_POINTS_PER_QUESTION } from "../src/server/game/results";
import { assignedSkills } from "../src/server/student/assigned";
import { clearEarlyWarningCache, schoolEarlyWarning } from "../src/server/insights/early-warning";
import { demoDatabase } from "./helpers/db";

describe("🩹 round 14: hidden questions", () => {
  test("self-contained stems are shown; stems that point to a missing text stay hidden", () => {
    for (const s of [
      "An author writes an article that begins by describing a dry, cracked field, then explains the science of drought, and ends by asking readers to conserve water. How do the different parts of the article work together?",
      "A passage explains that both a monologue and a soliloquy involve a single character speaking at length, but a soliloquy is typically delivered when the character believes no one else is listening. What is the passage's main purpose?",
      "A story set on a long sea voyage shows the ship’s supplies dwindling week by week. What does this passage of time within the setting most likely foreshadow?",
      "Because social media algorithms show users more of what they already agree with, some researchers argue this causes people’s opinions to become more extreme over time. According to this passage, what is being proposed as a LONG-TERM effect?",
    ]) assert.equal(definitelyNeedsPassage(s), false, s.slice(0, 60));
    for (const s of ["According to the passage, why did the bees leave?", "Read this passage. According to this passage, what happened first?", "In paragraph 3, what does the word fragile mean?", "Which detail from the article supports the main idea?"]) assert.equal(definitelyNeedsPassage(s), true, s);
  });
});

describe("🩹 round 14 (DB)", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let student: Actor; let classId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, admin, student] = await Promise.all(["test.teacher.1", "test.admin", "test.student.005"].map(a));
    classId = (await teacherRoster(repo, teacher))[0].id;
  });

  test("a set with a question the loader hides is finished without it (no frozen 'You finished')", async () => {
    const skillId = String((await assignedSkills(repo, student)).items.find((i) => i.skillId)!.skillId);
    const mk = async (stem: string) => {
      const id = await createDraft(repo, admin, { skillId, type: "MULTIPLE_CHOICE", stem, level: 3, whyCorrect: "Because.", options: [{ label: "A", text: "right one", correct: true, rationale: null }, { label: "B", text: "wrong one", correct: false, rationale: "No." }] } as never);
      await publishQuestions(repo, admin, [id]);
      return id;
    };
    const ok1 = await mk("Which word means very big? Choose the best answer for this sentence about a whale."), hidden = await mk("According to the passage, why did the bees leave the hive?"), ok2 = await mk("Which word is a verb in the sentence 'The dog runs fast'?");
    assert.deepEqual([...await servableIds(repo, [ok1, hidden, ok2])].sort(), [ok1, ok2].sort(), "the shared rule");
    assert.deepEqual((await loadQuestionItems(repo, [ok1, hidden, ok2])).map((i) => i.questionId).sort(), [ok1, ok2].sort(), "the loader agrees with it");
    const { assignmentId } = await assignQuestions(repo, teacher, { source: "CURRICULUM", classId, questionIds: [ok1, hidden, ok2], studentIds: [student.studentId!], title: "With a hidden one" });
    let clock = Date.now() - 600_000;
    let v = await startQuiz(repo, student, assignmentId, new Date(clock));
    assert.equal(v.total, 2, "the hidden question is not counted");
    const seen: string[] = [];
    while (v.question) {
      seen.push(v.question.questionId);
      const it = (await loadQuestionItems(repo, [v.question.questionId]))[0];
      v = (await submitQuizAnswer(repo, student, { assignmentId, questionId: it.questionId, response: it.options!.find((o) => o.correct)!.label }, new Date((clock += 30_000)))).view;
    }
    assert.deepEqual(seen, [ok1, ok2]);
    assert.equal(v.ended, true);
    const row = (await repo.findMany("AssignmentStudent", { assignmentId, studentId: student.studentId! }))[0];
    assert.equal(String(row.status), "COMPLETED", "finished and saved");
  });

  test("Early Warning: a first placement below the working start is not a level drop", async () => {
    const sid = student.studentId!, schoolId = admin.schoolId!;
    const now = new Date();
    await repo.create("RRStudent", { studentId: sid, schoolId, level: 640, startLevel: 640, source: "PLACEMENT", placedAt: new Date(now.getTime() - 3 * 86_400_000), weeklyGoal: 2, updatedAt: now });
    await repo.create("RRLevelChange", { studentId: sid, schoolId, fromLevel: 950, toLevel: 640, reason: "Placement: 12 passages, result 640L", createdAt: new Date(now.getTime() - 3 * 86_400_000) });
    clearEarlyWarningCache(repo);
    const ew = await schoolEarlyWarning(repo, schoolId, now) as unknown as { rows: { studentId: string; rules: string[]; reason: string }[] };
    const mine = ew.rows.find((r) => r.studentId === sid);
    assert.ok(!mine || !mine.rules.some((r) => /DROP/.test(r)), JSON.stringify(mine));
  });

  test("one guessing-pause alert per student and work within 30 minutes", async () => {
    const t0 = new Date();
    const n1 = await notifyGuessPause(repo, student.studentId!, "Author's Perspective", t0, "pause|a");
    const n2 = await notifyGuessPause(repo, student.studentId!, "Author's Perspective", new Date(t0.getTime() + 10_000), "pause|b");
    const n3 = await notifyGuessPause(repo, student.studentId!, "Another skill", new Date(t0.getTime() + 20_000), "pause|c");
    assert.ok(n1 > 0); assert.equal(n2, 0, "the same work seconds later: no second notification"); assert.ok(n3 > 0, "other work: notified");
  });

  test("solo game points are capped per question served", async () => {
    const skillId = String((await assignedSkills(repo, student)).items.find((i) => i.skillId)!.skillId);
    const r = await soloRound(repo, student, "quiz-race", skillId);
    const { id } = await recordSoloPlay(repo, student, { roundId: r.roundId, correct: 99, incorrect: 0, points: 999_999 });
    const row = (await repo.findUnique("GamePlay", { id }))!;
    assert.equal(Number(row.points), r.questions.length * SOLO_POINTS_PER_QUESTION);
    assert.equal(Number(row.correct), r.questions.length);
  });
});

describe("🩹 round 14: ReadRise down when the last 4 average under 60%", () => {
  test("63, 50, 50, 63 (no two under 50%) → down 50; 63 ×4 stays; latest 75%+ never drops", () => {
    assert.equal(ENGINE.downAverage, 60);
    const d = levelDecision([63, 50, 50, 63]);
    assert.equal(d.delta, -50); assert.match(String(d.reason), /averaged 57%/);
    assert.equal(levelDecision([63, 63, 63, 63]).delta, 0);
    assert.equal(levelDecision([50, 38, 63, 75]).delta, 0, "the latest read was good");
    assert.equal(levelDecision([50, 63, 50]).delta, 0, "fewer than 4 reads");
  });
});
