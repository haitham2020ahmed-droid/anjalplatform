import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS, bandOf, versionFor } from "../src/server/readrise/level";
import { parsePlacement, type PlacementPassage } from "../src/server/readrise/content-loader";
import { ENGINE, goalStats, levelDecision, nearestLevel, projectLevel, studentReadRiseSummary, weekStart } from "../src/server/readrise/engine";
import { answerPlacement, blendWithMap, placementPlan, placementResult, placementView, setLevelByTeacher, startPlacement, teacherResetPlacement, type PlacementStep } from "../src/server/readrise/placement";
import {
  articlePage, finishReading, keyWordsFor, practiceActivity, recommend, runView, saveReading, saveWritingDraft, startRun, studentLibrary,
  readRiseHome, submitActivity, submitPostPoll, submitPrePoll, submitWriting, visibleArticles, type ArticleCard,
} from "../src/server/readrise/student";
import { keyWordFor } from "../src/components/readrise/text";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const T0 = new Date("2026-09-06T08:00:00Z"); // a Sunday morning in Riyadh
const at = (days: number, h = 0) => new Date(T0.getTime() + days * DAY + h * 3_600_000);

/** 12 versions, 8 questions per band (answer always "A"), prompts + key words per band. */
async function makeArticle(repo: SqliteRepo, o: { code: string; topic?: string; schoolId?: string | null; status?: string; title?: string }): Promise<string> {
  const a = await repo.create("RRArticle", { schoolId: o.schoolId ?? null, code: o.code, title: o.title ?? `Article ${o.code}`, topic: o.topic ?? "Science", summary: "About things.", pollStatement: "Things matter.", status: o.status ?? "PUBLISHED" });
  const id = String(a.id);
  for (const level of RR_LEVELS) {
    const body = `${o.code} at ${level}. The colony works hard every day.\n\nBees ${"make honey ".repeat(Math.round(level / 20))}and the hive grows.`;
    await repo.create("RRVersion", { articleId: id, level, title: `${o.title ?? o.code} (${level})`, body, wordCount: body.split(/\s+/).length, estLevel: level });
  }
  for (const band of ["LOW", "MID", "HIGH"]) {
    for (let n = 1; n <= 8; n++) await repo.create("RRQuestion", { articleId: id, band, number: n, stem: `${band} Q${n}?`, options: ["right", "w1", "w2", "w3"], answer: "A", skill: "detail", rationale: { why: `because ${n}`, wrong: { B: "B is wrong" } } });
    await repo.create("RRPrompt", { articleId: id, band, prompt: `Explain (${band}).`, checklist: ["Use evidence", "Explain"], keyWords: [{ word: band === "LOW" ? "colony" : band === "MID" ? "hive" : "honey", partOfSpeech: "noun", definition: "d", example: "e" }] });
  }
  return id;
}

/** 8 answers with `right` of them correct. */
const answers = (right: number) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), i < right ? "A" : "B"]));
const WRITING = Array.from({ length: 32 }, (_, i) => `word${i}`).join(" ");

/** Full routine; returns the run view after the post-poll. */
async function readArticle(repo: SqliteRepo, s: Actor, articleId: string, right: number, now: Date, stretch = false) {
  const v = await startRun(repo, s, articleId, { stretch }, now);
  await submitPrePoll(repo, s, v.runId, 1, now);
  await finishReading(repo, s, v.runId, { readSeconds: 120, listened: true, annotations: [{ start: 0, end: 2, color: "yellow", note: "first" }] }, now);
  const q = await submitActivity(repo, s, v.runId, answers(right), now);
  await submitWriting(repo, s, v.runId, WRITING, now);
  const done = await submitPostPoll(repo, s, v.runId, 2, now);
  return { start: v, quiz: q, done };
}

/** Injected placement passages: 3 per level, answers A, A, A. */
const PASSAGES: PlacementPassage[] = parsePlacement({
  passages: RR_LEVELS.flatMap((level) => [1, 2, 3].map((k) => ({ id: `P${level}-${k}`, level, title: `P ${level}/${k}`, text: "Text.", questions: [1, 2, 3].map((n) => ({ stem: `Q${n}`, options: ["a", "b", "c", "d"], answer: "A", skill: "detail" })) }))),
});
const pAns = (right: number) => [0, 1, 2].map((i) => (i < right ? "A" : "B"));

describe("🚀 ReadRise: placement, the 5-step routine, the level engine and goals", () => {
  let repo: SqliteRepo; let teacher: Actor; let otherTeacher: Actor; let admin: Actor;
  let st: Actor[]; let schoolId: string; let otherSchool: string;
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    [admin, teacher, otherTeacher] = await Promise.all(["test.admin", "test.teacher.1", "test.teacher.3"].map(actorOf));
    st = await Promise.all(["001", "002", "003", "004", "005", "006", "007", "008"].map((t) => actorOf(`test.student.${t}`)));
    schoolId = String(st[0].schoolId);
    otherSchool = String((await repo.findMany("School", {})).find((x) => x.id !== schoolId)!.id);
  });

  // ------------------------------------------------------------------ pure parts

  test("versionFor / bandOf / nearestLevel", () => {
    assert.equal(versionFor(850, [...RR_LEVELS]), 900);
    assert.equal(versionFor(840, [...RR_LEVELS]), 800);
    assert.equal(versionFor(100, [...RR_LEVELS]), 300);
    assert.equal(versionFor(1500, [...RR_LEVELS]), 1400);
    assert.deepEqual([bandOf(300), bandOf(600), bandOf(700), bandOf(1000), bandOf(1100), bandOf(1400)], ["LOW", "LOW", "MID", "MID", "HIGH", "HIGH"]);
    assert.deepEqual([nearestLevel(120), nearestLevel(740), nearestLevel(760), nearestLevel(1650)], [300, 700, 800, 1400]);
  });

  test("placement path: +200/+100/−100/−200, ±100 after the first reversal, no repeats, stop rules", () => {
    const run = (start: number, corrects: number[]) => {
      const steps: PlacementStep[] = [];
      for (const c of corrects) {
        const p = placementPlan(start, steps, PASSAGES);
        if (p.done) break;
        steps.push({ level: p.passage!.level, passageId: p.passage!.id, answers: pAns(c), correct: c });
      }
      return { steps, plan: placementPlan(start, steps, PASSAGES) };
    };
    // 700 (3/3) → 900 (2/3) → 1000 (0/3, first reversal) → 900 (±100 now) …
    const a = run(700, [3, 2, 0, 3, 1, 2, 1, 2, 3, 3]);
    assert.deepEqual(a.steps.map((x) => x.level).slice(0, 4), [700, 900, 1000, 900]);
    assert.ok(a.steps.every((x, i) => i === 0 || Math.abs(x.level - a.steps[i - 1].level) <= 200));
    assert.ok(a.steps.slice(3).every((x, i) => Math.abs(x.level - a.steps[i + 2].level) === 100), "±100 after the first reversal");
    assert.equal(new Set(a.steps.map((x) => x.passageId)).size, a.steps.length, "no passage twice");
    assert.ok(a.plan.done && a.steps.length <= 8);
    // two reversals but fewer than 5 passages → keep going; then stop at 5
    const b = run(800, [3, 0, 3, 3, 3, 3, 3, 3]);
    assert.ok(b.steps.length >= 5 && b.plan.done);
    // never more than 8
    const c = run(300, [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    assert.equal(c.steps.length, 8);
    assert.ok(c.steps.every((x) => x.level <= 1400));
    assert.equal(new Set(c.steps.map((x) => x.passageId)).size, 8, "at the top it uses other passages, never a repeat");
  });

  test("placement result: highest 2+/3 level not above a level failed twice; MAP blend over 250", () => {
    const st = (level: number, correct: number, k = 1): PlacementStep => ({ level, passageId: `P${level}-${k}`, answers: [], correct });
    assert.equal(placementResult([st(700, 3), st(900, 2), st(1000, 1), st(900, 3, 2), st(1000, 0, 2)], 700), 900);
    // a pass above a level failed twice does not count
    assert.equal(placementResult([st(800, 1), st(800, 0, 2), st(900, 2), st(700, 3)], 800), 700);
    assert.equal(placementResult([st(500, 0), st(300, 1)], 500), 300, "floor 300");
    assert.deepEqual(blendWithMap(900, 1000), { level: 900, note: null });
    const b = blendWithMap(600, 1000);
    assert.equal(b.level, 800);
    assert.match(b.note!, /averaged/);
    assert.deepEqual(blendWithMap(900, null), { level: 900, note: null });
  });

  test("placement end-to-end: MAP start, stored result, RRStudent PLACEMENT + RRLevelChange, no second test", async () => {
    const s = st[0];
    await repo.create("MapResult", { studentId: s.studentId, testDate: at(-40), subject: "Reading", rit: 200, lexile: 640 });
    await repo.create("MapResult", { studentId: s.studentId, testDate: at(-10), subject: "Reading", rit: 205, lexile: 760 });
    assert.equal((await placementView(repo, s, [])).state, "NOT_AVAILABLE", "no passages → not ready (never crashes)");
    assert.equal((await placementView(repo, s, PASSAGES)).state, "READY");
    const pid = await startPlacement(repo, s, at(0));
    assert.equal(Number((await repo.findUnique("RRPlacement", { id: pid }))!.startLevel), 800, "latest MAP Lexile 760 → nearest level 800");
    let res; let n = 0;
    do {
      const v = await placementView(repo, s, PASSAGES);
      assert.equal(v.state, "IN_PROGRESS");
      assert.equal(v.passage!.questions.length, 3);
      assert.ok(!("answer" in v.passage!.questions[0]), "answers never sent to the browser");
      res = await answerPlacement(repo, s, pid, v.passage!.id, pAns(n % 2 ? 1 : 3), PASSAGES, at(0, n));
      n++;
    } while (!res.done);
    assert.ok(n >= 5 && n <= 8);
    const rr = (await repo.findUnique("RRStudent", { studentId: s.studentId }))!;
    assert.deepEqual([rr.source, Number(rr.level), Number(rr.startLevel)], ["PLACEMENT", res.result, res.result]);
    const ch = await repo.findMany("RRLevelChange", { studentId: s.studentId });
    assert.ok(ch.some((c) => String(c.reason).startsWith("Placement")));
    assert.equal((await placementView(repo, s, PASSAGES)).state, "DONE");
    await assert.rejects(startPlacement(repo, s, at(1)), /teacher/);
    // a stale passage id is refused
    const s2 = st[7];
    const pid2 = await startPlacement(repo, s2, at(0));
    await assert.rejects(answerPlacement(repo, s2, pid2, "P1400-3", pAns(3), PASSAGES, at(0)), /no longer the current/);
  });

  test("teacher reset / override: only the student's teacher or an admin; once per term; reason recorded", async () => {
    const s = st[0];
    await assert.rejects(teacherResetPlacement(repo, otherTeacher, s.studentId!, "x", at(2)), ForbiddenError);
    await assert.rejects(teacherResetPlacement(repo, s, s.studentId!, "x", at(2)), ForbiddenError);
    await teacherResetPlacement(repo, teacher, s.studentId!, "New term", at(2));
    assert.equal((await placementView(repo, s, PASSAGES)).state, "READY");
    await assert.rejects(teacherResetPlacement(repo, admin, s.studentId!, "again", at(2, 1)), /already allowed/);
    await assert.rejects(setLevelByTeacher(repo, otherTeacher, s.studentId!, 900, "x", at(2)), ForbiddenError);
    const r = await setLevelByTeacher(repo, teacher, s.studentId!, 905, "Class work shows more", at(2, 2));
    assert.equal(r.to, 910);
    const rr = (await repo.findUnique("RRStudent", { studentId: s.studentId }))!;
    assert.deepEqual([rr.source, Number(rr.level)], ["TEACHER", 910]);
    assert.ok((await repo.findMany("RRLevelChange", { studentId: s.studentId })).some((c) => /Teacher set the level: Class work/.test(String(c.reason))));
    await setLevelByTeacher(repo, admin, s.studentId!, 800, "admin", at(2, 3));
  });

  // owner r69: faster DOWN (≤ 25% once, or two in a row under 50%: −100), careful UP (unchanged +50)
  test("level rule (pure): up 3 of 4; down 100 on ≤25% or two in a row under 50%", () => {
    assert.equal(levelDecision([80, 80, 80]).delta, 50, "3 of 3 ≥75 and latest ≥75");
    assert.equal(levelDecision([80, 40, 80, 80]).delta, 50);
    assert.equal(levelDecision([80, 80, 80, 60]).delta, 0, "latest must be ≥75");
    assert.equal(levelDecision([80, 80]).delta, 0);
    assert.equal(levelDecision([40, 30]).delta, -100, "two in a row under 50%");
    assert.equal(levelDecision([40, 60, 30]).delta, 0, "not in a row");
    assert.equal(levelDecision([40, 30, 60]).delta, 0, "latest must be <50");
    assert.equal(levelDecision([100, 100, 100, 40, 40]).delta, -100, "the last two only");
    assert.equal(levelDecision([25]).delta, -100, "one score of 25% or less: down at once");
  });

  test("visibility: platform + own school, not another school's, not DRAFT, not hidden", async () => {
    const lib = await makeArticle(repo, { code: "V-LIB", topic: "Space" });
    const own = await makeArticle(repo, { code: "V-OWN", schoolId, topic: "Animals" });
    const other = await makeArticle(repo, { code: "V-OTH", schoolId: otherSchool });
    const draft = await makeArticle(repo, { code: "V-DRF", status: "DRAFT" });
    const hidden = await makeArticle(repo, { code: "V-HID" });
    await repo.create("SchoolSetting", { schoolId, key: "readrise.hidden", value: [hidden] });
    const ids = (await visibleArticles(repo, schoolId)).map((a) => String(a.id));
    assert.ok(ids.includes(lib) && ids.includes(own));
    for (const x of [other, draft, hidden]) assert.ok(!ids.includes(x));
    for (const x of [other, draft, hidden]) await assert.rejects(startRun(repo, st[1], x, {}, at(0)), ForbiddenError);
    await assert.rejects(articlePage(repo, st[1], other, at(0)), ForbiddenError);
  });

  test("library: level-right version, assigned first, recommended unread with topic variety, search + topic filter", async () => {
    const s = st[1];
    await setLevelByTeacher(repo, teacher, s.studentId!, 850, "", at(0));
    const a1 = await makeArticle(repo, { code: "L-1", topic: "Earth", title: "Volcano Power" });
    const klass = (await repo.findMany("ClassMembership", { studentId: s.studentId }))[0];
    await repo.create("RRClassArticle", { classId: klass.classId, articleId: a1, assignedById: teacher.userId, dueAt: at(5) });
    const lib = await studentLibrary(repo, s, {}, at(0));
    assert.equal(lib.level, 850);
    assert.equal(lib.assigned[0].id, a1);
    assert.equal(lib.assigned[0].versionLevel, 900);
    assert.ok(lib.assigned[0].minutes >= 1);
    assert.ok(!lib.recommended.some((c) => c.id === a1), "assigned articles are not repeated as recommended");
    const topics = lib.recommended.map((c) => c.topic);
    assert.equal(new Set(topics.slice(0, 2)).size, Math.min(2, new Set(topics).size), "variety: different topics first");
    const f = await studentLibrary(repo, s, { q: "volcano" }, at(0));
    assert.deepEqual(f.all.map((c) => c.id), [a1]);
    const t = await studentLibrary(repo, s, { topic: "Space" }, at(0));
    assert.ok(t.all.length >= 1 && t.all.every((c) => c.topic === "Space"));
    // pure: topics read recently go last
    const card = (id: string, topic: string): ArticleCard => ({ id, title: id, topic, summary: "", minutes: 1, versionLevel: 800, status: "NEW", firstTryScore: null, canStretch: false, stretchDone: false, assigned: false, dueAt: null });
    const rec = recommend([card("a", "Space"), card("b", "Space"), card("c", "Earth")], [{ articleId: "x", startedAt: at(0) }], [{ id: "x", topic: "Space" }], at(1));
    assert.deepEqual(rec.map((c) => c.id), ["c", "a", "b"]);
  });

  test("key words per band (and forms of the word are marked)", async () => {
    const a = await makeArticle(repo, { code: "K-1" });
    assert.equal((await keyWordsFor(repo, a, "LOW", "x"))[0].word, "colony");
    assert.equal((await keyWordsFor(repo, a, "HIGH", "x"))[0].word, "honey");
    const kw = await keyWordsFor(repo, a, "MID", "x");
    assert.ok(keyWordFor("hives,", kw) && !keyWordFor("colony", kw));
  });

  test("the 5 steps: strict order, resume, server scoring, rationales after submit, practice never changes the score", async () => {
    const s = st[2];
    await setLevelByTeacher(repo, teacher, s.studentId!, 620, "", at(0));
    const a = await makeArticle(repo, { code: "R-1" });
    const v = await startRun(repo, s, a, {}, at(0, 1));
    assert.deepEqual([v.step, v.versionLevel, v.band], ["PREPOLL", 600, "LOW"]);
    assert.equal(v.review, null);
    await assert.rejects(finishReading(repo, s, v.runId, {}, at(0, 1)), /in order/);
    await assert.rejects(submitActivity(repo, s, v.runId, answers(8), at(0, 1)), /in order/);
    await assert.rejects(submitPrePoll(repo, s, v.runId, 7, at(0, 1)), /Choose/);
    await submitPrePoll(repo, s, v.runId, 0, at(0, 1));
    // resume: starting again returns the same open run at its step
    const again = await startRun(repo, s, a, {}, at(0, 2));
    assert.deepEqual([again.runId, again.step], [v.runId, "READ"]);
    assert.equal(again.keyWords[0].word, "colony");
    await saveReading(repo, s, v.runId, { annotations: [{ start: 0, end: 3, color: "green", note: "hi" }, { start: 5, end: 2, color: "red" }], readSeconds: 30 });
    const mid = await runView(repo, s, v.runId, at(0, 2));
    assert.deepEqual(mid.annotations, [{ start: 0, end: 3, color: "green", note: "hi" }], "bad highlights dropped");
    await finishReading(repo, s, v.runId, { readSeconds: 90, listened: true }, at(0, 2));
    assert.equal(Number((await repo.findUnique("RRRun", { id: v.runId }))!.readSeconds), 90);
    await assert.rejects(submitActivity(repo, s, v.runId, { 1: "A" }, at(0, 2)), /every question/);
    const q = await submitActivity(repo, s, v.runId, answers(6), at(0, 2));
    assert.equal(q.score, 75);
    assert.equal(q.step, "WRITE");
    assert.equal(q.review!.length, 8);
    assert.equal(q.review![7].wrongWhy, "B is wrong");
    await assert.rejects(submitActivity(repo, s, v.runId, answers(8), at(0, 2)), /in order/);
    const p = await practiceActivity(repo, s, v.runId, answers(8));
    assert.equal(p.correct, 8);
    assert.equal(Number((await repo.findUnique("RRRun", { id: v.runId }))!.score), 75, "practice never changes the score");
    await saveWritingDraft(repo, s, v.runId, "draft words");
    assert.equal((await runView(repo, s, v.runId)).writing, "draft words");
    await assert.rejects(submitWriting(repo, s, v.runId, "too short", at(0, 3)), /at least 30/);
    await submitWriting(repo, s, v.runId, WRITING, at(0, 3));
    const done = await submitPostPoll(repo, s, v.runId, 3, at(0, 3));
    assert.equal(done.step, "DONE");
    assert.deepEqual([done.done!.prePoll, done.done!.postPoll, done.done!.score, done.done!.firstTry], [0, 3, 75, true]);
    assert.ok(done.done!.canStretch);
    // another student cannot touch this run
    await assert.rejects(runView(repo, st[3], v.runId), ForbiddenError);
  });

  test("first-try rule: a re-read never counts; stretch is one version up and never lowers the level", async () => {
    const s = st[3];
    await setLevelByTeacher(repo, teacher, s.studentId!, 800, "", at(0));
    const a = await makeArticle(repo, { code: "F-1" });
    await readArticle(repo, s, a, 8, at(1));
    const re = await readArticle(repo, s, a, 0, at(1, 2));
    assert.equal(re.done.firstTry, false);
    const runs = await repo.findMany("RRRun", { studentId: s.studentId, articleId: a });
    assert.deepEqual(runs.map((r) => r.firstTry).sort(), [false, true]);
    const page = await articlePage(repo, s, a, at(1, 3));
    assert.ok(page.canStretch);
    const lib = (await studentLibrary(repo, s, {}, at(1, 3))).all.find((c) => c.id === a)!;
    assert.deepEqual([lib.firstTryScore, lib.status, lib.canStretch], [100, "DONE", true]);
    // stretch at 0% → no level change
    const before = Number((await repo.findUnique("RRStudent", { studentId: s.studentId }))!.level);
    const sv = await readArticle(repo, s, a, 0, at(1, 4), true);
    assert.equal(sv.start.versionLevel, 900);
    assert.equal(sv.start.stretch, true);
    assert.equal(Number((await repo.findUnique("RRStudent", { studentId: s.studentId }))!.level), before);
    await assert.rejects(startRun(repo, s, a, { stretch: true }, at(1, 5)), /already stretched/);
    // a stretch cannot be started before reading the article
    const b = await makeArticle(repo, { code: "F-2" });
    await assert.rejects(startRun(repo, s, b, { stretch: true }, at(1, 5)), /Read the article first/);
  });

  test("level engine: +50 after 3 of 4 ≥75%, −100 after two in a row <50%, window resets after a change", async () => {
    const s = st[4];
    await setLevelByTeacher(repo, teacher, s.studentId!, 800, "", at(0));
    const arts = await Promise.all(Array.from({ length: 9 }, (_, i) => makeArticle(repo, { code: `E-${i}` })));
    const lvl = async () => Number((await repo.findUnique("RRStudent", { studentId: s.studentId }))!.level);
    await readArticle(repo, s, arts[0], 8, at(1));
    await readArticle(repo, s, arts[1], 3, at(1, 1));
    await readArticle(repo, s, arts[2], 7, at(1, 2));
    assert.equal(await lvl(), 800);
    const up = await readArticle(repo, s, arts[3], 6, at(1, 3));
    assert.equal(await lvl(), 850, "3 of 4 ≥75% and latest ≥75%");
    assert.deepEqual([up.done.done!.levelBefore, up.done.done!.levelAfter], [800, 850]);
    // window reset: two more highs are not enough
    await readArticle(repo, s, arts[4], 8, at(2));
    await readArticle(repo, s, arts[5], 8, at(2, 1));
    assert.equal(await lvl(), 850);
    // down (owner r69): two first-try scores in a row under 50% since the change → −100
    await readArticle(repo, s, arts[6], 3, at(3));
    assert.equal(await lvl(), 850);
    await readArticle(repo, s, arts[7], 3, at(3, 1));
    assert.equal(await lvl(), 750);
    const ch = (await repo.findMany("RRLevelChange", { studentId: s.studentId })).map((c) => String(c.reason));
    assert.ok(ch.some((r) => /^Up 50/.test(r)) && ch.some((r) => /^Down 100: the last two first-try scores were both under 50%/.test(r)));
    assert.equal(Number((await repo.findUnique("RRStudent", { studentId: s.studentId }))!.articlesDone), 8);
    // cap / floor
    await setLevelByTeacher(repo, teacher, s.studentId!, 5000, "", at(4));
    assert.equal(await lvl(), ENGINE.max);
    await setLevelByTeacher(repo, teacher, s.studentId!, 10, "", at(4, 1));
    assert.equal(await lvl(), ENGINE.min);
  });

  test("goals: weekly goal (75%+ first try, stretch counts), streak, summary + projection", async () => {
    // pure
    const g = goalStats([at(0), at(1), at(7), at(8), at(14)], 2, at(15));
    assert.deepEqual([g.thisWeek, g.met, g.streak, g.weeksMet], [1, false, 2, 2]);
    assert.equal(weekStart(new Date("2026-09-05T22:00:00Z")), weekStart(at(3)), "Sunday 01:00 Riyadh is the new week");
    assert.equal(projectLevel([{ at: at(0), level: 800 }], at(1), at(200)), null, "too little history");
    const p = projectLevel([{ at: at(-60), level: 700 }, { at: at(-30), level: 750 }, { at: at(-5), level: 800 }], at(0), at(70));
    assert.ok(p !== null && p > 800);
    // end to end
    const s = st[5];
    await setLevelByTeacher(repo, teacher, s.studentId!, 800, "", at(0));
    const [a, b] = await Promise.all([makeArticle(repo, { code: "G-1" }), makeArticle(repo, { code: "G-2" })]);
    await readArticle(repo, s, a, 8, at(1));
    const st1 = await readArticle(repo, s, a, 6, at(1, 1), true);
    assert.deepEqual([st1.done.done!.goal.thisWeek, st1.done.done!.goal.met], [2, true], "a stretch at 75%+ counts toward the goal");
    await readArticle(repo, s, b, 3, at(1, 2));
    const sum = (await studentReadRiseSummary(repo, s.studentId!, at(1, 3)))!;
    assert.equal(sum.weeklyGoal, 2);
    assert.equal(sum.articlesDone, 2);
    assert.equal(sum.firstTryAvg, Math.round((100 + 38) / 2), "stretch readings are not in the first-try average");
    assert.equal(sum.weeksMet, 1);
    assert.equal(sum.streak, 1);
    assert.equal(typeof sum.growth, "number");
    assert.equal(await studentReadRiseSummary(repo, st[6].studentId!, at(1)), null);
  });

  test("home page data: level, goal, growth, placement prompt (from the passages file) and the library", async () => {
    const s = st[6];
    const h = await readRiseHome(repo, s, {}, at(2), PASSAGES);
    assert.equal(h.placement.state, "NEED");
    assert.equal(typeof h.summary.level, "number");
    assert.ok(h.library.all.length > 0);
    assert.equal(h.growth.points.length, 1);
    assert.ok(!Number.isNaN(Date.parse(h.growth.yearEnd)));
    assert.equal((await readRiseHome(repo, s, {}, at(2), [])).placement.state, "NONE", "no prompt while the test is not ready");
    // a placement whose passages run out mid-way is finished with what was answered (never stuck)
    const pid = await startPlacement(repo, s);
    const v = await placementView(repo, s, PASSAGES);
    assert.equal(v.state, "IN_PROGRESS");
    assert.equal((await readRiseHome(repo, s, {}, at(2), PASSAGES)).placement.state, "OPEN");
    await answerPlacement(repo, s, pid, v.passage!.id, pAns(3), PASSAGES);
    const only = PASSAGES.filter((p) => p.id === v.passage!.id);
    const fin = await placementView(repo, s, only);
    assert.equal(fin.state, "DONE");
    assert.equal(typeof fin.result, "number");
    const after = await readRiseHome(repo, s, {}, at(2), PASSAGES);
    assert.deepEqual([after.placement.state, after.placement.result, after.summary.level], ["NONE", fin.result, fin.result]);
    await assert.rejects(readRiseHome(repo, teacher), ForbiddenError);
  });

  test("other roles cannot use the student functions", async () => {
    await assert.rejects(studentLibrary(repo, teacher), ForbiddenError);
    await assert.rejects(startPlacement(repo, teacher), ForbiddenError);
  });
});
