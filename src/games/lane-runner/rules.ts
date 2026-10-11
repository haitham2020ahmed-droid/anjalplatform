/**
 * 🏃 Lane Runner rules (pure, no React — the meta's `fits`, the game and the tests share them).
 *
 * The runner moves forward on a track with one lane per answer choice (2–4). A row of gates — one choice on each —
 * comes towards the runner; the student switches to the lane with the right answer before the gates arrive (or
 * dashes through early for a speed bonus). The lane the runner is in when the gates arrive is the answer.
 */
import type { PlayLevel, PlayQuestion } from "../types";

export const MIN_LANES = 2;
export const MAX_LANES = 4;
/** a gate sign holds at most this much text */
export const MAX_GATE_CHARS = 48;

/** The meta's `fits`: 2–4 choices with exactly one right one, each short enough for a gate sign. */
export function fitsLaneRunner(q: PlayQuestion): boolean {
  const o = q.options ?? [];
  if (o.length < MIN_LANES || o.length > MAX_LANES) return false;
  if (o.filter((x) => x.correct).length !== 1) return false;
  return o.every((x) => { const t = x.text.trim(); return t.length > 0 && t.length <= MAX_GATE_CHARS; });
}

/** seconds the gates take to reach the runner (time to read and switch lanes) */
export const APPROACH_SECONDS: Record<PlayLevel, number> = { BELOW: 13, ON: 11, ABOVE: 9 };

/** The lane the runner starts in: the middle (left of middle for an even count). */
export const startLane = (n: number): number => Math.max(0, Math.floor((n - 1) / 2));

/**
 * One step left (-1) or right (+1), jumping over blocked lanes (50/50 closes two wrong lanes). Stays put at the
 * edge or when every lane that way is blocked.
 */
export function moveLane(lane: number, dir: -1 | 1, n: number, blocked: readonly number[] = []): number {
  for (let l = lane + dir; l >= 0 && l < n; l += dir) if (!blocked.includes(l)) return l;
  return lane;
}

/** If the runner stands in a lane that has just been blocked, the nearest open lane (left first). */
export function nearestOpen(lane: number, n: number, blocked: readonly number[]): number {
  if (!blocked.includes(lane)) return lane;
  for (let d = 1; d < n; d++) { if (lane - d >= 0 && !blocked.includes(lane - d)) return lane - d; if (lane + d < n && !blocked.includes(lane + d)) return lane + d; }
  return lane;
}

/** Speed bonus 0–1 from how far the gates still were (dashing early = faster answer). */
export const dashSpeed = (progress: number): number => Math.max(0, Math.min(1, 1 - progress));

/** How far the gates have come (0 = far away, 1 = at the runner) after `elapsed` of `approach` seconds. */
export const gateProgress = (elapsed: number, approach: number): number => Math.max(0, Math.min(1, elapsed / Math.max(1, approach)));
