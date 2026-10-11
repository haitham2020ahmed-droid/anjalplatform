/**
 * What the recommendation engine knows about each skill for one student, from the database:
 * mastery, the student's ability (θ) on the skill, wrong answers among the last 10, the misconception
 * behind them, days since practice and whether a spaced review is due. Batched: one query per table.
 */
import type { Repo } from "../seeding/repo";

export interface SkillEvidence {
  theta: number; // the skill's ability; else the domain's; else 0 (grade level)
  recentErrors: number; // wrong answers among the last 10 on this skill
  misconception: string | null; // most frequent misconception among those wrong answers
  reviewDue: boolean;
}

const RECENT = 10;

export async function skillEvidence(repo: Repo, studentId: string, skillIds: string[], now = new Date()): Promise<Map<string, SkillEvidence>> {
  const out = new Map<string, SkillEvidence>();
  if (!skillIds.length) return out;
  const [abilities, attempts, mastery] = await Promise.all([
    repo.findMany("StudentAbility", { studentId, scope: { in: skillIds.map((id) => `SKILL:${id}`) } }, { select: ["skillId", "theta"] }),
    // the newest answers of the student on these skills (enough for the last 10 of each skill a student is working on)
    repo.findMany("QuestionAttempt", { studentId, skillId: { in: skillIds } }, {
      select: ["skillId", "isCorrect", "misconception"], orderBy: [{ field: "createdAt", dir: "desc" }], take: Math.min(2000, RECENT * skillIds.length),
    }),
    repo.findMany("StudentSkillMastery", { studentId, skillId: { in: skillIds } }, { select: ["skillId", "nextReviewAt", "isMastered"] }),
  ]);
  const theta = new Map(abilities.map((a) => [String(a.skillId), Number(a.theta)]));
  const bySkill = new Map<string, { correct: boolean; misconception: string | null }[]>();
  for (const a of attempts) {
    const k = String(a.skillId);
    const list = bySkill.get(k) ?? [];
    if (list.length < RECENT) list.push({ correct: Boolean(a.isCorrect), misconception: a.misconception ? String(a.misconception) : null });
    bySkill.set(k, list);
  }
  const review = new Map(mastery.map((m) => [String(m.skillId), Boolean(m.isMastered) && m.nextReviewAt != null && new Date(String(m.nextReviewAt instanceof Date ? m.nextReviewAt.toISOString() : m.nextReviewAt)) <= now]));
  for (const id of skillIds) {
    const recent = bySkill.get(id) ?? [];
    const wrong = recent.filter((r) => !r.correct);
    const counts = new Map<string, number>();
    for (const w of wrong) if (w.misconception) counts.set(w.misconception, (counts.get(w.misconception) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    out.set(id, { theta: theta.get(id) ?? 0, recentErrors: wrong.length, misconception: top && top[1] >= 2 ? top[0] : null, reviewDue: review.get(id) ?? false });
  }
  return out;
}
