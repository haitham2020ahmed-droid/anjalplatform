/**
 * Adaptive engine: one pure step per answered question.
 *
 *   processAnswer(state, response) ->
 *     1. weight the evidence (rapid guess / hint)
 *     2. re-estimate skill theta by EAP over the full skill history
 *     3. clamp the change to maxThetaStep (no sudden jumps)
 *     4. recompute mastery (before/after)
 *     5. choose the next item (or a prerequisite route)
 *     6. return a complete AdaptiveDecisionLog payload
 *
 * Pure function: the server action loads state, calls this, then persists the
 * attempt, ability, mastery and log in ONE transaction. Keeping it pure makes
 * it unit-testable and reusable by a background re-scoring job.
 */
import { ENGINE_VERSION, type AdaptiveConfig, type MasteryThresholds } from "../config/engine";
import type { AbilityEstimate, CandidateItem, MasteryResult, NextItemDecision, ResponseEvidence } from "../types/domain";
import { bandFor, computeMastery } from "../mastery/mastery";
import { isRapidGuess, toWeighted } from "./evidence";
import { estimateAbilityEAP, limitStep } from "./irt";
import { selectNextItem, type PrerequisiteStatus } from "./selector";

export interface SkillState {
  studentId: string;
  skillId: string;
  sessionId: string;
  mode: "PRACTICE" | "DIAGNOSTIC";
  ability: AbilityEstimate; // current stored estimate
  /** Prior for this student × skill (e.g. domain theta, or grade level = 0). */
  prior: { mean: number; sd: number };
  history: ResponseEvidence[]; // oldest first, excluding the new response
  previousTargetB: number | null;
  candidates: CandidateItem[];
  prerequisites: PrerequisiteStatus[];
}

export interface AdaptiveLogRecord {
  studentId: string;
  sessionId: string;
  skillId: string;
  questionId: string;
  previousTheta: number;
  newTheta: number;
  thetaSE: number;
  questionDifficulty: number;
  responseCorrect: boolean;
  responseMs: number;
  masteryBefore: number;
  masteryAfter: number;
  nextQuestionId: string | null;
  nextTargetB: number;
  reason: string;
  reasonCode: string;
  engineVersion: string;
}

export interface StepResult {
  ability: AbilityEstimate;
  mastery: MasteryResult;
  rapidGuess: boolean;
  next: NextItemDecision;
  log: AdaptiveLogRecord;
  /** XP is earned only for non-rapid correct answers and mastery gains. */
  xp: number;
}

export function processAnswer(
  state: SkillState,
  response: ResponseEvidence,
  cfg: { adaptive: AdaptiveConfig; mastery: MasteryThresholds },
  now: Date = new Date(),
  random?: () => number,
): StepResult {
  const { adaptive } = cfg;
  const before = computeMastery(state.history, state.ability.theta, cfg.mastery, adaptive, now, state.ability.se);
  const history = [...state.history, response];

  const est = estimateAbilityEAP(history.map((r) => toWeighted(r, adaptive)), {
    priorMean: state.prior.mean,
    priorSD: state.prior.sd,
    thetaMin: adaptive.thetaMin,
    thetaMax: adaptive.thetaMax,
    model: adaptive.model,
  });
  const theta = limitStep(state.ability.theta, est.theta, adaptive.maxThetaStep);
  const ability: AbilityEstimate = { theta, se: est.se };

  let after = computeMastery(history, theta, cfg.mastery, adaptive, now, est.se);
  // Fairness rule: a wrong (or partly wrong) answer never RAISES mastery. Extra evidence alone
  // can lift the score mathematically, but students must never see their score go up after a mistake.
  if (!response.correct && after.score > before.score) {
    after = { ...after, score: before.score, band: bandFor(before.score, cfg.mastery), isMastered: before.isMastered,
      components: { ...after.components, cappedBy: "a wrong answer cannot raise mastery" } };
  }
  const rapid = isRapidGuess(response, adaptive);

  const next = selectNextItem({
    mode: state.mode,
    theta,
    previousTargetB: state.previousTargetB ?? response.b,
    candidates: state.candidates,
    recentItemIds: history.map((h) => h.itemId),
    recentCorrect: history.slice(-adaptive.recentWindow).map((h) => h.correct),
    prerequisites: state.prerequisites,
    config: adaptive,
    random,
  });

  const xp =
    (response.correct && !rapid && !response.usedHint ? 2 + Math.max(0, response.level - 3) : 0) +
    (after.band !== before.band && after.score > before.score ? 10 : 0) +
    (after.isMastered && !before.isMastered ? 25 : 0);

  return {
    ability,
    mastery: after,
    rapidGuess: rapid,
    next,
    xp,
    log: {
      studentId: state.studentId,
      sessionId: state.sessionId,
      skillId: state.skillId,
      questionId: response.itemId,
      previousTheta: round(state.ability.theta),
      newTheta: round(theta),
      thetaSE: round(est.se),
      questionDifficulty: response.b,
      responseCorrect: response.correct,
      responseMs: response.responseMs,
      masteryBefore: before.score,
      masteryAfter: after.score,
      nextQuestionId: next.itemId,
      nextTargetB: round(next.targetB),
      reason:
        (rapid ? "Rapid response detected — counted as weak evidence. " : "") +
        (theta !== est.theta ? `Theta change capped at ±${adaptive.maxThetaStep}. ` : "") +
        next.reason,
      reasonCode: next.reasonCode,
      engineVersion: ENGINE_VERSION,
    },
  };
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
