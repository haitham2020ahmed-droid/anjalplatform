/**
 * 📉 Round 6 (owner: "ReadRise like Achieve3000") — levels below 300, a low start, a LevelSet-length placement, grade
 * bands and the end-of-year forecast. FAKE data only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_FLOOR, RR_LEVELS, RR_MIN, chooseVersion, formatLevel, versionFor } from "../src/server/readrise/level";
import { ENGINE, clampEngine, nearestLevel } from "../src/server/readrise/engine";
import { loadPlacementPassages, parsePlacement, type PlacementPassage } from "../src/server/readrise/content-loader";
import { PLACEMENT, answerPlacement, placementPlan, placementResult, placementStartLevel, placementStatus, placementView, startPlacement, type PlacementStep } from "../src/server/readrise/placement";
import { ANNUAL_GOAL, BAND_LABEL, forecastLevel, gradeBand, gradeLevelVersion, growthPaths, levelHistoryByMonth, meetsRange, yearlyGrowth } from "../src/server/readrise/benchmarks";
import { CYCLE_KEY, defaultCycle } from "../src/server/assessment-cycle/cycle";
import { demoDatabase } from "./helpers/db";

const LOW_LEVELS = [-200, 0, 100, 200];
const passage = (id: string, level: number) => ({ id, level, title: `P ${id}`, text: "Text.", questions: [1, 2, 3].map((n) => ({ stem: `Q${n}`, options: ["a", "b", "c", "d"], answer: "A", skill: "detail" })) });
/** 3 per level 300…1600 plus 4 per low level (−200, 0, 100, 200), answers A, A, A. */
const PASSAGES: PlacementPassage[] = parsePlacement({
  passages: [
    ...RR_LEVELS.flatMap((level) => [1, 2, 3].map((k) => passage(`P${level}-${k}`, level))),
    ...LOW_LEVELS.flatMap((level) => [1, 2, 3, 4].map((k) => passage(`L${level}-${k}`, level))),
  ],
});
const pAns = (right: number) => [0, 1, 2].map((i) => (i < right ? "A" : "B"));
const D = (iso: string, h = 8) => new Date(`${iso}T${String(h).padStart(2, "0")}:00:00Z`);
const DAY = 86_400_000;

function run(start: number, right: (n: number, level: number) => number, pool = PASSAGES) {
  const steps: PlacementStep[] = [];
  for (let n = 0; n < 30; n++) {
    const p = placementPlan(start, steps, pool);
    if (p.done) break;
    const c = right(n, p.passage!.level);
    steps.push({ level: p.passage!.level, passageId: p.passage!.id, answers: pAns(c), correct: c });
  }
  return steps;
}

describe("📉 Round 6: levels like Achieve3000", () => {
  test("formatLevel and the floor: BR below 0; every level below 300 reads the 300 version", () => {
    assert.deepEqual([formatLevel(-120), formatLevel(95), formatLevel(0), formatLevel(1050), formatLevel(-400)], ["BR120L", "95L", "0L", "1050L", "BR400L"]);
    assert.equal(RR_FLOOR, -400); assert.equal(RR_MIN, 300); assert.equal(ENGINE.min, RR_FLOOR);
    assert.deepEqual([clampEngine(-1000), clampEngine(95), clampEngine(1800)], [-400, 100, 1700]);
    assert.deepEqual([nearestLevel(95), nearestLevel(-220), nearestLevel(270), nearestLevel(-999)], [100, -220, 300, -400]);
    const versions = RR_LEVELS.map((l) => ({ level: l, estLevel: l }));
    for (const l of [-400, -120, 0, 95, 249, 299]) {
      assert.equal(versionFor(l, [...RR_LEVELS]), 300, `versionFor ${l}`);
      assert.equal(chooseVersion(l, versions), 300, `chooseVersion ${l}`);
    }
    // a 300 version that measures easy does not tempt chooseVersion to a 350 text for a BR reader
    assert.equal(chooseVersion(-100, [{ level: 300, estLevel: 380 }, { level: 340, estLevel: 300 }]), 300);
  });

  test("benchmarks: the Meets ranges, grade bands, the grade-level version, the yearly goal", () => {
    assert.deepEqual(meetsRange(7), { min: 970, max: 1120 });
    assert.deepEqual([meetsRange(1), meetsRange(12), meetsRange(0), meetsRange(13)], [{ min: 190, max: 530 }, { min: 1185, max: 1385 }, { min: 190, max: 530 }, { min: 1185, max: 1385 }]);
    assert.equal(gradeBand(7, 1180), "EXCEEDS");
    assert.equal(gradeBand(7, 990), "MEETS");
    for (const l of [660, 700, 880]) assert.equal(gradeBand(7, l), "APPROACHES", String(l));
    assert.equal(gradeBand(7, 540), "FAR_BELOW");
    assert.equal(gradeBand(7, 281), "FAR_BELOW", "the class average of the school's real Grade 7 data");
    assert.equal(gradeBand(7, -220), "FAR_BELOW");
    assert.deepEqual(BAND_LABEL, { FAR_BELOW: "Falls Far Below", APPROACHES: "Approaches", MEETS: "Meets", EXCEEDS: "Exceeds" });
    assert.equal(gradeLevelVersion(7, [...RR_LEVELS]), 1000, "middle of 970–1120 = 1045 → 1000");
    assert.equal(gradeLevelVersion(1, [...RR_LEVELS]), 400, "middle 360 → 400");
    assert.equal(gradeLevelVersion(1, [500, 600]), 500, "clamped to the lowest version there is");
    assert.equal(gradeLevelVersion(12, [300, 400, 500]), 500, "clamped to the versions there are");
    assert.deepEqual(ANNUAL_GOAL, { activities: 40, avg: 75 });
  });

  test("forecast: fitted to Achieve's forecasts; prorated; the student's own rate after 6 first tries", () => {
    const achieve: [number, number][] = [[95, 160], [-220, 140], [225, 95], [325, 85], [470, 70], [730, 45], [820, 35]];
    for (const [l, g] of achieve) assert.ok(Math.abs(yearlyGrowth(l) - g) <= 15, `growth from ${l}: ${yearlyGrowth(l)} vs ${g}`);
    for (let l = -400; l < 1600; l += 50) assert.ok(yearlyGrowth(l) >= yearlyGrowth(l + 50), "never more growth for a stronger reader");
    const startAt = D("2026-09-06"), yearEnd = new Date(startAt.getTime() + 280 * DAY);
    const half = new Date(startAt.getTime() + 140 * DAY);
    const f0 = forecastLevel({ startLevel: 325, currentLevel: 325, startAt, now: startAt, yearEnd, firstTries: 0 });
    assert.deepEqual(f0, { initial: 410, updated: 410 }, "325 + 85 over a whole year");
    const fHalf = forecastLevel({ startLevel: 325, currentLevel: 400, startAt, now: half, yearEnd, firstTries: 2 });
    assert.equal(fHalf.initial, 410);
    assert.equal(fHalf.updated, 440, "half a year left from 400: + ~40 (few first tries: the expected rate only)");
    const fast = forecastLevel({ startLevel: 325, currentLevel: 500, startAt, now: half, yearEnd, firstTries: 10 });
    assert.ok(fast.updated > 500 + yearlyGrowth(500) / 2, "a fast-growing student's own rate lifts the forecast");
    const br = forecastLevel({ startLevel: -220, currentLevel: -220, startAt, now: startAt, yearEnd, firstTries: 0 });
    assert.equal(br.initial, -70);
    const p = growthPaths({ startLevel: 325, currentLevel: 400, startAt, now: half, yearEnd, firstTries: 2, actual: [{ month: "2026-09", level: 325 }] });
    assert.equal(p.initial[0].month, "2026-09");
    assert.equal(p.initial[p.initial.length - 1].level, 410);
    assert.equal(p.expected[0].level, 400, "the expected path starts at the current level");
    assert.equal(p.expected[p.expected.length - 1].level, p.forecast.updated);
    assert.deepEqual(p.actual, [{ month: "2026-09", level: 325 }]);
  });

  test("the loader: placement.json + placement-extra.json (optional; low levels; ids unique)", () => {
    const root = mkdtempSync(join(tmpdir(), "rr6-"));
    mkdirSync(join(root, "data", "readrise"), { recursive: true });
    writeFileSync(join(root, "data", "readrise", "placement.json"), JSON.stringify({ passages: RR_LEVELS.map((l) => passage(`B${l}`, l)) }));
    assert.equal(loadPlacementPassages(root).length, RR_LEVELS.length, "works without the extra file");
    writeFileSync(join(root, "data", "readrise", "placement-extra.json"), JSON.stringify({ passages: [passage("X-200", -200), passage("X0", 0), passage("B300", 300), passage("X150", 150), passage("X-400", -400), passage("X1600", 1600)] }));
    const all = loadPlacementPassages(root);
    assert.deepEqual(all.slice(RR_LEVELS.length).map((p) => [p.id, p.level]), [["X-200", -200], ["X0", 0], ["X1600", 1600]], "a duplicate id, a level off the 100s and one under −200 are skipped");
    writeFileSync(join(root, "data", "readrise", "placement-extra.json"), "{ broken");
    assert.equal(loadPlacementPassages(root).length, RR_LEVELS.length, "a broken extra file is ignored");
  });

  test("the plan: starts low, climbs, 12–13 passages (round 7; was 8–13), never twice; a weak reader goes below 300", () => {
    // a 1000 reader from 300: climbs and ends near 1000
    const strong = run(300, (_n, l) => (l <= 1000 ? 3 : l === 1100 ? 1 : 0));
    assert.deepEqual(strong.slice(0, 4).map((x) => x.level), [300, 500, 700, 900]);
    assert.ok(strong.length >= PLACEMENT.minPassages && strong.length <= PLACEMENT.maxPassages, `length ${strong.length}`);
    assert.equal(new Set(strong.map((x) => x.passageId)).size, strong.length);
    // round 7: all right up to 1000, wrong above → between 1000 and 1100 (placementEstimate, within 100 of the rule's 1000)
    assert.equal(placementResult(strong, 300), 1060);
    // a reader at about 100: fails 300 and 200, passes 100 and below
    const weak = run(300, (_n, l) => (l <= 100 ? 3 : 0));
    assert.ok(weak.some((x) => x.level < 300), "the test goes below 300");
    assert.equal(placementResult(weak, 300), 130, "round 7: between 100 (all right) and 200 (all wrong)");
    // a non-reader: fails everything → fails the lowest passage (−200) twice → BR300L, the test ends early
    const none = run(300, () => 0);
    assert.equal(placementResult(none, 300), -300);
    assert.equal(formatLevel(placementResult(none, 300)), "BR300L");
    assert.ok(none.filter((x) => x.level === -200).length === 2 && none.length < PLACEMENT.maxPassages);
    // without the low passages the floor is the 300 passage (result one step lower: 200)
    const only = PASSAGES.filter((p) => p.level >= 300);
    assert.equal(placementResult(run(300, () => 0, only), 300), 200);
    // never more than 13
    const zig = run(700, (n) => (n % 2 ? 1 : 2));
    assert.ok(zig.length >= 12 && zig.length <= 13, `zig ${zig.length}`);
  });

  describe("end to end", () => {
    let repo: SqliteRepo; let st: Actor[]; let schoolId: string;
    const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    before(async () => {
      ({ repo } = await demoDatabase());
      await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
      st = await Promise.all(["001", "002", "003"].map((x) => actorOf(`test.student.${x}`)));
      schoolId = String(st[0].schoolId);
      await repo.create("SchoolSetting", { schoolId, key: CYCLE_KEY, value: defaultCycle(D("2026-09-01")) as unknown as Record<string, unknown> });
    });

    async function take(s: Actor, now: Date, right: (level: number) => number): Promise<number | null> {
      const pid = await startPlacement(repo, s, now);
      for (let n = 0; n < 20; n++) {
        const v = await placementView(repo, s, PASSAGES, now);
        if (v.state !== "IN_PROGRESS") break;
        const lvl = PASSAGES.find((p) => p.id === v.passage!.id)!.level;
        const a = await answerPlacement(repo, s, pid, v.passage!.id, pAns(right(lvl)), PASSAGES, new Date(now.getTime() + (n + 1) * 60_000));
        if (a.done) return a.result;
      }
      return null;
    }

    test("the start: 300 without MAP (not the grade); a MAP Lexile from the last 6 months; an older one is ignored", async () => {
      const [a, b, c] = st.map((x) => x.studentId!);
      const now = D("2026-09-06");
      assert.deepEqual(await placementStartLevel(repo, a, PASSAGES, now), { level: 300, source: "LOW" });
      await repo.create("MapResult", { studentId: b, testDate: new Date(now.getTime() - 60 * DAY), subject: "Reading", rit: 190, lexile: 95 });
      assert.deepEqual(await placementStartLevel(repo, b, PASSAGES, now), { level: 100, source: "MAP" });
      await repo.create("MapResult", { studentId: c, testDate: new Date(now.getTime() - 300 * DAY), subject: "Reading", rit: 220, lexile: 1100 });
      assert.deepEqual(await placementStartLevel(repo, c, PASSAGES, now), { level: 300, source: "LOW" }, "a MAP Lexile older than 6 months");
      const view = await placementView(repo, st[0], PASSAGES, now);
      assert.equal(view.maxSteps, 13);
      assert.ok(view.grade == null || (view.grade >= 1 && view.grade <= 12));
    });

    test("a weak reader is placed below 300 (BR), reads the 300 version; the middle-of-year check works below 300 too", async () => {
      const s = st[0], sid = s.studentId!;
      const start = await take(s, D("2026-09-06"), (l) => (l <= -200 ? 2 : 0));
      // round 7: 2 of 3 at BR200 and nothing above: the answers fit a reader a little under BR200 (placementEstimate,
      // within 100 of the old rule's −200)
      assert.equal(start, -290, "passed only BR200 (2 of 3)");
      const rr = (await repo.findUnique("RRStudent", { studentId: sid }))!;
      assert.deepEqual([Number(rr.level), Number(rr.startLevel), rr.source], [-290, -290, "PLACEMENT"]);
      assert.ok((await repo.findMany("RRLevelChange", { studentId: sid })).some((c) => /result BR290L/.test(String(c.reason))));
      // the middle-of-year check: same long test, starts at the current level (−200), can end below 300
      const c = defaultCycle(D("2026-09-01"));
      const mid = D(c.diagnostic.MOY.opens, 9);
      assert.equal((await placementStatus(repo, sid, mid)).due, "MOY");
      const check = await take(s, mid, (l) => (l <= 100 ? 3 : 0));
      // round 7: one 3/3 at 100 (the other low passages were used in the first test) and 0/3 on every passage above —
      // below guessing — so the estimate goes to the bottom of its window (100 − 100 = 0)
      assert.equal(check, 0);
      const rr2 = (await repo.findUnique("RRStudent", { studentId: sid }))!;
      assert.deepEqual([Number(rr2.level), Number(rr2.startLevel)], [0, -290], "the year's start is kept: growth BR290L → 0L");
      const later = new Date(mid.getTime() + DAY);
      const hist = await levelHistoryByMonth(repo, sid, D("2026-09-01"), later, later);
      assert.equal(hist[0].month, "2026-09"); assert.equal(hist[0].level, -290);
      assert.equal(hist[hist.length - 1].level, 0);
    });
  });
});
