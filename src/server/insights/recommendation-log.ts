/**
 * Every recommendation the platform shows is SAVED with its reasons, and checked 7 days later:
 *   followed?  the student practised the skill after it was recommended
 *   outcome    IMPROVED (mastery +5 or more) · SAME · DROPPED (−5 or more) · NOT_FOLLOWED
 * This closes the learning loop: the school can see whether the platform's advice works.
 */
import type { Recommendation } from "../../recommendations/recommend";
import type { Repo } from "../seeding/repo";

const DAY = 86_400_000;
export const EVALUATE_AFTER_DAYS = 7;
const s = (v: unknown) => String(v ?? "");
const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : String(v)).getTime();

/** Saves the recommendations shown (once a day per student and skill). */
export async function logRecommendations(repo: Repo, studentId: string, recs: Recommendation[], source: string, mastery: Map<string, number>, now = new Date()): Promise<number> {
  if (!recs.length) return 0;
  const recent = await repo.findMany("Recommendation", { studentId, skillId: { in: recs.map((r) => r.skillId) }, createdAt: { gte: new Date(now.getTime() - DAY) } }, { select: ["skillId"] });
  const done = new Set(recent.map((r) => s(r.skillId)));
  const rows = recs.filter((r) => !done.has(r.skillId)).map((r) => ({
    studentId, skillId: r.skillId, targetLevel: r.targetLevel, score: r.score, reasons: r.reasons, createdAt: now, source, masteryAtRec: mastery.get(r.skillId) ?? 0,
  }));
  if (rows.length) await repo.createMany("Recommendation", rows);
  return rows.length;
}

/** Time budget of one evaluateRecommendations call (the daily job; batches repeat until done or out of time). */
export const EVALUATE_BUDGET_MS = 20_000;

/** Checks recommendations made 7+ days ago that have no outcome yet: batches of `limit`, until none is left or the
 *  time budget is used (what is left waits for the next day). */
export async function evaluateRecommendations(repo: Repo, now = new Date(), limit = 2000, budgetMs = EVALUATE_BUDGET_MS): Promise<{ evaluated: number; improved: number; followed: number }> {
  const total = { evaluated: 0, improved: 0, followed: 0 };
  const start = Date.now();
  for (;;) {
    const r = await evaluateBatch(repo, now, limit);
    total.evaluated += r.evaluated; total.improved += r.improved; total.followed += r.followed;
    if (r.evaluated < limit || Date.now() - start >= budgetMs) return total;
  }
}

/** One bounded batch (one query per table for the batch). */
async function evaluateBatch(repo: Repo, now: Date, limit: number): Promise<{ evaluated: number; improved: number; followed: number }> {
  const before = new Date(now.getTime() - EVALUATE_AFTER_DAYS * DAY);
  const rows = await repo.findMany("Recommendation", { evaluatedAt: null, createdAt: { lt: before } }, { orderBy: [{ field: "createdAt", dir: "asc" }], take: limit });
  let improved = 0, followed = 0;
  if (!rows.length) return { evaluated: 0, improved: 0, followed: 0 };
  const students = [...new Set(rows.map((r) => s(r.studentId)))];
  const skills = [...new Set(rows.map((r) => s(r.skillId)))];
  const minAt = new Date(Math.min(...rows.map((r) => t(r.createdAt))));
  const [attempts, mastery] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId: { in: students }, skillId: { in: skills }, createdAt: { gte: minAt } }, { select: ["studentId", "skillId", "createdAt"] }),
    repo.findMany("StudentSkillMastery", { studentId: { in: students }, skillId: { in: skills } }, { select: ["studentId", "skillId", "score"] }),
  ]);
  const score = new Map(mastery.map((m) => [`${s(m.studentId)}|${s(m.skillId)}`, Number(m.score)]));
  // answer times per student and skill, sorted once
  const times = new Map<string, number[]>();
  for (const a of attempts) { const k = `${s(a.studentId)}|${s(a.skillId)}`; const l = times.get(k); if (l) l.push(t(a.createdAt)); else times.set(k, [t(a.createdAt)]); }
  for (const l of times.values()) l.sort((x, y) => x - y);
  for (const r of rows) {
    const key = `${s(r.studentId)}|${s(r.skillId)}`;
    const at = t(r.createdAt);
    const first = (times.get(key) ?? []).find((x) => x >= at);
    const after = score.get(key) ?? 0, was = Number(r.masteryAtRec ?? 0);
    const outcome = first === undefined ? "NOT_FOLLOWED" : after - was >= 5 ? "IMPROVED" : was - after >= 5 ? "DROPPED" : "SAME";
    if (first !== undefined) followed++;
    if (outcome === "IMPROVED") improved++;
    await repo.updateMany("Recommendation", { id: r.id }, { evaluatedAt: now, followedAt: first !== undefined ? new Date(first) : null, masteryAfter: after, outcome });
  }
  return { evaluated: rows.length, improved, followed };
}

export interface RecommendationStats { made: number; evaluated: number; followedPct: number | null; improvedPct: number | null; improvedWhenFollowedPct: number | null }

/** How well the platform's advice works for these students (last 60 days). */
export async function recommendationStats(repo: Repo, studentIds: string[], now = new Date()): Promise<RecommendationStats> {
  if (!studentIds.length) return { made: 0, evaluated: 0, followedPct: null, improvedPct: null, improvedWhenFollowedPct: null };
  const rows = await repo.findMany("Recommendation", { studentId: { in: studentIds }, createdAt: { gte: new Date(now.getTime() - 60 * DAY) } }, { select: ["outcome", "evaluatedAt"] });
  const ev = rows.filter((r) => r.evaluatedAt);
  const followed = ev.filter((r) => r.outcome !== "NOT_FOLLOWED");
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);
  return {
    made: rows.length, evaluated: ev.length,
    followedPct: pct(followed.length, ev.length),
    improvedPct: pct(ev.filter((r) => r.outcome === "IMPROVED").length, ev.length),
    improvedWhenFollowedPct: pct(followed.filter((r) => r.outcome === "IMPROVED").length, followed.length),
  };
}
