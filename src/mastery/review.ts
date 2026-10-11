/**
 * Spaced review of mastered skills: a skill comes back for a short review 2 weeks after it is mastered,
 * then 6 weeks, then every 12 weeks. A correct answer on a due review moves to the next step; a wrong
 * one keeps the review due. Losing mastery clears the schedule (the skill is practised normally again).
 */
export const REVIEW_DAYS = [14, 42, 84];

export function nextReview(
  prev: Record<string, unknown> | null,
  isMastered: boolean,
  correct: boolean,
  now: Date,
): { nextReviewAt: Date | null; reviewStep: number } {
  if (!isMastered) return { nextReviewAt: null, reviewStep: 0 };
  const day = 86_400_000;
  const step = Number(prev?.reviewStep ?? 0);
  const due = prev?.nextReviewAt ? new Date(prev.nextReviewAt instanceof Date ? prev.nextReviewAt.toISOString() : String(prev.nextReviewAt)) : null;
  if (!prev?.isMastered || !due) return { nextReviewAt: new Date(now.getTime() + REVIEW_DAYS[0] * day), reviewStep: 0 };
  if (due <= now && correct) { const s = step + 1; return { nextReviewAt: new Date(now.getTime() + REVIEW_DAYS[Math.min(s, REVIEW_DAYS.length - 1)] * day), reviewStep: s }; }
  return { nextReviewAt: due, reviewStep: step };
}
