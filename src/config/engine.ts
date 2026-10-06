/**
 * Default engine configuration. Every value here can be overridden per school
 * through `SchoolSetting` (keys "adaptive.engine" and "mastery.thresholds");
 * `resolveEngineConfig` merges overrides on top of these defaults.
 */

export const ENGINE_VERSION = "adaptive-1.0.0";

/** Authoring level (1-7) -> IRT difficulty b on the theta scale (-3..+3). */
export const LEVEL_TO_B: Record<number, number> = {
  1: -2.25, // Very easy
  2: -1.5, // Easy
  3: -0.75, // Below grade level
  4: 0, // Grade level
  5: 0.75, // Above grade level
  6: 1.5, // Challenging
  7: 2.25, // Advanced
};

export const LEVEL_LABELS: Record<number, string> = {
  1: "Very easy",
  2: "Easy",
  3: "Below grade level",
  4: "Grade level",
  5: "Above grade level",
  6: "Challenging",
  7: "Advanced",
};

export interface AdaptiveConfig {
  /** IRT model used for scoring: 1 = Rasch, 2 = 2PL, 3 = 3PL. */
  model: 1 | 2 | 3;
  /** Theta bounds. */
  thetaMin: number;
  thetaMax: number;
  /** Prior used for a brand-new student/skill (grade level). */
  priorMean: number;
  priorSD: number;
  /** Largest change in theta allowed from one response (prevents jumps). */
  maxThetaStep: number;
  /** Largest change in TARGET difficulty between consecutive items (theta units). */
  maxTargetStep: number;
  /** Desired probability of success in practice mode (learning zone). */
  practiceTargetP: number;
  /** Desired probability of success in diagnostic mode (max information). */
  diagnosticTargetP: number;
  /** Consecutive incorrect answers that trigger prerequisite routing. */
  prereqRouteAfterWrong: number;
  /** Rolling window used for "recent performance". */
  recentWindow: number;
  /** A response faster than max(rapidGuessMinMs, rapidGuessFraction * estimated time) is a rapid guess. */
  rapidGuessMinMs: number;
  rapidGuessFraction: number;
  /** Evidence weights for theta updates. */
  rapidGuessWeight: number;
  hintWeight: number;
  /** Items answered in the last N steps are not repeated. */
  noRepeatWindow: number;
  /** Randomise among the top-K candidate items (exposure control). */
  topK: number;
}

export interface MasteryThresholds {
  bands: { beginning: number; developing: number; approaching: number; proficient: number; mastered: number };
  /** Evidence gates required before a score may enter the PROFICIENT / MASTERED bands. */
  minAttemptsForProficient: number;
  minAttemptsForMastered: number;
  minLevelReachedForMastered: number; // highest level answered correctly
  minRecentAccuracyForMastered: number; // over `recentWindow`
  /** Evidence curve: confidence = 1 - exp(-effectiveN / evidenceScale). */
  evidenceScale: number;
  /** Retention: days without practice before mastery starts to decay, and decay per week. */
  decayAfterDays: number;
  decayPerWeek: number;
  decayFloor: number; // never decays below this fraction of the earned score
  /** Component weights (must sum to 1). */
  weights: { ability: number; recentAccuracy: number; consistency: number };
}

export const DEFAULT_ADAPTIVE: AdaptiveConfig = {
  model: 2,
  thetaMin: -3,
  thetaMax: 3,
  priorMean: 0,
  priorSD: 1,
  maxThetaStep: 0.6,
  maxTargetStep: 0.4, // a little over half an authoring level
  practiceTargetP: 0.72,
  diagnosticTargetP: 0.5,
  prereqRouteAfterWrong: 3,
  recentWindow: 10,
  rapidGuessMinMs: 2500,
  rapidGuessFraction: 0.12,
  rapidGuessWeight: 0.2,
  hintWeight: 0.5,
  noRepeatWindow: 25,
  topK: 3,
};

export const DEFAULT_MASTERY: MasteryThresholds = {
  bands: { beginning: 0, developing: 40, approaching: 60, proficient: 75, mastered: 90 },
  minAttemptsForProficient: 8,
  minAttemptsForMastered: 15,
  minLevelReachedForMastered: 5,
  minRecentAccuracyForMastered: 0.6, // adaptive practice targets ~72% success, so 80% would be unreachable
  evidenceScale: 4,
  decayAfterDays: 30,
  decayPerWeek: 0.02,
  decayFloor: 0.85,
  weights: { ability: 0.8, recentAccuracy: 0.15, consistency: 0.05 },
};

/** Merge a school override (validated upstream) over the defaults. */
export function resolveEngineConfig(
  adaptive: Partial<AdaptiveConfig> = {},
  mastery: Partial<MasteryThresholds> = {},
): { adaptive: AdaptiveConfig; mastery: MasteryThresholds } {
  const m: MasteryThresholds = {
    ...DEFAULT_MASTERY,
    ...mastery,
    bands: { ...DEFAULT_MASTERY.bands, ...(mastery.bands ?? {}) },
    weights: { ...DEFAULT_MASTERY.weights, ...(mastery.weights ?? {}) },
  };
  const wSum = m.weights.ability + m.weights.recentAccuracy + m.weights.consistency;
  if (Math.abs(wSum - 1) > 1e-6) throw new Error(`Mastery weights must sum to 1 (got ${wSum})`);
  const b = m.bands;
  if (!(b.developing < b.approaching && b.approaching < b.proficient && b.proficient < b.mastered)) {
    throw new Error("Mastery band thresholds must be strictly increasing");
  }
  return { adaptive: { ...DEFAULT_ADAPTIVE, ...adaptive }, mastery: m };
}
