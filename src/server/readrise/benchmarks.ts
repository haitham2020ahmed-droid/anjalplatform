/**
 * 🎯 ReadRise benchmarks (round 6, owner: "like Achieve3000"): grade-level bands, the grade-level (Stretch) version,
 * the end-of-year forecast and the growth chart paths. Pure, except levelHistoryByMonth (one or two small reads).
 *
 *  - meetsRange: the MetaMetrics-style END-OF-YEAR college-and-career-ready "Meets" range per grade (Lexile-like
 *    scale; ReadRise levels are an estimate on that scale, not official Lexile measures).
 *  - gradeBand: > max → EXCEEDS · ≥ min → MEETS · ≥ min − 350 → APPROACHES · else FAR_BELOW.
 *  - forecastLevel: expected growth in a school year by level, fitted to Achieve3000's forecasts for the school's own
 *    students (95L → +160, BR220L → +140, 225L → +95, 325L → +85, 470L → +70, 730L → +45, 820L → +35): a table
 *    (YEARLY_GROWTH) read with straight lines between its points, prorated over the part of the school year left.
 *    "initial" = from the start level at the start; "updated" = from the current level now, nudged by the student's
 *    own rate once there are at least 6 counted first tries. An ESTIMATE, never a promise.
 *  - ANNUAL_GOAL: Achieve3000's yearly goal — 40 activities with a 75% first-try average.
 */
import { toAchieve } from "./achieve-scale";
import type { Repo } from "../seeding/repo";
import { RR_FLOOR, RR_MAX } from "./level";

export type GradeBand = "FAR_BELOW" | "APPROACHES" | "MEETS" | "EXCEEDS";
export const GRADE_BANDS: GradeBand[] = ["FAR_BELOW", "APPROACHES", "MEETS", "EXCEEDS"];
export const BAND_LABEL: Record<GradeBand, string> = { FAR_BELOW: "Falls Far Below", APPROACHES: "Approaches", MEETS: "Meets", EXCEEDS: "Exceeds" };
/** APPROACHES starts this far under the grade's "Meets" minimum. */
export const APPROACHES_GAP = 350;
export const ANNUAL_GOAL = { activities: 40, avg: 75 } as const;

/** End-of-year college-and-career-ready "Meets" ranges, grades 1–12. */
const MEETS: Record<number, [number, number]> = {
  1: [190, 530], 2: [420, 650], 3: [520, 820], 4: [740, 940], 5: [830, 1010], 6: [925, 1070],
  7: [970, 1120], 8: [1010, 1185], 9: [1050, 1260], 10: [1080, 1335], 11: [1185, 1385], 12: [1185, 1385],
};
const gradeKey = (grade: number) => Math.min(12, Math.max(1, Math.round(Number(grade) || 1)));

/** The grade's end-of-year "Meets" range (grades below 1 read as 1, above 12 as 12). */
export function meetsRange(grade: number): { min: number; max: number } {
  const [min, max] = MEETS[gradeKey(grade)];
  return { min, max };
}

/** Where a level stands against the grade's end-of-year range. */
export function gradeBand(grade: number, level: number): GradeBand {
  const { min, max } = meetsRange(grade);
  const l = Number(level);
  return l > max ? "EXCEEDS" : l >= min ? "MEETS" : l >= min - APPROACHES_GAP ? "APPROACHES" : "FAR_BELOW";
}

/** The version a grade-level reader reads (the Stretch text): the version nearest the middle of meetsRange (ties: lower). */
export function gradeLevelVersion(grade: number, versions: readonly number[]): number {
  const { min, max } = meetsRange(grade);
  const mid = (min + max) / 2;
  const vs = [...new Set(versions.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!vs.length) return Math.round(mid / 100) * 100;
  // 📏 round 8: the version whose Achieve3000 level (achieve-scale.ts) is nearest the middle of the grade's band
  const d = (v: number) => Math.abs(toAchieve(v) - mid);
  return vs.reduce((best, v) => (d(v) < d(best) ? v : best), vs[0]);
}

// ------------------------------------------------------------------ forecast

/** Expected growth in one school year by level (points [level, growth]; straight lines between, flat outside). */
export const YEARLY_GROWTH: readonly (readonly [number, number])[] = [[100, 150], [225, 100], [325, 85], [470, 70], [730, 45], [820, 35], [1000, 30]];
/** The length of a school year for the forecast (≈ 40 weeks). */
export const SCHOOL_YEAR_DAYS = 280;
/** The student's own rate joins the forecast from this many counted first tries. */
export const FORECAST_MIN_TRIES = 6;
const DAY = 86_400_000;

/** Expected growth in one school year from a level. */
export function yearlyGrowth(level: number): number {
  const t = YEARLY_GROWTH;
  if (level <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    const [l1, g1] = t[i], [l0, g0] = t[i - 1];
    if (level <= l1) return g0 + ((g1 - g0) * (level - l0)) / (l1 - l0);
  }
  return t[t.length - 1][1];
}

const r10 = (x: number) => Math.round(x / 10) * 10;
const clampL = (x: number) => Math.min(RR_MAX + 100, Math.max(RR_FLOOR, r10(x)));
/** The part of a school year between two moments (0…1). */
const yearPart = (from: Date, to: Date) => Math.min(1, Math.max(0, (to.getTime() - from.getTime()) / (SCHOOL_YEAR_DAYS * DAY)));

export interface ForecastInput { startLevel: number; currentLevel: number; startAt: Date; now: Date; yearEnd: Date; firstTries: number }

/** The end-of-year forecast: initial (from the start) and updated (from now, with the student's own rate when known). */
export function forecastLevel(i: ForecastInput): { initial: number; updated: number } {
  const initial = clampL(i.startLevel + yearlyGrowth(i.startLevel) * yearPart(i.startAt, i.yearEnd));
  let rate = yearlyGrowth(i.currentLevel);
  const elapsedDays = (i.now.getTime() - i.startAt.getTime()) / DAY;
  if (i.firstTries >= FORECAST_MIN_TRIES && elapsedDays >= 14) {
    // the student's own yearly rate so far, kept between 0 and 2.5× the expected one, weighs half
    const own = ((i.currentLevel - i.startLevel) / elapsedDays) * SCHOOL_YEAR_DAYS;
    rate = (rate + Math.min(2.5 * rate, Math.max(0, own))) / 2;
  }
  const updated = clampL(i.currentLevel + rate * yearPart(i.now, i.yearEnd));
  return { initial, updated };
}

// ------------------------------------------------------------------ growth chart

export interface MonthLevel { month: string; level: number }
const RIYADH = 3 * 3_600_000;
/** The Riyadh month (yyyy-mm) of a moment. */
export const monthOf = (at: Date): string => new Date(at.getTime() + RIYADH).toISOString().slice(0, 7);
/** The last moment (UTC ms) of a Riyadh month. */
function monthEnd(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return Date.UTC(y, m, 1) - RIYADH - 1;
}
/** The months from `from` to `to` (Riyadh), at most 24. */
export function monthsBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  let [y, m] = monthOf(from).split("-").map(Number);
  const last = monthOf(to);
  while (out.length < 24) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > last) break;
    out.push(key);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

export interface GrowthPathsInput extends ForecastInput { actual?: readonly MonthLevel[] }

/**
 * The growth chart month by month: `initial` (the start-of-year forecast line, start → yearEnd), `expected` (the
 * updated forecast line, now → yearEnd) and `actual` (the student's level at the end of each month so far, from
 * levelHistoryByMonth). Each value is the level at the end of the month (or at yearEnd / now when earlier).
 */
export function growthPaths(i: GrowthPathsInput): { initial: MonthLevel[]; expected: MonthLevel[]; actual: MonthLevel[]; forecast: { initial: number; updated: number } } {
  const f = forecastLevel(i);
  const line = (from: Date, fromLevel: number, toLevel: number): MonthLevel[] => {
    const span = i.yearEnd.getTime() - from.getTime();
    return monthsBetween(from, i.yearEnd).map((month) => {
      const t = Math.min(monthEnd(month), i.yearEnd.getTime());
      const k = span > 0 ? Math.min(1, Math.max(0, (t - from.getTime()) / span)) : 1;
      return { month, level: r10(fromLevel + (toLevel - fromLevel) * k) };
    });
  };
  const expected = line(i.now, i.currentLevel, f.updated);
  if (expected.length) expected[0] = { month: expected[0].month, level: r10(i.currentLevel) };
  return { initial: line(i.startAt, i.startLevel, f.initial), expected, actual: [...(i.actual ?? [])], forecast: f };
}

/**
 * The student's level at the end of each month from `from` to `to` (months after now are left out), from the level
 * history (RRLevelChange: placement, moves, teacher changes). A month before the first change has no level (not placed).
 */
export async function levelHistoryByMonth(repo: Repo, studentId: string, from: Date, to: Date, now = new Date()): Promise<MonthLevel[]> {
  const changes = (await repo.findMany("RRLevelChange", { studentId }, { select: ["toLevel", "createdAt"] }))
    .map((c) => ({ at: (c.createdAt instanceof Date ? c.createdAt : new Date(String(c.createdAt))).getTime(), level: Number(c.toLevel) }))
    .filter((c) => Number.isFinite(c.at) && Number.isFinite(c.level))
    .sort((a, b) => a.at - b.at);
  const out: MonthLevel[] = [];
  const stop = Math.min(to.getTime(), now.getTime());
  for (const month of monthsBetween(from, new Date(stop))) {
    const t = Math.min(monthEnd(month), stop);
    let v: number | null = null;
    for (const c of changes) { if (c.at <= t) v = c.level; else break; }
    if (v !== null) out.push({ month, level: v });
  }
  return out;
}
