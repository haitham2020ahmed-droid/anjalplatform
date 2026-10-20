/**
 * 🗓️ The school's assessment cycle (year plan), stored as JSON in SchoolSetting "assessment.cycle" (no schema change).
 *
 *   Diagnostic windows   BOY / MOY / EOY (beginning, middle, end of year) — also the three fluency benchmark windows
 *                        for Tier 1 students
 *   MAP terms            Fall / Winter / Spring testing windows
 *   Weekly Check         on / off
 *   Progress checks      one per text set, due at the end of the text set's last week (auto from Lesson.weeks:
 *                        unit n starts at instructional week (n−1)·weeksPerUnit + 1); a few days of grace
 *   Fluency checks       Tier 1: three times a year (in the BOY / MOY / EOY windows); Tier 2 / Tier 3: every
 *                        StudentTier.monitorEveryDays days (14 / 7)
 *   Breaks               weeks that are holidays do not count as instructional weeks
 *
 * The idea of a yearly cycle (screen → diagnose → monitor progress → benchmark again) follows the usual
 * progress-monitoring model of core reading programmes; the dates and rules here are the school's own.
 * Everything in this file except load/save is PURE.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";

export const CYCLE_KEY = "assessment.cycle";
const DAY = 86_400_000;

export type Period = "BOY" | "MOY" | "EOY";
export const PERIODS: Period[] = ["BOY", "MOY", "EOY"];
export const PERIOD_NAME: Record<Period, string> = { BOY: "Beginning of year", MOY: "Middle of year", EOY: "End of year" };

/** dates are yyyy-mm-dd (inclusive) */
export interface Window { opens: string; closes: string }
export interface MapTerm extends Window { name: string }
export interface AssessmentCycle {
  /** "2026-2027" */
  year: string;
  yearStart: string;
  yearEnd: string;
  diagnostic: Record<Period, Window>;
  map: MapTerm[];
  weeklyCheck: boolean;
  progressChecks: { enabled: boolean; weeksPerUnit: number; graceDays: number };
  fluency: { tier1: "BENCHMARK_WINDOWS"; tier2Days: number; tier3Days: number };
  breaks: (Window & { name: string })[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => fmt(new Date(day(iso).getTime() + n * DAY));
/** the first Sunday on or after the date (the Saudi school week runs Sunday–Thursday) */
const sundayOnOrAfter = (iso: string) => { const d = day(iso); return addDays(iso, (7 - d.getUTCDay()) % 7); };

/** The school year a date falls in: from July on it is the year starting that August.
 * r85 audit (#5): shifted by the Riyadh offset (UTC+3, same as engine.ts's `weekStart`) before reading the UTC
 * month/year — without this, a run completed between UTC June 30 21:00–24:00 (Riyadh July 1 00:00–03:00) was
 * still read as June in UTC and mis-tagged with the OLD school year for a ~3-hour window every year. */
const RIYADH_OFFSET = 3 * 3_600_000;
export function schoolYearOf(now: Date): number {
  const local = new Date(now.getTime() + RIYADH_OFFSET);
  return local.getUTCMonth() >= 6 ? local.getUTCFullYear() : local.getUTCFullYear() - 1;
}

/** Defaults for a Saudi school year (late August – mid June), used until the admin saves a plan. Pure. */
export function defaultCycle(now: Date = new Date()): AssessmentCycle {
  const y = schoolYearOf(now), n = y + 1;
  const start = sundayOnOrAfter(`${y}-08-20`);
  return {
    year: `${y}-${n}`,
    yearStart: start,
    yearEnd: `${n}-06-11`,
    diagnostic: {
      BOY: { opens: addDays(start, 7), closes: addDays(start, 25) },
      MOY: { opens: sundayOnOrAfter(`${n}-01-10`), closes: addDays(sundayOnOrAfter(`${n}-01-10`), 11) },
      EOY: { opens: sundayOnOrAfter(`${n}-05-10`), closes: addDays(sundayOnOrAfter(`${n}-05-10`), 11) },
    },
    map: [
      { name: "Fall", opens: addDays(start, 14), closes: addDays(start, 32) },
      { name: "Winter", opens: sundayOnOrAfter(`${n}-01-17`), closes: addDays(sundayOnOrAfter(`${n}-01-17`), 18) },
      { name: "Spring", opens: sundayOnOrAfter(`${n}-04-26`), closes: addDays(sundayOnOrAfter(`${n}-04-26`), 18) },
    ],
    weeklyCheck: true,
    progressChecks: { enabled: true, weeksPerUnit: 6, graceDays: 7 },
    fluency: { tier1: "BENCHMARK_WINDOWS", tier2Days: 14, tier3Days: 7 },
    breaks: [],
  };
}

const json = (v: unknown): Record<string, unknown> | null => {
  if (typeof v === "string") { try { return JSON.parse(v) as Record<string, unknown>; } catch { return null; } }
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
};

/** Checks a plan and returns it cleaned; throws ValidationError with a teacher-readable message. Pure. */
export function validateCycle(raw: unknown): AssessmentCycle {
  const v = json(raw);
  if (!v) throw new ValidationError("The assessment plan is empty.");
  const date = (x: unknown, label: string): string => { const t = String(x ?? "").trim(); if (!ISO.test(t) || Number.isNaN(day(t).getTime()) || fmt(day(t)) !== t) throw new ValidationError(`${label}: enter a date (yyyy-mm-dd).`); return t; };
  const win = (x: unknown, label: string): Window => {
    const o = json(x) ?? {};
    const w = { opens: date(o.opens, `${label} opens`), closes: date(o.closes, `${label} closes`) };
    if (w.closes < w.opens) throw new ValidationError(`${label}: the window must close after it opens.`);
    return w;
  };
  const yearStart = date(v.yearStart, "First day of school"), yearEnd = date(v.yearEnd, "Last day of school");
  if (yearEnd <= yearStart) throw new ValidationError("The last day of school must be after the first.");
  if (day(yearEnd).getTime() - day(yearStart).getTime() > 400 * DAY) throw new ValidationError("A school year is at most about 13 months.");
  const inside = (w: Window, label: string) => { if (w.opens < yearStart || w.closes > yearEnd) throw new ValidationError(`${label} must be inside the school year (${yearStart} – ${yearEnd}).`); };
  const d = json(v.diagnostic) ?? {};
  const diagnostic = {} as Record<Period, Window>;
  for (const p of PERIODS) { diagnostic[p] = win(d[p], `Diagnostic ${p}`); inside(diagnostic[p], `Diagnostic ${p}`); }
  if (!(diagnostic.BOY.closes < diagnostic.MOY.opens && diagnostic.MOY.closes < diagnostic.EOY.opens)) throw new ValidationError("The diagnostic windows must be in order: BOY, then MOY, then EOY, without overlapping.");
  const mapRaw = Array.isArray(v.map) ? v.map : [];
  if (mapRaw.length > 4) throw new ValidationError("At most 4 MAP terms.");
  const map = mapRaw.map((m, i) => {
    const o = json(m) ?? {};
    const name = String(o.name ?? "").replace(/\s+/g, " ").trim().slice(0, 30) || `Term ${i + 1}`;
    const w = win(o, `MAP ${name}`); inside(w, `MAP ${name}`);
    return { name, ...w };
  }).sort((a, b) => a.opens.localeCompare(b.opens));
  const pc = json(v.progressChecks) ?? {};
  const weeksPerUnit = Math.round(Number(pc.weeksPerUnit ?? 6)), graceDays = Math.round(Number(pc.graceDays ?? 7));
  if (!(weeksPerUnit >= 3 && weeksPerUnit <= 10)) throw new ValidationError("Weeks per unit: between 3 and 10.");
  if (!(graceDays >= 0 && graceDays <= 21)) throw new ValidationError("Days to give a progress check: between 0 and 21.");
  const fl = json(v.fluency) ?? {};
  const tier2Days = Math.round(Number(fl.tier2Days ?? 14)), tier3Days = Math.round(Number(fl.tier3Days ?? 7));
  if (!(tier3Days >= 3 && tier3Days <= tier2Days && tier2Days <= 42)) throw new ValidationError("Fluency checks: Tier 3 every 3+ days, Tier 2 no more often than Tier 3 and at most every 42 days.");
  const breaksRaw = Array.isArray(v.breaks) ? v.breaks : [];
  if (breaksRaw.length > 12) throw new ValidationError("At most 12 breaks.");
  const breaks = breaksRaw.map((b, i) => {
    const o = json(b) ?? {};
    const name = String(o.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || `Break ${i + 1}`;
    return { name, ...win(o, name) };
  }).sort((a, b) => a.opens.localeCompare(b.opens));
  const year = String(v.year ?? "").trim() || `${yearStart.slice(0, 4)}-${yearEnd.slice(0, 4)}`;
  if (!/^\d{4}-\d{4}$/.test(year)) throw new ValidationError("School year: e.g. 2026-2027.");
  return {
    year, yearStart, yearEnd, diagnostic, map, weeklyCheck: v.weeklyCheck === undefined ? true : Boolean(v.weeklyCheck),
    progressChecks: { enabled: pc.enabled === undefined ? true : Boolean(pc.enabled), weeksPerUnit, graceDays },
    fluency: { tier1: "BENCHMARK_WINDOWS", tier2Days, tier3Days }, breaks,
  };
}

/** The school's plan, or the defaults when none is saved (or the saved one is broken or from an earlier year). */
export async function loadCycle(repo: Repo, schoolId: string, now = new Date()): Promise<{ cycle: AssessmentCycle; saved: boolean; updatedAt: string | null }> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: CYCLE_KEY }, { take: 1 }))[0];
  if (row) {
    try {
      const c = validateCycle(row.value);
      // a plan for a year that has ended is replaced by this year's defaults (the admin is told on the page)
      if (fmt(now) <= addDays(c.yearEnd, 60)) return { cycle: c, saved: true, updatedAt: row.updatedAt ? new Date(String(row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt)).toISOString() : null };
    } catch { /* fall back to the defaults */ }
  }
  return { cycle: defaultCycle(now), saved: false, updatedAt: null };
}

/** School admin: saves the plan (validated, audited). */
export async function saveCycle(repo: Repo, actor: Actor, raw: unknown, now = new Date()): Promise<AssessmentCycle> {
  assertCan(actor, "settings:school");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only a school admin can change the assessment calendar.");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const cycle = validateCycle(raw);
  const before = (await repo.findMany("SchoolSetting", { schoolId: actor.schoolId, key: CYCLE_KEY }, { take: 1 }))[0]?.value ?? null;
  const value = cycle as unknown as Record<string, unknown>;
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId, key: CYCLE_KEY }, { value, updatedBy: actor.userId }, { value, updatedBy: actor.userId });
  await audit(repo, { actorId: actor.userId, action: "settings.assessment_cycle", entityType: "SchoolSetting", entityId: `${actor.schoolId}:${CYCLE_KEY}`, before: json(before), after: value, at: now });
  return cycle;
}

/** School admin: back to the defaults. */
export async function resetCycle(repo: Repo, actor: Actor, now = new Date()): Promise<void> {
  assertCan(actor, "settings:school");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only a school admin can change the assessment calendar.");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  await repo.deleteMany("SchoolSetting", { schoolId: actor.schoolId, key: CYCLE_KEY });
  await audit(repo, { actorId: actor.userId, action: "settings.assessment_cycle_reset", entityType: "SchoolSetting", entityId: `${actor.schoolId}:${CYCLE_KEY}`, at: now });
}

// ------------------------------------------------------------------ pure helpers

const inWin = (iso: string, w: Window) => iso >= w.opens && iso <= w.closes;
const inBreak = (c: AssessmentCycle, weekStartIso: string) => {
  const end = addDays(weekStartIso, 4); // a school week (Sun–Thu) wholly inside a break is not taught
  return c.breaks.some((b) => weekStartIso >= b.opens && end <= b.closes);
};

/** The Sunday that starts instructional week n (1-based), skipping break weeks. Pure. */
export function instructionalWeekStart(c: AssessmentCycle, n: number): string | null {
  let wk = sundayOnOrAfter(addDays(c.yearStart, -6)); // the week containing the first day
  let count = 0;
  for (let i = 0; i < 70; i++) {
    if (wk > c.yearEnd) return null;
    if (!inBreak(c, wk)) { count++; if (count === n) return wk; }
    wk = addDays(wk, 7);
  }
  return null;
}

/** The instructional week a date is in (0 before the year / in a break week before teaching resumes). Pure. */
export function instructionalWeekOf(c: AssessmentCycle, now: Date): number {
  const today = fmt(now);
  let wk = sundayOnOrAfter(addDays(c.yearStart, -6));
  let count = 0;
  for (let i = 0; i < 70 && wk <= today; i++) {
    if (!inBreak(c, wk)) count++;
    wk = addDays(wk, 7);
  }
  return count;
}

/** When a text set's progress check is due: the Thursday of its last week. Pure. */
export function textSetDueDate(c: AssessmentCycle, unitNumber: number, lessonWeeks: unknown, lessonNumber: number): string | null {
  const weeks = (Array.isArray(lessonWeeks) ? lessonWeeks : typeof lessonWeeks === "string" ? (() => { try { return JSON.parse(lessonWeeks) as unknown[]; } catch { return []; } })() : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  // without weeks: Wonders pacing (TS1 weeks 1–2, TS2 weeks 3–4, TS3 week 5)
  const last = weeks.length ? Math.max(...weeks) : Math.min(c.progressChecks.weeksPerUnit - 1, lessonNumber * 2 - (lessonNumber >= 3 ? 1 : 0));
  const n = (Math.max(1, unitNumber) - 1) * c.progressChecks.weeksPerUnit + Math.min(last, c.progressChecks.weeksPerUnit);
  const ws = instructionalWeekStart(c, n);
  return ws ? addDays(ws, 4) : null;
}

/** The diagnostic (fluency benchmark) window open on this date, if any. Pure. */
export function openPeriod(c: AssessmentCycle, now: Date): Period | null {
  const t = fmt(now);
  return PERIODS.find((p) => inWin(t, c.diagnostic[p])) ?? null;
}

/** The latest diagnostic window that has opened by this date (the "current" benchmark season). Pure. */
export function latestPeriod(c: AssessmentCycle, now: Date): Period | null {
  const t = fmt(now);
  return [...PERIODS].reverse().find((p) => c.diagnostic[p].opens <= t) ?? null;
}

export type FluencyState = "OK" | "DUE" | "OVERDUE";
/**
 * Is a student's fluency check due? Tier 2/3: every N days since the last check (or since the tier began);
 * DUE in the last 2 days before, OVERDUE after. Tier 1: one check inside each BOY / MOY / EOY window; DUE while the
 * window is open, OVERDUE for 30 days after it closes. Pure.
 */
export function fluencyDue(c: AssessmentCycle, input: { tier: number; everyDays: number; lastCheck: Date | null; tierSince: Date | null }, now: Date): { state: FluencyState; dueOn: string | null; why: string } {
  const tier = input.tier === 3 ? 3 : input.tier === 2 ? 2 : 1;
  if (tier >= 2) {
    const every = input.everyDays > 0 ? input.everyDays : tier === 3 ? c.fluency.tier3Days : c.fluency.tier2Days;
    const from = input.lastCheck ?? input.tierSince ?? now;
    const due = new Date(from.getTime() + every * DAY);
    const dueOn = fmt(due);
    if (!input.lastCheck && !input.tierSince) return { state: "DUE", dueOn: fmt(now), why: `Tier ${tier}: no fluency check yet (every ${every} days).` };
    if (now.getTime() > due.getTime() + DAY) return { state: "OVERDUE", dueOn, why: `Tier ${tier}: a fluency check every ${every} days; the last was ${input.lastCheck ? fmt(input.lastCheck) : "never"}.` };
    if (now.getTime() >= due.getTime() - 2 * DAY) return { state: "DUE", dueOn, why: `Tier ${tier}: fluency check due ${dueOn}.` };
    return { state: "OK", dueOn, why: `Tier ${tier}: next fluency check ${dueOn}.` };
  }
  const p = latestPeriod(c, now);
  if (!p) return { state: "OK", dueOn: c.diagnostic.BOY.closes, why: "Tier 1: the first benchmark window has not opened yet." };
  const w = c.diagnostic[p];
  const t = fmt(now);
  const done = input.lastCheck && fmt(input.lastCheck) >= w.opens;
  if (done) return { state: "OK", dueOn: null, why: `Tier 1: ${p} fluency benchmark done.` };
  if (t <= w.closes) return { state: "DUE", dueOn: w.closes, why: `Tier 1: ${p} fluency benchmark due by ${w.closes}.` };
  if (now.getTime() - day(w.closes).getTime() <= 30 * DAY) return { state: "OVERDUE", dueOn: w.closes, why: `Tier 1: the ${p} fluency benchmark window closed on ${w.closes}.` };
  return { state: "OK", dueOn: null, why: `Tier 1: next benchmark in the next window.` };
}

/** Every dated thing of the plan, for a timeline / the calendar. Pure. */
export function cycleMilestones(c: AssessmentCycle): { start: string; end: string; kind: "DIAGNOSTIC" | "MAP" | "BREAK" | "YEAR"; title: string }[] {
  return [
    { start: c.yearStart, end: c.yearStart, kind: "YEAR" as const, title: "First day of school" },
    ...PERIODS.map((p) => ({ start: c.diagnostic[p].opens, end: c.diagnostic[p].closes, kind: "DIAGNOSTIC" as const, title: `Diagnostic ${p} + fluency benchmark` })),
    ...c.map.map((m) => ({ start: m.opens, end: m.closes, kind: "MAP" as const, title: `MAP ${m.name}` })),
    ...c.breaks.map((b) => ({ start: b.opens, end: b.closes, kind: "BREAK" as const, title: b.name })),
    { start: c.yearEnd, end: c.yearEnd, kind: "YEAR" as const, title: "Last day of school" },
  ].sort((a, b) => a.start.localeCompare(b.start));
}

export const isoDay = fmt;
export const plusDays = addDays;
