/**
 * 📄 Shared passage dedup/creation (src/server/admin/passages.ts), used by the question editor, the importer and
 * the NAFS bank whenever a question carries passage text: the same text always maps to the same `ReadingPassage`
 * row (content hash), so several questions about one story share it instead of creating a copy each time; editing
 * a question's passage text creates or finds the passage for the NEW text and never changes any other question's
 * passage. No test file referenced this module before this one (audit finding, Oct 2026, P2 #9).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { ValidationError } from "../src/server/curriculum-admin";
import { cleanPassage, MAX_PASSAGE_CHARS, passageForText, passageRef } from "../src/server/admin/passages";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("📄 cleanPassage (pure)", () => {
  test("empty, whitespace-only or missing text becomes null", () => {
    assert.equal(cleanPassage(""), null);
    assert.equal(cleanPassage("   \n\t  "), null);
    assert.equal(cleanPassage(null), null);
    assert.equal(cleanPassage(undefined), null);
  });

  test("trims, normalizes Windows line endings, and strips trailing spaces on each line", () => {
    assert.equal(cleanPassage("  Hello world.  "), "Hello world.");
    assert.equal(cleanPassage("Line one.\r\nLine two.\r\n"), "Line one.\nLine two.");
    assert.equal(cleanPassage("Line one.   \nLine two."), "Line one.\nLine two.");
  });

  test("text over the character limit throws a ValidationError naming the limit", () => {
    const tooLong = "a".repeat(MAX_PASSAGE_CHARS + 1);
    assert.throws(() => cleanPassage(tooLong), ValidationError);
    assert.throws(() => cleanPassage(tooLong), /too long/);
    assert.throws(() => cleanPassage(tooLong), /20,000/);
  });

  test("text exactly at the limit is accepted", () => {
    const exact = "a".repeat(MAX_PASSAGE_CHARS);
    assert.equal(cleanPassage(exact)!.length, MAX_PASSAGE_CHARS);
  });
});

describe("📄 passageRef (pure content hash)", () => {
  test("the same text (even with different whitespace) always gives the same ref", () => {
    assert.equal(passageRef("Hello   world."), passageRef("Hello world."));
    assert.equal(passageRef("  Hello world.  "), passageRef("Hello world."));
    assert.equal(passageRef("Hello\nworld."), passageRef("Hello world."));
  });

  test("different text gives a different ref, and the ref is stably formatted", () => {
    assert.notEqual(passageRef("Hello world."), passageRef("Goodbye world."));
    assert.match(passageRef("Any text"), /^IMP-[0-9a-f]{24}$/);
  });
});

describe("📄 passageForText (database)", () => {
  let repo: SqliteRepo;
  let createdById: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    createdById = s((await repo.findMany("User", { username: "demo.admin" }))[0].id);
  });

  test("new text creates a new ReadingPassage row, with stats and a title derived from the text", async () => {
    const text = "The Lighthouse Keeper's Daughter\nEvery morning, Amal climbed the spiral stairs to check the lamp.";
    const id = await passageForText(repo, text, 5, createdById);
    const row = (await repo.findUnique("ReadingPassage", { id }))!;
    assert.equal(row.body, text);
    assert.equal(row.gradeLevel, 5);
    assert.equal(row.status, "UNDER_REVIEW");
    assert.equal(row.origin, "TEACHER_AUTHORED");
    assert.equal(row.title, "The Lighthouse Keeper's Daughter");
    assert.ok(Number(row.wordCount) > 0);
  });

  test("the exact same text returns the SAME passage id instead of creating a duplicate row", async () => {
    const text = "A single short passage about a garden that grew overnight.";
    const first = await passageForText(repo, text, 4, createdById);
    const countBefore = await repo.count("ReadingPassage", {});
    const second = await passageForText(repo, text, 4, createdById);
    assert.equal(second, first);
    assert.equal(await repo.count("ReadingPassage", {}), countBefore, "no new row was created the second time");
  });

  test("text that differs only in spacing still maps to the same passage (same content hash)", async () => {
    const a = await passageForText(repo, "Two sentences.   Here they are.", 4, createdById);
    const b = await passageForText(repo, "Two sentences. Here they are.", 4, createdById);
    assert.equal(a, b);
  });

  test("single-line text (no newline) falls back to a truncated 'Passage: ...' title instead of using the whole line as a title", async () => {
    const text = "This is a single long line with no newline in it at all, used only as passage text.";
    const id = await passageForText(repo, text, 6, createdById);
    const row = (await repo.findUnique("ReadingPassage", { id }))!;
    assert.match(s(row.title), /^Passage: /);
  });

  test("a first line longer than 80 characters also falls back to the 'Passage: ...' title", async () => {
    const longFirstLine = "X".repeat(90);
    const text = `${longFirstLine}\nSecond line of the passage.`;
    const id = await passageForText(repo, text, 6, createdById);
    const row = (await repo.findUnique("ReadingPassage", { id }))!;
    assert.match(s(row.title), /^Passage: /);
  });
});
