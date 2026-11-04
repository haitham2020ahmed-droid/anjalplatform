/**
 * ⭐ Student Skills (owner r75): the TREND, the GUESSING flag and the DATE filter of the three tabs. Pure rules here;
 * the reads are in skills-grid.ts classSkills (bounded, see there).
 *
 *   Trend ⬆️ ➖ ⬇️    each assigned skill's star NOW (or at the "To" date) against its star 2 weeks before. Star
 *                    levels: ☆ 0 · ◐ / 🔄 1 · ⭐ / ☆⬆ 2. ⬆️ = at least one skill went up a level and none went down;
 *                    ⬇️ = more levels lost than won; ➖ = everything else (no change, or ups and downs that cancel).
 *                    The star 2 weeks ago comes from the star's stored history (SkillStatus.history); a pair with no
 *                    history is recomputed from the answers given up to that day with the SAME star rule
 *                    (decideStatus: ≥ 30 careful practice answers AND the engine's mastery, mastered by then).
 *   Guessing ⚡       the student's answers on their assigned skills in the last 2 weeks (or in the chosen dates):
 *                    ≥ 20 % rapid guesses (QuestionAttempt.rapidGuess; the platform's effort threshold
 *                    UNRELIABLE_SHARE), from at least GUESS_MIN_ANSWERS answers.
 *   Dates            optional From – To (yyyy-mm-dd); empty = the whole year (nothing left out). Only assignments made
 *                    and answers given inside the dates count; with a "To" in the past the stars are as they were then.
 */
import type { Row } from "../seeding/repo";
import { decideStatus, historyOf, ms, type StarStatus } from "./status";
import { UNRELIABLE_SHARE } from "../practice/guessing";
import type { AssessmentCycle } from "../assessment-cycle/cycle";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const DAY = 86_400_000;

/** the trend compares with this many days before */
export const TREND_BACK_DAYS = 14;
/** r94 (audit): a middle checkpoint, so the trend can show a short history (14d ago → 7d ago → now) instead of
 * only two points — no new data, just one more read of the same stored star history. */
export const TREND_MID_DAYS = 7;
/** ⚡ from this share of rapid guesses (the platform's effort threshold: 20 %) */
export const GUESS_SHARE = UNRELIABLE_SHARE;
/** ⚡ needs at least this many answers (one fast answer is not a habit) */
export const GUESS_MIN_ANSWERS = 5;
/** the history entry the one-time migration writes (its date is the migration's, not the practice's) */
const MIGRATION_WHY = "computed from earlier practice";

/** the level of a star on the existing scale: ☆ 0 · ◐ / 🔄 1 · ⭐ / ☆⬆ 2 */
export const STAR_RANK: Record<StarStatus, number> = { NOT_STARTED: 0, IN_PROGRESS: 1, NEEDS_REVIEW: 1, MASTERED: 2, NEXT_LEVEL: 2 };
export type Trend = "UP" | "SAME" | "DOWN";
export const TREND_ICON: Record<Trend, string> = { UP: "⬆️", SAME: "➖", DOWN: "⬇️" };
export const TREND_WORD: Record<Trend, string> = { UP: "Improved", SAME: "Not moving", DOWN: "Going down" };
/** the ⓘ rule (teacher) */
export const TREND_RULE = "Each assigned skill's star now against 2 weeks ago. ⬆️ at least one star went up and none went down · ⬇️ more stars went down than up · ➖ no change.";
export const GUESS_TIP = "Answers too fast — talk to the student about reading carefully before re-teaching.";
export const GUESS_RULE = "⚡ = at least 20% of the student's answers in the last 2 weeks (or the chosen dates) were too fast to have been read (at least 5 answers).";

export interface StudentTrend { trend: Trend; up: number; down: number; gained: number }
/** Pure: one student's trend from the star levels of their assigned skills (then → now). */
export function trendOf(pairs: readonly { then: StarStatus; now: StarStatus }[]): StudentTrend {
  let up = 0, down = 0, net = 0, gained = 0;
  for (const p of pairs) {
    const d = STAR_RANK[p.now] - STAR_RANK[p.then];
    if (d > 0) up++; else if (d < 0) down++;
    net += d;
    if (STAR_RANK[p.now] === 2 && STAR_RANK[p.then] < 2) gained++;
  }
  return { trend: up > 0 && down === 0 ? "UP" : net < 0 ? "DOWN" : "SAME", up, down, gained };
}

export interface GuessCount { answers: number; rapid: number }
/** Pure: ⚡ — ≥ 20 % rapid guesses from at least GUESS_MIN_ANSWERS answers. */
export const isGuessing = (c: GuessCount | null | undefined): boolean => Boolean(c) && c!.answers >= GUESS_MIN_ANSWERS && c!.rapid >= GUESS_SHARE * c!.answers;

/**
 * Pure: the star of one student × skill at time `at` (ms) from its stored rows' history; null = cannot tell from the
 * history (no entry, or only the migration's entry dated after `at`) → recompute from the answers.
 */
export function starFromHistory(rows: readonly Row[], at: number): StarStatus | null {
  const h = rows.flatMap((r) => historyOf(r.history)).filter((x) => s(x.status) && ms(x.at)).sort((a, b) => ms(a.at) - ms(b.at));
  if (!h.length) return null;
  if (ms(h[0].at) > at) return s(h[0].why) === MIGRATION_WHY ? null : "NOT_STARTED";
  let st = s(h[0].status);
  for (const x of h) { if (ms(x.at) > at) break; st = s(x.status); }
  return st as StarStatus;
}

/** Pure: the star recomputed from counted answers up to then and the engine's mastery then (the same star rule). */
export const starFromAnswers = (answered: number, mastered: boolean): StarStatus => decideStatus(null, answered, mastered).status;

// ------------------------------------------------------------------ the date filter

export interface DateRange { from: string | null; to: string | null }
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const valid = (v: unknown): string | null => (typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null);
/** Pure: the From – To of the URL (yyyy-mm-dd; a wrong value is ignored; swapped when From is after To). */
export function parseRange(from: unknown, to: unknown): DateRange {
  let f = valid(from), t = valid(to);
  if (f && t && f > t) [f, t] = [t, f];
  return { from: f, to: t };
}
export const isRangeOn = (r: DateRange | null | undefined): boolean => Boolean(r && (r.from || r.to));
export interface RangeBounds { on: boolean; start: number | null; end: number; past: boolean }
/** Pure: the range in ms — start (or null), end (the end of the "To" day, never after now), past (To before today). */
export function rangeBounds(r: DateRange | null | undefined, now: Date): RangeBounds {
  const n = now.getTime();
  const start = r?.from ? Date.parse(`${r.from}T00:00:00Z`) : null;
  const toEnd = r?.to ? Date.parse(`${r.to}T00:00:00Z`) + DAY - 1 : null;
  return { on: isRangeOn(r), start, end: toEnd !== null ? Math.min(n, toEnd) : n, past: toEnd !== null && toEnd < n };
}

export interface RangePreset { key: "month" | "lastMonth" | "term"; label: string; from: string; to: string }
const iso = (d: Date) => d.toISOString().slice(0, 10);
/**
 * Pure: the presets — This month · Last month · This term (the school year's first term runs from the first day of
 * school to the day before the middle-of-year window; the second from there to the last day of school).
 */
export function rangePresets(now: Date, cycle: Pick<AssessmentCycle, "yearStart" | "yearEnd" | "diagnostic">): RangePreset[] {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1)), last = new Date(Date.UTC(y, m + 1, 0));
  const pFirst = new Date(Date.UTC(y, m - 1, 1)), pLast = new Date(Date.UTC(y, m, 0));
  const mid = cycle.diagnostic.MOY.opens, today = iso(now);
  const midEve = iso(new Date(Date.parse(`${mid}T00:00:00Z`) - DAY));
  const term = today < mid ? { from: cycle.yearStart, to: midEve } : { from: mid, to: cycle.yearEnd };
  return [
    { key: "month", label: "This month", from: iso(first), to: iso(last) },
    { key: "lastMonth", label: "Last month", from: iso(pFirst), to: iso(pLast) },
    { key: "term", label: "This term", ...term },
  ];
}
