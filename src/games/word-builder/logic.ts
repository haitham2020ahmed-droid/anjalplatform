/**
 * 🧱 Word Builder — the rules (pure, no React): which bank questions fit, how tiles are scrambled and checked, and
 * what a Live Challenge device sends. The bank's scorer (scoreResponse, WORD_ORDER / SENTENCE_ORDER) gets the
 * pieces as a string[] and is right only for the exact order — solo play uses the same rule.
 */
import type { PlayQuestion } from "../types";

export const MIN_TILES = 3;
export const MAX_TILES = 8;
/** a piece is a word or a short sentence */
export const MAX_TILE_TEXT = 140;
/** seconds a sentence may take before the speed bonus is gone */
export const BUILD_SECONDS = 35;

export interface Tile { id: number; text: string }

/** A word- or sentence-order question with 3–8 pieces that are not empty or very long. */
export function fitsOrder(q: Pick<PlayQuestion, "type" | "sequence">): boolean {
  if ((q.type !== "WORD_ORDER" && q.type !== "SENTENCE_ORDER") || !q.sequence) return false;
  const s = q.sequence;
  return s.length >= MIN_TILES && s.length <= MAX_TILES && s.every((x) => typeof x === "string" && x.trim().length > 0 && x.length <= MAX_TILE_TEXT);
}

/** The pieces as tiles in a new order (never the answer order when the pieces are not all the same). */
export function scramble(seq: readonly string[], rnd: () => number = Math.random): Tile[] {
  const tiles = seq.map((text, id) => ({ id, text }));
  const same = (a: Tile[]) => a.every((t, i) => t.text === seq[i]);
  for (let k = 0; k < 8; k++) {
    const a = [...tiles];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (!same(a)) return a;
  }
  return tiles.length > 1 ? [...tiles.slice(1), tiles[0]] : tiles;
}

/** Right only when the pieces read in exactly the bank's order (equal words are interchangeable). */
export const checkOrder = (seq: readonly string[], built: readonly string[]): boolean => built.length === seq.length && built.every((t, i) => t === seq[i]);

/** Move a tile to a position in the line (insert; `to` past the end = the end). */
export function moveInLine(line: number[], id: number, to: number): number[] {
  const from = line.indexOf(id);
  const out = line.filter((x) => x !== id);
  // `to` is a position in the line as it was (before the tile was lifted out of it)
  const at = Math.max(0, Math.min(from !== -1 && from < to ? to - 1 : to, out.length));
  out.splice(at, 0, id);
  return out;
}

/**
 * Help (Hint: 1 piece, 50/50: 2 pieces): the line becomes the first `locked + n` pieces in the right order, locked;
 * the other pieces the player had placed stay in the line after them.
 */
export function lockNext(seq: readonly string[], tiles: readonly Tile[], line: readonly number[], locked: number, n: number): { line: number[]; locked: number } {
  const want = Math.min(seq.length, locked + n);
  const used = new Set<number>();
  const head: number[] = [];
  for (let i = 0; i < want; i++) {
    // keep the tile already there when it is right, otherwise the first free tile with that text
    const here = line[i];
    const pick = here !== undefined && !used.has(here) && tiles.find((t) => t.id === here)?.text === seq[i] ? here : tiles.find((t) => t.text === seq[i] && !used.has(t.id) && !head.includes(t.id))?.id;
    if (pick === undefined) break;
    used.add(pick); head.push(pick);
  }
  return { line: [...head, ...line.filter((id) => !used.has(id))], locked: head.length };
}

/** What a Live Challenge device sends: the pieces' texts in the order built (all pieces). */
export function orderResponse(elements: readonly string[], tiles: readonly Tile[], line: readonly number[]): string[] | null {
  if (line.length !== elements.length) return null;
  const out = line.map((id) => tiles.find((t) => t.id === id)?.text);
  return out.every((x): x is string => typeof x === "string") ? out : null;
}

export const buildSpeed = (ms: number, seconds = BUILD_SECONDS): number => Math.max(0, Math.min(1, 1 - ms / (seconds * 1000)));

/** Sentences are long pieces: shown one per row instead of as word chips. */
export const isSentencePieces = (seq: readonly string[]): boolean => seq.some((x) => x.trim().split(/\s+/).length > 3);
