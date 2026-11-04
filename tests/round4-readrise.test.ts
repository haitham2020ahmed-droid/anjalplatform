/**
 * Round 4 — ReadRise fixes (owner-approved): only the first try counts; a stretch only in a new question band; ⭐ fed
 * by first tries only (+ the clean-up of what re-reads fed); placement checks from the current level with unseen
 * passages; rapid placement passages; ONE accuracy tally; ONE article definition; a teacher's level for a never-placed
 * student; Riyadh days and week labels; AI writing draft guards; ReadRise answer minutes.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS } from "../src/server/readrise/level";
import { parsePlacement, type PlacementPassage } from "../src/server/readrise/content-loader";
import { countsForLevel, ensureRRStudent, setLevelByTeacher, studentReadRiseSummary, weekLabel, weekStart } from "../src/server/readrise/engine";
import { answerPlacement, placementView, startPlacement, testPool, PLACEMENT_INVALID_TEXT } from "../src/server/readrise/placement";
import { finishReading, startRun, stretchOffer, studentLibrary, submitActivity, submitPostPoll, submitPrePoll, submitWriting } from "../src/server/readrise/student";
import { articleRuns, countedTries, isCountedTry, keyRowsLookup, stretchRuns, tallyAnswers, tallyRuns } from "../src/server/readrise/first-try";
import { accuracyByType } from "../src/server/readrise/teacher-report";
import { answerKeyLookup, skillBreakdown, type AnswerKey } from "../src/server/readrise/growth";
import { loadStudentGrowth } from "../src/server/readrise/growth-report";
import { periodOf, readRiseWindows } from "../src/server/readrise/windows";
import { feedReadRise } from "../src/server/practice/skill-evidence";
import { purgeRereadEvidence } from "../src/server/readrise/stars-cleanup";
import { draftReadRiseWritingScore } from "../src/server/readrise/writing-ai";
import { loadAnswers } from "../src/server/analytics/practice";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const T0 = new Date("2026-09-06T08:00:00Z"); // a Sunday morning in Riyadh
const at = (days: number, h = 0) => new Date(T0.getTime() + days * DAY + h * 3_600_000);

async function makeArticle(repo: SqliteRepo, code: string): Promise<string> {
  const a = await repo.create("RRArticle", { schoolId: null, code, title: `Article ${code}`, topic: "Science", summary: "About things.", pollStatement: "Things matter.", status: "PUBLISHED" });
  const id = String(a.id);
  for (const level of RR_LEVELS) {
    const body = `${code} at ${level}. The colony works hard every day.\n\nBees ${"make honey ".repeat(Math.round(level / 20))}and the hive grows.`;
    await repo.create("RRVersion", { articleId: id, level, title: `${code} (${level})`, body, wordCount: body.split(/\s+/).length, estLevel: level });
  }
  for (const band of ["LOW", "MID", "HIGH"]) {
    for (let n = 1; n <= 8; n++) await repo.create("RRQuestion", { articleId: id, band, number: n, stem: `${band} Q${n}?`, options: ["right", "w1", "w2", "w3"], answer: "A", skill: n <= 4 ? "main-idea" : "detail", rationale: { why: "w" } });
    await repo.create("RRPrompt", { articleId: id, band, prompt: `Explain (${band}).`, checklist: ["Use evidence"], keyWords: [] });
  }
  return id;
}
const answers = (right: number) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), i < right ? "A" : "B"]));
const WRITING = Array.from({ length: 32 }, (_, i) => `word${i}`).join(" ");
async function read(repo: SqliteRepo, s: Actor, articleId: string, right: number, now: Date, stretch = false, readSeconds = 120) {
  const v = await startRun(repo, s, articleId, { stretch }, now);
  await submitPrePoll(repo, s, v.runId, 1, now);
  await finishReading(repo, s, v.runId, { readSeconds }, now);
  await submitActivity(repo, s, v.runId, answers(right), now);
  await submitWriting(repo, s, v.runId, WRITING, now);
  return { start: v, done: await submitPostPoll(repo, s, v.runId, 2, now) };
}
const PASSAGES: PlacementPassage[] = parsePlacement({
  passages: RR_LEVELS.flatMap((level) => [1, 2, 3].map((k) => ({ id: `P${level}-${k}`, level, title: `P ${level}/${k}`, text: "Text.", questions: [1, 2, 3].map((n) => ({ stem: `Q${n}`, options: ["a", "b", "c", "d"], answer: "A", skill: "detail" })) }))),
});

describe("round 4 — ReadRise", () => {
  let repo: SqliteRepo; let admin: Actor; let st: Actor[];
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const lvl = async (s: Actor) => Number((await repo.findUnique("RRStudent", { studentId: s.studentId }))!.level);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorOf("test.admin");
    st = await Promise.all(["001", "002", "003", "004", "005", "006"].map((t) => actorOf(`test.student.${t}`)));
  });

  // ------------------------------------------------------------------ 1. first try / stretch band

  test("1 · stretch after a reliable first try of 75%+ — round 5: also in the SAME band (as practice) (UI + server)", async () => {
    const s = st[0];
    await setLevelByTeacher(repo, admin, s.studentId!, 800, "", at(0)); // 800 MID → stretch 900 MID: same questions
    const a = await makeArticle(repo, "R4-1");
    await read(repo, s, a, 8, at(1));
    const card = (await studentLibrary(repo, s, {}, at(1, 1))).all.find((c) => c.id === a)!;
    assert.equal(card.canStretch, true, "round 5: the same band is offered too (as practice)");
    const same = await read(repo, s, a, 8, at(1, 2), true);
    assert.deepEqual([same.start.versionLevel, same.start.band, same.done.done!.stretchCounted], [900, "MID", "PRACTICE"]);
    // a new band: 1000 MID → 1100 HIGH (counts fully, as before)
    await setLevelByTeacher(repo, admin, s.studentId!, 1000, "", at(2));
    const b = await makeArticle(repo, "R4-2");
    const first = await read(repo, s, b, 8, at(2, 1));
    assert.equal(first.done.done!.canStretch, true);
    const sv = await read(repo, s, b, 8, at(2, 2), true);
    assert.deepEqual([sv.start.versionLevel, sv.start.band, sv.done.done!.stretchCounted], [1100, "HIGH", "FULL"]);
    // a re-read never unlocks a stretch: only the first try does (an Unreliable or low first try → no stretch)
    const pure = stretchOffer([{ stretch: false, firstTry: false, step: "DONE", score: 100, band: "MID" }], 1000, [{ level: 1000 }, { level: 1100 }]);
    assert.equal(pure.ok, false);
    const bad = stretchOffer([{ stretch: false, firstTry: true, step: "DONE", score: 100, band: "MID", unreliable: true }], 1000, [{ level: 1000 }, { level: 1100 }]);
    assert.match(String(bad.why), /did not count/);
    await afterResponseSettled();
  });

  test("1 · a re-read never changes the level, the goal or the level window; a fast read never counts for the level", async () => {
    const s = st[1];
    await setLevelByTeacher(repo, admin, s.studentId!, 800, "", at(0));
    const a = await makeArticle(repo, "R4-3");
    await read(repo, s, a, 6, at(1));
    const before = (await studentReadRiseSummary(repo, s.studentId!, at(1, 1)))!;
    await read(repo, s, a, 8, at(1, 2)); // re-read at 100%
    await read(repo, s, a, 8, at(1, 3));
    await read(repo, s, a, 8, at(1, 4));
    const after = (await studentReadRiseSummary(repo, s.studentId!, at(1, 5)))!;
    assert.deepEqual([after.level, after.thisWeek, after.articlesDone], [before.level, before.thisWeek, before.articlesDone]);
    assert.equal(countsForLevel({ firstTry: true, score: 100, readSeconds: 10 }), false, "read in 10 s (< 45 s)");
    assert.equal(countsForLevel({ firstTry: true, score: 100, readSeconds: 0 }), true, "unknown read time is not judged");
    await afterResponseSettled();
  });

  // ------------------------------------------------------------------ 2. ⭐ feed + clean-up

  test("2 · re-reads and same-band stretches never feed ⭐; the stars recompute removes what they fed (idempotent)", async () => {
    const s = st[2], sid = s.studentId!;
    await setLevelByTeacher(repo, admin, sid, 800, "", at(0));
    const a = await makeArticle(repo, "R4-4");
    await read(repo, s, a, 8, at(1));
    const re = await read(repo, s, a, 8, at(1, 1));
    await afterResponseSettled();
    assert.equal(await feedReadRise(repo, re.start.runId, at(1, 2)), 0, "a re-read feeds nothing");
    // an OLD same-band stretch row (made before the fix) and evidence an old re-read fed
    const legacy = await repo.create("RRRun", { studentId: sid, schoolId: s.schoolId, articleId: a, versionLevel: 900, band: "MID", step: "DONE", levelBefore: 800, firstTry: true, stretch: true, listened: false, startedAt: at(1, 3), completedAt: at(1, 3), score: 100, answers: answers(8), readSeconds: 120 });
    assert.equal(await feedReadRise(repo, String(legacy.id), at(1, 4)), 0, "a same-band stretch feeds nothing");
    const skill = (await repo.findMany("Skill", {}, { select: ["id"], take: 1 }))[0];
    for (const runId of [re.start.runId, String(legacy.id)]) await repo.create("SkillEvidence", { studentId: sid, skillId: skill.id, source: "READRISE", refId: `${runId}:1`, credit: 1, difficultyB: 0, guessC: 0.25, weight: 0.5, createdAt: at(1, 5) });
    const firstRun = (await repo.findMany("RRRun", { studentId: sid, articleId: a, firstTry: true, stretch: false }))[0];
    await repo.create("SkillEvidence", { studentId: sid, skillId: skill.id, source: "READRISE", refId: `${firstRun.id}:99`, credit: 1, difficultyB: 0, guessC: 0.25, weight: 0.5, createdAt: at(1, 5) });
    const r1 = await purgeRereadEvidence(repo, [sid], at(2));
    assert.equal(r1.removed, 2);
    const left = (await repo.findMany("SkillEvidence", { studentId: sid, source: "READRISE" })).map((e) => String(e.refId));
    assert.ok(left.includes(`${firstRun.id}:99`), "the first try's evidence stays");
    assert.ok(!left.some((x) => x.startsWith(re.start.runId) || x.startsWith(String(legacy.id))));
    assert.deepEqual(await purgeRereadEvidence(repo, [sid], at(2)), { removed: 0, skills: 0 }, "idempotent");
    const ex = readFileSync("src/server/skills/status-extras.ts", "utf8");
    assert.match(ex, /purgeRereadEvidence\(repo, ids, now\)/, "the Compute skill stars again path cleans first");
  });

  // ------------------------------------------------------------------ 3 + 8. placement

  test("3 · a middle/end-of-year check starts from the CURRENT level and never repeats a passage of an earlier test", async () => {
    const s = st[3], sid = s.studentId!;
    // an earlier (start of year) test that used three passages
    await repo.create("RRPlacement", { studentId: sid, schoolId: s.schoolId, startLevel: 800, steps: [{ level: 1000, passageId: "P1000-1", answers: ["A", "A", "A"], correct: 3 }, { level: 1000, passageId: "P1000-2", answers: ["A", "A", "A"], correct: 3 }, { level: 1000, passageId: "P1000-3", answers: ["A", "A", "A"], correct: 3 }], startedAt: at(-100), completedAt: at(-100), result: 1000, period: "BOY" });
    const open = await repo.create("RRPlacement", { studentId: sid, schoolId: s.schoolId, startLevel: 1000, steps: [], startedAt: at(0) });
    const pool = await testPool(repo, open, PASSAGES);
    assert.ok(!pool.some((p) => p.id.startsWith("P1000-")), "the earlier test's passages are left out");
    const v = await placementView(repo, s, PASSAGES, at(0));
    assert.equal(v.state, "IN_PROGRESS");
    assert.ok(v.passage && !v.passage.id.startsWith("P1000-") && [900, 1100].includes(PASSAGES.find((p) => p.id === v.passage!.id)!.level), "the nearest unseen passage");
    await repo.deleteMany("RRPlacement", { id: open.id });
    const src = readFileSync("src/server/readrise/placement.ts", "utf8");
    assert.match(src, /st\.due \? Number\(\(await ensureRRStudent\(repo, studentId, now\)\)\.level\)/, "a check starts from the current level");
  });

  test("8 · 2+ passages answered too fast → Not valid — retake; the level is not changed; the student can start again", async () => {
    const s = st[4], sid = s.studentId!;
    const before = Number((await ensureRRStudent(repo, sid, at(0))).level);
    const pid = await startPlacement(repo, s, at(0));
    let v = await placementView(repo, s, PASSAGES, at(0));
    const a1 = await answerPlacement(repo, s, pid, v.passage!.id, ["A", "A", "A"], PASSAGES, new Date(at(0).getTime() + 2_000));
    assert.deepEqual([a1.done, a1.rapid], [false, true], "2 s for a passage: does not count");
    v = await placementView(repo, s, PASSAGES, at(0));
    const a2 = await answerPlacement(repo, s, pid, v.passage!.id, ["A", "A", "A"], PASSAGES, new Date(at(0).getTime() + 60_000), { ms: 3_000 });
    assert.deepEqual([a2.done, a2.invalid, a2.result, a2.note], [true, true, null, PLACEMENT_INVALID_TEXT], "the page's 3 s wins over the server's minute");
    assert.equal(Number((await repo.findUnique("RRStudent", { studentId: sid }))!.level), before, "level unchanged");
    const again = await placementView(repo, s, PASSAGES, at(0, 1));
    assert.deepEqual([again.state, again.invalid], ["READY", true], "take it again");
    // careful answers count normally
    const pid2 = await startPlacement(repo, s, at(1));
    for (let i = 0; i < 10; i++) {
      const w = await placementView(repo, s, PASSAGES, at(1));
      if (w.state !== "IN_PROGRESS") break;
      const r = await answerPlacement(repo, s, pid2, w.passage!.id, ["A", "A", "A"], PASSAGES, new Date(at(1).getTime() + (i + 1) * 90_000));
      assert.equal(r.rapid, false);
      if (r.done) { assert.equal(typeof r.result, "number"); break; }
    }
    assert.equal(String((await repo.findUnique("RRStudent", { studentId: sid }))!.source), "PLACEMENT");
  });

  // ------------------------------------------------------------------ 5 + 6. ONE tally, ONE article

  test("5 · ONE accuracy tally: the teacher report and the growth report agree; skills are normalised; rapid answers out", () => {
    const keyRows = new Map([["a1", [1, 2, 3].map((n) => ({ band: "MID", number: n, answer: "A", skill: n === 1 ? "main-idea" : "Details" }))]]);
    const runs = [{ articleId: "a1", band: "MID", answers: { 1: "A", 2: "B", 3: "A" }, rapid: [3] }];
    const t = accuracyByType(runs, keyRows);
    assert.deepEqual(t.map((x) => [x.type, x.correct, x.total]), [["central-idea", 1, 1], ["detail", 0, 1]]);
    const key: AnswerKey = new Map(keyRows.get("a1")!.map((q) => [`a1|MID|${q.number}`, { answer: q.answer, skill: q.skill }]));
    const g = skillBreakdown(runs, key);
    assert.deepEqual(g.map((x) => [x.skill, x.correct, x.total]), [["central-idea", 1, 1], ["detail", 0, 1]]);
    assert.equal(tallyAnswers(runs, keyRowsLookup(keyRows)).length, tallyAnswers(runs, answerKeyLookup(key)).length);
    // the runs that count: counted first tries of reliable runs (a re-read and a same-band stretch never)
    const rows = [
      { studentId: "s", articleId: "a", band: "MID", firstTry: true, stretch: false, completedAt: "x", score: 80 },
      { studentId: "s", articleId: "a", band: "MID", firstTry: false, stretch: false, completedAt: "x", score: 100 },
      { studentId: "s", articleId: "a", band: "MID", firstTry: true, stretch: true, completedAt: "x", score: 100 },
      { studentId: "s", articleId: "b", band: "MID", firstTry: true, stretch: false, completedAt: "x", score: 90, unreliable: true },
      { studentId: "s", articleId: "c", band: "MID", firstTry: true, stretch: false, completedAt: "x", score: 70 },
      { studentId: "s", articleId: "c", band: "HIGH", firstTry: true, stretch: true, completedAt: "x", score: 75 },
    ];
    assert.equal(tallyRuns(rows).length, 3);
    assert.equal(countedTries(rows).length, 4);
    assert.equal(isCountedTry(rows[2], "MID"), false);
    // 6 · ONE article definition: reliable non-stretch first tries; stretch on its own line
    assert.deepEqual([articleRuns(rows).length, stretchRuns(rows).length], [2, 1]);
  });

  test("4 · the growth report drops Unreliable runs (trend, articles, skills, stretch)", async () => {
    const s = st[5], sid = s.studentId!;
    await setLevelByTeacher(repo, admin, sid, 800, "", at(0));
    const a = await makeArticle(repo, "R4-5"), b = await makeArticle(repo, "R4-6");
    await read(repo, s, a, 6, at(1));
    const r = await read(repo, s, b, 8, at(1, 1));
    await repo.updateMany("RRRun", { id: r.start.runId }, { unreliable: true });
    const g = await loadStudentGrowth(repo, sid, at(2));
    assert.equal(g.firstTries, 1);
    assert.deepEqual(g.trend.map((x) => x.score), [75]);
    assert.equal(g.skills.reduce((n, k) => n + k.total, 0), 8, "only the reliable run's 8 answers");
    await afterResponseSettled();
  });

  // ------------------------------------------------------------------ 7. teacher level for a never-placed student

  test("7 · a teacher's level for a never-placed student is the start (no fake growth)", async () => {
    const s = st[3], sid = s.studentId!;
    await repo.deleteMany("RRStudent", { studentId: sid });
    const rr = await ensureRRStudent(repo, sid, at(0));
    assert.ok(["DEFAULT", "MAP"].includes(String(rr.source)));
    await setLevelByTeacher(repo, admin, sid, Number(rr.level) - 350, "", at(1));
    const sum = (await studentReadRiseSummary(repo, sid, at(1)))!;
    assert.deepEqual([sum.growth, sum.startLevel], [0, Number(rr.level) - 350]);
    // a placed student keeps the start: growth is real
    await setLevelByTeacher(repo, admin, sid, Number(rr.level) - 300, "", at(2));
    assert.equal((await studentReadRiseSummary(repo, sid, at(2)))!.growth, 50);
  });

  // ------------------------------------------------------------------ 11. small ones

  test("11 · Riyadh days and Sunday week labels; AI writing guards; ReadRise answer minutes", async () => {
    // Saturday 22:00 UTC = Sunday 01:00 Riyadh
    const sunday = new Date("2026-09-05T22:00:00Z");
    assert.equal(weekLabel(weekStart(sunday)), "09-06");
    const w = readRiseWindows({ yearStart: "2026-08-30", yearEnd: "2027-06-17", midOpens: "2027-01-10" });
    assert.equal(periodOf(w, new Date("2027-01-09T22:30:00Z")), "MOY", "already 10 Jan in Riyadh");
    for (const f of ["src/server/readrise/dashboards.ts", "src/server/readrise/growth-report.ts"]) assert.doesNotMatch(readFileSync(f, "utf8"), /toISOString\(\)\.slice\(5, 10\)/, f);
    // AI: no draft for a re-read; a second concurrent submit is refused
    const s = st[1], sid = s.studentId!;
    const reread = (await repo.findMany("RRRun", { studentId: sid, firstTry: false }))[0];
    const out = await draftReadRiseWritingScore(repo, { schoolId: String(s.schoolId), runId: String(reread.id), prompt: "p", checklist: [], text: WRITING }, {});
    assert.match(String(out.reason), /Not a first try/);
    const a = await makeArticle(repo, "R4-7");
    const v = await startRun(repo, s, a, {}, at(3));
    await submitPrePoll(repo, s, v.runId, 1, at(3));
    await finishReading(repo, s, v.runId, { readSeconds: 120 }, at(3));
    await submitActivity(repo, s, v.runId, answers(8), at(3));
    const both = await Promise.allSettled([submitWriting(repo, s, v.runId, WRITING, at(3)), submitWriting(repo, s, v.runId, WRITING, at(3))]);
    assert.equal(both.filter((x) => x.status === "fulfilled").length, 1, "check-and-set: one submit wins");
    // ReadRise minutes: the stored per-question time (≤ 5 min)
    const skill = (await repo.findMany("Skill", {}, { select: ["id"], take: 1 }))[0];
    await repo.updateMany("RRRun", { id: v.runId }, { answerMs: { ms: { 1: 40_000, 2: 900_000 }, rapid: [] } });
    await repo.create("SkillEvidence", { studentId: sid, skillId: skill.id, source: "READRISE", refId: `${v.runId}:1`, credit: 1, difficultyB: 0, guessC: 0.25, weight: 0.5, createdAt: at(3) });
    await repo.create("SkillEvidence", { studentId: sid, skillId: skill.id, source: "READRISE", refId: `${v.runId}:2`, credit: 1, difficultyB: 0, guessC: 0.25, weight: 0.5, createdAt: at(3) });
    const rr = (await loadAnswers(repo, [sid], at(2), at(4))).filter((x) => x.source === "READRISE" && x.session === `readrise:${v.runId}`);
    assert.deepEqual(rr.map((x) => x.ms).sort((x, y) => Number(x) - Number(y)), [40_000, 300_000]);
    await afterResponseSettled();
  });

  test("10 · the reader and placement screens: labels through t(), content stays English", () => {
    const reader = readFileSync("src/components/readrise/reader.tsx", "utf8");
    const placement = readFileSync("src/components/readrise/placement.tsx", "utf8");
    assert.match(reader, /useT\(\)/); assert.match(placement, /useT\(\)/);
    // round 5: the duplicate "Try a new article" button is gone (Back to ReadRise + Read next instead)
    assert.ok(!reader.includes("Try a new article"));
    for (const x of ["Back to ReadRise", "Read it again (practice)", "Submit my answers", "I finished reading — go to the activity ▶"]) assert.ok(reader.includes(`tr("${x}")`), x);
    for (const x of ["Not valid — retake", "Next passage ▶", "Read a short passage, then answer 3 questions."]) assert.ok(placement.includes(`t("${x}")`), x);
    assert.doesNotMatch(reader, />Submit my answers</);
  });
});
