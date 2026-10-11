/**
 * Next-item selection.
 *
 * Practice mode targets a success probability of ~72% (configurable): hard
 * enough to learn, easy enough to stay motivated. Diagnostic/placement mode
 * targets ~50%, where an item carries the most information about ability.
 *
 * Guard rails:
 *  1. The target difficulty may move at most `maxTargetStep` from the previous
 *     target, so the student never feels a sudden jump.
 *  2. Items seen in the last `noRepeatWindow` steps are excluded (capped at 60% of the
 *     pool, so small pools keep working without immediate repeats).
 *  3. Among the best `topK` candidates one is chosen at random (exposure control,
 *     so classmates don't all see identical sequences).
 *  4. After `prereqRouteAfterWrong` consecutive errors IN THIS SESSION, if a prerequisite skill
 *     is below its minimum mastery, the engine recommends routing there. A prerequisite the
 *     student was already routed to (`visited`) is not routed to again, and an untested
 *     prerequisite (no mastery yet) is a "check it" — routed to at most once.
 */
import type { AdaptiveConfig } from "../config/engine";
import type { CandidateItem, NextItemDecision } from "../types/domain";
import { clamp, difficultyForTargetP, information } from "./irt";

export interface PrerequisiteStatus {
  skillId: string;
  name: string;
  mastery: number;
  minimumMastery: number;
  weight: number;
  /** false when the student has no mastery row for it yet (mastery 0 means "untested", not "weak") */
  tested?: boolean;
  /** already routed to from this skill in this session (or its detour): never routed to again */
  visited?: boolean;
}

export interface SelectionInput {
  mode: "PRACTICE" | "DIAGNOSTIC";
  theta: number;
  previousTargetB: number | null;
  candidates: CandidateItem[];
  recentItemIds: string[];
  /** Most recent last — answers of the CURRENT session only (the wrong-answer streak never spans sessions). */
  recentCorrect: boolean[];
  prerequisites: PrerequisiteStatus[];
  config: AdaptiveConfig;
  /** Injectable RNG for deterministic tests. */
  random?: () => number;
}

/** In practice, an item is never more than this far above the student's ability (2 authoring levels of 0.75). */
export const MAX_ABOVE_THETA = 1.5;

export function consecutiveWrong(recentCorrect: boolean[]): number {
  let n = 0;
  for (let i = recentCorrect.length - 1; i >= 0 && !recentCorrect[i]; i--) n++;
  return n;
}

function fmt(x: number): string {
  return x.toFixed(2);
}

export function selectNextItem(input: SelectionInput): NextItemDecision {
  const { config: cfg, theta } = input;
  const rnd = input.random ?? Math.random;

  // 1. Prerequisite routing
  const wrongStreak = consecutiveWrong(input.recentCorrect);
  if (input.mode === "PRACTICE" && wrongStreak >= cfg.prereqRouteAfterWrong) {
    const gaps = input.prerequisites
      .filter((p) => !p.visited && p.mastery < p.minimumMastery)
      .map((p) => ({ p, priority: p.weight * (p.minimumMastery - p.mastery) }))
      .sort((x, y) => y.priority - x.priority);
    if (gaps.length > 0) {
      const g = gaps[0].p;
      return {
        itemId: null,
        targetB: theta,
        reasonCode: "PREREQ_ROUTE",
        reason: g.tested === false
          ? `${wrongStreak} incorrect in a row; prerequisite "${g.name}" has not been checked yet (needs ${g.minimumMastery}). Route there to check it before continuing.`
          : `${wrongStreak} incorrect in a row; prerequisite "${g.name}" is at ${g.mastery.toFixed(0)} (needs ${g.minimumMastery}). Route there before continuing.`,
        routeToSkillId: g.skillId,
      };
    }
  }

  // 2. Desired difficulty
  const desired =
    input.mode === "DIAGNOSTIC" ? theta : difficultyForTargetP(theta, cfg.practiceTargetP);
  let target = clamp(desired, cfg.thetaMin, cfg.thetaMax);
  let reasonCode: NextItemDecision["reasonCode"] =
    input.previousTargetB === null ? "START_AT_PRIOR" : input.mode === "DIAGNOSTIC" ? "MAX_INFORMATION" : "TARGET_SUCCESS_RATE";

  // 3. Step limit relative to previous target
  if (input.previousTargetB !== null) {
    const lo = input.previousTargetB - cfg.maxTargetStep;
    const hi = input.previousTargetB + cfg.maxTargetStep;
    if (target > hi) {
      target = hi;
      reasonCode = "STEP_LIMITED_UP";
    } else if (target < lo) {
      target = lo;
      reasonCode = "STEP_LIMITED_DOWN";
    }
  }

  // 4. Candidate pool
  // small pools: never exclude more than 60% of the pool, so practice can continue without immediate repeats
  const window = Math.min(cfg.noRepeatWindow, Math.max(1, Math.floor(input.candidates.length * 0.6)));
  const recent = new Set(input.recentItemIds.slice(-window));
  const pool = input.candidates.filter((c) => !recent.has(c.id));
  if (pool.length === 0) {
    return {
      itemId: null,
      targetB: target,
      reasonCode: "POOL_EXHAUSTED",
      reason: `No unseen items remain for this skill near b=${fmt(target)}. Add questions or widen the no-repeat window.`,
    };
  }

  // 4b. Bank gaps (readiness I-22): in practice an item is never more than MAX_ABOVE_THETA (2 authoring levels) above
  // the student's estimate. When no unseen item is in reach, nothing is served: the set ends early (fewer items) and
  // the gap is logged (NO_ITEM_IN_RANGE) for the admin's Question Bank Gaps page. (Reusing a question seen a moment
  // ago would repeat it inside the same session.)
  let usable = pool;
  if (input.mode === "PRACTICE") {
    const cap = theta + MAX_ABOVE_THETA;
    usable = pool.filter((c) => c.b <= cap);
    if (!usable.length) {
      const easiest = pool.reduce((m, c) => (c.b < m.b ? c : m), pool[0]);
      return {
        itemId: null,
        targetB: target,
        reasonCode: "NO_ITEM_IN_RANGE",
        reason: `Content gap: no unseen question within 2 levels of the student (θ=${fmt(theta)}); the easiest available is b=${fmt(easiest.b)} (level ${easiest.level}). The set ends early; the bank needs easier questions for this skill.`,
      };
    }
  }

  // 5. Score: closeness to target (practice) or information at theta (diagnostic)
  const scored = usable
    .map((item) => ({
      item,
      dist: Math.abs(item.b - target),
      score:
        input.mode === "DIAGNOSTIC"
          ? information(theta, item, 2) - 0.25 * Math.abs(item.b - target)
          : -Math.abs(item.b - target) + 0.05 * information(theta, item, 2),
    }))
    .sort((x, y) => y.score - x.score);
  // when the nearest item is already far from the target, only the nearest ones are used (no random far pick)
  const nearest = scored.reduce((m, x) => Math.min(m, x.dist), Infinity);
  const near = nearest > 1.0 ? scored.filter((x) => x.dist <= nearest + 0.25) : scored;
  const top = near.slice(0, Math.max(1, cfg.topK));
  const pick = top[Math.min(top.length - 1, Math.floor(rnd() * top.length))];

  if (pick.dist > 1.0) reasonCode = "NO_ITEM_IN_RANGE";
  const why: Record<string, string> = {
    START_AT_PRIOR: `First item: started near the student's prior ability (θ=${fmt(theta)}).`,
    TARGET_SUCCESS_RATE: `θ=${fmt(theta)}; aiming for ~${Math.round(cfg.practiceTargetP * 100)}% success → target b=${fmt(target)}.`,
    MAX_INFORMATION: `Diagnostic: item chosen for maximum information at θ=${fmt(theta)}.`,
    STEP_LIMITED_UP: `Ability rose; difficulty raised gradually (capped at +${cfg.maxTargetStep}) to b=${fmt(target)}.`,
    STEP_LIMITED_DOWN: `Ability fell; difficulty lowered gradually (capped at −${cfg.maxTargetStep}) to b=${fmt(target)}.`,
    NO_ITEM_IN_RANGE: `Closest available item is ${fmt(pick.dist)} from target b=${fmt(target)}; the bank needs more items at this level.`,
  };
  return {
    itemId: pick.item.id,
    targetB: target,
    reasonCode,
    reason: `${why[reasonCode]} Picked item b=${fmt(pick.item.b)} (level ${pick.item.level}) from top ${top.length}.`,
  };
}
