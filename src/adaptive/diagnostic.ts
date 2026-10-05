/**
 * Placement / diagnostic check (pure logic).
 *
 * Goal: estimate a starting ability per domain (Reading, Vocabulary, Grammar,
 * Language/Mechanics, Word study…) in ~15–24 questions.
 *  - One ability (θ) per domain, estimated by EAP with a N(0,1) prior.
 *  - Items are chosen for MAXIMUM INFORMATION at the domain's current θ (≈50% success),
 *    unlike practice (≈72%), because the job here is measurement, not learning.
 *  - Domains rotate (least-measured first); within a domain the least-sampled skill is
 *    used, so the result covers the curriculum rather than one skill.
 *  - The target difficulty moves at most `maxTargetStep` per domain step (no jumps).
 *  - Stops when every domain has ≥ minPerDomain items and SE ≤ targetSE, or at maxItems.
 * Results are INTERNAL estimates, never presented as official MAP/RIT scores.
 */
import type { AdaptiveConfig } from "../config/engine";
import type { CandidateItem } from "../types/domain";
import { clamp, estimateAbilityEAP, information, type WeightedResponse } from "./irt";

export interface DiagnosticItem extends CandidateItem {
  domain: string;
}

export interface DiagnosticResponse {
  itemId: string;
  domain: string;
  skillId: string;
  correct: boolean;
  a: number;
  b: number;
  c: number;
  weight: number; // rapid guesses count less
}

export interface DiagnosticConfig {
  maxItems: number;
  minPerDomain: number;
  targetSE: number;
}

export const DEFAULT_DIAGNOSTIC: DiagnosticConfig = { maxItems: 24, minPerDomain: 4, targetSE: 0.5 };

export interface DomainEstimate {
  domain: string;
  theta: number;
  se: number;
  items: number;
  correct: number;
}

export function domainEstimates(domains: string[], responses: DiagnosticResponse[], cfg: AdaptiveConfig): DomainEstimate[] {
  return domains.map((domain) => {
    const rs = responses.filter((r) => r.domain === domain);
    const est = estimateAbilityEAP(
      rs.map<WeightedResponse>((r) => ({ a: r.a, b: r.b, c: r.c, credit: r.correct ? 1 : 0, weight: r.weight })),
      { priorMean: 0, priorSD: 1, thetaMin: cfg.thetaMin, thetaMax: cfg.thetaMax, model: cfg.model },
    );
    return { domain, theta: est.theta, se: est.se, items: rs.length, correct: rs.filter((r) => r.correct).length };
  });
}

export function overallEstimate(responses: DiagnosticResponse[], cfg: AdaptiveConfig) {
  return estimateAbilityEAP(
    responses.map((r) => ({ a: r.a, b: r.b, c: r.c, credit: r.correct ? 1 : 0, weight: r.weight })),
    { priorMean: 0, priorSD: 1, thetaMin: cfg.thetaMin, thetaMax: cfg.thetaMax, model: cfg.model },
  );
}

export function isDiagnosticComplete(domains: string[], responses: DiagnosticResponse[], cfg: AdaptiveConfig, d: DiagnosticConfig = DEFAULT_DIAGNOSTIC): boolean {
  if (responses.length >= d.maxItems) return true;
  return domainEstimates(domains, responses, cfg).every((e) => e.items >= d.minPerDomain && e.se <= d.targetSE);
}

export interface DiagnosticPick {
  item: DiagnosticItem | null;
  domain: string | null;
  targetB: number;
  reason: string;
}

export function nextDiagnosticItem(
  pool: DiagnosticItem[],
  responses: DiagnosticResponse[],
  lastTargetByDomain: Record<string, number>,
  cfg: AdaptiveConfig,
  d: DiagnosticConfig = DEFAULT_DIAGNOSTIC,
): DiagnosticPick {
  const domains = [...new Set(pool.map((p) => p.domain))].sort();
  const used = new Set(responses.map((r) => r.itemId));
  const est = domainEstimates(domains, responses, cfg);
  // least-measured domain first: fewer items, then larger SE
  const open = est
    .filter((e) => (e.items < d.minPerDomain || e.se > d.targetSE) && pool.some((p) => p.domain === e.domain && !used.has(p.id)))
    .sort((x, y) => x.items - y.items || y.se - x.se);
  const fallback = est.filter((e) => pool.some((p) => p.domain === e.domain && !used.has(p.id))).sort((x, y) => y.se - x.se);
  const pick = open[0] ?? fallback[0];
  if (!pick) return { item: null, domain: null, targetB: 0, reason: "No unused items remain." };

  const prev = lastTargetByDomain[pick.domain];
  const target = prev === undefined ? clamp(pick.theta, cfg.thetaMin, cfg.thetaMax) : clamp(pick.theta, prev - cfg.maxTargetStep, prev + cfg.maxTargetStep);
  const skillCounts = new Map<string, number>();
  for (const r of responses.filter((r) => r.domain === pick.domain)) skillCounts.set(r.skillId, (skillCounts.get(r.skillId) ?? 0) + 1);
  const candidates = pool.filter((p) => p.domain === pick.domain && !used.has(p.id));
  const fewest = Math.min(...candidates.map((c) => skillCounts.get(c.skillId) ?? 0));
  const coverage = candidates.filter((c) => (skillCounts.get(c.skillId) ?? 0) === fewest);
  const best = coverage
    .map((c) => ({ c, score: information(target, c, cfg.model) - 0.3 * Math.abs(c.b - target) }))
    .sort((x, y) => y.score - x.score)[0].c;
  return {
    item: best,
    domain: pick.domain,
    targetB: target,
    reason: `Measuring ${pick.domain.toLowerCase()} (θ=${pick.theta.toFixed(2)}, SE=${pick.se.toFixed(2)}, ${pick.items} items so far); item at b=${best.b.toFixed(2)} gives the most information near the target ${target.toFixed(2)}.`,
  };
}

/** Plain-language placement labels (internal scale; not MAP/RIT). */
export function proficiencyLabel(theta: number): string {
  if (theta < -1.0) return "Below grade level";
  if (theta < -0.35) return "Approaching grade level";
  if (theta <= 0.75) return "At grade level";
  return "Above grade level";
}
