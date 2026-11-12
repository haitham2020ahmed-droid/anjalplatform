/**
 * 📋 The teacher's ReadRise report (owner r69 item 4) — ONE clear page per class (/teacher/readrise/report, reports hub
 * "Programs → ReadRise"):
 *
 *   each student   the level line (the year's placements and every change), the three reading checks (start →
 *                  middle → end), the projected end-of-year level from the trend (an ESTIMATE, with its range)
 *   lists          "Stuck" (placed, no level change for STUCK_DAYS+ days) and "Rising fast" (up RISING_GAIN+ in the
 *                  last 4 weeks). "Stuck" is split for the teacher into 🔴 "Not reading" (no counted reading for
 *                  NOT_READING_DAYS days) and 🟠 "Reading, below 75%" (4+ counted first tries in 28 days, none at
 *                  75%+, level unchanged); plus 📉 "Missed the weekly goal 2 weeks in a row" (the engine's goal:
 *                  goalDates). One rule for all three: dashboards.ts readingSignals.
 *   accuracy       class accuracy by question type (main idea, details, inference, vocabulary …) from reliable first
 *                  tries; rapid answers left out
 *   unreliable     the runs with 2+ rapid answers (never moved a level)
 * The level is always called "the ReadRise level". Bounded reads: the class's rows only, batched with `in`,
 * only the needed columns.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertClassRead } from "../teacher/coordinators";
import { RETAKE_REASON, readRisePlaced, riyadhDay, s, toDate, undoableDrop, weekLabel, weekStart, yearEndFor, type UndoableDrop } from "./engine";
import { articleRuns, baseBand, isFirst, isStretch, keyRowsLookup, rapidRead, scoredRun, storedMs, tallyAnswers, tallyBy, tallyRuns } from "./first-try";
import { gradeBand, readingSignals, type ReadingSignals } from "./dashboards";
import { levelJourney, type HistoryKind } from "./growth-report";
import { projectionRange, type ProjectionRange } from "./growth";
import { questionKeys } from "./question-key";
import { QUESTION_TYPES, QUESTION_TYPE_NAME, isUnreliableRun, storedRapid, type QuestionType } from "./accuracy";
import { loadReadRiseWindows, placementChecks, type RRPeriod, type RRWindows } from "./windows";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { runTitle, versionTitles } from "./version-title";
import { ANNUAL_GOAL, BAND_LABEL, forecastLevel, gradeBand as benchBand, growthPaths, meetsRange, monthOf, monthsBetween, type GradeBand } from "./benchmarks";
import { runMeta, secondTryScore } from "./teacher";

const DAY = 86_400_000;
/** no level change for this many days → "Stuck" */
export const STUCK_DAYS = 28;
/** up this much in the last RISING_DAYS days → "Rising fast" */
export const RISING_GAIN = 100, RISING_DAYS = 28;
/** at most this many unreliable runs are listed (newest first) */
export const UNRELIABLE_LIST = 30;

const time = (v: unknown) => (v === null || v === undefined ? 0 : toDate(v).getTime());
const iso = (t: number) => new Date(t).toISOString();

export interface ReportPoint { at: string; level: number; kind: HistoryKind }
export interface ReportStudent {
  studentId: string; name: string; placed: boolean; level: number | null; startLevel: number | null;
  points: ReportPoint[];
  checks: Record<RRPeriod, { level: number; at: string } | null>;
  /** the end-of-year level from the trend — an ESTIMATE (null: too few readings yet) */
  projected: ProjectionRange | null;
  lastChangeAt: string | null; daysSinceChange: number | null;
  /** level change over the last RISING_DAYS days */
  gain4w: number | null;
  readings4w: number;
  unreliableRuns: number;
  /** 🔴 / 🟠 / 📉 (placed students; null when not placed) */
  signals: ReadingSignals | null;
}
export interface TypeAccuracy { type: QuestionType; name: string; correct: number; total: number; pct: number | null }
export interface UnreliableRun { runId: string; studentId: string; name: string; title: string; at: string; rapid: number; score: number | null }
export interface ReadRiseTeacherReport {
  classId: string; className: string; grade: number; band: { low: number; high: number }; yearEnd: string; windows: RRWindows;
  /** when the report was made (ISO) */
  now: string;
  students: ReportStudent[];
  stuck: { studentId: string; name: string; level: number; days: number; readings4w: number }[];
  rising: { studentId: string; name: string; level: number; gain: number }[];
  /** 🔴 placed, no counted reading for NOT_READING_DAYS+ days (days: since the last one; null = never read) */
  notReading: { studentId: string; name: string; level: number; days: number | null }[];
  /** 🟠 reading, but below 75%: 4+ counted first tries in 28 days, none at 75%+, level unchanged */
  belowGoal: { studentId: string; name: string; level: number; tries: number; best: number | null }[];
  /** 📉 the weekly goal missed in each of the last two full weeks (weeks = articles at 75%+ in those weeks) */
  missedGoal: { studentId: string; name: string; level: number; goal: number; weeks: [number, number] }[];
  byType: TypeAccuracy[];
  unreliable: UnreliableRun[];
  summary: { students: number; placed: number; stuck: number; rising: number; unreliable: number; notReading: number; belowGoal: number; missedGoal: number; checksDue: { MOY: number; EOY: number } };
}

/** The level at a moment from a student's points (oldest first), null before the first. Pure. */
/** Round 7: an average count for a tile — one decimal under 10 ("0.1", "2.5"), whole from 10 up, "<0.1" for a small
 *  value above 0 (it was "0" with one activity in a class), "—" when there is none. */
export function rateText(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  if (v >= 10) return String(Math.round(v));
  if (v > 0 && v < 0.05) return "<0.1";
  return (Math.round(v * 10) / 10).toFixed(1);
}

export function levelOn(points: readonly { at: string; level: number }[], t: number): number | null {
  let v: number | null = null;
  for (const p of points) { if (time(p.at) <= t) v = p.level; else break; }
  return v;
}

/** Stuck / rising for one student (pure). */
export function movement(points: readonly ReportPoint[], now: Date): { lastChangeAt: string | null; daysSinceChange: number | null; gain4w: number | null } {
  if (!points.length) return { lastChangeAt: null, daysSinceChange: null, gain4w: null };
  const last = points[points.length - 1];
  const nowT = now.getTime();
  const before = levelOn(points, nowT - RISING_DAYS * DAY) ?? points[0].level;
  return { lastChangeAt: last.at, daysSinceChange: Math.max(0, Math.floor((nowT - time(last.at)) / DAY)), gain4w: last.level - before };
}

/**
 * Accuracy by question type from answered runs (pure): rapid answers are left out. Round 4: through the ONE tally
 * (first-try.ts tallyAnswers) shared with the class skills / standards reports and the growth report.
 */
export function accuracyByType(runs: readonly { articleId: string; band: string; answers: unknown; rapid: number[] }[], key: Map<string, { band: string; number: number; answer: string; skill: string }[]>): TypeAccuracy[] {
  const tally = tallyBy(tallyAnswers(runs, keyRowsLookup(key)), (a) => a.type) as Map<string, [number, number]>;
  return QUESTION_TYPES.filter((t) => tally.has(t)).map((type: QuestionType) => {
    const [correct, total] = tally.get(type)!;
    return { type, name: QUESTION_TYPE_NAME[type], correct, total, pct: total ? Math.round((100 * correct) / total) : null };
  });
}

/** 👩‍🏫 The class's ReadRise report (teachers of the class, coordinators, admins). */
export async function readRiseTeacherReport(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<ReadRiseTeacherReport> {
  const klass = await assertClassRead(repo, actor, classId);
  const schoolId = s(klass.schoolId);
  const [grade, members, windows, yearEnd] = await Promise.all([
    repo.findUnique("Grade", { id: klass.gradeId }),
    repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] }),
    loadReadRiseWindows(repo, schoolId, now),
    yearEndFor(repo, schoolId, now),
  ]);
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const g = Number(grade?.level ?? 0);
  const empty = { classId, className: s(klass.name), grade: g, band: gradeBand(g), yearEnd: yearEnd.toISOString(), windows, now: now.toISOString() };
  if (!ids.length) return { ...empty, students: [], stuck: [], rising: [], notReading: [], belowGoal: [], missedGoal: [], byType: [], unreliable: [], summary: { students: 0, placed: 0, stuck: 0, rising: 0, unreliable: 0, notReading: 0, belowGoal: 0, missedGoal: 0, checksDue: { MOY: 0, EOY: 0 } } };
  const [students, rrs, changeRows, runs, placements] = await Promise.all([
    repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }),
    repo.findMany("RRStudent", { studentId: { in: ids } }, { select: ["studentId", "level", "startLevel", "placedAt", "source", "weeklyGoal"] }),
    repo.findMany("RRLevelChange", { studentId: { in: ids } }, { select: ["studentId", "fromLevel", "toLevel", "reason", "createdAt"] }),
    repo.findMany("RRRun", { studentId: { in: ids }, completedAt: { not: null } }, { select: ["id", "studentId", "articleId", "band", "versionLevel", "answers", "score", "firstTry", "stretch", "completedAt", "answerMs", "rapidCount", "unreliable", "readSeconds"] }),
    repo.findMany("RRPlacement", { studentId: { in: ids }, completedAt: { not: null }, result: { not: null } }, { select: ["studentId", "result", "period", "completedAt"] }),
  ]);
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const uname = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const names = new Map(students.map((x) => [s(x.id), uname.get(s(x.userId)) || "Student"]));
  const group = <T extends Row>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) { const l = m.get(s(r.studentId)); if (l) l.push(r); else m.set(s(r.studentId), [r]); } return m; };
  const rrBy = new Map(rrs.map((r) => [s(r.studentId), r]));
  const chBy = group(changeRows), runBy = group(runs), plBy = group(placements);
  const nowT = now.getTime();

  const rows: ReportStudent[] = ids.map((id) => {
    const rr = rrBy.get(id);
    const mine = runBy.get(id) ?? [];
    const placed = readRisePlaced(rr, (plBy.get(id) ?? []).length > 0) && !!rr;
    const checks = placementChecks(windows, plBy.get(id) ?? []);
    const unreliableRuns = mine.filter(isUnreliableRun).length;
    // round 4: the ONE article definition (first-try.ts articleRuns: reliable non-stretch first tries)
    const readings4w = articleRuns(mine).filter((r) => time(r.completedAt) >= nowT - RISING_DAYS * DAY).length;
    if (!placed || !rr) return { studentId: id, name: names.get(id) ?? "Student", placed: false, level: null, startLevel: null, points: [], checks, projected: null, lastChangeAt: null, daysSinceChange: null, gain4w: null, readings4w, unreliableRuns, signals: null };
    const changes = (chBy.get(id) ?? []).filter((c) => !s(c.reason).startsWith(RETAKE_REASON))
      .map((c) => ({ at: time(c.createdAt), from: Number(c.fromLevel), to: Number(c.toLevel), reason: s(c.reason) })).sort((a, b) => a.at - b.at);
    const journey = levelJourney({ startLevel: Number(rr.startLevel), placedAt: time(rr.placedAt), source: s(rr.source) }, changes);
    const points: ReportPoint[] = journey.events.map((e) => ({ at: e.at, level: e.level, kind: e.kind }));
    // the current level wins for "now" (a change may not have a history row)
    if (points.length && points[points.length - 1].level !== Number(rr.level)) points.push({ at: iso(nowT), level: Number(rr.level), kind: "OTHER" });
    const main = articleRuns(mine);
    return {
      studentId: id, name: names.get(id) ?? "Student", placed: true, level: Number(rr.level), startLevel: Number(rr.startLevel), points, checks,
      projected: projectionRange(journey.points, main.map((r) => time(r.completedAt)), now, yearEnd),
      ...movement(points, now), readings4w, unreliableRuns,
      signals: readingSignals(mine, { placedAt: time(rr.placedAt), weeklyGoal: Number(rr.weeklyGoal ?? 2) }, changes.map((c) => c.at), nowT),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const stuck = rows.filter((r) => r.placed && (r.daysSinceChange ?? 0) >= STUCK_DAYS)
    .map((r) => ({ studentId: r.studentId, name: r.name, level: r.level!, days: r.daysSinceChange!, readings4w: r.readings4w })).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
  const rising = rows.filter((r) => r.placed && (r.gain4w ?? 0) >= RISING_GAIN)
    .map((r) => ({ studentId: r.studentId, name: r.name, level: r.level!, gain: r.gain4w! })).sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name));

  const lv = (r: ReportStudent) => r.level ?? 0;
  const notReading = rows.filter((r) => r.signals?.notReading)
    .map((r) => ({ studentId: r.studentId, name: r.name, level: lv(r), days: r.signals!.daysSinceReading })).sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999) || a.name.localeCompare(b.name));
  const belowGoal = rows.filter((r) => r.signals?.belowGoal)
    .map((r) => ({ studentId: r.studentId, name: r.name, level: lv(r), tries: r.signals!.tries28, best: r.signals!.best28 })).sort((a, b) => (a.best ?? 0) - (b.best ?? 0) || a.name.localeCompare(b.name));
  const missedGoal = rows.filter((r) => r.signals?.missedGoal2w)
    .map((r) => ({ studentId: r.studentId, name: r.name, level: lv(r), goal: Math.max(1, Number(rrBy.get(r.studentId)?.weeklyGoal ?? 2) || 2), weeks: r.signals!.lastWeeks })).sort((a, b) => a.name.localeCompare(b.name));

  // accuracy by question type: reliable first tries, rapid answers out
  const reliable = tallyRuns(runs); // round 4: the ONE accuracy set (counted first tries, reliable)
  const key = await questionKeys(repo, [...new Set(reliable.map((r) => s(r.articleId)))]);
  const byType = accuracyByType(reliable.map((r) => ({ articleId: s(r.articleId), band: s(r.band), answers: r.answers, rapid: storedRapid(r.answerMs) })), key);

  const bad = runs.filter(isUnreliableRun).sort((a, b) => time(b.completedAt) - time(a.completedAt)).slice(0, UNRELIABLE_LIST);
  const badIds = [...new Set(bad.map((r) => s(r.articleId)))];
  const [arts, vTitles] = bad.length ? await Promise.all([repo.findMany("RRArticle", { id: { in: badIds } }, { select: ["id", "title"] }), versionTitles(repo, badIds)]) : [[] as Row[], new Map<string, string>()];
  const title = new Map(arts.map((a) => [s(a.id), s(a.title)]));
  const unreliable = bad.map((r) => ({
    // round 7: the article title + "(read as: <version title> · 600L)" when the student's version has its own title
    runId: s(r.id), studentId: s(r.studentId), name: names.get(s(r.studentId)) ?? "Student", title: runTitle(title.get(s(r.articleId)) ?? "Article", vTitles, s(r.articleId), r.versionLevel),
    at: iso(time(r.completedAt)), rapid: Number(r.rapidCount ?? 0) || storedRapid(r.answerMs).length, score: r.score === null || r.score === undefined ? null : Number(r.score),
  }));
  const today = riyadhDay(nowT); // round 4: the window dates are school (Riyadh) days
  const open = (p: "MOY" | "EOY") => today >= windows[p].opens && today <= windows[p].closes;
  return {
    ...empty, students: rows, stuck, rising, notReading, belowGoal, missedGoal, byType, unreliable,
    summary: {
      students: rows.length, placed: rows.filter((r) => r.placed).length, stuck: stuck.length, rising: rising.length, unreliable: runs.filter(isUnreliableRun).length,
      notReading: notReading.length, belowGoal: belowGoal.length, missedGoal: missedGoal.length,
      checksDue: { MOY: open("MOY") ? rows.filter((r) => r.placed && !r.checks.MOY).length : 0, EOY: open("EOY") ? rows.filter((r) => r.placed && !r.checks.EOY).length : 0 },
    },
  };
}

// ================================================================== round 6: the Teacher Data Center (Achieve3000-style)
//
//   classOverview     per student: activities, first-try average (attention under 65%), pre-test, current level,
//                     grade band, expected level now and at the year's end, growth; class tiles; first-try trend by
//                     week and by month; the class's average level by month
//   levelDetail       one student: the annual goal (40 activities at a 75% average), forecasts, the assessments table
//                     (each placement / check) and the growth chart paths with the grade's "Meets" range
//   activityTracker   one student: every article run (assigned or self-selected, 5-step or stretch, version, first and
//                     second try, minutes) with an "invalid score" flag on unreliable runs (shown, not hidden)

/** A first-try average under this is flagged "Attention!". */
export const ATTENTION_SCORE = 65;
const MONTH_WEEKS = 12;
const avgOf = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
/** The school year's first day (Riyadh midnight) as a moment. */
const dayStart = (day: string) => new Date(`${day}T00:00:00+03:00`).getTime();

/** The year's pre-test: the first finished placement of this school year (60 days' grace before the first day). Pure. */
export function preTestOf(placements: readonly Row[], yearStart: string): { level: number; at: number } | null {
  const from = dayStart(yearStart) - 60 * DAY;
  const done = placements.filter((p) => p.completedAt && p.result !== null && p.result !== undefined && time(p.completedAt) >= from)
    .sort((a, b) => time(a.completedAt) - time(b.completedAt));
  return done.length ? { level: Number(done[0].result), at: time(done[0].completedAt) } : null;
}

export interface OverviewRow {
  studentId: string; name: string; placed: boolean;
  /** completed activities: first tries of articles (the ONE definition, first-try.ts articleRuns) */
  activities: number;
  avgFirstTry: number | null;
  /** first-try average under ATTENTION_SCORE */
  attention: boolean;
  preTest: number | null; preTestAt: string | null; current: number | null;
  band: GradeBand | null; bandLabel: string | null;
  /** on the start-of-year forecast line today */
  expectedNow: number | null;
  /** the updated end-of-year forecast */
  expectedEnd: number | null;
  /** the start-of-year (initial) end-of-year forecast */
  initialEnd: number | null;
  growth: number | null;
  /** the existing alerts (🔴 / 🟠 / 📉) */
  signals: ReadingSignals | null;
}
export interface TrendPoint { label: string; avg: number | null; n: number }
export interface ClassOverview {
  classId: string; className: string; grade: number; yearStart: string; yearEnd: string; now: string;
  meets: { min: number; max: number };
  students: OverviewRow[];
  tiles: {
    /** average first-try score per activity, over N activities */
    avgScore: number | null; scoreN: number;
    avgPerWeek: number | null; avgPerStudent: number | null;
    preTestAvg: number | null; currentAvg: number | null; initialExpectedAvg: number | null; actualGrowth: number | null;
  };
  weekly: TrendPoint[]; monthly: TrendPoint[];
  levelByMonth: { month: string; avg: number | null; n: number }[];
}

/** The level points (placement → every change, then the current level) of a placed student. */
function studentPoints(rr: Row, changeRows: readonly Row[], nowT: number): ReportPoint[] {
  const changes = changeRows.filter((c) => !s(c.reason).startsWith(RETAKE_REASON))
    .map((c) => ({ at: time(c.createdAt), from: Number(c.fromLevel), to: Number(c.toLevel), reason: s(c.reason) })).sort((a, b) => a.at - b.at);
  const points: ReportPoint[] = levelJourney({ startLevel: Number(rr.startLevel), placedAt: time(rr.placedAt), source: s(rr.source) }, changes).events.map((e) => ({ at: e.at, level: e.level, kind: e.kind }));
  if (!points.length || points[points.length - 1].level !== Number(rr.level)) points.push({ at: iso(nowT), level: Number(rr.level), kind: "OTHER" });
  return points;
}

/** One student's overview numbers (pure). */
export function overviewOf(x: { runs: readonly Row[]; rr: Row | null; placed: boolean; placements: readonly Row[]; grade: number; yearStart: string; yearEnd: Date; now: Date }): Omit<OverviewRow, "studentId" | "name" | "signals"> {
  const main = articleRuns(x.runs);
  const avg = avgOf(main.map((r) => Number(r.score)));
  const base = { placed: x.placed, activities: main.length, avgFirstTry: avg, attention: avg !== null && avg < ATTENTION_SCORE };
  if (!x.placed || !x.rr) return { ...base, preTest: null, preTestAt: null, current: null, band: null, bandLabel: null, expectedNow: null, expectedEnd: null, initialEnd: null, growth: null };
  const pre = preTestOf(x.placements, x.yearStart) ?? { level: Number(x.rr.startLevel), at: time(x.rr.placedAt) };
  const current = Number(x.rr.level);
  const startAt = new Date(pre.at);
  const f = forecastLevel({ startLevel: pre.level, currentLevel: current, startAt, now: x.now, yearEnd: x.yearEnd, firstTries: main.length });
  const span = x.yearEnd.getTime() - pre.at;
  const k = span > 0 ? Math.min(1, Math.max(0, (x.now.getTime() - pre.at) / span)) : 1;
  const band = benchBand(x.grade, current);
  return {
    ...base, preTest: pre.level, preTestAt: iso(pre.at), current, band, bandLabel: BAND_LABEL[band],
    expectedNow: Math.round((pre.level + (f.initial - pre.level) * k) / 10) * 10, expectedEnd: f.updated, initialEnd: f.initial, growth: current - pre.level,
  };
}

/** Average first-try score and count per period (pure). `periods` = [label, from, to) */
export function trendOf(runs: readonly Row[], periods: readonly [string, number, number][]): TrendPoint[] {
  return periods.map(([label, from, to]) => {
    const xs = runs.filter((r) => time(r.completedAt) >= from && time(r.completedAt) < to).map((r) => Number(r.score));
    return { label, avg: avgOf(xs), n: xs.length };
  });
}

const monthStartT = (m: string) => { const [y, mo] = m.split("-").map(Number); return Date.UTC(y, mo - 1, 1) - 3 * 3_600_000; };
const monthEndT = (m: string) => { const [y, mo] = m.split("-").map(Number); return Date.UTC(y, mo, 1) - 3 * 3_600_000 - 1; };

/** 👩‍🏫 The Class Overview + Class Dashboard (teachers of the class, coordinators, admins). */
export async function classOverview(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<ClassOverview> {
  const klass = await assertClassRead(repo, actor, classId);
  const schoolId = s(klass.schoolId);
  const [grade, members, windows, yearEnd] = await Promise.all([
    repo.findUnique("Grade", { id: klass.gradeId }),
    repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] }),
    loadReadRiseWindows(repo, schoolId, now),
    yearEndFor(repo, schoolId, now),
  ]);
  const g = Number(grade?.level ?? 0);
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const nowT = now.getTime();
  const yearStartT = Math.min(dayStart(windows.yearStart), nowT);
  const [students, rrs, changeRows, runs, placements] = ids.length ? await Promise.all([
    repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }),
    repo.findMany("RRStudent", { studentId: { in: ids } }, { select: ["studentId", "level", "startLevel", "placedAt", "source", "weeklyGoal"] }),
    repo.findMany("RRLevelChange", { studentId: { in: ids } }, { select: ["studentId", "fromLevel", "toLevel", "reason", "createdAt"] }),
    repo.findMany("RRRun", { studentId: { in: ids }, completedAt: { not: null } }, { select: ["id", "studentId", "articleId", "band", "score", "firstTry", "stretch", "startedAt", "completedAt", "unreliable", "readSeconds", "rapidCount"] }),
    repo.findMany("RRPlacement", { studentId: { in: ids }, completedAt: { not: null }, result: { not: null } }, { select: ["studentId", "result", "completedAt"] }),
  ]) : [[], [], [], [], []] as Row[][];
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const uname = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const names = new Map(students.map((x) => [s(x.id), uname.get(s(x.userId)) || "Student"]));
  const group = (rows: Row[]) => { const m = new Map<string, Row[]>(); for (const r of rows) { const l = m.get(s(r.studentId)); if (l) l.push(r); else m.set(s(r.studentId), [r]); } return m; };
  const rrBy = new Map(rrs.map((r) => [s(r.studentId), r])), chBy = group(changeRows), runBy = group(runs), plBy = group(placements);

  const pointsBy = new Map<string, ReportPoint[]>();
  const rows: OverviewRow[] = ids.map((id) => {
    const rr = rrBy.get(id) ?? null, mine = runBy.get(id) ?? [], pls = plBy.get(id) ?? [];
    const placed = !!rr && readRisePlaced(rr, pls.length > 0);
    if (placed) pointsBy.set(id, studentPoints(rr!, chBy.get(id) ?? [], nowT));
    const changes = (chBy.get(id) ?? []).filter((c) => !s(c.reason).startsWith(RETAKE_REASON)).map((c) => time(c.createdAt));
    return {
      studentId: id, name: names.get(id) ?? "Student",
      ...overviewOf({ runs: mine, rr, placed, placements: pls, grade: g, yearStart: windows.yearStart, yearEnd, now }),
      signals: placed ? readingSignals(mine, { placedAt: time(rr!.placedAt), weeklyGoal: Number(rr!.weeklyGoal ?? 2) }, changes, nowT) : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // tiles: activities are the counted first tries of this school year
  const main = articleRuns(runs).filter((r) => time(r.completedAt) >= yearStartT);
  const placed = rows.filter((r) => r.placed);
  const weeksSoFar = Math.max(1, Math.ceil((nowT - yearStartT) / (7 * DAY)));
  const tiles: ClassOverview["tiles"] = {
    avgScore: avgOf(main.map((r) => Number(r.score))), scoreN: main.length,
    // round 7: two decimals (a small class value like 0.05 is not "0"); shown with rateText
    avgPerWeek: ids.length ? Math.round((100 * main.length) / ids.length / weeksSoFar) / 100 : null,
    avgPerStudent: ids.length ? Math.round((10 * main.length) / ids.length) / 10 : null,
    preTestAvg: avgOf(placed.map((r) => r.preTest!)), currentAvg: avgOf(placed.map((r) => r.current!)),
    initialExpectedAvg: avgOf(placed.map((r) => r.initialEnd!)), actualGrowth: avgOf(placed.map((r) => r.growth!)),
  };
  const ws = weekStart(now);
  const weekly = trendOf(main, Array.from({ length: MONTH_WEEKS }, (_, i) => { const w = ws - (MONTH_WEEKS - 1 - i) * 7 * DAY; return [weekLabel(w), w, w + 7 * DAY] as [string, number, number]; }));
  const months = monthsBetween(new Date(yearStartT), now);
  const monthly = trendOf(main, months.map((m) => [m, monthStartT(m), monthEndT(m) + 1] as [string, number, number]));
  const levelByMonth = months.map((m) => {
    const t = Math.min(monthEndT(m), nowT);
    const xs = [...pointsBy.values()].map((p) => levelOn(p, t)).filter((v): v is number => v !== null);
    return { month: m, avg: avgOf(xs), n: xs.length };
  });
  return {
    classId, className: s(klass.name), grade: g, yearStart: windows.yearStart, yearEnd: yearEnd.toISOString(), now: now.toISOString(),
    meets: meetsRange(g), students: rows, tiles, weekly, monthly, levelByMonth,
  };
}

async function assertStudentOfClass(repo: Repo, actor: Actor, classId: string, studentId: string): Promise<Row> {
  const klass = await assertClassRead(repo, actor, classId);
  const m = await repo.findMany("ClassMembership", { classId, studentId, leftAt: null }, { select: ["studentId"], take: 1 });
  if (!m.length) throw new ForbiddenError("This student is not in the class.");
  return klass;
}
async function studentName(repo: Repo, studentId: string): Promise<{ name: string; gradeId: string | null }> {
  const st = await repo.findUnique("Student", { id: studentId });
  const u = st ? await repo.findUnique("User", { id: s(st.userId) }) : null;
  return { name: s(u?.displayName) || "Student", gradeId: st?.gradeId ? s(st.gradeId) : null };
}

export interface AssessmentRow { at: string; period: string | null; questions: number; seconds: number | null; result: number | null; valid: boolean }
export interface LevelDetail {
  classId: string; studentId: string; name: string; grade: number; placed: boolean;
  goal: { activities: number; target: number; avg: number | null; targetAvg: number; pctActivities: number; met: boolean };
  preTest: number | null; current: number | null; growth: number | null; band: GradeBand | null; bandLabel: string | null;
  forecast: { initial: number; updated: number } | null;
  assessments: AssessmentRow[];
  chart: { months: string[]; actual: (number | null)[]; initial: (number | null)[]; expected: (number | null)[]; meets: { min: number; max: number } } | null;
  /** ↩️ round 11: the last automatic drop the teacher can still undo (engine.ts undoableDrop) */
  undoDrop: UndoableDrop | null;
}

/** The questions and time of one placement / check (pure). */
export function assessmentOf(p: Row): AssessmentRow {
  let steps: unknown = p.steps;
  if (typeof steps === "string") { try { steps = JSON.parse(steps); } catch { steps = []; } }
  const list = Array.isArray(steps) ? (steps as Record<string, unknown>[]) : [];
  const questions = list.reduce((a, x) => a + (Array.isArray(x?.answers) ? (x.answers as unknown[]).length : 0), 0);
  const ms = list.reduce((a, x) => a + (Number(x?.ms) > 0 ? Number(x.ms) : 0), 0);
  const span = p.completedAt && p.startedAt ? (time(p.completedAt) - time(p.startedAt)) / 1000 : null;
  const seconds = ms > 0 ? Math.round(ms / 1000) : span !== null && span >= 0 ? Math.round(span) : null;
  const result = p.result === null || p.result === undefined ? null : Number(p.result);
  return { at: iso(time(p.completedAt ?? p.startedAt)), period: p.period ? s(p.period) : null, questions, seconds, result, valid: result !== null };
}

/** 📈 One student's level detail: the annual goal, forecasts, assessments and the growth chart. */
export async function levelDetail(repo: Repo, actor: Actor, classId: string, studentId: string, now = new Date()): Promise<LevelDetail> {
  const klass = await assertStudentOfClass(repo, actor, classId, studentId);
  const schoolId = s(klass.schoolId);
  const [who, grade, rr, windows, yearEnd, placements, runs, changeRows] = await Promise.all([
    studentName(repo, studentId), repo.findUnique("Grade", { id: klass.gradeId }), repo.findUnique("RRStudent", { studentId }),
    loadReadRiseWindows(repo, schoolId, now), yearEndFor(repo, schoolId, now),
    repo.findMany("RRPlacement", { studentId, completedAt: { not: null } }, { select: ["result", "period", "steps", "startedAt", "completedAt"], take: 50 }),
    repo.findMany("RRRun", { studentId, completedAt: { not: null } }, { select: ["id", "studentId", "articleId", "band", "score", "firstTry", "stretch", "startedAt", "completedAt", "unreliable", "readSeconds"] }),
    repo.findMany("RRLevelChange", { studentId }, { select: ["fromLevel", "toLevel", "reason", "createdAt"] }),
  ]);
  const g = Number(grade?.level ?? 0), nowT = now.getTime();
  const yearStartT = dayStart(windows.yearStart) - 60 * DAY;
  const yearRuns = articleRuns(runs).filter((r) => time(r.completedAt) >= yearStartT);
  const avg = avgOf(yearRuns.map((r) => Number(r.score)));
  const goal = { activities: yearRuns.length, target: ANNUAL_GOAL.activities, avg, targetAvg: ANNUAL_GOAL.avg, pctActivities: Math.min(100, Math.round((100 * yearRuns.length) / ANNUAL_GOAL.activities)), met: yearRuns.length >= ANNUAL_GOAL.activities && (avg ?? 0) >= ANNUAL_GOAL.avg };
  const assessments = placements.filter((p) => time(p.completedAt) >= yearStartT).map(assessmentOf).sort((a, b) => a.at.localeCompare(b.at));
  const placed = !!rr && readRisePlaced(rr, placements.some((p) => p.result !== null && p.result !== undefined));
  const base: LevelDetail = { classId, studentId, name: who.name, grade: g, placed, goal, preTest: null, current: null, growth: null, band: null, bandLabel: null, forecast: null, assessments, chart: null, undoDrop: rr ? undoableDrop(changeRows, Number(rr.level), now) : null };
  if (!placed || !rr) return base;
  const o = overviewOf({ runs, rr, placed, placements, grade: g, yearStart: windows.yearStart, yearEnd, now });
  const startAt = new Date(time(o.preTestAt));
  const paths = growthPaths({ startLevel: o.preTest!, currentLevel: o.current!, startAt, now, yearEnd, firstTries: articleRuns(runs).length });
  const points = studentPoints(rr, changeRows, nowT);
  const months = monthsBetween(startAt, yearEnd);
  const cur = monthOf(now);
  const at = (list: { month: string; level: number }[]) => months.map((m) => list.find((x) => x.month === m)?.level ?? null);
  return {
    ...base, preTest: o.preTest, current: o.current, growth: o.growth, band: o.band, bandLabel: o.bandLabel, forecast: paths.forecast,
    chart: {
      months, initial: at(paths.initial), meets: meetsRange(g),
      // the actual level at the end of each month so far (the current level for this month)
      actual: months.map((m) => (m > cur ? null : m === cur ? o.current : levelOn(points, Math.min(monthEndT(m), nowT)))),
      expected: at(paths.expected),
    },
  };
}

export interface ActivityRow {
  runId: string; articleId: string; title: string;
  /** on the class's list (assigned) or chosen by the student */
  assigned: boolean;
  kind: "5-step" | "stretch";
  versionLevel: number;
  /** the activity score: the first try's score (null: not finished) */
  score: number | null; firstTry: boolean;
  /** the 2nd-try score (RRRun.annotations.secondTry, stored by the reader) */
  secondTry: number | null;
  at: string | null;
  /** reading + activity time in minutes (one decimal) */
  minutes: number | null;
  /** one or more scores may be invalid (unreliable / rapid answers / read too fast) — shown, never hidden */
  invalid: boolean;
  done: boolean;
}

/** The activity row of one run (pure). `key` = the article's questions (for the 2nd-try score). */
export function activityOf(r: Row, title: string, assigned: boolean, key: readonly { band: string; number: number; answer: string }[] = []): ActivityRow {
  const quizMs = Object.values(storedMs(r.answerMs)).reduce((a, b) => a + b, 0);
  const secs = Number(r.readSeconds ?? 0) + quizMs / 1000;
  const done = !!r.completedAt;
  return {
    runId: s(r.id), articleId: s(r.articleId), title, assigned, kind: isStretch(r) ? "stretch" : "5-step", versionLevel: Number(r.versionLevel),
    score: scoredRun(r) ? Number(r.score) : null, firstTry: isFirst(r), secondTry: secondOf(r, key),
    at: iso(time(r.completedAt ?? r.startedAt)), minutes: secs > 0 ? Math.round(secs / 6) / 10 : null,
    invalid: isUnreliableRun(r) || Number(r.rapidCount ?? 0) >= 2 || storedRapid(r.answerMs).length >= 2 || (done && rapidRead(r)), done,
  };
}

/** The run's 2nd-try score: a stored number, else the first-or-second-try % from the reader's second tries. */
function secondOf(r: Row, key: readonly { band: string; number: number; answer: string }[]): number | null {
  const m = runMeta(r.annotations);
  if (m.secondTry !== null) return m.secondTry;
  if (!scoredRun(r)) return null;
  return secondTryScore(r.answers, m.secondTryAnswers, key.filter((q) => q.band === baseBand(r.band)));
}

/** 🗂 One student's Activity Tracker: every article run, newest first. */
export async function activityTracker(repo: Repo, actor: Actor, classId: string, studentId: string): Promise<{ name: string; rows: ActivityRow[] }> {
  await assertStudentOfClass(repo, actor, classId, studentId);
  const [who, runs, mine] = await Promise.all([
    studentName(repo, studentId),
    repo.findMany("RRRun", { studentId }, { select: ["id", "articleId", "band", "versionLevel", "answers", "score", "firstTry", "stretch", "startedAt", "completedAt", "unreliable", "rapidCount", "readSeconds", "answerMs", "annotations"] }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] }),
  ]);
  const ids = [...new Set(runs.map((r) => s(r.articleId)))];
  const [arts, links, keys, vTitles] = await Promise.all([
    ids.length ? repo.findMany("RRArticle", { id: { in: ids } }, { select: ["id", "title"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("RRClassArticle", { classId: { in: [...new Set([classId, ...mine.map((m) => s(m.classId))])] }, articleId: { in: ids } }, { select: ["articleId"] }) : Promise.resolve([] as Row[]),
    questionKeys(repo, ids),
    versionTitles(repo, ids),
  ]);
  const title = new Map(arts.map((a) => [s(a.id), s(a.title)]));
  const assigned = new Set(links.map((l) => s(l.articleId)));
  // round 7: the article title + "(read as: <version title> · 600L)" when the student's version has its own title
  const rows = runs.map((r) => activityOf(r, runTitle(title.get(s(r.articleId)) || "Article", vTitles, s(r.articleId), r.versionLevel), assigned.has(s(r.articleId)), keys.get(s(r.articleId)) ?? []))
    .sort((a, b) => s(b.at).localeCompare(s(a.at)));
  return { name: who.name, rows };
}
