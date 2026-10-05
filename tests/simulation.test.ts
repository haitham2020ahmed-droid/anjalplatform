/**
 * Engine quality study with a FULL-SIZE synthetic item pool (60 calibrated items
 * spread over levels 1–7), separating "is the algorithm sound?" from "is the bank
 * big enough?". Simulated students answer according to the 2PL model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ADAPTIVE, DEFAULT_MASTERY, LEVEL_TO_B } from "../src/config/engine";
import { processAnswer, type SkillState } from "../src/adaptive/engine";
import { probability } from "../src/adaptive/irt";
import type { CandidateItem, ResponseEvidence } from "../src/types/domain";

let s = 7;
const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const pool: CandidateItem[] = Array.from({ length: 60 }, (_, i) => {
  const level = 1 + (i % 7);
  return { id: `i${i}`, skillId: "k", level, a: 0.8 + rand() * 0.6, b: LEVEL_TO_B[level] + (rand() - 0.5) * 0.6, c: 0, estimatedSeconds: 40 };
});

function simulate(truth: number, n: number) {
  let st: SkillState = { studentId: "x", skillId: "k", sessionId: "s", mode: "PRACTICE", ability: { theta: 0, se: 1 }, prior: { mean: 0, sd: 1 }, history: [], previousTargetB: null, candidates: pool, prerequisites: [] };
  let item: CandidateItem | null = pool.find((p) => p.level === 4)!;
  let last = null as ReturnType<typeof processAnswer> | null;
  const t0 = Date.parse("2026-10-01T08:00:00Z");
  for (let i = 0; i < n && item; i++) {
    const r: ResponseEvidence = { itemId: item.id, correct: rand() < probability(truth, item, 2), level: item.level, a: item.a, b: item.b, c: 0, responseMs: 30_000, estimatedSeconds: 40, usedHint: false, at: new Date(t0 + i * 60_000).toISOString() };
    last = processAnswer(st, r, { adaptive: DEFAULT_ADAPTIVE, mastery: DEFAULT_MASTERY }, new Date(t0 + i * 60_000), rand);
    st = { ...st, ability: last.ability, history: [...st.history, r], previousTargetB: last.next.targetB };
    item = last.next.itemId ? pool.find((p) => p.id === last!.next.itemId)! : null;
  }
  return last!;
}

function corr(x: number[], y: number[]) {
  const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length;
  const c = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0);
  return c / Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0) * y.reduce((a, v) => a + (v - my) ** 2, 0));
}

test("with a full item pool, 20 adaptive answers estimate ability accurately (r > 0.85, RMSE < 0.55)", () => {
  const truths = Array.from({ length: 300 }, () => gauss());
  const ests = truths.map((t) => simulate(t, 20).ability.theta);
  const r = corr(truths, ests);
  const rmse = Math.sqrt(truths.reduce((a, t, i) => a + (t - ests[i]) ** 2, 0) / truths.length);
  console.log(`  engine study: r=${r.toFixed(3)} RMSE=${rmse.toFixed(3)} (n=300, 20 items, pool=60)`);
  assert.ok(r > 0.85, `r=${r}`);
  assert.ok(rmse < 0.55, `rmse=${rmse}`);
});

test("mastery separates strong from weak students after 20 answers", () => {
  const strong = Array.from({ length: 60 }, () => simulate(1.8 + 0.3 * gauss(), 20).mastery.score);
  const weak = Array.from({ length: 60 }, () => simulate(-1.5 + 0.3 * gauss(), 20).mastery.score);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`  mastery: strong avg ${avg(strong).toFixed(1)}, weak avg ${avg(weak).toFixed(1)}`);
  assert.ok(avg(strong) >= 75, "strong students reach Proficient+ on average");
  assert.ok(avg(weak) < 40, "weak students stay Beginning on average");
  assert.ok(weak.every((m) => m < 90), "no weak student is marked Mastered");
});
