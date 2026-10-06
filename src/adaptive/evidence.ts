/**
 * Converts raw responses into weighted evidence.
 *
 * Response time is used for *evidence quality*, not to punish slow readers:
 *  - A rapid guess (much faster than anyone can read the item) carries little
 *    information, so it barely moves theta and earns no XP. This is also the
 *    main defence against "click randomly to collect points".
 *  - A hinted answer is not independent performance, so it counts half.
 * Slow-but-correct answers are NOT down-weighted; slowness is surfaced to
 * teachers through analytics/intervention rules instead.
 */
import type { AdaptiveConfig } from "../config/engine";
import type { ResponseEvidence } from "../types/domain";
import type { WeightedResponse } from "./irt";

export function isRapidGuess(r: Pick<ResponseEvidence, "responseMs" | "estimatedSeconds">, cfg: AdaptiveConfig): boolean {
  const threshold = Math.max(cfg.rapidGuessMinMs, cfg.rapidGuessFraction * r.estimatedSeconds * 1000);
  return r.responseMs < threshold;
}

export function evidenceWeight(r: ResponseEvidence, cfg: AdaptiveConfig): number {
  let w = 1;
  if (isRapidGuess(r, cfg)) w *= cfg.rapidGuessWeight;
  if (r.usedHint) w *= cfg.hintWeight;
  return w;
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
