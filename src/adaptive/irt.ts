/**
 * Item Response Theory primitives (1PL / 2PL / 3PL) and ability estimation.
 *
 * Why EAP (expected a posteriori) instead of maximum likelihood?
 *  - MLE is undefined for all-correct or all-wrong response strings, which is
 *    exactly what new learners produce. EAP always returns a finite, stable
 *    estimate pulled gently toward the prior, and gives a standard error we use
 *    as "confidence".
 *  - It is computed on a fixed quadrature grid: deterministic, fast (a few
 *    hundred multiplications per update) and easy to audit.
 */
import type { AbilityEstimate, ItemParams } from "../types/domain";

export type IrtModel = 1 | 2 | 3;

const D = 1.0; // logistic metric (no 1.7 scaling): b and theta share one scale

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Parameters actually used by a given model (Rasch ignores a and c, 2PL ignores c). */
export function effectiveParams(p: ItemParams, model: IrtModel): ItemParams {
  return {
    a: model === 1 ? 1 : p.a,
    b: p.b,
    c: model === 3 ? p.c : 0,
  };
}

/** P(correct | theta) for the chosen model. */
export function probability(theta: number, item: ItemParams, model: IrtModel = 2): number {
  const { a, b, c } = effectiveParams(item, model);
  return c + (1 - c) / (1 + Math.exp(-D * a * (theta - b)));
}

/** Fisher information of an item at theta. */
export function information(theta: number, item: ItemParams, model: IrtModel = 2): number {
  const { a, c } = effectiveParams(item, model);
  const p = probability(theta, item, model);
  if (p <= c || p >= 1) return 0;
  return (D * D * a * a * (1 - p) * ((p - c) / (1 - c)) ** 2) / p;
}

/**
 * Difficulty b that gives probability `targetP` of success for a student at
 * theta (closed form for 1PL/2PL; 3PL handled by inverting the curve).
 */
export function difficultyForTargetP(theta: number, targetP: number, a = 1, c = 0): number {
  const pStar = clamp((targetP - c) / (1 - c), 0.01, 0.99);
  return theta - Math.log(pStar / (1 - pStar)) / (D * a);
}

export interface WeightedResponse extends ItemParams {
  /** 0..1 credit (1 = correct). */
  credit: number;
  /** Evidence weight 0..1 (rapid guesses and hinted answers count less). */
  weight: number;
}

const GRID_STEP = 0.05;

/**
 * EAP estimate of theta with a normal prior.
 * Partial credit is treated as a fractional Bernoulli observation.
 */
export function estimateAbilityEAP(
  responses: WeightedResponse[],
  opts: { priorMean: number; priorSD: number; thetaMin: number; thetaMax: number; model: IrtModel },
): AbilityEstimate {
  const { priorMean, priorSD, thetaMin, thetaMax, model } = opts;
  let num = 0;
  let den = 0;
  let sq = 0;
  // log-space accumulation keeps long response strings numerically stable
  const logPost: number[] = [];
  const grid: number[] = [];
  for (let t = thetaMin; t <= thetaMax + 1e-9; t += GRID_STEP) {
    let lp = -0.5 * ((t - priorMean) / priorSD) ** 2;
    for (const r of responses) {
      if (r.weight <= 0) continue;
      const p = clamp(probability(t, r, model), 1e-9, 1 - 1e-9);
      lp += r.weight * (r.credit * Math.log(p) + (1 - r.credit) * Math.log(1 - p));
    }
    grid.push(t);
    logPost.push(lp);
  }
  const max = Math.max(...logPost);
  for (let i = 0; i < grid.length; i++) {
    const w = Math.exp(logPost[i] - max);
    num += grid[i] * w;
    den += w;
  }
  const theta = num / den;
  for (let i = 0; i < grid.length; i++) {
    const w = Math.exp(logPost[i] - max);
    sq += (grid[i] - theta) ** 2 * w;
  }
  return { theta, se: Math.sqrt(sq / den) };
}

/**
 * Apply the per-response step limit: theta may not move more than `maxStep`
 * away from the previous estimate after a single response. The EAP is already
 * smooth; this is a hard safety rail against outliers (e.g. a lucky 3PL guess).
 */
export function limitStep(previous: number, proposed: number, maxStep: number): number {
  return clamp(proposed, previous - maxStep, previous + maxStep);
}
