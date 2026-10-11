/**
 * Daily streak and points (motivation): a day counts when the student answered at least one question
 * (practice, assigned sets, tests) or finished a ReadMaster article. Days in Saudi time (UTC+3).
 * Points: 10 per correct answer + 25 per ReadMaster article + 10 per Respond to Reading answer + 50 per level moved up.
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

/** Days of activity read for the streak; widened to a year only when the streak reaches the edge. */
export const STREAK_WINDOW_DAYS = 60;
const STREAK_MAX_DAYS = 365;

async function activeDays(repo: Repo, studentId: string, since: Date): Promise<number[]> {
  const [attempts, articles] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId, createdAt: { gte: since } }, { select: ["createdAt"] }),
    repo.findMany("ReadMasterAttempt", { studentId, createdAt: { gte: since } }, { select: ["createdAt"] }),
  ]);
  return [...attempts.map((a) => dayOf(a.createdAt)), ...articles.map((a) => dayOf(a.createdAt))];
}

export async function streakAndPoints(repo: Repo, studentId: string, now = new Date()): Promise<{ streak: number; points: number; activeToday: boolean }> {
  const today = dayOf(now);
  // recent days only (runs on every student home load); points are lifetime totals, so they are COUNTED
  const [recent, correct, articles, bonus] = await Promise.all([
    activeDays(repo, studentId, new Date(now.getTime() - STREAK_WINDOW_DAYS * DAY)),
    repo.count("QuestionAttempt", { studentId, isCorrect: true }),
    repo.count("ReadMasterAttempt", { studentId }),
    repo.findMany("XpEvent", { studentId }, { select: ["points", "reason"] }),
  ]);
  let days = recent;
  let streak = streakFromDays(days, today);
  // a streak that reaches the window's start may be longer: read up to a year (same semantics, rare)
  if (streak >= STREAK_WINDOW_DAYS - 1) {
    days = await activeDays(repo, studentId, new Date(now.getTime() - STREAK_MAX_DAYS * DAY));
    streak = streakFromDays(days, today);
  }
  // bonus points: a Respond to Reading answer finished, a level moved up
  const extra = bonus.filter((x) => /^(respond\.finished|level\.up)/.test(String(x.reason))).reduce((t, x) => t + Number(x.points ?? 0), 0);
  return { streak, points: correct * 10 + articles * 25 + extra, activeToday: days.includes(today) };
}
