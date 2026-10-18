/**
 * 🎲 r67 item 1 — rapid guesses count for nothing, and the platform answers guessing calmly, step by step
 * (demo school in memory; never a real database).
 *   · a rapid guess: under 3 s; the first question of a passage under a third of its reading time; a question with
 *     20+ careful answers: 10 % of their average time, capped at 10 s
 *   · it counts for nothing: no 30/50 count, no ability or mastery change, no accuracy, no coins (XP)
 *   · 1 guess → logged · 3 of the last 5 → "Take your time" and the next answer buttons wait 3 s · 5 of the last 10 →
 *     the practice pauses (progress saved, not ended, never a failure) and the teachers get ONE alert
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { startPractice, submitAnswer, type PracticeView } from "../src/server/practice/session";
import { countsTowardWork, expectedReadingMs, guessResponse, isRapidGuess, ITEM_CAP_MS, passageWords, RAPID_GUESS_MS, rapidGuessThresholdMs, SLOW_DOWN_MS } from "../src/server/practice/guessing";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const T0 = new Date("2027-03-08T08:00:00Z");

describe("the rapid-guess rule (pure)", () => {
  test("3 seconds; a passage's first question: a third of its reading time; a question's own time after 20 answers", () => {
    assert.equal(RAPID_GUESS_MS, 3000);
    assert.equal(rapidGuessThresholdMs(), 3000);
    assert.equal(isRapidGuess(2999), true);
    assert.equal(isRapidGuess(3000), false);
    const passage = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    assert.equal(passageWords(passage), 300);
    assert.equal(expectedReadingMs(300), 120_000, "300 words at 150 words a minute = 2 minutes");
    assert.equal(rapidGuessThresholdMs({ passageText: passage, firstOnPassage: true }), 40_000, "a third of the reading time");
    assert.equal(isRapidGuess(30_000, { passageText: passage, firstOnPassage: true }), true, "the first question of a passage in 30 s: not read");
    assert.equal(isRapidGuess(30_000, { passageText: passage, firstOnPassage: false }), false, "the next question on the same passage: 3 s rule");
    assert.equal(rapidGuessThresholdMs({ passageText: "Short text.", firstOnPassage: true }), 3000, "never under 3 s");
    // the question's own careful time once it has 20 answers (10 %, capped at 10 s)
    assert.equal(rapidGuessThresholdMs({ itemStats: { answers: 19, avgMs: 60_000 } }), 3000, "19 answers: not yet");
    assert.equal(rapidGuessThresholdMs({ itemStats: { answers: 20, avgMs: 40_000 } }), 4000);
    assert.equal(rapidGuessThresholdMs({ itemStats: { answers: 50, avgMs: 400_000 } }), ITEM_CAP_MS, "capped at 10 s");
    assert.equal(rapidGuessThresholdMs({ itemStats: { answers: 25, avgMs: 15_000 }, passageText: passage, firstOnPassage: true }), 1500, "the question's own time replaces the default rules");
    assert.equal(countsTowardWork({ rapidGuess: true }), false);
    assert.equal(countsTowardWork({ rapidGuess: false }), true);
  });

  test("graduated response: 1 → logged, 3 of the last 5 → slow down, 5 of the last 10 → pause", () => {
    const f = (x: string) => [...x].map((c) => c === "g");
    assert.equal(guessResponse(f("....")), "NONE");
    assert.equal(guessResponse(f("...g")), "LOGGED");
    assert.equal(guessResponse(f("..g.g")), "LOGGED", "2 of the last 5");
    assert.equal(guessResponse(f(".g.gg")), "SLOW_DOWN", "3 of the last 5");
    assert.equal(guessResponse(f("g..g..g.")), "NONE", "3 guesses but spread out");
    assert.equal(guessResponse(f("gg.g..gg.g")), "PAUSE", "5 of the last 10");
    assert.equal(guessResponse(f("gggg......")), "NONE", "old guesses fall out of the window");
    assert.equal(SLOW_DOWN_MS, 3000);
  });
});

describe("guessing in practice", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = ""; let skillId = "";
  const kids: Actor[] = [];
  let clock = T0.getTime();
  const tick = (ms = 30_000) => new Date((clock += ms));

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 4 }));
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    for (const st of view.students) kids.push(await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: st.id }))!.userId }))!));
    const st = (await repo.findUnique("Student", { id: kids[0].studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const fam = s((await repo.upsert("SkillFamily", { code: "r67.guess" }, { name: "r67 guess", domain: "READING", category: "COMPREHENSION" })).id);
    skillId = s((await repo.create("Skill", { curriculumId: cur.id, familyId: fam, code: "R67.guess", name: "Marble Inference", domain: "READING", category: "COMPREHENSION", sequence: 9600, isActive: true })).id);
    for (let k = 0; k < 60; k++) {
      const q = await repo.create("Question", { skillId, typeId: mc, stem: `Marble Inference item ${k + 1}: which clue fits?`, content: {}, difficultyLevel: 1 + (k % 7), irtB: -1 + (k % 5) * 0.4, status: "PUBLISHED", createdAt: T0, updatedAt: T0 });
      for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Marble option ${o} ${k}`, isCorrect: i === 0, order: i });
    }
  });

  test("a rapid guess counts for nothing: no count, no ability, no mastery, no coins — only logged", async () => {
    const me = kids[0];
    const { assignmentId } = await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId, studentIds: [me.studentId!] }, tick(0));
    let v: PracticeView = await startPractice(repo, me, skillId, tick(0));
    // one careful answer first
    let r = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: "A" }, tick());
    v = r.view;
    const before = { ability: await repo.findUnique("StudentAbility", { studentId: me.studentId, scope: `SKILL:${skillId}` }), mastery: await repo.findUnique("StudentSkillMastery", { studentId: me.studentId, skillId }), xp: await repo.count("XpEvent", { studentId: me.studentId }), row: (await repo.findMany("AssignmentStudent", { assignmentId, studentId: me.studentId }))[0] };
    // a correct answer in 1 second
    r = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: "A" }, tick(1000));
    assert.equal(r.feedback.rapidGuess, true);
    assert.equal(r.feedback.xp, 0, "no coins");
    assert.equal(r.feedback.guess ?? null, null, "one guess: only logged");
    assert.equal(r.feedback.masteryAfter, r.feedback.masteryBefore, "mastery unchanged");
    const after = { ability: await repo.findUnique("StudentAbility", { studentId: me.studentId, scope: `SKILL:${skillId}` }), mastery: await repo.findUnique("StudentSkillMastery", { studentId: me.studentId, skillId }), xp: await repo.count("XpEvent", { studentId: me.studentId }), row: (await repo.findMany("AssignmentStudent", { assignmentId, studentId: me.studentId }))[0] };
    assert.equal(Number(after.ability!.theta), Number(before.ability!.theta), "ability unchanged");
    assert.deepEqual([Number(after.mastery!.score), Number(after.mastery!.attempts)], [Number(before.mastery!.score), Number(before.mastery!.attempts)], "mastery and its counts unchanged");
    assert.equal(after.xp, before.xp);
    assert.deepEqual([Number(after.row.coreAnswered), Number(after.row.coreCorrect)], [1, 1], "the 30/50 count and accuracy skip it");
    const att = (await repo.findMany("QuestionAttempt", { sessionId: v.sessionId }, { orderBy: [{ field: "id", dir: "asc" }] }));
    assert.deepEqual(att.map((a) => Boolean(a.rapidGuess)), [false, true], "logged on the attempt");
  });

  test("3 guesses in the last 5 → take your time (3 s wait); 5 in the last 10 → a calm pause, one teacher alert, then it continues", async () => {
    const me = kids[1];
    let v: PracticeView = await startPractice(repo, me, skillId, tick(0));
    const answer = async (ms: number) => { const r = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: "B" }, tick(ms)); v = r.view; return r; };
    const alerts = async () => repo.count("Notification", { type: "INTERVENTION_ALERT", title: { contains: "too fast" } });
    const alertsBefore = await alerts();
    assert.equal((await answer(1000)).feedback.guess ?? null, null);
    assert.equal((await answer(1000)).feedback.guess ?? null, null);
    const third = await answer(1000);
    assert.deepEqual(third.feedback.guess, { action: "SLOW_DOWN", waitMs: 3000 }, "3 of the last 5: take your time");
    assert.equal(third.feedback.next.hasQuestion, true);
    await answer(30_000);
    const fifth = await answer(1000);
    assert.equal(fifth.feedback.guess?.action, "SLOW_DOWN");
    const sixth = await answer(1000);
    assert.equal(sixth.feedback.guess?.action, "PAUSE", "5 of the last 10: pause");
    assert.equal(sixth.view.paused, true);
    assert.equal(sixth.view.ended, false, "paused, not ended: never a failed attempt");
    assert.ok(sixth.view.question, "the next question waits for the student's return");
    await afterResponseSettled();
    assert.equal((await alerts()) - alertsBefore, 1, "the teacher gets one alert");
    assert.equal(await repo.count("StudentAlert", { studentId: me.studentId, kind: "RAPID_GUESS" }), 1, "one alert in the teacher's Alerts list (with follow-up)");
    const sess = (await repo.findUnique("PracticeSession", { id: v.sessionId }))!;
    assert.equal(sess.endedAt ?? null, null);
    // coming back: the same session goes on; the guess window starts again (one careful answer does not pause again)
    const back = await startPractice(repo, me, skillId, tick(10 * 60_000));
    assert.equal(back.sessionId, v.sessionId, "progress saved: the same practice continues");
    v = back;
    const next = await answer(30_000);
    assert.equal(next.feedback.guess ?? null, null);
    assert.equal(next.feedback.next.hasQuestion, true);
    await afterResponseSettled();
    assert.equal((await alerts()) - alertsBefore, 1, "still one alert");
  });
});
