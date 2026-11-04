/**
 * 🎲 r67 item 1, redesigned Nov 2026 — speed alone no longer withholds credit; only a literal instant misclick does,
 * and the real guessing signal is now a PATTERN (fast AND wrong, repeatedly), not fast alone
 * (demo school in memory; never a real database).
 *   · "fast" (under 3 s; the first question of a passage under a third of its reading time; a question with 20+
 *     careful answers: 10 % of their average time, capped at 10 s) is now purely informational: logged, shown to
 *     teachers, used only to spot the pattern below — it no longer zero-weights a correct (or even a wrong) answer.
 *   · a literal MISCLICK (well under half a second — isInstantMisclick) is the only thing that still counts for
 *     nothing: no 30/50 count, no ability or mastery change, no accuracy, no coins (XP).
 *   · 3 of the last 5 fast-AND-WRONG answers → "Take your time" and the next answer buttons wait 3 s · 5 of the
 *     last 10 → the practice pauses (progress saved, not ended, never a failure) and the teachers get ONE alert
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { startPractice, submitAnswer, type PracticeView } from "../src/server/practice/session";
import { countsTowardWork, expectedReadingMs, guessResponse, isInstantMisclick, isRapidGuess, ITEM_CAP_MS, MISCLICK_MS, passageWords, RAPID_GUESS_MS, rapidGuessThresholdMs, SLOW_DOWN_MS } from "../src/server/practice/guessing";
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

  test("a literal misclick (well under half a second) is the only thing that still counts for nothing", () => {
    assert.equal(MISCLICK_MS, 500);
    assert.equal(isInstantMisclick(499), true);
    assert.equal(isInstantMisclick(500), false);
    // "fast" (3 s and under) no longer implies "counts for nothing" — most fast answers are well above the misclick floor
    assert.equal(isRapidGuess(1000), true, "still flagged as fast, informationally");
    assert.equal(isInstantMisclick(1000), false, "but not a misclick: it counts in full");
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

  // Nov 2026 redesign: a merely FAST but genuine correct answer now counts in full — mastery, ability, accuracy and
  // the full XP reward, exactly like any other correct answer, even on the student's very first-ever attempt (no
  // track record or grace window needed any more). Only a literal instant misclick (under MISCLICK_MS) still earns
  // nothing at all.
  test("a fast but genuine correct answer counts in full — no speed penalty any more", async () => {
    const me = kids[0];
    const { assignmentId } = await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId, studentIds: [me.studentId!] }, tick(0));
    let v: PracticeView = await startPractice(repo, me, skillId, tick(0));
    const before = { ability: await repo.findUnique("StudentAbility", { studentId: me.studentId, scope: `SKILL:${skillId}` }), mastery: await repo.findUnique("StudentSkillMastery", { studentId: me.studentId, skillId }), xp: await repo.count("XpEvent", { studentId: me.studentId }), row: (await repo.findMany("AssignmentStudent", { assignmentId, studentId: me.studentId }))[0] };
    // a correct answer in 500ms: fast (still logged as such) but not a misclick (500ms === MISCLICK_MS, not under it)
    let r = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: "A" }, tick(500));
    v = r.view;
    assert.equal(r.feedback.rapidGuess, true, "still logged as fast — informational only now");
    assert.ok(r.feedback.xp > 0, "the full reward, not a reduced one");
    assert.equal(r.feedback.guess ?? null, null, "a single fast CORRECT answer never contributes to the guessing pattern");
    assert.ok(r.feedback.masteryAfter! >= r.feedback.masteryBefore!, "mastery moves normally");
    const after = { ability: await repo.findUnique("StudentAbility", { studentId: me.studentId, scope: `SKILL:${skillId}` }), mastery: await repo.findUnique("StudentSkillMastery", { studentId: me.studentId, skillId }), xp: await repo.count("XpEvent", { studentId: me.studentId }), row: (await repo.findMany("AssignmentStudent", { assignmentId, studentId: me.studentId }))[0] };
    assert.notEqual(Number(after.ability!.theta), Number(before.ability?.theta ?? 0), "ability updated normally");
    assert.equal(Number(after.mastery!.attempts), Number(before.mastery?.attempts ?? 0) + 1, "mastery's attempt count moved");
    assert.deepEqual([Number(after.row.coreAnswered), Number(after.row.coreCorrect)], [1, 1], "counts toward the 30/50 rule and accuracy, fully");
    const att = (await repo.findMany("QuestionAttempt", { sessionId: v.sessionId }, { orderBy: [{ field: "id", dir: "asc" }] }));
    assert.deepEqual(att.map((a) => Boolean(a.rapidGuess)), [true], "fast is still logged on the attempt, informationally");
  });

  test("a literal instant misclick still counts for nothing", async () => {
    const me = kids[2];
    const { assignmentId } = await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId, studentIds: [me.studentId!] }, tick(0));
    let v: PracticeView = await startPractice(repo, me, skillId, tick(0));
    const before = { ability: await repo.findUnique("StudentAbility", { studentId: me.studentId, scope: `SKILL:${skillId}` }), mastery: await repo.findUnique("StudentSkillMastery", { studentId: me.studentId, skillId }), xp: await repo.count("XpEvent", { studentId: me.studentId }), row: (await repo.findMany("AssignmentStudent", { assignmentId, studentId: me.studentId }))[0] };
    // a correct answer in 100ms: well under MISCLICK_MS — physically too fast to have read anything
    const r = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: "A" }, tick(100));
    assert.equal(r.feedback.rapidGuess, true);
    assert.equal(r.feedback.xp, 0, "no credit at all for a literal misclick — not even a participation coin");
    assert.equal(r.feedback.masteryAfter, r.feedback.masteryBefore, "mastery unchanged");
    const after = { ability: await repo.findUnique("StudentAbility", { studentId: me.studentId, scope: `SKILL:${skillId}` }), mastery: await repo.findUnique("StudentSkillMastery", { studentId: me.studentId, skillId }), xp: await repo.count("XpEvent", { studentId: me.studentId }), row: (await repo.findMany("AssignmentStudent", { assignmentId, studentId: me.studentId }))[0] };
    assert.equal(Number(after.ability?.theta ?? 0), Number(before.ability?.theta ?? 0), "ability unchanged");
    assert.equal(after.mastery, null, "no mastery row was ever created by a misclick alone");
    assert.equal(after.xp, before.xp, "no XP event at all");
    assert.deepEqual([Number(after.row.coreAnswered ?? 0), Number(after.row.coreCorrect ?? 0)], [0, 0], "the 30/50 count and accuracy skip it");
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
