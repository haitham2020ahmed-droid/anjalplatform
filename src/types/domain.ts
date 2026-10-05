/** Framework-free domain types shared by the engines, server and UI. */

export interface ItemParams {
  /** Discrimination (2PL/3PL). Rasch uses 1. */
  a: number;
  /** Difficulty on the theta scale. */
  b: number;
  /** Lower asymptote / guessing (3PL). */
  c: number;
}

export interface CandidateItem extends ItemParams {
  id: string;
  skillId: string;
  level: number; // authoring level 1-7
  estimatedSeconds: number;
}

/** One scored response as the engines see it. */
export interface ResponseEvidence extends ItemParams {
  itemId: string;
  correct: boolean;
  /** 0-1 for partially-correct multi-part items; defaults to correct ? 1 : 0. */
  credit?: number;
  level: number;
  responseMs: number;
  estimatedSeconds: number;
  usedHint: boolean;
  /** ISO timestamp. */
  at: string;
}

export interface AbilityEstimate {
  theta: number;
  se: number;
}

export type MasteryBandName = "BEGINNING" | "DEVELOPING" | "APPROACHING" | "PROFICIENT" | "MASTERED";

export interface MasteryResult {
  score: number; // 0-100, internal platform mastery
  band: MasteryBandName;
  isMastered: boolean;
  /** Why the score is what it is — shown to teachers. */
  components: {
    ability: number;
    recentAccuracy: number;
    consistency: number;
    evidence: number;
    raw: number;
    cappedBy: string | null;
    decayFactor: number;
    effectiveN: number;
    maxLevelCorrect: number;
  };
}

export type ReasonCode =
  | "START_AT_PRIOR"
  | "TARGET_SUCCESS_RATE"
  | "MAX_INFORMATION"
  | "STEP_LIMITED_UP"
  | "STEP_LIMITED_DOWN"
  | "PREREQ_ROUTE"
  | "NO_ITEM_IN_RANGE"
  | "POOL_EXHAUSTED";

export interface NextItemDecision {
  itemId: string | null;
  targetB: number;
  reasonCode: ReasonCode;
  reason: string;
  /** Set when the engine recommends switching to a prerequisite skill. */
  routeToSkillId?: string;
}
