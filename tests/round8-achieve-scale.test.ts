/**
 * 📏 Round 8 (owner, 7 Nov 2026): ReadRise levels on the Achieve3000 scale — FAKE students only.
 *  - the version scale ↔ Achieve3000 scale (achieve-scale.ts);
 *  - the placement result uses each passage's measured Achieve level (placement.json "lexile");
 *  - simulation: students with a known Achieve3000 level get a ReadRise result within ±50 on average.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ACHIEVE_OF_VERSION, toAchieve, toTextScale } from "../src/server/readrise/achieve-scale";
import { RR_LEVELS, chooseVersion } from "../src/server/readrise/level";
import { loadPlacementPassages } from "../src/server/readrise/content-loader";
import { PLACEMENT_START, lexileOf, passageLevelFor, placementPlan, placementResult, type PlacementStep } from "../src/server/readrise/placement";

describe("📏 ReadRise on the Achieve3000 scale", () => {
  test("the version scale and the Achieve3000 scale: both ways, every version", () => {
    for (const v of RR_LEVELS) {
      assert.equal(toAchieve(v), ACHIEVE_OF_VERSION[v], `version ${v}`);
      assert.equal(toTextScale(ACHIEVE_OF_VERSION[v]), v, `back ${v}`);
    }
    assert.ok(toAchieve(850) > 930 && toAchieve(850) < 1040);
    assert.equal(toTextScale(100), 200, "below the lowest point: 1 to 1 (Achieve 100L → 200 on the text scale)");
  });

  test("the version a reader gets is the one that reads like their Achieve3000 level", () => {
    const exact = RR_LEVELS.map((l) => ({ level: l, estLevel: l }));
    // Jawad (95L), a 281L class average, an 820L and a 730L reader (the school's real Achieve3000 numbers)
    assert.deepEqual([95, 281, 820, 730].map((l) => chooseVersion(l, exact)), [300, 300, 700, 600]);
    for (const l of [400, 600, 800, 1000, 1200, 1400]) {
      const v = chooseVersion(l, exact);
      assert.ok(Math.abs(ACHIEVE_OF_VERSION[v] - l) <= 110, `reader ${l} → version ${v} (≈${ACHIEVE_OF_VERSION[v]})`);
    }
  });

  test("every placement passage has its measured level; the start and the result use it", () => {
    const P = loadPlacementPassages();
    assert.ok(P.length >= 90);
    assert.ok(P.every((p) => typeof p.lexile === "number"), "lexile on every passage");
    assert.equal(passageLevelFor(760, P), 600, "MAP 760 → the 600 passages (≈720)");
    assert.equal(passageLevelFor(760, P.map(({ lexile: _x, ...p }) => p)), 800, "no measures: the nearest label");
    assert.equal(lexileOf({ level: 700 }), 700, "an older step without a measure: its level");
    // the same answers, harder passages than their labels → a higher result than the labels say
    const steps: PlacementStep[] = [300, 500, 700, 800, 800, 700].map((level, i) => ({ level, passageId: `x${i}`, answers: [], correct: [3, 3, 3, 1, 1, 2][i] }));
    const plain = placementResult(steps, 300);
    const measured = placementResult(steps.map((x) => ({ ...x, lexile: x.level + 120 })), 300);
    assert.ok(measured >= plain + 80, `${plain} → ${measured}`);
  });

  test("simulation: readers with a known Achieve3000 level get a result within ±50 on average", () => {
    const P = loadPlacementPassages();
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const pRight = (L: number, T: number) => 0.25 + 0.75 / (1 + Math.exp((L - T) / 120));
    for (const T of [100, 300, 500, 700, 900, 1100, 1300]) {
      const errs: number[] = [];
      for (let i = 0; i < 120; i++) {
        const steps: PlacementStep[] = [];
        for (let g = 0; g < 40; g++) {
          const plan = placementPlan(PLACEMENT_START, steps, P);
          if (plan.done || !plan.passage) break;
          let c = 0; for (let q = 0; q < 3; q++) if (rnd() < pRight(plan.passage.lexile ?? plan.passage.level, T)) c++;
          steps.push({ level: plan.passage.level, lexile: plan.passage.lexile, passageId: plan.passage.id, answers: [], correct: c });
        }
        errs.push(placementResult(steps, PLACEMENT_START) - T);
      }
      const bias = errs.reduce((a, b) => a + b, 0) / errs.length;
      const near = errs.filter((e) => Math.abs(e) <= 150).length / errs.length;
      assert.ok(Math.abs(bias) <= 50, `T=${T}: average gap ${Math.round(bias)}`);
      assert.ok(near >= 0.8, `T=${T}: ${Math.round(near * 100)}% within ±150`);
    }
  });
});
