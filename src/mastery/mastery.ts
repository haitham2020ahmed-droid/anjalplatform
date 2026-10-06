/**
 * Skill mastery (internal platform metric, 0-100).
 *
 *   raw      = wA·Ability + wR·RecentAccuracy + wC·Consistency
 *   evidence = 1 − exp(−effectiveN / evidenceScale)
 *   score    = 100 · raw · evidence · decay      then evidence gates may cap it
 *
 * Ability        Confidence-adjusted ability: θ_low = θ − SE, mapped to 0–1 by
 *                σ(1.30·(θ_low + 0.69)), anchored so θ_low = +1.0 → 0.90 (Mastered),
 *                +0.3 → 0.78 (Proficient), −1.0 → 0.40 (Developing).
 *                Why ability dominates: adaptive practice deliberately keeps every
 *                student near ~72% success, so raw accuracy cannot tell a strong
 *                student from a weak one — the difficulty they succeed at can.
 *                (Found by the Phase 2 simulation: an accuracy-heavy formula left
 *                students far above grade level stuck at ~68.)
 * RecentAccuracy recency-weighted (half-life 6 responses), difficulty-weighted
 *                accuracy: a correct level-6 answer counts more than a level-1.
 * Consistency    1 − normalised variability of the last N outcomes, so a
 *                streaky right/wrong pattern scores lower than a stable one.
 * effectiveN     responses weighted for independence (rapid guesses and hints
 *                count less), so clicking fast cannot manufacture evidence.
 * Gates          PROFICIENT needs ≥ minAttemptsForProficient; MASTERED needs
 *                ≥ minAttemptsForMastered, a correct answer at level ≥ 5 and
 *                ≥ 80 % recent accuracy. Without them the score is capped just
 *                below the band.
 * Decay          after 30 idle days the score fades slowly (2 %/week, floor 85 %)
 *                so "needs review" skills resurface in recommendations.
 *
 * Example: 2 easy correct answers → effectiveN 2 → evidence ≈ 0.39 → score ≈ 25
 * (BEGINNING). Mastery cannot be reached by a short lucky run.
 */
import type { AdaptiveConfig, MasteryThresholds } from "../config/engine";
import type { MasteryBandName, MasteryResult, ResponseEvidence } from "../types/domain";
import { evidenceWeight } from "../adaptive/evidence";

const ABILITY_SLOPE = 1.3;
const ABILITY_CENTER = -0.69;
const RECENCY_HALF_LIFE = 6;

export function bandFor(score: number, t: MasteryThresholds): MasteryBandName {
  const b = t.bands;
  if (score >= b.mastered) return "MASTERED";
  if (score >= b.proficient) return "PROFICIENT";
  if (score >= b.approaching) return "APPROACHING";
  if (score >= b.developing) return "DEVELOPING";
  return "BEGINNING";
}

function credit(r: ResponseEvidence): number {
  return r.credit ?? (r.correct ? 1 : 0);
}

/**
 * @param history  all responses for this student × skill, oldest first
 * @param theta    current skill ability estimate
 * @param now      evaluation time (injectable for tests)
 */
export function computeMastery(
  history: ResponseEvidence[],
  theta: number,
  thresholds: MasteryThresholds,
  adaptive: AdaptiveConfig,
  now: Date = new Date(),
  se = 0.5,
): MasteryResult {
  const empty: MasteryResult = {
    score: 0,
    band: "BEGINNING",
    isMastered: false,
    components: { ability: 0, recentAccuracy: 0, consistency: 0, evidence: 0, raw: 0, cappedBy: null, decayFactor: 1, effectiveN: 0, maxLevelCorrect: 0 },
  };
  if (history.length === 0) return empty;

  // Ability component (confidence-adjusted)
  const thetaLow = theta - se;
  const ability = 1 / (1 + Math.exp(-ABILITY_SLOPE * (thetaLow - ABILITY_CENTER)));

  // Recency- and difficulty-weighted accuracy
  let wSum = 0;
  let wCorrect = 0;
  const n = history.length;
  history.forEach((r, i) => {
    const age = n - 1 - i;
    const recency = Math.pow(0.5, age / RECENCY_HALF_LIFE);
    const difficulty = 0.6 + 0.1 * r.level; // level 1 → 0.7 … level 7 → 1.3
    const w = recency * difficulty * evidenceWeight(r, adaptive);
    wSum += w;
    // a wrong answer on a hard item is penalised less than a wrong easy one
    const penaltyScale = r.correct ? 1 : 2 - difficulty;
    wCorrect += w * credit(r);
    wSum += w * (penaltyScale - 1) * (1 - credit(r));
  });
  const recentAccuracy = wSum > 0 ? Math.max(0, Math.min(1, wCorrect / wSum)) : 0;

  // Consistency over the recent window
  const recent = history.slice(-adaptive.recentWindow).map(credit);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length;
  const consistency = 1 - Math.min(1, variance / 0.25) * 0.6; // variance 0.25 = max (50/50)

  // Evidence
  const effectiveN = history.reduce((a, r) => a + evidenceWeight(r, adaptive), 0);
  const evidence = 1 - Math.exp(-effectiveN / thresholds.evidenceScale);

  const w = thresholds.weights;
  const raw = w.ability * ability + w.recentAccuracy * recentAccuracy + w.consistency * consistency * mean;

  // Retention decay
  const last = new Date(history[history.length - 1].at).getTime();
  const idleDays = (now.getTime() - last) / 86_400_000;
  let decayFactor = 1;
  if (idleDays > thresholds.decayAfterDays) {
    const weeks = (idleDays - thresholds.decayAfterDays) / 7;
    decayFactor = Math.max(thresholds.decayFloor, 1 - thresholds.decayPerWeek * weeks);
  }

  let score = 100 * raw * evidence * decayFactor;

  // Evidence gates
  const independent = history.filter((r) => evidenceWeight(r, adaptive) >= 0.99);
  const maxLevelCorrect = independent.filter((r) => r.correct).reduce((m, r) => Math.max(m, r.level), 0);
  const recentAcc = recent.length ? mean : 0;
  const b = thresholds.bands;
  let cappedBy: string | null = null;
  if (score >= b.proficient && effectiveN < thresholds.minAttemptsForProficient) {
    score = b.proficient - 1;
    cappedBy = `needs ${thresholds.minAttemptsForProficient} independent answers for Proficient`;
  }
  if (score >= b.mastered) {
    if (effectiveN < thresholds.minAttemptsForMastered) {
      score = b.mastered - 1;
      cappedBy = `needs ${thresholds.minAttemptsForMastered} independent answers for Mastered`;
    } else if (maxLevelCorrect < thresholds.minLevelReachedForMastered) {
      score = b.mastered - 1;
      cappedBy = `needs a correct answer at level ${thresholds.minLevelReachedForMastered}+`;
    } else if (recentAcc < thresholds.minRecentAccuracyForMastered) {
      score = b.mastered - 1;
      cappedBy = `needs ${Math.round(thresholds.minRecentAccuracyForMastered * 100)}% accuracy on the last ${adaptive.recentWindow}`;
    }
  }

  score = Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
  const band = bandFor(score, thresholds);
  return {
    score,
    band,
    isMastered: band === "MASTERED",
    components: {
      ability: round3(ability),
      recentAccuracy: round3(recentAccuracy),
      consistency: round3(consistency),
      evidence: round3(evidence),
      raw: round3(raw),
      cappedBy,
      decayFactor: round3(decayFactor),
      effectiveN: round3(effectiveN),
      maxLevelCorrect,
    },
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
