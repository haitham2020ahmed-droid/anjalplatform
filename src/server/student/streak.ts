/**
 * Daily streak and points (motivation): a day counts when the student answered at least one question
 * (practice, assigned sets, tests) or finished a ReadMaster article. Days in Saudi time (UTC+3).
 * Points: 10 per correct answer + 25 per ReadMaster article.
 */
import type { Repo } from "../seeding/repo";

const DAY = 86_400_000, KSA = 3 * 3_600_000;
const dayOf = (v: unknown) => Math.floor((new Date(v instanceof Date ? v.toISOString() : String(v)).getTime() + KSA) / DAY);

export function streakFromDays(days: number[], today: number): number {
  const set = new Set(days);
  let d = set.has(today) ? today : set.has(today - 1) ? today - 1 : null;   // yesterday still keeps the streak alive
  if (d === null) return 0;
  let n = 0;
  while (set.has(d)) { n++; d--; }
  return n;
}

export async function streakAndPoints(repo: Repo, studentId: string, now = new Date()): Promise<{ streak: number; points: number; activeToday: boolean }> {
  const [attempts, articles] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId }, { select: ["createdAt", "isCorrect"] }),
    repo.findMany("ReadMasterAttempt", { studentId }, { select: ["createdAt"] }),
  ]);
  const days = [...attempts.map((a) => dayOf(a.createdAt)), ...articles.map((a) => dayOf(a.createdAt))];
  const today = dayOf(now);
  return { streak: streakFromDays(days, today), points: attempts.filter((a) => a.isCorrect).length * 10 + articles.length * 25, activeToday: days.includes(today) };
}
