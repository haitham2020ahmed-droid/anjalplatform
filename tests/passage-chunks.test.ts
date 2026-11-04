/**
 * 📖 Passage chunking (reading aid for BELOW-level students, no persisted state):
 *   - chunkPassage: a normal multi-paragraph passage groups by paragraph/feature blocks; a passage with no
 *     paragraph breaks at all splits by sentences instead; a short passage (or unusual whitespace) is never
 *     chunked.
 *   - ChunkedPassage (the UI) only ever turns chunking on for a "BELOW" level — ON / ABOVE / unknown always
 *     gets the whole passage, exactly like the plain PassageText it replaces.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { chunkPassage, shouldChunk, MIN_BLOCKS_TO_CHUNK, PARAGRAPHS_PER_CHUNK, SENTENCES_PER_CHUNK } from "../src/lib/passage-chunks";

const textOf = (chunk: ReturnType<typeof chunkPassage>[number]) => chunk.map((b) => b.text).join(" / ");

describe("📖 chunkPassage: the pure splitting function", () => {
  test("a normal passage (blank-line paragraphs) groups PARAGRAPHS_PER_CHUNK blocks per chunk", () => {
    const paras = ["One.", "Two.", "Three.", "Four.", "Five."];
    const text = paras.join("\n\n");
    const chunks = chunkPassage(text);
    assert.ok(chunks.length > 1, "a 5-paragraph passage should be chunked");
    // every chunk (but maybe the last) holds PARAGRAPHS_PER_CHUNK paragraphs
    for (const c of chunks.slice(0, -1)) assert.equal(c.filter((b) => b.kind !== "h").length, PARAGRAPHS_PER_CHUNK);
    // nothing is lost or reordered: flattening every chunk back gives the original paragraphs in order
    assert.deepEqual(chunks.flat().map((b) => b.text), paras);
  });

  test("a heading stays with the block that follows it, never alone in its own chunk", () => {
    const text = "## Part One\nFirst.\n\n## Part Two\nSecond.\n\n## Part Three\nThird.\n\nFourth.";
    const chunks = chunkPassage(text, { paragraphsPerChunk: 1 });
    for (const c of chunks) assert.ok(c.some((b) => b.kind !== "h"), "every chunk has real content, not just a heading");
  });

  test("a passage with NO paragraph breaks at all splits by sentences instead", () => {
    const sentences = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1}.`);
    const text = sentences.join(" "); // one single block — no blank lines anywhere
    const chunks = chunkPassage(text);
    assert.ok(chunks.length > 1, "a long single block should still be chunked, by sentence");
    assert.equal(chunks.length, Math.ceil(sentences.length / SENTENCES_PER_CHUNK));
    // every chunk is itself a single "p" block (never split mid-sentence)
    for (const c of chunks) { assert.equal(c.length, 1); assert.equal(c[0].kind, "p"); }
    const rebuilt = chunks.map((c) => c[0].text).join(" ");
    assert.equal(rebuilt, text);
  });

  test("a short passage (at or below MIN_BLOCKS_TO_CHUNK paragraphs) is returned as a single chunk", () => {
    const text = Array.from({ length: MIN_BLOCKS_TO_CHUNK }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n");
    const chunks = chunkPassage(text);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].length, MIN_BLOCKS_TO_CHUNK);
  });

  test("a very short single sentence is never chunked", () => {
    const chunks = chunkPassage("Just one short sentence.");
    assert.equal(chunks.length, 1);
    assert.equal(textOf(chunks[0]), "Just one short sentence.");
  });

  test("empty / whitespace-only text produces no chunks at all", () => {
    assert.deepEqual(chunkPassage(""), []);
    assert.deepEqual(chunkPassage("   \n\n   \n  "), []);
  });

  test("unusual whitespace (extra blank lines, trailing spaces, \\r\\n) still round-trips cleanly", () => {
    const text = "One.   \r\n\r\n\r\n\r\nTwo.\n\n\n   \n\nThree.\n\nFour.\n\nFive.   ";
    const chunks = chunkPassage(text);
    assert.deepEqual(chunks.flat().map((b) => b.text), ["One.", "Two.", "Three.", "Four.", "Five."]);
  });

  test("a text feature (FIG: …) counts as its own block when grouping", () => {
    const text = "One.\n\nFIG: Map | A map | From here to there\n\nTwo.\n\nThree.";
    const chunks = chunkPassage(text, { paragraphsPerChunk: 1 });
    assert.deepEqual(chunks.flat().map((b) => b.kind), ["p", "fig", "p", "p"]);
  });
});

describe("🚦 shouldChunk: gated to BELOW-level only", () => {
  const paras = ["One.", "Two.", "Three.", "Four.", "Five."];
  const longChunks = chunkPassage(paras.join("\n\n"));
  const shortChunks = chunkPassage("Just one short sentence.");

  test("BELOW with a passage long enough to split: chunking turns on", () => {
    assert.ok(longChunks.length > 1, "sanity check: this passage really did split");
    assert.equal(shouldChunk("BELOW", longChunks), true);
  });
  test("ON level: never chunked, even for a long passage", () => {
    assert.equal(shouldChunk("ON", longChunks), false);
  });
  test("ABOVE level: never chunked, even for a long passage", () => {
    assert.equal(shouldChunk("ABOVE", longChunks), false);
  });
  test("unknown level (null) falls back to showing everything", () => {
    assert.equal(shouldChunk(null, longChunks), false);
  });
  test("unknown level (undefined, e.g. a caller that doesn't pass one yet) falls back to showing everything", () => {
    assert.equal(shouldChunk(undefined, longChunks), false);
  });
  test("BELOW but the passage is too short to split: still not chunked (nothing to gain)", () => {
    assert.equal(shortChunks.length, 1);
    assert.equal(shouldChunk("BELOW", shortChunks), false);
  });
  test("an unrecognized level string is treated like unknown, not like BELOW", () => {
    assert.equal(shouldChunk("below", longChunks), false); // case-sensitive: the stored value is always upper-case "BELOW"
    assert.equal(shouldChunk("SOMETHING_ELSE", longChunks), false);
  });
});
