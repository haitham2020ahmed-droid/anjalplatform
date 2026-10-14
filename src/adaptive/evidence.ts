/**
 * Converts raw responses into weighted evidence.
 *
 * Response time is used for *evidence quality*, not to punish slow readers:
 *  - A rapid guess (much faster than anyone can read the item) carries little
 *    information, so it barely moves theta and earns no XP. This is also the
 *    main defence against "click randomly to collect points".
 *  - A hinted answer is not independent performance, so it counts half.
 *  - A repeated question (already answered before) may be remembered, not understood: it counts half.
 * Slow-but-correct answers are NOT down-weighted; slowness is surfaced to
 * teachers through analytics/intervention rules instead.
 */
import type { AdaptiveConfig } from "../config/engine";
import type { ResponseEvidence } from "../types/domain";
import type { WeightedResponse } from "./irt";

export function isRapidGuess(r: Pick<ResponseEvidence, "responseMs" | "estimatedSeconds" | "rapid">, cfg: AdaptiveConfig): boolean {
  // r67: the server decides with the owner's rule (3 s, a passage's reading time, the item's own time) when it knows
  if (r.rapid !== undefined) return r.rapid;
  const threshold = Math.max(cfg.rapidGuessMinMs, cfg.rapidGuessFraction * r.estimatedSeconds * 1000);
  return r.responseMs < threshold;
}

export function evidenceWeight(r: ResponseEvidence, cfg: AdaptiveConfig): number {
  let w = 1;
  // r67: a rapid guess counts for nothing (weight 0, whatever an older school setting says)
  if (isRapidGuess(r, cfg)) return 0;
  if (r.usedHint) w *= cfg.hintWeight;
  if (r.repeat) w *= cfg.repeatWeight ?? 0.5;
  if (r.sourceWeight !== undefined) w *= Math.max(0, Math.min(1, r.sourceWeight));
  return w;
}

/** A question met again within this many answers or days may be remembered, not understood. */
export const REPEAT_WINDOW_ANSWERS = 10;
export const REPEAT_WINDOW_DAYS = 2;

/**
 * Marks answers to a question the student answered recently (within the last 10 answers or 2 days; list oldest
 * first). A question met again after a longer gap tests retention, so it counts in full.
 */
export function markRepeats<T extends { itemId: string; at: string; repeat?: boolean }>(history: T[]): T[] {
  const last = new Map<string, { i: number; t: number }>();
  return history.map((h, i) => {
    const t = new Date(h.at).getTime(), prev = last.get(h.itemId);
    last.set(h.itemId, { i, t });
    return prev && (i - prev.i <= REPEAT_WINDOW_ANSWERS || t - prev.t <= REPEAT_WINDOW_DAYS * 86_400_000) ? { ...h, repeat: true } : h;
  });
}

/** Whether a new answer to `itemId` at `at` is a recent repeat, given the history (oldest first). */
export function isRecentRepeat(history: { itemId: string; at: string }[], itemId: string, at: string): boolean {
  for (let k = history.length - 1; k >= 0; k--) {
    if (history[k].itemId !== itemId) continue;
    return history.length - k <= REPEAT_WINDOW_ANSWERS || new Date(at).getTime() - new Date(history[k].at).getTime() <= REPEAT_WINDOW_DAYS * 86_400_000;
  }
  return false;
}

export function toWeighted(r: ResponseEvidence, cfg: AdaptiveConfig): WeightedResponse {
  return {
    a: r.a,
    b: r.b,
    c: r.c,
    credit: r.credit ?? (r.correct ? 1 : 0),
    weight: evidenceWeight(r, cfg),
  };
}
