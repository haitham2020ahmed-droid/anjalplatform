/**
 * 🔁 The platform learns which of its own decisions work.
 *
 * Every learning-path step shown is saved (Recommendation, source PATH, reason code = the step's kind) and checked a
 * week later. From those outcomes, per school:
 *   success rate of each kind of step (FOUNDATION · TARGET · REVIEW · STRETCH) = improved ÷ followed
 *   weight = its rate ÷ the overall rate, shrunk toward 1 when there are few examples (n ÷ (n + 30)), kept in 0.7–1.3
 * The path planner multiplies each candidate by its weight: kinds of steps that help students more come first.
 */
import type { Repo } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
export const ACTIONS = ["FOUNDATION", "TARGET", "REVIEW", "STRETCH"] as const;
export type ActionWeights = Record<(typeof ACTIONS)[number], number>;
export const NEUTRAL: ActionWeights = { FOUNDATION: 1, TARGET: 1, REVIEW: 1, STRETCH: 1 };

/** Pure: weights from (kind, followed, improved) outcomes. */
export function weightsFrom(rows: { kind: string; followed: boolean; improved: boolean }[]): { weights: ActionWeights; stats: Record<string, { n: number; rate: number | null }> } {
  const f = rows.filter((r) => r.followed);
  const overall = f.length ? f.filter((r) => r.improved).length / f.length : 0;
  const weights = { ...NEUTRAL };
  const stats: Record<string, { n: number; rate: number | null }> = {};
  for (const k of ACTIONS) {
    const mine = f.filter((r) => r.kind === k);
    const rate = mine.length ? mine.filter((r) => r.improved).length / mine.length : null;
    stats[k] = { n: mine.length, rate: rate === null ? null : Math.round(rate * 100) / 100 };
    if (rate === null || !overall) continue;
    const shrink = mine.length / (mine.length + 30);
    weights[k] = Math.round(Math.max(0.7, Math.min(1.3, 1 + shrink * (rate / overall - 1))) * 100) / 100;
  }
  return { weights, stats };
}

/** Re-learns the school's step weights from the checked recommendations (last 120 days). */
export async function learnActionWeights(repo: Repo, schoolId: string, now = new Date()): Promise<{ weights: ActionWeights; n: number }> {
  const students = (await repo.findMany("Student", { schoolId }, { select: ["id"] })).map((x) => s(x.id));
  if (!students.length) return { weights: NEUTRAL, n: 0 };
  const recs = await repo.findMany("Recommendation", { studentId: { in: students }, source: "PATH", evaluatedAt: { not: null }, createdAt: { gte: new Date(now.getTime() - 120 * 86_400_000) } }, { select: ["reasons", "outcome", "evaluatedAt"] });
  const rows = recs.filter((r) => r.evaluatedAt).map((r) => {
    const reasons = (typeof r.reasons === "string" ? JSON.parse(r.reasons) : r.reasons ?? []) as { code?: string }[];
    return { kind: s(reasons[0]?.code), followed: s(r.outcome) !== "NOT_FOLLOWED", improved: s(r.outcome) === "IMPROVED" };
  });
  const { weights, stats } = weightsFrom(rows);
  await repo.upsert("PredictionModel", { schoolId, kind: "ACTION_WEIGHTS" }, { weights, metrics: { stats, n: rows.length }, n: rows.length, trainedAt: now }, { weights, metrics: { stats, n: rows.length }, n: rows.length, trainedAt: now });
  return { weights, n: rows.length };
}

/** The school's current weights (neutral until learned). */
export async function actionWeights(repo: Repo, schoolId: string): Promise<ActionWeights> {
  const row = (await repo.findMany("PredictionModel", { schoolId, kind: "ACTION_WEIGHTS" }))[0];
  return row ? { ...NEUTRAL, ...((typeof row.weights === "string" ? JSON.parse(row.weights) : row.weights) as Partial<ActionWeights>) } : NEUTRAL;
}
