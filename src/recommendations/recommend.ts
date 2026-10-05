/**
 * Recommendation engine: ranks skills for "Recommended next".
 * Every recommendation carries a reason CODE (for teachers, reports and auditing,
 * stored in Recommendation.reasons) and a DETAIL written for the student.
 */
import { LEVEL_TO_B } from "../config/engine";

export interface SkillSnapshot {
  skillId: string;
  name: string;
  sequence: number; // curriculum order
  unitNumber: number;
  mastery: number; // 0-100 internal
  attempts: number;
  recentErrors: number; // wrong answers in last 10
  daysSincePractice: number | null;
  theta: number;
  assignedDueInDays: number | null; // teacher assignment
  prerequisiteGap: boolean; // this skill is an unmet prerequisite of something the student is working on
  mapGoalAreaWeak: boolean; // IMPORTED MAP shows this skill's goal area as a relative weakness
}

export interface Recommendation {
  skillId: string;
  name: string;
  score: number;
  targetLevel: number;
  reasons: { code: string; detail: string; weight: number }[];
}

export function thetaToLevel(theta: number): number {
  let best = 4;
  let bestDist = Infinity;
  for (const [lvl, b] of Object.entries(LEVEL_TO_B)) {
    const d = Math.abs(b - theta);
    if (d < bestDist) {
      bestDist = d;
      best = Number(lvl);
    }
  }
  return best;
}

export function recommendSkills(skills: SkillSnapshot[], currentUnit: number, limit = 5): Recommendation[] {
  const out: Recommendation[] = [];
  for (const s of skills) {
    const reasons: Recommendation["reasons"] = [];
    const add = (code: string, detail: string, weight: number) => reasons.push({ code, detail, weight });

    const needsReview = s.mastery >= 90 && (s.daysSincePractice ?? 0) > 30;
    if (s.mastery >= 90 && !needsReview) continue;

    if (s.assignedDueInDays !== null) add("ASSIGNED", s.assignedDueInDays <= 0 ? "Your teacher assigned this. It is due today" : `Your teacher assigned this. It is due in ${s.assignedDueInDays} ${s.assignedDueInDays === 1 ? "day" : "days"}`, s.assignedDueInDays <= 2 ? 40 : 25);
    if (s.prerequisiteGap) add("PREREQ_GAP", "It will help with other skills you are practising", 30);
    if (s.attempts > 0 && s.mastery < 60) add("LOW_MASTERY", `You are at ${s.mastery.toFixed(0)}. A little more practice will move you up`, (60 - s.mastery) * 0.4);
    if (s.recentErrors >= 3) add("RECENT_ERRORS", "A few recent answers were tricky. Let's try again", s.recentErrors * 3);
    if (needsReview) add("REVIEW", "Time for a quick review so you keep this skill strong", 12);
    if (s.unitNumber === currentUnit && s.attempts === 0) add("CURRENT_UNIT", "New in this unit", 18);
    if (s.unitNumber === currentUnit && s.attempts > 0 && s.mastery < 75) add("CURRENT_UNIT_PROGRESS", "Part of this unit", 10);
    // imported evidence outranks "new in this unit"; teacher assignments still rank highest
    if (s.mapGoalAreaWeak) add("MAP_GOAL_AREA", "Your test results suggest extra practice here", 20);
    if (s.unitNumber > currentUnit) add("FUTURE_UNIT", "Coming up in a later unit", -15);

    if (reasons.length === 0) continue;
    const score = reasons.reduce((a, r) => a + r.weight, 0) - s.sequence * 0.01; // tie-break by curriculum order
    out.push({ skillId: s.skillId, name: s.name, score: Math.round(score * 10) / 10, targetLevel: thetaToLevel(s.theta), reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
