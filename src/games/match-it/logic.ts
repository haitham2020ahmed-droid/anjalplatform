/**
 * 🔗 Match It — the rules (pure, no React): which bank questions fit, how a board is checked, and what a Live
 * Challenge device sends. The bank's own scorer (scoreResponse, MATCHING) gets `{ left: right }` and counts the
 * board right only when every pair is right — solo play uses exactly the same rule.
 */
import type { PlayQuestion } from "../types";

export const MIN_PAIRS = 3;
export const MAX_PAIRS = 6;
/** a pair's text is short enough for a card on a phone */
export const MAX_TEXT = 90;
/** seconds a board may take before the speed bonus is gone */
export const BOARD_SECONDS = 40;

const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** A MATCHING question with 3–6 pairs, no empty or very long cards, and no two cards alike on the same side. */
export function fitsMatch(q: Pick<PlayQuestion, "type" | "pairs">): boolean {
  if (q.type !== "MATCHING" || !q.pairs) return false;
  const p = q.pairs;
  if (p.length < MIN_PAIRS || p.length > MAX_PAIRS) return false;
  if (p.some((x) => typeof x.left !== "string" || typeof x.right !== "string" || !x.left.trim() || !x.right.trim() || x.left.length > MAX_TEXT || x.right.length > MAX_TEXT)) return false;
  return new Set(p.map((x) => clean(x.left))).size === p.length && new Set(p.map((x) => clean(x.right))).size === p.length;
}

export function shuffle<T>(arr: readonly T[], rnd: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** The right-hand cards in a new order (never the answer order when it can be avoided). */
export function scrambleRights(pairs: { left: string; right: string }[], rnd: () => number = Math.random): string[] {
  const rights = pairs.map((p) => p.right);
  for (let i = 0; i < 6; i++) { const s = shuffle(rights, rnd); if (s.some((r, k) => r !== rights[k])) return s; }
  return [...rights.slice(1), rights[0]];
}

/** Pair a left card with a right card; a right card belongs to one left card only (the old link is undone). */
export function link(chosen: Record<string, string>, left: string, right: string): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [l, r] of Object.entries(chosen)) if (l !== left && r !== right) next[l] = r;
  next[left] = right;
  return next;
}

export function unlink(chosen: Record<string, string>, left: string): Record<string, string> {
  const next = { ...chosen };
  delete next[left];
  return next;
}

/** Check a finished board: right only when every pair is right (as the bank scores it). */
export function checkBoard(pairs: { left: string; right: string }[], chosen: Record<string, string>): { correct: boolean; wrong: string[] } {
  const wrong = pairs.filter((p) => chosen[p.left] !== p.right).map((p) => p.left);
  return { correct: wrong.length === 0, wrong };
}

/** Lefts to pair for the player (Hint: 1, 50/50: 2) — the ones not yet paired right, in board order. */
export function helpPairs(pairs: { left: string; right: string }[], chosen: Record<string, string>, locked: string[], n: number): string[] {
  return pairs.filter((p) => !locked.includes(p.left) && chosen[p.left] !== p.right).slice(0, n).map((p) => p.left);
}

/** Lock pairs in (right), moving any card that was in the way. */
export function lockIn(pairs: { left: string; right: string }[], chosen: Record<string, string>, lefts: string[]): Record<string, string> {
  let next = chosen;
  for (const l of lefts) { const p = pairs.find((x) => x.left === l); if (p) next = link(next, p.left, p.right); }
  return next;
}

/** What a Live Challenge device sends: `{ left: right }` for every left card (only cards that were shown). */
export function matchResponse(lefts: string[], rights: string[], chosen: Record<string, string>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const l of lefts) { const r = chosen[l]; if (typeof r !== "string" || !rights.includes(r)) return null; out[l] = r; }
  return out;
}

/** Speed 0–1 for the points (a quick board scores a little more). */
export const boardSpeed = (ms: number, seconds = BOARD_SECONDS): number => Math.max(0, Math.min(1, 1 - ms / (seconds * 1000)));
