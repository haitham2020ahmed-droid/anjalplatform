/**
 * Round 7: a statistical check of the ReadRise placement (no browser, no database).
 *
 * Simulated students with a true level T answer each question of a passage at level L right with probability
 *   p = 0.25 + 0.75 / (1 + exp((L − T) / 120))      (a 4-option question: a 25% guessing floor)
 * 200 students per T (seeded RNG), through the real placementPlan / placementResult and the real passages
 * (data/readrise/placement.json + placement-extra.json), starting at 300 like a first test without MAP.
 * "before" = the round 6 test (stop after 8 passages once 3 reversals, the old result rule), replayed here;
 * "after"  = the code as it is now (at least 12 passages; the result refined by placementEstimate).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLACEMENT, PLACEMENT_START, placementPlan, placementResult, type PlacementStep } from "../src/server/readrise/placement";
import { loadPlacementPassages } from "../src/server/readrise/content-loader";

const PASSAGES = loadPlacementPassages();
const TS = [-200, 0, 200, 400, 600, 800, 1000, 1200, 1400, 1600];
const RUNS = 200;

/** mulberry32 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pRight = (level: number, T: number) => 0.25 + 0.75 / (1 + Math.exp((level - T) / 120));

/** the round 6 result rule (before round 7), kept here only to report the "before" numbers */
function oldResult(steps: PlacementStep[]): number {
  const bar = (l: number) => (l >= 1200 ? 3 : 2);
  const by = new Map<number, { pass: number; fail: number }>();
  for (const st of steps) {
    const e = by.get(st.level) ?? { pass: 0, fail: 0 };
    if (st.correct >= bar(st.level)) e.pass++; else e.fail++;
    by.set(st.level, e);
  }
  const failedTwice = [...by.entries()].filter(([, e]) => e.fail >= 2).map(([l]) => l);
  const ceiling = failedTwice.length ? Math.min(...failedTwice) : Infinity;
  const ok = [...by.entries()].filter(([l, e]) => e.pass >= 1 && (l < ceiling || (l === ceiling && e.pass > e.fail))).map(([l]) => l);
  const r = ok.length ? Math.max(...ok) : Math.min(...steps.map((x) => x.level)) - 100;
  return Math.max(-400, Math.round(r / 10) * 10);
}

interface Stat { T: number; meanAbs: number; bias: number; in100: number; in150: number; passages: number }

function simulate(T: number, mode: "before" | "after"): Stat {
  const r = rng(7919 + (T + 1000) * 31);
  const errs: number[] = [];
  let len = 0;
  for (let i = 0; i < RUNS; i++) {
    const steps: PlacementStep[] = [];
    for (let guard = 0; guard < 40; guard++) {
      const plan = placementPlan(PLACEMENT_START, steps, PASSAGES);
      if (plan.done || !plan.passage) break;
      // round 6 stop: 3 reversals once 8 passages were read
      if (mode === "before" && plan.reversals >= PLACEMENT.reversals && steps.length >= 8) break;
      const p = pRight(plan.passage.level, T);
      let c = 0;
      for (let q = 0; q < 3; q++) if (r() < p) c++;
      steps.push({ level: plan.passage.level, passageId: plan.passage.id, answers: [], correct: c });
    }
    assert.ok(steps.length <= PLACEMENT.maxPassages, "the test always ends by 13 passages");
    assert.equal(new Set(steps.map((x) => x.passageId)).size, steps.length, "never a repeat");
    len += steps.length;
    errs.push((mode === "before" ? oldResult(steps) : placementResult(steps, PLACEMENT_START)) - T);
  }
  const pct = (d: number) => Math.round((1000 * errs.filter((e) => Math.abs(e) <= d).length) / RUNS) / 10;
  return {
    T,
    meanAbs: Math.round(errs.reduce((a, b) => a + Math.abs(b), 0) / RUNS),
    bias: Math.round(errs.reduce((a, b) => a + b, 0) / RUNS),
    in100: pct(100), in150: pct(150),
    passages: Math.round((10 * len) / RUNS) / 10,
  };
}

test("round 7: the content has enough passages near every level (6 at 300–1600, 4 at −200/0/100/200)", () => {
  const count = (l: number) => PASSAGES.filter((p) => p.level === l).length;
  for (let l = 300; l <= 1600; l += 100) assert.ok(count(l) >= 6, `level ${l}: ${count(l)}`);
  for (const l of [-200, 0, 100, 200]) assert.ok(count(l) >= 4, `level ${l}: ${count(l)}`);
  assert.equal(new Set(PASSAGES.map((p) => p.id)).size, PASSAGES.length);
  assert.deepEqual([PLACEMENT.minPassages, PLACEMENT.maxPassages], [12, 13]);
});

test("round 7: placement accuracy (simulated students, 200 per level)", (t) => {
  const before = TS.map((T) => simulate(T, "before"));
  const after = TS.map((T) => simulate(T, "after"));
  const row = (s: Stat) => `T=${String(s.T).padStart(5)}  mean|err| ${String(s.meanAbs).padStart(4)}  bias ${String(s.bias).padStart(5)}  ±100 ${String(s.in100).padStart(5)}%  ±150 ${String(s.in150).padStart(5)}%  passages ${s.passages}`;
  t.diagnostic("BEFORE (min 8, old result)\n" + before.map(row).join("\n"));
  t.diagnostic("AFTER (min 12, estimate)\n" + after.map(row).join("\n"));
  for (const s of after) {
    // a test ends early only when there is nothing left to show (failed the lowest level twice / passed the top twice)
    if (s.T >= 0 && s.T <= 1400) {
      assert.ok(s.passages >= 11.9, `T=${s.T}: ${s.passages} passages on average`);
      assert.ok(s.meanAbs <= 120, `T=${s.T}: mean |error| ${s.meanAbs}`);
      assert.ok(s.in150 >= 70, `T=${s.T}: ${s.in150}% within ±150`);
    }
  }
});
