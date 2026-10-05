/**
 * Item analysis and calibration (pure functions; the nightly job feeds them).
 *
 * Statistics per question (rapid guesses excluded):
 *   p-value (proportion correct), point-biserial discrimination (correct vs the student's
 *   ability BEFORE answering), average time, distractor choice counts, rapid-guess rate.
 * Flags (only with enough evidence):
 *   TOO_EASY p>0.95 · TOO_HARD p<0.20 · LOW_DISCRIMINATION r<0.15 · NEGATIVE_DISCRIMINATION r<0
 *   DISTRACTOR_NEVER_CHOSEN · POSSIBLE_KEY_ERROR (strong students prefer a distractor to the key)
 *   SLOW (avg time > 2× expected) · HIGH_RAPID_GUESSING (>25% rapid)
 *
 * Calibration: MAP estimate of difficulty b (and discrimination a for 2PL) with the
 * student abilities fixed at their pre-answer estimates, a normal prior centred on the
 * AUTHORED difficulty (so thin data cannot swing an item wildly), and a cap on how far
 * b may move in one run.
 */
import { probability } from "../adaptive/irt";

export interface ItemResponse {
  questionId: string;
  correct: boolean;
  responseMs: number;
  rapid: boolean;
  chosen: string | null; // option label for single-choice items
  ability: number; // θ before answering
}

export interface ItemMeta {
  questionId: string;
  estimatedSeconds: number;
  optionLabels: string[];
  keyLabels: string[];
  a: number;
  b: number;
  c: number;
  authoredB: number;
}

export type ItemFlag =
  | "TOO_EASY" | "TOO_HARD" | "LOW_DISCRIMINATION" | "NEGATIVE_DISCRIMINATION"
  | "DISTRACTOR_NEVER_CHOSEN" | "POSSIBLE_KEY_ERROR" | "SLOW" | "HIGH_RAPID_GUESSING";

export interface ItemStats {
  questionId: string;
  attempts: number; // non-rapid
  correct: number;
  pValue: number | null;
  pointBiserial: number | null;
  avgResponseMs: number | null;
  rapidRate: number;
  distractorCounts: Record<string, number>;
  flags: ItemFlag[];
}

export const STAT_THRESHOLDS = { minForDifficulty: 30, minForDiscrimination: 50, minTopGroup: 15 };

function pointBiserial(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  return vx === 0 || vy === 0 ? null : cov / Math.sqrt(vx * vy);
}

export function computeItemStats(meta: ItemMeta, all: ItemResponse[]): ItemStats {
  const rs = all.filter((r) => !r.rapid);
  const n = rs.length;
  const correct = rs.filter((r) => r.correct).length;
  const p = n ? correct / n : null;
  const pb = pointBiserial(rs.map((r) => (r.correct ? 1 : 0)), rs.map((r) => r.ability));
  const avg = n ? rs.reduce((a, r) => a + r.responseMs, 0) / n : null;
  const counts: Record<string, number> = Object.fromEntries(meta.optionLabels.map((l) => [l, 0]));
  for (const r of rs) if (r.chosen && r.chosen in counts) counts[r.chosen]++;
  const flags: ItemFlag[] = [];
  const T = STAT_THRESHOLDS;
  if (p !== null && n >= T.minForDifficulty) {
    if (p > 0.95) flags.push("TOO_EASY");
    if (p < 0.2) flags.push("TOO_HARD");
  }
  if (pb !== null && n >= T.minForDiscrimination) {
    if (pb < 0) flags.push("NEGATIVE_DISCRIMINATION");
    else if (pb < 0.15) flags.push("LOW_DISCRIMINATION");
  }
  if (meta.optionLabels.length && n >= T.minForDiscrimination) {
    if (meta.optionLabels.some((l) => !meta.keyLabels.includes(l) && counts[l] === 0)) flags.push("DISTRACTOR_NEVER_CHOSEN");
    const sorted = [...rs].sort((a, b) => b.ability - a.ability);
    const top = sorted.slice(0, Math.ceil(sorted.length / 3)).filter((r) => r.chosen);
    if (top.length >= T.minTopGroup) {
      const topCounts: Record<string, number> = {};
      for (const r of top) topCounts[r.chosen!] = (topCounts[r.chosen!] ?? 0) + 1;
      const keyTop = Math.max(...meta.keyLabels.map((k) => topCounts[k] ?? 0));
      if (Object.entries(topCounts).some(([l, c]) => !meta.keyLabels.includes(l) && c > keyTop)) flags.push("POSSIBLE_KEY_ERROR");
    }
  }
  if (avg !== null && n >= T.minForDifficulty && avg > 2 * meta.estimatedSeconds * 1000) flags.push("SLOW");
  const rapidRate = all.length ? (all.length - n) / all.length : 0;
  if (all.length >= T.minForDifficulty && rapidRate > 0.25) flags.push("HIGH_RAPID_GUESSING");
  return { questionId: meta.questionId, attempts: n, correct, pValue: p, pointBiserial: pb, avgResponseMs: avg, rapidRate, distractorCounts: counts, flags };
}

export interface CalibrationOptions {
  minResponses: number; // default 200
  priorSD: number; // spread of the prior around the authored difficulty
  maxStep: number; // largest change of b in one run
  estimateA: boolean; // 2PL
  aMin: number;
  aMax: number;
}

export const DEFAULT_CALIBRATION: CalibrationOptions = { minResponses: 200, priorSD: 0.7, maxStep: 0.5, estimateA: true, aMin: 0.4, aMax: 2.5 };

export interface CalibrationResult {
  questionId: string;
  calibrated: boolean;
  reason: string;
  oldB: number;
  newB: number;
  oldA: number;
  newA: number;
  n: number;
}

/** Log-posterior of (a, b) given fixed abilities, with priors b ~ N(authoredB, priorSD), log a ~ N(0, 0.3). */
function logPost(a: number, b: number, c: number, rs: { theta: number; correct: boolean }[], authoredB: number, o: CalibrationOptions): number {
  let lp = -0.5 * ((b - authoredB) / o.priorSD) ** 2 - 0.5 * (Math.log(a) / 0.3) ** 2;
  for (const r of rs) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, probability(r.theta, { a, b, c }, 3)));
    lp += r.correct ? Math.log(p) : Math.log(1 - p);
  }
  return lp;
}

export function calibrateItem(meta: ItemMeta, responses: ItemResponse[], o: CalibrationOptions = DEFAULT_CALIBRATION): CalibrationResult {
  const rs = responses.filter((r) => !r.rapid).map((r) => ({ theta: r.ability, correct: r.correct }));
  const base = { questionId: meta.questionId, oldB: meta.b, oldA: meta.a, n: rs.length };
  if (rs.length < o.minResponses) return { ...base, calibrated: false, reason: `Needs ${o.minResponses} responses (has ${rs.length}).`, newB: meta.b, newA: meta.a };
  // b: 1-D search on a fine grid around the authored value (robust, no derivatives needed)
  let bestB = meta.b, best = -Infinity;
  for (let b = meta.authoredB - 3; b <= meta.authoredB + 3; b += 0.01) {
    const v = logPost(meta.a, b, meta.c, rs, meta.authoredB, o);
    if (v > best) { best = v; bestB = b; }
  }
  let bestA = meta.a;
  if (o.estimateA) {
    best = -Infinity;
    for (let a = o.aMin; a <= o.aMax; a += 0.01) {
      const v = logPost(a, bestB, meta.c, rs, meta.authoredB, o);
      if (v > best) { best = v; bestA = a; }
    }
    // re-fit b with the new a
    best = -Infinity;
    for (let b = meta.authoredB - 3; b <= meta.authoredB + 3; b += 0.01) {
      const v = logPost(bestA, b, meta.c, rs, meta.authoredB, o);
      if (v > best) { best = v; bestB = b; }
    }
  }
  const step = Math.max(-o.maxStep, Math.min(o.maxStep, bestB - meta.b));
  const newB = Math.round((meta.b + step) * 1000) / 1000;
  return {
    ...base, calibrated: true, newB, newA: Math.round(bestA * 1000) / 1000,
    reason: Math.abs(bestB - meta.b) > o.maxStep ? `Estimated b=${bestB.toFixed(2)}; moved ${o.maxStep} this run (limit).` : `Estimated from ${rs.length} responses.`,
  };
}
