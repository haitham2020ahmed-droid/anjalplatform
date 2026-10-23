/**
 * 🇸🇦 NAFS readiness: how ready a student looks for the real NAFS test, from their last 3 FINISHED adaptive NAFS
 * practice runs (NafsPracticeRun — score = correct ÷ asked of each run). One pure rule, used by two places that must
 * never disagree:
 *   - the student's own NAFS page: a small encouraging badge ("You're on track" / "Keep practicing"),
 *   - the nightly job (daily.ts): a practice-reminder notification for a student who is below the line AND has
 *     gone quiet for a few days — never for a student doing fine, never for one still too new to judge.
 * Fewer than 3 finished runs = not enough data: nothing is shown and no reminder fires (never a false "not ready").
 */
import type { Repo } from "../seeding/repo";

export const NAFS_READY_PCT = 70;
export const NAFS_READY_RUNS = 3;
/** The nightly job reminds a below-threshold student only after this many idle days (never a student mid-practice). */
export const NAFS_REMINDER_IDLE_DAYS = 3;

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const time = (v: unknown): number => new Date(v instanceof Date ? v.toISOString() : String(v)).getTime();

export interface NafsReadiness {
  /** enough data (3+ finished runs) to show anything at all */
  show: boolean;
  /** only meaningful when show is true: the average of the last 3 finished runs is ≥ NAFS_READY_PCT */
  ready: boolean;
  avgPct: number | null;
  lastFinishedAt: string | null;
}

/** Pure: pass the student's finished runs, NEWEST FIRST (asked/correct of each, plus when it finished). */
export function nafsReadinessOf(finishedNewestFirst: { asked: number; correct: number; finishedAt: string | Date }[]): NafsReadiness {
  const last = finishedNewestFirst.slice(0, NAFS_READY_RUNS);
  const lastFinishedAt = last[0] ? iso(last[0].finishedAt) : null;
  if (last.length < NAFS_READY_RUNS) return { show: false, ready: false, avgPct: null, lastFinishedAt };
  const pct = (r: { asked: number; correct: number }) => (r.asked > 0 ? (r.correct / r.asked) * 100 : 0);
  const avg = last.reduce((a, r) => a + pct(r), 0) / last.length;
  return { show: true, ready: avg >= NAFS_READY_PCT, avgPct: Math.round(avg), lastFinishedAt };
}

/** The student's readiness, read from the database (their last 3 finished NAFS practice runs, any practice). */
export async function studentNafsReadiness(repo: Repo, studentId: string): Promise<NafsReadiness> {
  const rows = await repo.findMany("NafsPracticeRun", { studentId, finishedAt: { not: null } },
    { select: ["asked", "correct", "finishedAt"], orderBy: [{ field: "finishedAt", dir: "desc" }], take: NAFS_READY_RUNS });
  return nafsReadinessOf(rows.map((r) => ({ asked: Number(r.asked ?? 0), correct: Number(r.correct ?? 0), finishedAt: String(r.finishedAt) })));
}

/** The student's last NAFS practice activity of any kind (started or answered), for the "gone quiet" idle check. */
export async function nafsLastActivityAt(repo: Repo, studentId: string): Promise<Date | null> {
  const row = (await repo.findMany("NafsPracticeRun", { studentId }, { select: ["updatedAt"], orderBy: [{ field: "updatedAt", dir: "desc" }], take: 1 }))[0];
  return row?.updatedAt ? new Date(String(row.updatedAt)) : null;
}

/** Pure: true when the nightly job should remind this student (below threshold, enough data, quiet long enough). */
export function needsNafsReminder(readiness: NafsReadiness, lastActivityAt: Date | null, now: Date, idleDays = NAFS_REMINDER_IDLE_DAYS): boolean {
  if (!readiness.show || readiness.ready) return false;
  if (!lastActivityAt) return false;
  return now.getTime() - time(lastActivityAt) >= idleDays * 86_400_000;
}
