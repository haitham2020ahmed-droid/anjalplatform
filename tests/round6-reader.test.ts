/**
 * Round 6 — the ReadRise reader "exactly like Achieve3000": Ready → Read → Respond → Reflect → Write (+ Stretch Read →
 * Stretch Respond), one question per screen with a second try (the score = first tries only), 4 questions below the 400
 * version, Ready / Reflect explanations + platform-wide % + the class feed (teacher toggle), the Article Rating, drafts,
 * the Stretch at the grade-level version as practice only, and levels shown with formatLevel.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS, formatLevel as levelFormat } from "../src/server/readrise/level";
import { levelWindow, setLevelByTeacher } from "../src/server/readrise/engine";
import {
  answerQuestion, answerTime, feedOffKey, finishReading, initialsOf, rateArticle, runView, saveReading, saveWritingDraft, startRun, stretchOffer, submitActivity,
  submitPostPoll, submitPrePoll, submitWriting,
} from "../src/server/readrise/student";
import { goalRuns, isCountedTry, stretchCountsFully } from "../src/server/readrise/first-try";
import { pickShownQuestions } from "../src/server/readrise/question-type";
import { cleanAnnotations, readAnnotations, withRunExtras } from "../src/components/readrise/text";
import { formatLevel } from "../src/components/readrise/widgets";
import { secondTryRight } from "../src/server/readrise/points";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const T0 = new Date("2026-09-06T08:00:00Z");
const at = (days: number, h = 0) => new Date(T0.getTime() + days * DAY + h * 3_600_000);
const SKILLS = ["central-idea", "detail", "detail", "vocabulary", "cause-effect", "inference", "inference", "author-purpose"];

async function makeArticle(repo: SqliteRepo, code: string): Promise<string> {
  const a = await repo.create("RRArticle", { schoolId: null, code, title: `Article ${code}`, topic: "Science", summary: "About things.", pollStatement: "Things matter.", status: "PUBLISHED" });
  const id = String(a.id);
  for (const level of RR_LEVELS) {
    const body = `${code} at ${level}. The colony works hard every day.\n\nBees ${"make honey ".repeat(Math.round(level / 20))}and the hive grows.`;
    await repo.create("RRVersion", { articleId: id, level, title: `${code} (${level})`, body, wordCount: body.split(/\s+/).length, estLevel: level });
  }
  for (const band of ["LOW", "MID", "HIGH"]) {
    for (let n = 1; n <= 8; n++) await repo.create("RRQuestion", { articleId: id, band, number: n, stem: `${band} Q${n}?`, options: ["right", "w1", "w2", "w3"], answer: "A", skill: SKILLS[n - 1], rationale: { why: "w" } });
    await repo.create("RRPrompt", { articleId: id, band, prompt: `Explain (${band}).`, checklist: ["Use evidence"], keyWords: [{ word: "colony", partOfSpeech: "noun", definition: "a group that lives together", example: "" }], modelAnswer: "A strong answer." });
  }
  return id;
}
const WRITING = Array.from({ length: 32 }, (_, i) => `word${i}`).join(" ");

describe("round 6 — the ReadRise reader like Achieve3000", () => {
  let repo: SqliteRepo; let admin: Actor; let st: Actor[];
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorOf("test.admin");
    st = await Promise.all(["001", "002", "003", "004"].map((t) => actorOf(`test.student.${t}`)));
  });

  test("4 questions below the 400 version (one per skill type), 8 from 400", () => {
    const qs = SKILLS.map((skill, i) => ({ number: i + 1, skill, stem: "?" }));
    assert.deepEqual(pickShownQuestions(qs, 300).map((q) => q.number), [1, 2, 4, 5], "main idea, detail, vocabulary, cause/inference");
    assert.equal(pickShownQuestions(qs, 400).length, 8);
    // a band without the types: the lowest numbers fill in
    assert.deepEqual(pickShownQuestions(qs.map((q) => ({ ...q, skill: "detail" })), 300).map((q) => q.number), [1, 2, 3, 4]);
  });

  test("Ready → Read → Respond (one question, a second try) → Reflect → Write; the score = first tries", async () => {
    const s = st[0], sid = s.studentId!;
    await setLevelByTeacher(repo, admin, sid, 800, "", at(0));
    const a = await makeArticle(repo, "R6-1");
    const v = await startRun(repo, s, a, {}, at(1));
    assert.equal(v.step, "PREPOLL");
    await assert.rejects(finishReading(repo, s, v.runId, { readSeconds: 120 }, at(1)), /in order/);
    const r1 = await submitPrePoll(repo, s, v.runId, 1, at(1), "I agree with it because of bees.");
    assert.deepEqual([r1.step, r1.ready?.vote, r1.ready?.why], ["READ", 1, "I agree with it because of bees."]);
    await saveReading(repo, s, v.runId, { annotations: [{ start: 0, end: 2, color: "yellow", note: "n" }], notesText: "my note" });
    await finishReading(repo, s, v.runId, { readSeconds: 120 }, at(1, 1));
    await rateArticle(repo, s, v.runId, { stars: 3, access: "SELF" }, at(1, 1));
    const q0 = await runView(repo, s, v.runId, at(1, 1));
    assert.deepEqual([q0.step, q0.questions.length, q0.rating?.stars, q0.rating?.access, q0.notesText], ["QUIZ", 8, 3, "SELF", "my note"]);
    assert.equal(q0.annotations.length, 1, "highlights kept beside the step data");
    // Q1 right (2 points); Q2 wrong then right (1 point); Q3 wrong twice (the answer is shown); the rest right
    const qt = (ms: number) => new Date(at(1, 1).getTime() + ms); // the server's clock: ms after the questions opened
    const f1 = await answerQuestion(repo, s, v.runId, 1, "A", 30_000, qt(30_000));
    assert.deepEqual([f1.try, f1.correct, f1.points, f1.done], [1, true, 2, true]);
    await assert.rejects(answerQuestion(repo, s, v.runId, 1, "B", 31_000, qt(31_000)), /already answered/);
    const f2 = await answerQuestion(repo, s, v.runId, 2, "B", 10_000, qt(40_000));
    assert.deepEqual([f2.correct, f2.done, f2.answer], [false, false, null], "no answer before the second try");
    const f2b = await answerQuestion(repo, s, v.runId, 2, "A", null, qt(45_000));
    assert.deepEqual([f2b.try, f2b.correct, f2b.points], [2, true, 1]);
    await answerQuestion(repo, s, v.runId, 3, "C", 10_000, qt(50_000));
    const f3 = await answerQuestion(repo, s, v.runId, 3, "D", null, qt(55_000));
    assert.deepEqual([f3.correct, f3.done, f3.answer], [false, true, "A"]);
    let last = f3;
    for (let n = 4; n <= 8; n++) last = await answerQuestion(repo, s, v.runId, n, "A", 10_000, qt(50_000 + (n - 3) * 10_000));
    assert.equal(last.allDone, true);
    // the page sends nothing: the stored FIRST tries are the answers (a different "raw" answer cannot change them)
    const scored = await submitActivity(repo, s, v.runId, { 2: "A", 3: "A" }, at(1, 2));
    assert.deepEqual([scored.step, scored.score], ["POSTPOLL", 75], "6 of 8 right on the first try");
    const row = (await repo.findUnique("RRRun", { id: v.runId }))!;
    assert.deepEqual(row.answers, { 1: "A", 2: "B", 3: "C", 4: "A", 5: "A", 6: "A", 7: "A", 8: "A" });
    const ann = readAnnotations(row.annotations);
    assert.deepEqual(ann.extras.secondTry, { 2: { letter: "A", correct: true }, 3: { letter: "D", correct: false } });
    assert.equal(ann.extras.quiz, undefined);
    assert.equal(secondTryRight(row.annotations), 1, "points.ts reads the second tries");
    const r2 = scored.review!.find((r) => r.number === 2)!;
    assert.deepEqual([r2.correct, r2.second, r2.secondCorrect, typeof r2.skillName], [false, "A", true, "string"]);
    assert.deepEqual(scored.points, { earned: 6 * 2 + 1, bonus: 10, secondPct: 88 });
    // Reflect → Write: Before / After, the platform-wide %
    await assert.rejects(submitWriting(repo, s, v.runId, WRITING, at(1, 2)), /in order/);
    const w = await submitPostPoll(repo, s, v.runId, 2, at(1, 3), "I changed my mind.");
    assert.equal(w.step, "WRITE");
    assert.deepEqual([w.reflect?.vote, w.pollStats?.before.agree, w.pollStats?.after.disagree], [2, 100, 100]);
    const mem = await repo.findMany("ClassMembership", { studentId: sid, leftAt: null });
    if (mem.length) assert.ok(w.feed && w.feed.some((x) => x.mine && x.why === "I changed my mind."), "my explanation in the class feed");
    // Write: drafts are kept in annotations; RRRun.writing only on submit (never an unsent draft in the teacher queue)
    await saveWritingDraft(repo, s, v.runId, "second draft", { drafts: ["first draft", "second draft"], draft: 1 });
    const wv = await runView(repo, s, v.runId, at(1, 3));
    assert.deepEqual([wv.drafts, wv.draft, wv.writing, wv.modelAnswer], [["first draft", "second draft"], 1, "second draft", null]);
    assert.equal((await repo.findUnique("RRRun", { id: v.runId }))!.writing ?? null, null);
    const done = await submitWriting(repo, s, v.runId, WRITING, at(1, 4));
    assert.equal(done.step, "DONE");
    assert.equal(done.modelAnswer, "A strong answer.");
    assert.equal(done.annotations.length, 1);
    const sent = readAnnotations((await repo.findUnique("RRRun", { id: v.runId }))!.annotations).extras;
    assert.deepEqual([sent.drafts, sent.draft, sent.notesText, sent.ready?.vote], [undefined, undefined, undefined, 1], "drafts and notes dropped on submit; the rest kept");
    await afterResponseSettled();
  });

  test("the 300 version shows 4 questions; the score is the % of those", async () => {
    const s = st[1];
    await setLevelByTeacher(repo, admin, s.studentId!, 300, "", at(0));
    const a = await makeArticle(repo, "R6-2");
    const v = await startRun(repo, s, a, {}, at(1));
    assert.equal(v.versionLevel, 300);
    assert.deepEqual(v.questions.map((q) => q.number), [1, 2, 4, 5]);
    await submitPrePoll(repo, s, v.runId, 2, at(1));
    await finishReading(repo, s, v.runId, { readSeconds: 120 }, at(1));
    const q = await submitActivity(repo, s, v.runId, { 1: "A", 2: "A", 4: "A", 5: "B" }, at(1, 1));
    assert.deepEqual([q.score, q.review!.length], [75, 4]);
    await afterResponseSettled();
  });

  test("the Stretch: the grade-level version, Stretch Read → Stretch Respond, practice only", async () => {
    const vs = RR_LEVELS.map((level) => ({ level }));
    const first = { firstTry: true, stretch: false, step: "DONE", score: 90, band: "MID", versionLevel: 800 };
    const g9 = stretchOffer([first], 800, vs, new Set(), 9);
    assert.deepEqual([g9.ok, g9.up, g9.band, g9.mode], [true, 1200, "HIGH", "PRACTICE"], "grade 9: the version nearest its Meets band");
    assert.equal(stretchOffer([first], 800, vs, new Set(), 4).up, 900, "grade-level not above → the next version up");
    assert.equal(stretchCountsFully("MID", "S-H"), false);
    assert.equal(isCountedTry({ firstTry: true, stretch: true, band: "S-H" }, "MID"), false);
    assert.equal(goalRuns([{ studentId: "s", articleId: "a", firstTry: true, stretch: true, score: 100, completedAt: "2026-09-07T08:00:00Z" }]).length, 0);
    // a real stretch run
    const s = st[2], sid = s.studentId!;
    await setLevelByTeacher(repo, admin, sid, 1000, "", at(0));
    const a = await makeArticle(repo, "R6-3");
    const v0 = await startRun(repo, s, a, {}, at(1));
    await submitPrePoll(repo, s, v0.runId, 1, at(1), "yes");
    await finishReading(repo, s, v0.runId, { readSeconds: 120 }, at(1));
    await submitActivity(repo, s, v0.runId, Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), "A"])), at(1));
    await submitPostPoll(repo, s, v0.runId, 1, at(1), "still yes");
    const d0 = await submitWriting(repo, s, v0.runId, WRITING, at(1));
    assert.equal(d0.done!.canStretch, true);
    const win = await levelWindow(repo, sid);
    const sv = await startRun(repo, s, a, { stretch: true }, at(1, 1));
    assert.deepEqual([sv.step, sv.stretch], ["READ", true], "no Ready step for the Stretch");
    assert.ok(sv.versionLevel > 1000);
    await finishReading(repo, s, sv.runId, { readSeconds: 120 }, at(1, 1));
    const sd = await submitActivity(repo, s, sv.runId, Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), "A"])), at(1, 2));
    assert.deepEqual([sd.step, sd.done!.kind, sd.done!.stretchCounted, sd.done!.levelBefore === sd.done!.levelAfter], ["DONE", "STRETCH", "PRACTICE", true]);
    assert.deepEqual(await levelWindow(repo, sid), win, "the Stretch never joins the level window");
    assert.deepEqual([sd.points!.earned, sd.points!.bonus], [sv.questions.length * 2, 20], "a Stretch first try always earns its points");
    await afterResponseSettled();
  });

  test("answer times: the SERVER's clock per first answer; the page's ms only makes a time smaller (a reload never breaks it)", async () => {
    const Q = at(5).getTime();
    // pure: the gap since the previous saved first answer (else quizAt), min with the page's own gap
    assert.equal(answerTime({ quizAt: new Date(Q), ts: {}, at: {}, now: Q + 40_000, ms: 999_999 }), 40_000, "a page clock can never make it larger");
    assert.equal(answerTime({ quizAt: new Date(Q), ts: {}, at: {}, now: Q + 40_000, ms: 2_000 }), 2_000, "smaller is kept");
    assert.equal(answerTime({ quizAt: new Date(Q), ts: { 1: Q + 40_000 }, at: { 1: 40_000 }, now: Q + 70_000, ms: null }), 70_000);
    assert.equal(answerTime({ quizAt: new Date(Q), ts: { 1: Q + 40_000 }, at: { 1: 40_000 }, now: Q + 70_000, ms: 5_000 }), 45_000, "after a reload: still after the previous answer");
    assert.equal(answerTime({ quizAt: null, ts: {}, at: {}, now: Q, ms: null }), null);
    // a real run: Q1 after 60 s, then the page is RELOADED (its clock restarts) and Q2 comes 4 s after the reload
    const s = st[3];
    await setLevelByTeacher(repo, admin, s.studentId!, 800, "", at(0));
    const a = await makeArticle(repo, "R6-T");
    const v = await startRun(repo, s, a, {}, at(5));
    await submitPrePoll(repo, s, v.runId, 1, at(5), "yes");
    await finishReading(repo, s, v.runId, { readSeconds: 300 }, new Date(Q));
    await answerQuestion(repo, s, v.runId, 1, "A", 60_000, new Date(Q + 60_000));
    await answerQuestion(repo, s, v.runId, 2, "A", 4_000, new Date(Q + 90_000));
    await answerQuestion(repo, s, v.runId, 3, "A", 999_999, new Date(Q + 110_000)); // a wrong page clock: the server's 20 s
    for (let n = 4; n <= 8; n++) await answerQuestion(repo, s, v.runId, n, "A", 20_000, new Date(Q + 110_000 + (n - 3) * 20_000));
    const quiz = readAnnotations((await repo.findUnique("RRRun", { id: v.runId }))!.annotations).extras.quiz!;
    assert.deepEqual([quiz.at["1"], quiz.at["2"], quiz.at["3"], quiz.at["8"]], [60_000, 64_000, 84_000, 184_000]);
    assert.equal(quiz.ts!["2"], Q + 90_000, "the server moment of each first answer is stored");
    const sc = await submitActivity(repo, s, v.runId, {}, new Date(Q + 300_000), { at: { 1: 1, 2: 2, 3: 3 } });
    const row = (await repo.findUnique("RRRun", { id: v.runId }))!;
    assert.deepEqual([sc.score, row.unreliable, row.rapidCount], [100, false, 0], "valid first tries stay reliable after a reload");
    assert.deepEqual((row.answerMs as { ms: Record<string, number> }).ms, { 1: 60_000, 2: 4_000, 3: 20_000, 4: 20_000, 5: 20_000, 6: 20_000, 7: 20_000, 8: 20_000 }, "the page's old `at` is ignored: one clock");
    await afterResponseSettled();
  });

  test("an old run scored on 8 questions below the 400 version keeps its 8 in the view", async () => {
    const s = st[3];
    const a = await makeArticle(repo, "R6-OLD");
    const ans = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), "A"]));
    const r = await repo.create("RRRun", { studentId: s.studentId!, schoolId: s.schoolId!, articleId: a, versionLevel: 300, band: "MID", step: "POSTPOLL", firstTry: false, stretch: false, levelBefore: 300, levelAfter: 300, score: 100, answers: ans, startedAt: at(6), completedAt: at(6) });
    const view = await runView(repo, s, String(r.id), at(6));
    assert.equal(view.questions.length, 8);
    assert.equal(view.review!.length, 8);
  });

  test("the class feed: initials only; a teacher's feedOff hides it", async () => {
    assert.equal(initialsOf("Jana Ahmed Ali"), "J.A.");
    assert.equal(initialsOf(""), "?");
    const s = st[0];
    const mem = await repo.findMany("ClassMembership", { studentId: s.studentId!, leftAt: null });
    if (!mem.length) return;
    const run = (await repo.findMany("RRRun", { studentId: s.studentId!, step: "DONE" }))[0];
    for (const m of mem) await repo.create("SchoolSetting", { schoolId: s.schoolId!, key: feedOffKey(String(m.classId)), value: "1" });
    assert.equal((await runView(repo, s, String(run.id), at(2))).feed, null);
  });

  test("annotations: old arrays still work; extras never drop the highlights", () => {
    const old = [{ start: 0, end: 2, color: "yellow" }];
    assert.deepEqual(readAnnotations(old), { marks: old, extras: {} });
    const next = withRunExtras(old, { ready: { vote: 1, why: "w", at: "x" } });
    assert.deepEqual(cleanAnnotations(next, 10), old);
    const meta = withRunExtras(next, { teacherBadges: ["word-wiz"] });
    assert.deepEqual([readAnnotations(meta).extras.ready?.why, readAnnotations(meta).marks.length], ["w", 1]);
  });

  test("levels with formatLevel; the reader's Achieve pieces go through t()", () => {
    for (const n of [-120, 95, 0, 1200]) assert.equal(formatLevel(n), levelFormat(n));
    assert.equal(formatLevel(-120), "BR120L");
    const src = readFileSync("src/components/readrise/reader.tsx", "utf8");
    for (const x of ["Excellent! You earned 2 points!", "Oops! You answered incorrectly. Try again.", "Nice! You earned 1 point!", "QUESTION {n} OF {total}", "Results Table",
      "Great work! You scored 75% or higher", "You did not change your opinion", "You changed your opinion", "Explain why you voted the way you did", "Sentence Frames",
      "Writing Tips", "Paragraph Frames", "Save for later", "Article Rating", "How did you access this article?", "Go to stretch activity", "You are done!",
      "Take note of questions and answers here. You can use your notes in the Write step."]) assert.ok(src.includes(`tr("${x}"`), x);
    assert.match(src, /SpeechRecognition/);
    assert.match(src, /r\.lang = "en-US"/);
    assert.doesNotMatch(src, /Lexile/);
  });
});
