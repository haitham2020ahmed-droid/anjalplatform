/**
 * Splits a reading passage into smaller sections for a student who struggles with sustained reading (a working
 * level of BELOW) — a pure, client-safe UI helper: nothing here is persisted, so which chunk a student is on
 * resets on reload (see components/passage/chunked-passage.tsx, which shows one chunk at a time with a
 * "Continue reading" action and a "Show full passage" escape hatch).
 *
 * Splitting rules, in order:
 *  1. A passage with too little content to be "long" (few paragraph/feature blocks) is never chunked — it is
 *     returned as a single chunk, so a short passage reads exactly as it always did.
 *  2. A normal passage (blank-line-separated paragraphs, section headings, text features) is grouped by
 *     PARAGRAPHS_PER_CHUNK paragraph/feature blocks per chunk. A heading stays with the block that follows it.
 *  3. A passage written with NO paragraph breaks at all (one long block of text) is instead split by sentences,
 *     SENTENCES_PER_CHUNK at a time, since paragraph grouping would otherwise produce a single giant "chunk".
 */
import { passageBlocks, type PassageBlock } from "./passage";

/** Below this many paragraph/feature blocks, a passage is short enough to show whole. */
export const MIN_BLOCKS_TO_CHUNK = 3;
/** How many paragraph/feature blocks make up one chunk, for a passage that already has paragraph breaks. */
export const PARAGRAPHS_PER_CHUNK = 2;
/** How many sentences make up one chunk, for a passage with no paragraph breaks at all. */
export const SENTENCES_PER_CHUNK = 5;

/** Sentence boundaries: end punctuation followed by whitespace. Keeps the punctuation on the sentence before it. */
function splitSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function groupEvery<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/**
 * The passage's blocks (headings, paragraphs, text features — see lib/passage.ts), grouped into chunks to show
 * one at a time. Always returns at least one chunk for non-empty text (an empty/whitespace-only passage returns
 * an empty array — nothing to show).
 */
export function chunkPassage(text: string, opts: { paragraphsPerChunk?: number; minBlocks?: number; sentencesPerChunk?: number } = {}): PassageBlock[][] {
  const paragraphsPerChunk = Math.max(1, opts.paragraphsPerChunk ?? PARAGRAPHS_PER_CHUNK);
  const minBlocks = Math.max(1, opts.minBlocks ?? MIN_BLOCKS_TO_CHUNK);
  const sentencesPerChunk = Math.max(1, opts.sentencesPerChunk ?? SENTENCES_PER_CHUNK);
  const blocks = passageBlocks(text);
  if (!blocks.length) return [];

  const contentBlocks = blocks.filter((b) => b.kind !== "h");
  if (contentBlocks.length === 0) return [blocks]; // headings only — nothing to chunk

  // Edge case: one long paragraph, no blank-line breaks at all — chunk by sentences instead.
  if (contentBlocks.length === 1 && contentBlocks[0].kind === "p") {
    const sentences = splitSentences(contentBlocks[0].text);
    if (sentences.length <= sentencesPerChunk) return [blocks]; // short enough as-is
    const heading = blocks[0].kind === "h" ? blocks[0] : null;
    return groupEvery(sentences, sentencesPerChunk).map((group, i): PassageBlock[] => {
      const p: PassageBlock = { kind: "p", text: group.join(" ") };
      return i === 0 && heading ? [heading, p] : [p];
    });
  }

  if (contentBlocks.length <= minBlocks) return [blocks]; // short enough as-is

  const chunks: PassageBlock[][] = [];
  let current: PassageBlock[] = [];
  let unitsInCurrent = 0;
  for (const b of blocks) {
    current.push(b);
    if (b.kind !== "h") unitsInCurrent++;
    if (unitsInCurrent >= paragraphsPerChunk) {
      chunks.push(current);
      current = [];
      unitsInCurrent = 0;
    }
  }
  if (current.length) {
    // a trailing heading with no content after it (unusual, but possible) joins the previous chunk rather than
    // standing alone with nothing to read
    if (current.every((b) => b.kind === "h") && chunks.length) chunks[chunks.length - 1].push(...current);
    else chunks.push(current);
  }
  return chunks;
}

/**
 * The gating decision used by components/passage/chunked-passage.tsx, pulled out as a pure function so it can be
 * tested without rendering React: chunking only ever turns on for a BELOW-level student, and only when the
 * passage actually split into more than one chunk (nothing to gain from "chunking" a passage that is already
 * short enough to show whole). Every other level — ON, ABOVE, or unknown (null/undefined, e.g. the level was
 * never set, or a caller that does not yet pass one through) — always shows the full passage, same as before
 * this feature existed.
 */
export function shouldChunk(level: string | null | undefined, chunks: PassageBlock[][]): boolean {
  return level === "BELOW" && chunks.length > 1;
}
