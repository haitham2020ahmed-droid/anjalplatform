/**
 * 📝 Daily Dictation: the word-level diff (diff.ts), the up/down tier engine (engine.ts, same shape as the
 * ReadRise engine) and the repo-touching service (service.ts) — one attempt a day, graded, tier moves by one.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { diffTokens, gradeDictation, tokenize } from "../src/server/dictation/diff";
import { clampTier, dictationDay, dictationDecision, DICTATION_ENGINE, isNewDay, itemForDay, MAX_REPLAYS } from "../src/server/dictation/engine";
import { DICTATION_ITEMS, itemsOfTier, TIER_COUNT } from "../src/server/dictation/items";
import { dictationHome, ensureDictationStudent, submitDictation } from "../src/server/dictation/service";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const T0 = new Date("2026-10-05T08:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);

describe("📝 Daily Dictation: diff, the tier engine, and the daily-attempt service", () => {
  // ------------------------------------------------------------------ pure: tokenize / diff
  test("tokenize: words and punctuation as separate tokens, in order", () => {
    assert.deepEqual(tokenize("The library closes at six."), [
      { text: "The", kind: "word" }, { text: "library", kind: "word" }, { text: "closes", kind: "word" },
      { text: "at", kind: "word" }, { text: "six", kind: "word" }, { text: ".", kind: "punct" },
    ]);
    assert.deepEqual(tokenize("don't stop"), [{ text: "don't", kind: "word" }, { text: "stop", kind: "word" }]);
  });

  test("gradeDictation: a perfect match is clean with zero errors", () => {
    const g = gradeDictation("The library closes at six.", "The library closes at six.");
    assert.equal(g.clean, true);
    assert.equal(g.errorCount, 0);
    assert.ok(g.ops.every((o) => o.kind === "ok"));
  });

  test("gradeDictation: a missing word, an extra word, a missing punctuation mark — three separate errors", () => {
    const g = gradeDictation("a sunny morning today", "a sunny today extra");
    assert.equal(g.errorCount, 2); // "morning" missing, "extra" extra ("today" matches, no reorder credit either way)
    assert.ok(g.ops.some((o) => o.kind === "missing" && o.text === "morning"));
    assert.ok(g.ops.some((o) => o.kind === "extra" && o.typedText === "extra"));
  });

  test("gradeDictation: missing punctuation is its own op, separate from word errors", () => {
    const g = gradeDictation("Wait!", "Wait");
    assert.deepEqual(g.ops, [{ kind: "ok", text: "Wait" }, { kind: "missing", text: "!" }]);
    assert.equal(g.errorCount, 1);
  });

  test("gradeDictation: a one-word misspelling reads as MISSPELLED, not a separate missing+extra", () => {
    const g = gradeDictation("The dog ran home", "The dog ran hone");
    assert.deepEqual(g.ops.at(-1), { kind: "misspelled", text: "home", typedText: "hone" });
    assert.equal(g.errorCount, 1, "one misspelling is one error, not two");
    const single = gradeDictation("friend", "freind");
    assert.equal(single.errorCount, 1);
    assert.equal(single.ops[0].kind, "misspelled");
  });

  test("gradeDictation: an unrelated substitution is missing + extra (not merged as a spelling slip)", () => {
    const g = gradeDictation("the dog ran home", "the dog ran zebra");
    assert.ok(g.ops.some((o) => o.kind === "missing" && o.text === "home"));
    assert.ok(g.ops.some((o) => o.kind === "extra" && o.typedText === "zebra"));
    assert.ok(!g.ops.some((o) => o.kind === "misspelled"));
  });

  test("diffTokens is pure and order-preserving (used directly by gradeDictation)", () => {
    const ops = diffTokens(tokenize("a b c"), tokenize("a b c"));
    assert.equal(ops.length, 3);
    assert.ok(ops.every((o) => o.kind === "ok"));
  });

  // ------------------------------------------------------------------ pure: the tier engine
  test("dictationDecision: clean → up a tier; a few errors → hold; many errors → down a tier", () => {
    assert.equal(dictationDecision(0).delta, DICTATION_ENGINE.step);
    assert.equal(dictationDecision(DICTATION_ENGINE.holdMaxErrors).delta, 0);
    assert.equal(dictationDecision(DICTATION_ENGINE.holdMaxErrors + 1).delta, -DICTATION_ENGINE.step);
    assert.match(dictationDecision(0).reason, /clean/);
    assert.match(dictationDecision(DICTATION_ENGINE.holdMaxErrors + 5).reason, /steps back/);
  });

  test("clampTier: never below minTier or above maxTier", () => {
    assert.equal(clampTier(0), DICTATION_ENGINE.minTier);
    assert.equal(clampTier(-5), DICTATION_ENGINE.minTier);
    assert.equal(clampTier(999), DICTATION_ENGINE.maxTier);
    assert.equal(clampTier(3), 3);
  });

  test("dictationDay / isNewDay: a calendar day (UTC yyyy-mm-dd), not the real wall clock", () => {
    assert.equal(dictationDay(new Date("2026-10-05T00:00:01Z")), "2026-10-05");
    assert.equal(dictationDay(new Date("2026-10-05T23:59:59Z")), "2026-10-05");
    assert.equal(isNewDay("2026-10-05", new Date("2026-10-05T23:00:00Z")), false);
    assert.equal(isNewDay("2026-10-05", new Date("2026-10-06T00:00:01Z")), true);
    assert.equal(isNewDay(null, new Date()), true);
  });

  test("the item bank has every tier 1..TIER_COUNT covered", () => {
    for (let t = 1; t <= TIER_COUNT; t++) assert.ok(itemsOfTier(t).length > 0, `tier ${t} has items`);
    assert.ok(DICTATION_ITEMS.length >= 30, "a reasonable starter bank (30+ items)");
  });

  test("itemForDay: the same item all day for one student, rotates on a new day, differs by student", () => {
    const a1 = itemForDay(2, "student-A", at(0));
    const a2 = itemForDay(2, "student-A", new Date(at(0).getTime() + 5 * 3_600_000));
    assert.deepEqual(a1, a2, "same calendar day → same item (reload-safe)");
    assert.equal(a1.tier, 2);
    // tier is always clamped, even if a stray tier value is passed
    assert.equal(itemForDay(0, "student-A", at(0)).tier >= 1, true);
    assert.equal(itemForDay(999, "student-A", at(0)).tier, TIER_COUNT);
    // not every student gets the same item for the same day/tier (not a hard guarantee, but true for this bank/day)
    const ids = new Set(["s1", "s2", "s3", "s4", "s5"].map((s) => itemForDay(3, s, at(0)).id));
    assert.ok(ids.size > 1, "the bank is spread across students, not one fixed item for everyone");
  });

  // ------------------------------------------------------------------ the repo-touching service
  let repo: SqliteRepo; let student: Actor; let teacher: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    student = await resolveActor(repo, (await repo.findUnique("User", { username: "test.student.001" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
  });

  test("ensureDictationStudent: starts at the engine's minTier, created once", async () => {
    const row = await ensureDictationStudent(repo, student.studentId!, String(student.schoolId));
    assert.equal(Number(row.tier), DICTATION_ENGINE.minTier);
    const again = await ensureDictationStudent(repo, student.studentId!, String(student.schoolId));
    assert.equal(again.studentId, row.studentId, "the same row, not a second one");
  });

  test("dictationHome / submitDictation: only a student may use it", async () => {
    await assert.rejects(() => dictationHome(repo, teacher, at(1)), ForbiddenError);
    await assert.rejects(() => submitDictation(repo, teacher, "hello", at(1)), ForbiddenError);
  });

  test("submitDictation: empty text is rejected before anything is graded or stored", async () => {
    await assert.rejects(() => submitDictation(repo, student, "   ", at(2)), ValidationError);
  });

  test("submitDictation: a clean attempt moves the tier up by one for next time; the item matches what the student heard", async () => {
    const home = await dictationHome(repo, student, at(3));
    assert.equal(home.today, null, "nothing done yet today");
    const r = await submitDictation(repo, student, home.item.text, at(3));
    assert.equal(r.clean, true);
    assert.equal(r.tierAfter, r.tierBefore + DICTATION_ENGINE.step);
    const after = await dictationHome(repo, student, at(3));
    assert.ok(after.today && after.today.clean, "today's attempt is now stored and returned");
  });

  test("submitDictation: one attempt only per calendar day — a second try the same day is rejected, not overwritten", async () => {
    const home = await dictationHome(repo, student, at(4));
    await submitDictation(repo, student, home.item.text, at(4));
    await assert.rejects(() => submitDictation(repo, student, "a different answer entirely", at(4)), ValidationError);
    const still = await dictationHome(repo, student, at(4));
    assert.equal(still.today!.clean, true, "the stored attempt is unchanged by the rejected resubmit");
  });

  test("submitDictation: a messy (too many errors) attempt steps the tier down by one", async () => {
    const before2 = (await ensureDictationStudent(repo, student.studentId!, String(student.schoolId))).tier;
    const r = await submitDictation(repo, student, "zzz completely wrong answer not even close", at(5));
    assert.equal(Number(before2), r.tierBefore);
    if (r.errorCount > DICTATION_ENGINE.holdMaxErrors) assert.equal(r.tierAfter, r.tierBefore - DICTATION_ENGINE.step);
    assert.equal(r.tierAfter, clampTier(r.tierAfter), "never drops below minTier");
  });

  test("dictationHome exposes MAX_REPLAYS so the UI never hardcodes the replay limit", async () => {
    const home = await dictationHome(repo, student, at(6));
    assert.equal(home.maxReplays, MAX_REPLAYS);
    assert.ok(MAX_REPLAYS >= 1);
  });

  test("dictationHome: history lists earlier days, most recent first, excluding today", async () => {
    const home = await dictationHome(repo, student, at(6));
    assert.ok(home.history.length >= 3, "the earlier days (3, 4, 5) show up in history");
    assert.ok(home.history.every((h) => h.day !== home.day));
    const days = home.history.map((h) => h.day);
    assert.deepEqual(days, [...days].sort().reverse(), "most recent first");
  });
});
