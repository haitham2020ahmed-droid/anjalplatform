/**
 * 🎯 ReadRise round 11 (owner, 12 Nov 2026: "like Achieve3000's scoring") — up needs strong scores ABOVE 75% on
 * average, emerging readers move up from 63%, and the teacher can undo an automatic drop for 7 days. FAKE data only.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { AUTO_DOWN_PREFIX, NO_DROP_READS, UNDO_DROP_TAG, dropsPaused, levelDecision, undoableDrop } from "../src/server/readrise/engine";

const NOW = new Date("2026-11-12T08:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("🎯 round 11: the level rule", () => {
  test("up: the strong scores must average above 75%", () => {
    assert.equal(levelDecision([75, 75, 75]).delta, 0);
    assert.equal(levelDecision([75, 75, 75, 75]).delta, 0);
    assert.equal(levelDecision([88, 75, 75, 75]).delta, 50);
    assert.equal(levelDecision([80, 40, 80, 80]).delta, 50, "one weak score among strong ones");
    assert.equal(levelDecision([75, 75], { afterDrop: true }).delta, 0);
    assert.equal(levelDecision([75, 88], { afterDrop: true }).delta, 50);
  });
  test("emerging readers (under 50L) move up from 63%", () => {
    assert.equal(levelDecision([63, 63, 63], { level: 20 }).delta, 50);
    assert.equal(levelDecision([50, 63, 50], { level: 20 }).delta, 0);
    assert.equal(levelDecision([63, 63, 63], { level: 50 }).delta, 0, "50L is not an emerging reader");
    assert.match(String(levelDecision([63, 63, 63], { level: 20 }).reason), /emerging reader/);
  });
});

describe("↩️ round 11: undo an automatic drop", () => {
  const drop = (d: number) => ({ fromLevel: 800, toLevel: 750, reason: `${AUTO_DOWN_PREFIX}50: the last two first-try scores were both under 50%`, createdAt: ago(d) });
  test("only the newest change, an automatic drop, within 7 days, with the level unchanged", () => {
    assert.deepEqual(undoableDrop([drop(2)], 750, NOW)?.from, 800);
    assert.equal(undoableDrop([drop(8)], 750, NOW), null, "too old");
    assert.equal(undoableDrop([drop(2)], 700, NOW), null, "the level moved since");
    assert.equal(undoableDrop([drop(3), { fromLevel: 750, toLevel: 800, reason: "Up 50: …", createdAt: ago(1) }], 800, NOW), null);
    assert.equal(undoableDrop([{ fromLevel: 900, toLevel: 800, reason: "Teacher set the level: x", createdAt: ago(1) }], 800, NOW), null);
  });
  test("after an undo no automatic drop for the next 8 articles", () => {
    const undo = { reason: `${UNDO_DROP_TAG}: the teacher undid the automatic drop`, createdAt: ago(1) };
    assert.equal(dropsPaused([drop(2), undo], 3), true);
    assert.equal(dropsPaused([drop(2), undo], NO_DROP_READS), false);
    assert.equal(dropsPaused([drop(2)], 0), false);
  });
});
