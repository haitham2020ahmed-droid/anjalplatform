/** 📉📈 Round 9 (owner, 7 Nov 2026): gentler automatic level drops and the quick way back — pure checks. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { AUTO_DOWN_PREFIX, afterAutoDrop, levelDecision, readsToMoveUp } from "../src/server/readrise/engine";

describe("📉📈 round 9 level moves", () => {
  test("the strip on the student page: after a drop 2 strong reads are needed, else 3", () => {
    assert.equal(readsToMoveUp([], 600), 3);
    assert.equal(readsToMoveUp([], 600, true), 2);
    assert.equal(readsToMoveUp([80], 600, true), 1);
    assert.equal(readsToMoveUp([40], 1600, true), null, "at the top: no promise");
  });

  test("only an automatic drop opens the quick way back (not a teacher's level, not a placement)", () => {
    const ch = (reason: string) => [{ reason }];
    assert.equal(afterAutoDrop(ch(`${AUTO_DOWN_PREFIX}50: the last two first-try scores were both under 50%`)), true);
    assert.equal(afterAutoDrop(ch("Teacher set the level")), false);
    assert.equal(afterAutoDrop(ch("Placement: 12 passages, result 600L")), false);
    assert.equal(afterAutoDrop([]), false);
  });

  test("a student 200 too high reaches the right level fast when the texts are far too hard", () => {
    // 4 articles at 10–20%: −100, then −100 again (the window restarts after each move)
    assert.equal(levelDecision([20, 10]).delta, -100);
    // a normal bad patch: −50 steps only
    assert.equal(levelDecision([45, 40]).delta, -50);
  });
});
