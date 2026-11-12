/**
 * 🛡️ ReadRise round 10 (owner, 11 Nov 2026: "make it all automatic") — the placement can no longer put a Grade 5
 * reader at 1600L by guessing: grade cap, MAP anchor, invalid-test patterns, probation, impossible MAP Lexiles and
 * the one-time correction job. FAKE data only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parsePlacement, loadPlacementPassages, type PlacementPassage } from "../src/server/readrise/content-loader";
import { PLACEMENT, anchorToMap, effectiveCap, gradeCapAchieve, placementPattern, placementPlan, type PlacementStep } from "../src/server/readrise/placement";
import { AUTO_DOWN_PREFIX, PROBATION_TAG, alignReadRiseToMap, levelDecision, lexileFitsRit, lexileForRit, onProbation } from "../src/server/readrise/engine";
import { RETAKE_REASON } from "../src/server/readrise/engine";
import { ROUND10_RETAKE_WHY, round10School } from "../src/server/readrise/round10";
import { RR_LEVELS } from "../src/server/readrise/level";
import { demoDatabase } from "./helpers/db";

const NOW = new Date("2026-11-11T08:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const passage = (id: string, level: number, answer = "A") => ({ id, level, title: id, text: "Text.", questions: [1, 2, 3].map((n) => ({ stem: `Q${n}`, options: ["aaaa", "bbbb", "cccc", "dddd"], answer, skill: "detail" })) });
const PASSAGES: PlacementPassage[] = parsePlacement({ passages: RR_LEVELS.flatMap((l) => [1, 2, 3].map((k) => passage(`P${l}-${k}`, l, "ABCD"[(k + l / 100) % 4]))) });
const step = (level: number, correct: number, answers = ["A", "A", "A"]): PlacementStep => ({ level, passageId: `P${level}-1`, answers, correct });

describe("🛡️ round 10: placement", () => {
  test("grade cap: the grade's Meets top + 150", () => {
    assert.equal(gradeCapAchieve(5), 1160);
    assert.equal(gradeCapAchieve(11), 1535);
    assert.equal(gradeCapAchieve(null), null);
  });

  test("the cap rises by 200 only after two 3/3 at or above it", () => {
    assert.equal(effectiveCap(1100, [], 1600, 600), 1100);
    assert.equal(effectiveCap(1100, [step(1100, 3)], 1600, 600), 1100, "one 3/3 is not enough");
    assert.equal(effectiveCap(1100, [step(1100, 3), step(1200, 3)], 1600, 600), 1300);
    assert.equal(effectiveCap(null, [], 1600, 600), 1600, "no grade: no cap");
  });

  test("the test reads at least the minimum passages before it can end at the top", () => {
    const steps: PlacementStep[] = [];
    for (let i = 0; i < 20; i++) {
      const plan = placementPlan(1000, steps, PASSAGES);
      if (plan.done || !plan.passage) break;
      steps.push({ level: plan.passage.level, passageId: plan.passage.id, answers: ["A", "A", "A"], correct: 3 });
    }
    assert.ok(steps.length >= PLACEMENT.minPassages, `ended after ${steps.length}`);
  });

  test("MAP anchor: within 150 of a recent MAP Lexile; no MAP: at most the grade cap", () => {
    assert.deepEqual(anchorToMap(1600, 760, 5).level, 910);
    assert.deepEqual(anchorToMap(300, 850, 5).level, 700);
    assert.deepEqual(anchorToMap(800, 760, 5), { level: 800, note: null });
    assert.equal(anchorToMap(1600, null, 5).level, 1160);
    assert.equal(anchorToMap(900, null, 5).level, 900);
    assert.equal(anchorToMap(1600, null, null).level, 1600, "grade unknown: nothing to cap with");
  });

  test("invalid test: under 10 minutes, one letter, the longest option every time", () => {
    const real = loadPlacementPassages(process.cwd());
    const pick = real.filter((p) => p.level >= 600 && p.level <= 1600).slice(0, 14);
    const steps = (ans: (p: PlacementPassage, i: number) => string): PlacementStep[] => pick.map((p) => ({ level: p.level, passageId: p.id, answers: p.questions.map((_, i) => ans(p, i)), correct: 0 }));
    const longest = (p: PlacementPassage, i: number) => { const L = p.questions[i].options.map((o) => o.length); return "ABCD"[L.indexOf(Math.max(...L))]; };
    const start = new Date(NOW.getTime() - 40 * 60_000);
    assert.match(String(placementPattern(steps((p, i) => p.questions[i].answer), real, new Date(NOW.getTime() - 6 * 60_000), NOW)), /under 10 minutes/);
    assert.equal(placementPattern(steps((p, i) => p.questions[i].answer), real, start, NOW), null, "a reader who knows every answer");
    assert.match(String(placementPattern(steps(() => "C"), real, start, NOW)), /"C"/);
    // the rewritten distractors: picking the longest option no longer looks like knowing the answers
    const r = placementPattern(steps(longest), real, start, NOW);
    assert.ok(r === null || /longest/.test(r));
  });

  test("the bank: the correct option is rarely the unique longest one (the old 1600 clue)", () => {
    const real = loadPlacementPassages(process.cwd());
    let n = 0, lon = 0;
    for (const p of real) for (const q of p.questions) {
      const L = q.options.map((o) => o.length), k = "ABCD".indexOf(q.answer), max = Math.max(...L);
      n++; if (L[k] === max && L.filter((x) => x === max).length === 1) lon++;
    }
    assert.ok(lon / n < 0.25, `correct = longest in ${lon} of ${n}`);
  });
});

describe("🛡️ round 10: probation and MAP Lexiles", () => {
  test("probation: one low first try right after a placement drops the level", () => {
    assert.equal(levelDecision([40], { probation: true }).delta, -100);
    assert.equal(levelDecision([20], { probation: true }).delta, -200);
    assert.match(String(levelDecision([20], { probation: true }).reason), new RegExp(PROBATION_TAG.replace(/[()]/g, "\\$&")));
    assert.equal(levelDecision([80], { probation: true }).delta, 0);
    assert.equal(levelDecision([40]).delta, 0, "outside the probation one low score is not enough");
  });

  test("impossible MAP Lexiles: 1725L does not belong to a Grade 5 RIT", () => {
    assert.equal(lexileForRit(200), 666);
    assert.equal(lexileFitsRit(1725, 205), false);
    assert.equal(lexileFitsRit(760, 205), true);
    assert.equal(lexileFitsRit(900, null), true);
  });
});

describe("🛡️ round 10: the one-time correction (DB)", () => {
  let repo: SqliteRepo; let ids: string[]; let schoolId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const users = await Promise.all(["001", "002", "003", "004"].map(async (x) => resolveActor(repo, (await repo.findUnique("User", { username: `test.student.${x}` }))!)));
    ids = users.map((u) => u.studentId!);
    schoolId = String(users[0].schoolId);
    const g5 = (await repo.findMany("Grade", { schoolId })).find((g) => Number(g.level) === 5);
    if (g5) for (const id of ids) await repo.updateMany("Student", { id }, { gradeId: g5.id });
    // student 2 is in Grade 11 (the old 1400 ceiling hit the strong older readers); no grade → no cap either
    const g11 = (await repo.findMany("Grade", { schoolId })).find((g) => Number(g.level) === 11);
    const g11id = g11 ? g11.id : (await repo.create("Grade", { schoolId, level: 11, name: "Grade 11" })).id;
    await repo.updateMany("Student", { id: ids[2] }, { gradeId: g11id });
    const rr = (studentId: string, level: number) => repo.create("RRStudent", { studentId, schoolId, level, startLevel: level, source: "PLACEMENT", placedAt: ago(30), weeklyGoal: 2, updatedAt: ago(30) });
    const placed = (studentId: string, level: number, when: Date) => repo.create("RRLevelChange", { studentId, schoolId, fromLevel: 300, toLevel: level, reason: `Placement: 13 passages, result ${level}L`, createdAt: when });
    // 0: placed 1600 with MAP 760 → 910
    await rr(ids[0], 1600); await placed(ids[0], 1600, ago(30));
    await repo.create("MapResult", { studentId: ids[0], testDate: ago(40), subject: "Reading", rit: 205, lexile: 760 });
    // 1: placed 1600, an impossible MAP Lexile (cleared) and no other MAP → the grade cap
    await rr(ids[1], 1600); await placed(ids[1], 1600, ago(30));
    await repo.create("MapResult", { studentId: ids[1], testDate: ago(40), subject: "Reading", rit: 205, lexile: 1725 });
    // 2: the old 1400 ceiling (placement before 21 Oct) → a new test
    await rr(ids[2], 1400); await placed(ids[2], 1400, ago(60));
    await repo.create("RRPlacement", { studentId: ids[2], schoolId, startLevel: 800, steps: [], result: 1400, period: "BOY", startedAt: ago(60), completedAt: ago(60) });
    // 3: a level earned by articles is left alone
    await rr(ids[3], 1300); await placed(ids[3], 1100, ago(30));
    await repo.create("RRLevelChange", { studentId: ids[3], schoolId, fromLevel: 1100, toLevel: 1300, reason: "Up 100: 3 of the last 4 first-try scores were 75% or higher", createdAt: ago(5) });
  });

  test("round10School fixes each case once", async () => {
    const r = await round10School(repo, schoolId, NOW);
    assert.equal(r.lexilesCleared, 1);
    const lvl = async (i: number) => Number((await repo.findUnique("RRStudent", { studentId: ids[i] }))!.level);
    assert.equal(await lvl(0), 910);
    assert.equal(await lvl(1), 1160);
    assert.equal(await lvl(3), 1300);
    const ch2 = await repo.findMany("RRLevelChange", { studentId: ids[2] });
    assert.ok(ch2.some((c) => String(c.reason).startsWith(RETAKE_REASON) && String(c.reason).includes(ROUND10_RETAKE_WHY)));
    const again = await round10School(repo, schoolId, NOW);
    assert.deepEqual([again.lexilesCleared, again.mapChecked, again.capped, again.retakes], [0, 0, 0, 0], "a second run changes nothing");
  });

  test("after the MAP check the next first tries are on probation", async () => {
    const changes = (await repo.findMany("RRLevelChange", { studentId: ids[0] })).sort((a, b) => new Date(String(a.createdAt)).getTime() - new Date(String(b.createdAt)).getTime());
    assert.equal(await onProbation(repo, ids[0], changes), false, "no article read yet");
    assert.equal(await alignReadRiseToMap(repo, ids[0], NOW), null, "already within the band");
    assert.ok(!changes.some((c) => String(c.reason).startsWith(AUTO_DOWN_PREFIX)));
  });
});
