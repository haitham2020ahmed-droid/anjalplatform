import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ADAPTIVE, DEFAULT_MASTERY, LEVEL_TO_B } from "../src/config/engine";
import { difficultyForTargetP, estimateAbilityEAP, information, limitStep, probability } from "../src/adaptive/irt";
import { selectNextItem } from "../src/adaptive/selector";
import { processAnswer, type SkillState } from "../src/adaptive/engine";
import type { CandidateItem, ResponseEvidence } from "../src/types/domain";

const cfg = { adaptive: DEFAULT_ADAPTIVE, mastery: DEFAULT_MASTERY };
const opts = { priorMean: 0, priorSD: 1, thetaMin: -3, thetaMax: 3, model: 2 as const };

function bank(): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (let level = 1; level <= 7; level++)
    for (let k = 0; k < 6; k++)
      items.push({ id: `L${level}-${k}`, skillId: "s", level, a: 1, b: LEVEL_TO_B[level] + (k - 2.5) * 0.05, c: 0, estimatedSeconds: 40 });
  return items;
}
const seeded = () => {
  let x = 42;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647);
};

test("probability is 0.5 at theta=b and increases with theta (1PL/2PL/3PL)", () => {
  const item = { a: 1.2, b: 0.5, c: 0.2 };
  assert.ok(Math.abs(probability(0.5, item, 2) - 0.5) < 1e-9);
  assert.ok(probability(1.5, item, 2) > probability(0.5, item, 2));
  assert.ok(probability(-5, item, 3) >= 0.2); // guessing floor in 3PL
  assert.ok(Math.abs(probability(0.5, item, 1) - 0.5) < 1e-9);
});

test("item information peaks near b", () => {
  const item = { a: 1, b: 1, c: 0 };
  assert.ok(information(1, item) > information(0, item));
  assert.ok(information(1, item) > information(2, item));
});

test("difficultyForTargetP gives an item the student answers with the requested probability", () => {
  const b = difficultyForTargetP(0.4, 0.72);
  assert.ok(Math.abs(probability(0.4, { a: 1, b, c: 0 }) - 0.72) < 1e-6);
});

test("EAP stays finite for all-correct and all-wrong strings (MLE would diverge)", () => {
  const right = Array.from({ length: 8 }, () => ({ a: 1, b: 0, c: 0, credit: 1, weight: 1 }));
  const wrong = right.map((r) => ({ ...r, credit: 0 }));
  const up = estimateAbilityEAP(right, opts);
  const down = estimateAbilityEAP(wrong, opts);
  assert.ok(up.theta > 1 && up.theta < 3);
  assert.ok(down.theta < -1 && down.theta > -3);
  assert.ok(up.se < 1);
});

test("rapid-guess evidence barely moves theta", () => {
  const full = estimateAbilityEAP([{ a: 1, b: 0, c: 0, credit: 1, weight: 1 }], opts);
  const weak = estimateAbilityEAP([{ a: 1, b: 0, c: 0, credit: 1, weight: 0.2 }], opts);
  assert.ok(weak.theta < full.theta / 2);
});

test("limitStep caps a single-response jump", () => {
  assert.equal(limitStep(0, 2, 0.6), 0.6);
  assert.equal(limitStep(0, -2, 0.6), -0.6);
  assert.equal(limitStep(0, 0.3, 0.6), 0.3);
});

test("selector never moves the target more than maxTargetStep and never repeats recent items", () => {
  const items = bank();
  const d = selectNextItem({
    mode: "PRACTICE",
    theta: 2.5,
    previousTargetB: 0,
    candidates: items,
    recentItemIds: ["L5-0", "L5-1"],
    recentCorrect: [true, true],
    prerequisites: [],
    config: DEFAULT_ADAPTIVE,
    random: seeded(),
  });
  assert.equal(d.reasonCode, "STEP_LIMITED_UP");
  assert.ok(Math.abs(d.targetB - DEFAULT_ADAPTIVE.maxTargetStep) < 1e-9);
  assert.ok(d.itemId && !["L5-0", "L5-1"].includes(d.itemId));
});

test("three consecutive errors route to a weak prerequisite", () => {
  const d = selectNextItem({
    mode: "PRACTICE",
    theta: -0.5,
    previousTargetB: -0.5,
    candidates: bank(),
    recentItemIds: [],
    recentCorrect: [true, false, false, false],
    prerequisites: [
      { skillId: "nouns", name: "Nouns", mastery: 35, minimumMastery: 60, weight: 0.6 },
      { skillId: "verbs", name: "Verbs", mastery: 80, minimumMastery: 60, weight: 0.9 },
    ],
    config: DEFAULT_ADAPTIVE,
  });
  assert.equal(d.reasonCode, "PREREQ_ROUTE");
  assert.equal(d.routeToSkillId, "nouns");
});

test("end-to-end: a correct streak raises difficulty gradually; errors lower it gradually", () => {
  const rnd = seeded();
  const items = bank();
  let state: SkillState = {
    studentId: "stu",
    skillId: "s",
    sessionId: "sess",
    mode: "PRACTICE",
    ability: { theta: 0, se: 1 },
    prior: { mean: 0, sd: 1 },
    history: [],
    previousTargetB: null,
    candidates: items,
    prerequisites: [],
  };
  let current = items.find((i) => i.level === 4)!;
  const targets: number[] = [];
  const pattern = [true, true, true, true, true, true, false, false, false];
  const t0 = Date.parse("2026-10-01T08:00:00Z");
  pattern.forEach((correct, i) => {
    const r: ResponseEvidence = {
      itemId: current.id, correct, level: current.level, a: current.a, b: current.b, c: current.c,
      responseMs: 30_000, estimatedSeconds: 40, usedHint: false, at: new Date(t0 + i * 60_000).toISOString(),
    };
    const step = processAnswer(state, r, cfg, new Date(t0 + i * 60_000), rnd);
    targets.push(step.next.targetB);
    assert.ok(Math.abs(step.log.newTheta - step.log.previousTheta) <= DEFAULT_ADAPTIVE.maxThetaStep + 1e-9);
    assert.ok(step.log.reason.length > 10, "every decision is explained");
    state = { ...state, ability: step.ability, history: [...state.history, r], previousTargetB: step.next.targetB };
    current = items.find((x) => x.id === step.next.itemId) ?? current;
  });
  for (let i = 1; i < targets.length; i++)
    assert.ok(Math.abs(targets[i] - targets[i - 1]) <= DEFAULT_ADAPTIVE.maxTargetStep + 1e-9, "no sudden jumps");
  const peak = Math.max(...targets.slice(0, 6));
  assert.ok(peak > targets[0], "difficulty rose during the correct streak");
  assert.ok(targets[8] < peak, "difficulty fell after errors");
});

test("rapid correct answers earn no XP", () => {
  const item = bank()[20];
  const state: SkillState = {
    studentId: "s", skillId: "s", sessionId: "x", mode: "PRACTICE", ability: { theta: 0, se: 1 }, prior: { mean: 0, sd: 1 },
    history: [], previousTargetB: null, candidates: bank(), prerequisites: [],
  };
  const r: ResponseEvidence = { itemId: item.id, correct: true, level: item.level, a: 1, b: item.b, c: 0, responseMs: 800, estimatedSeconds: 40, usedHint: false, at: new Date().toISOString() };
  const step = processAnswer(state, r, cfg);
  assert.equal(step.rapidGuess, true);
  assert.equal(step.xp, 0);
});

test("a wrong answer never raises mastery (fairness rule)", () => {
  const items = bank();
  let state: SkillState = {
    studentId: "s", skillId: "s", sessionId: "x", mode: "PRACTICE", ability: { theta: 0, se: 1 }, prior: { mean: 0, sd: 1 },
    history: [], previousTargetB: null, candidates: items, prerequisites: [],
  };
  const t0 = Date.parse("2026-10-01T08:00:00Z");
  const pattern = [true, false, true, true, false, false, true, false, true, false, false, true];
  pattern.forEach((correct, i) => {
    const it = items[(i * 5) % items.length];
    const r: ResponseEvidence = { itemId: it.id, correct, level: it.level, a: 1, b: it.b, c: 0, responseMs: 30_000, estimatedSeconds: 40, usedHint: false, at: new Date(t0 + i * 60_000).toISOString() };
    const step = processAnswer(state, r, cfg, new Date(t0 + i * 60_000));
    if (!correct) assert.ok(step.log.masteryAfter <= step.log.masteryBefore, `answer ${i}: ${step.log.masteryBefore} -> ${step.log.masteryAfter}`);
    state = { ...state, ability: step.ability, history: [...state.history, r], previousTargetB: step.next.targetB };
  });
});
