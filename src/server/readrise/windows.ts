/**
 * 🗓️ ReadRise reading checks — the placement (LevelSet-like) THREE times a school year (owner r69 item 1):
 *
 *   BOY  beginning of year: the first placement (required before any article — unchanged)
 *   MOY  middle of year: opens when the middle term starts (the school's terms), else on the assessment plan's MOY
 *        window; a student placed earlier sees a "Check your reading level" card until they take it
 *   EOY  end of year: the last 6 weeks of the school year (or the assessment plan's EOY window when the school saved
 *        its plan); the same card
 *
 * The school year and windows come from the school's settings: the saved assessment plan (SchoolSetting
 * "assessment.cycle", src/server/assessment-cycle) wins; else the current AcademicYear and its Terms; else the plan's
 * defaults. A teacher can still allow an extra retake at any time (placement.ts). Pure except loadReadRiseWindows.
 */
import type { Repo, Row } from "../seeding/repo";
import { isoDay, loadCycle, plusDays, type Window } from "../assessment-cycle/cycle";

export type RRPeriod = "BOY" | "MOY" | "EOY";
export const RR_PERIODS: RRPeriod[] = ["BOY", "MOY", "EOY"];
export const RR_PERIOD_NAME: Record<RRPeriod, string> = { BOY: "Start of year", MOY: "Middle of year", EOY: "End of year" };
/** the end-of-year check opens this many weeks before the last day of school (default) */
export const END_WEEKS = 6;

export interface RRWindows { yearStart: string; yearEnd: string; BOY: Window; MOY: Window; EOY: Window }

const d = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));

/** The three windows from the year's dates (yyyy-mm-dd). `endOpens` defaults to the last END_WEEKS weeks. Pure. */
export function readRiseWindows(input: { yearStart: string; yearEnd: string; midOpens?: string | null; endOpens?: string | null }): RRWindows {
  const { yearStart, yearEnd } = input;
  let endOpens = input.endOpens && input.endOpens > yearStart && input.endOpens <= yearEnd ? input.endOpens : plusDays(yearEnd, -7 * END_WEEKS);
  if (endOpens <= yearStart) endOpens = plusDays(yearStart, 1);
  // the middle of the year when no date is given: half way between the first day and the end check
  const half = isoDay(new Date((new Date(`${yearStart}T00:00:00Z`).getTime() + new Date(`${endOpens}T00:00:00Z`).getTime()) / 2));
  const midOpens = input.midOpens && input.midOpens > yearStart && input.midOpens < endOpens ? input.midOpens : half;
  return {
    yearStart, yearEnd,
    BOY: { opens: yearStart, closes: plusDays(midOpens, -1) },
    MOY: { opens: midOpens, closes: plusDays(endOpens, -1) },
    EOY: { opens: endOpens, closes: yearEnd },
  };
}

/** The period a moment falls in (before the year: BOY; after it: EOY). Pure. */
export function periodOf(w: RRWindows, at: Date): RRPeriod {
  const t = isoDay(at);
  return t >= w.EOY.opens ? "EOY" : t >= w.MOY.opens ? "MOY" : "BOY";
}

/**
 * The reading check that is due now (MOY / EOY), or null: only for a student who already has a placement, and only
 * while the period's window is open and no placement was finished inside it. The first placement (BOY) is the
 * required placement, not a check. Pure.
 */
export function dueCheck(w: RRWindows, now: Date, completed: Date[]): RRPeriod | null {
  if (!completed.length) return null;
  const p = periodOf(w, now);
  if (p === "BOY") return null;
  const t = isoDay(now);
  if (t < w[p].opens || t > w[p].closes) return null;
  return completed.some((c) => isoDay(c) >= w[p].opens) ? null : p;
}

/**
 * The year's checks: the result of the latest finished placement of each period (this school year; a placement up to
 * 60 days before the first day counts as the start). Pure.
 */
export function placementChecks(w: RRWindows, rows: readonly Row[]): Record<RRPeriod, { level: number; at: string } | null> {
  const out: Record<RRPeriod, { level: number; at: string } | null> = { BOY: null, MOY: null, EOY: null };
  const from = plusDays(w.yearStart, -60);
  const done = rows.filter((r) => r.completedAt && r.result !== null && r.result !== undefined && isoDay(d(r.completedAt)) >= from)
    .sort((a, b) => d(a.completedAt).getTime() - d(b.completedAt).getTime());
  for (const r of done) {
    const p = (RR_PERIODS as string[]).includes(String(r.period)) ? (String(r.period) as RRPeriod) : periodOf(w, d(r.completedAt));
    out[p] = { level: Number(r.result), at: d(r.completedAt).toISOString() };
  }
  return out;
}

/** The school's ReadRise windows (assessment plan → AcademicYear + Terms → defaults). Two or three small reads. */
export async function loadReadRiseWindows(repo: Repo, schoolId: string, now = new Date()): Promise<RRWindows> {
  const { cycle, saved } = await loadCycle(repo, schoolId, now);
  if (saved) return readRiseWindows({ yearStart: cycle.yearStart, yearEnd: cycle.yearEnd, midOpens: cycle.diagnostic.MOY.opens, endOpens: cycle.diagnostic.EOY.opens });
  let yearStart = cycle.yearStart, yearEnd = cycle.yearEnd, midOpens: string | null = cycle.diagnostic.MOY.opens;
  const year = schoolId ? (await repo.findMany("AcademicYear", { schoolId, isCurrent: true }, { select: ["id", "startDate", "endDate"], take: 1 }))[0] : undefined;
  if (year) {
    const ys = isoDay(d(year.startDate)), ye = isoDay(d(year.endDate));
    if (ye > ys) {
      yearStart = ys; yearEnd = ye;
      const terms = (await repo.findMany("Term", { academicYearId: year.id }, { select: ["startDate"], take: 12 })).map((t) => isoDay(d(t.startDate))).sort();
      // "after mid-term start": the middle term (the 2nd of 2 or 3 terms); without terms the plan's MOY date when it is inside the year
      midOpens = terms.length >= 2 ? terms[Math.floor(terms.length / 2)] : midOpens && midOpens > ys && midOpens < ye ? midOpens : null;
    }
  }
  return readRiseWindows({ yearStart, yearEnd, midOpens });
}
