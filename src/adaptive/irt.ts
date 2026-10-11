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
 * Grid values shared between EAP estimates (Update 40): for one item (effective a, b, c) the log-probabilities at
 * every grid point are the same in every estimate on the same grid, so a caller that estimates many students at once
 * (levelThetas) passes one cache and each item's logs are computed once instead of once per answer. The cached
 * numbers are exactly the ones the loop would compute, and they are added in the same order, so the estimate is
 * bit-for-bit the same with or without the cache.
 */
export type EapCache = Map<string, Map<number, Map<number, Map<number, { lp: Float64Array; lq: Float64Array }>>>>;

/**
 * EAP estimate of theta with a normal prior.
 * Partial credit is treated as a fractional Bernoulli observation.
 */
export function estimateAbilityEAP(
  responses: WeightedResponse[],
  opts: { priorMean: number; priorSD: number; thetaMin: number; thetaMax: number; model: IrtModel; cache?: EapCache },
): AbilityEstimate {
  const { priorMean, priorSD, thetaMin, thetaMax, model } = opts;
  let num = 0;
  let den = 0;
  let sq = 0;
  // log-space accumulation keeps long response strings numerically stable
  const logPost: number[] = [];
  const grid: number[] = [];
  for (let t = thetaMin; t <= thetaMax + 1e-9; t += GRID_STEP) grid.push(t);
  const G = grid.length;
  // Update 40 (speed, same arithmetic): each response's effective parameters are worked out once, and its two
  // log-probabilities at every grid point are computed once (or taken from the shared cache) instead of at every
  // grid point of every answer; for credit 0 or 1 the term multiplied by 0 is skipped — x·0 adds an exact zero.
  // Every grid value is therefore bit-for-bit the one of the plain formula (tests/update40-health).
  const LP: Float64Array[] = [], LQ: Float64Array[] = [], W: number[] = [], K: number[] = [];
  // cache: grid → a → b → c (number keys, no string per answer)
  const shared: EapCache = opts.cache ?? new Map();
  const gridKey = `${thetaMin}|${thetaMax}`;
  let byA = shared.get(gridKey);
  if (!byA) { byA = new Map(); shared.set(gridKey, byA); }
  for (const r of responses) {
    if (r.weight <= 0) continue;
    // effectiveParams without an object per answer (same values)
    const ea = model === 1 ? 1 : r.a, eb = r.b, ec = model === 3 ? r.c : 0;
    const na = -D * ea;
    let byB = byA.get(na); if (!byB) { byB = new Map(); byA.set(na, byB); }
    let byC = byB.get(eb); if (!byC) { byC = new Map(); byB.set(eb, byC); }
    let v = byC.get(ec);
    if (!v) {
      const lp = new Float64Array(G), lq = new Float64Array(G);
      for (let j = 0; j < G; j++) {
        const p = clamp(ec + (1 - ec) / (1 + Math.exp(na * (grid[j] - eb))), 1e-9, 1 - 1e-9);
        lp[j] = Math.log(p); lq[j] = Math.log(1 - p);
      }
      v = { lp, lq };
      byC.set(ec, v);
    }
    LP.push(v.lp); LQ.push(v.lq); W.push(r.weight); K.push(r.credit);
  }
  const m = W.length;
  for (let j = 0; j < G; j++) {
    const t = grid[j];
    let lp = -0.5 * ((t - priorMean) / priorSD) ** 2;
    for (let i = 0; i < m; i++) {
      const k = K[i];
      lp += W[i] * (k === 1 ? LP[i][j] : k === 0 ? LQ[i][j] : k * LP[i][j] + (1 - k) * LQ[i][j]);
    }
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
