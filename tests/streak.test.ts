import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { streakFromDays } from "../src/server/student/streak";

describe("daily streak", () => {
  test("counts consecutive days ending today or yesterday", () => {
    assert.equal(streakFromDays([10, 9, 8, 6], 10), 3, "today, yesterday, the day before; a gap stops it");
    assert.equal(streakFromDays([9, 8], 10), 2, "not yet today: yesterday keeps the streak alive");
    assert.equal(streakFromDays([8, 7], 10), 0, "two days without practice: the streak is over");
    assert.equal(streakFromDays([], 10), 0);
    assert.equal(streakFromDays([10, 10, 10], 10), 1, "many answers in one day = one day");
  });
});
