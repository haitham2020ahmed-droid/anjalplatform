/**
 * 🫧 Word Pop rules (pure, no React — the meta's `fits`, the game and the tests share them).
 *
 * Every answer choice floats up in a bubble. The student pops ONLY the right ones:
 *   - sorting items (bank MULTI_SELECT, e.g. "Which words are verbs?"): pop every right word; popping a wrong word
 *     ends the question as not correct (the bank's own rule: any wrong choice → no credit)
 *   - True/False: two bubbles, pop the true answer
 *   - multiple choice with SHORT word choices (a word or a short phrase): pop the one right word
 */
import type { PlayQuestion } from "../types";

/** a bubble holds at most this much text */
export const MAX_WORDS = 3;
export const MAX_CHARS = 26;
export const MAX_BUBBLES = 6;

const short = (s: string) => { const t = s.trim(); return t.length > 0 && t.length <= MAX_CHARS && t.split(/\s+/).length <= MAX_WORDS; };

/** The meta's `fits`: True/False always; choice items only when every choice fits in a bubble (2–6 choices). */
export function fitsWordPop(q: PlayQuestion): boolean {
  if (q.type === "TRUE_FALSE") return typeof q.answer === "boolean";
  const o = q.options ?? [];
  if (o.length < 2 || o.length > MAX_BUBBLES || !o.some((x) => x.correct) || o.every((x) => x.correct)) return false;
  if (q.type === "MULTIPLE_CHOICE" && o.filter((x) => x.correct).length !== 1) return false;
  return o.every((x) => short(x.text));
}

/** The labels to pop. */
export const popTargets = (q: PlayQuestion): string[] => (q.options ?? []).filter((o) => o.correct).map((o) => o.label);

/** many right bubbles (a sorting item) or exactly one */
export const isSorting = (q: Pick<PlayQuestion, "type">): boolean => q.type === "MULTI_SELECT";

/**
 * What popping `label` does, given the bubbles already popped:
 *   "wrong" — a wrong bubble: the question ends, not correct
 *   "right" — the last right bubble: the question ends, correct
 *   "more"  — a right bubble, more right ones are still floating (sorting items)
 *   "none"  — already popped / unknown
 */
export function popOutcome(q: PlayQuestion, popped: readonly string[], label: string): "wrong" | "right" | "more" | "none" {
  const o = q.options?.find((x) => x.label === label);
  if (!o || popped.includes(label)) return "none";
  if (!o.correct) return "wrong";
  const left = popTargets(q).filter((l) => l !== label && !popped.includes(l));
  return left.length ? "more" : "right";
}

// ------------------------------------------------------------------ bubble layout (no two bubbles ever overlap)

/** bubbles rise faster for higher levels (px per second) */
export const RISE_SPEED = { BELOW: 42, ON: 52, ABOVE: 62 } as const;

export interface Arena { width: number; height: number }

/** Columns and bubble size for an arena: 2–4 columns, bubbles 76–124 px (always ≥ 44 px touch targets). */
export function layout(n: number, a: Arena): { cols: number; size: number } {
  const cols = Math.max(1, Math.min(n, a.width < 520 ? 3 : 4));
  const size = Math.round(Math.max(76, Math.min(124, a.width / cols - 12)));
  return { cols, size };
}

/**
 * Where bubble `i` of `n` is at time `t` (seconds): each column holds its bubbles evenly spaced on one loop, all
 * rising at the same speed, so bubbles never overlap; a bubble leaving the top comes back from the bottom.
 */
export function bubbleAt(i: number, n: number, a: Arena, t: number, speed: number): { x: number; y: number; size: number } {
  const { cols, size } = layout(n, a);
  const col = i % cols, inCol = Math.ceil((n - col) / cols), slot = Math.floor(i / cols);
  const period = a.height + size;
  const offset = (slot * period) / Math.max(1, inCol) + col * period * 0.37;
  const travelled = ((t * speed + offset) % period + period) % period;
  const colW = a.width / cols;
  const sway = Math.sin(t * 1.4 + i * 1.7) * Math.min(8, Math.max(0, (colW - size) / 2));
  return { x: Math.round(col * colW + (colW - size) / 2 + sway), y: Math.round(a.height - travelled), size };
}
