/**
 * 🚀 ReadRise — class and school reports (Achieve3000-style), computed from the RR* tables.
 *
 *   classReport     one row per student: level now, start level, growth since placement, MAP Lexile, articles this
 *                   week / total, first-try average, weeks meeting the goal, last activity, writing to score, flags;
 *                   weekly level history per student with the class median; level distribution vs the grade band
 *   skillsReport    first-try accuracy by question skill, per class and per student
 *   pollReport      per article: opinions before vs after reading
 *   writingQueue    written answers waiting for a score
 *   schoolDashboard by grade and class: placed / not placed, median level vs band, growth, usage over 8 weeks,
 *                   goal attainment, top / bottom classes, level histogram
 *
 * Expected grade bands are guidance on the ReadRise Level scale (an estimate, not an official Lexile).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { assertClassRead } from "../teacher/coordinators";
import { RR_SKILLS } from "./import";
import { goalDates, readRisePlaced, weekLabel, weekStart as engineWeekStart } from "./engine";
import { questionKeys } from "./question-key";
import { standardOfSkill } from "./growth-words";
import { RR_FLOOR } from "./level";
import { articleRuns, baseBand, countedTries, goalRuns, isUnreliableRun, keyRowsLookup, rapidRead, scoredRun, stretchRuns, tallyAnswers, tallyBy, tallyRuns } from "./first-try";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
const time = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string | Date).getTime());
// ⚠️ r85 audit: same as engine.ts's unreliableRun() — a rapid-guessed run must not count as a "done" first try here
// either, or lucky guesses inflate firstTryAvg, goal attainment % and per-skill accuracy shown on these dashboards.
const unreliableRun = (r: Row) => isUnreliableRun(r);

/** Expected ReadRise Level range by grade (guidance). */
export const GRADE_BANDS: Record<number, { low: number; high: number }> = { 4: { low: 640, high: 940 }, 5: { low: 740, high: 1010 }, 6: { low: 830, high: 1070 } };
export const gradeBand = (grade: number) => GRADE_BANDS[grade] ?? (grade < 4 ? { low: 420, high: 820 } : { low: 925, high: 1185 });
/** A first-try score at or above this counts toward the weekly goal. */
export const GOAL_SCORE = 75;
export const INACTIVE_DAYS = 14;
export const POLL_LABELS = ["Strongly agree", "Agree", "Disagree", "Strongly disagree"];

/** The school week starts on Sunday, Riyadh time (the engine's week). */
export function weekStart(d: Date | number): number {
  return engineWeekStart(new Date(typeof d === "number" ? d : d.getTime()));
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y), m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const avg1 = (xs: number[]) => (xs.length ? Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 : null);

/** Level at time t from the start level and the change history (null before placement). */
export function levelAt(st: { startLevel: number; placedAt: number }, changes: { at: number; toLevel: number }[], t: number): number | null {
  if (st.placedAt > t) return null;
  let lvl = st.startLevel;
  for (const c of changes) if (c.at >= st.placedAt && c.at <= t) lvl = c.toLevel;
  return lvl;
}

/** Weeks (from the placement week to this week) in which the student met the weekly goal. */
export function goalWeeks(placedAt: number, goal: number, firstTries: { at: number; score: number }[], now: number, lastWeeks?: number): { met: number; weeks: number } {
  const thisWeek = weekStart(now);
  let from = weekStart(placedAt);
  if (lastWeeks) from = Math.max(from, thisWeek - (lastWeeks - 1) * 7 * DAY);
  let met = 0, weeks = 0;
  for (let w = from; w <= thisWeek; w += 7 * DAY) {
    const n = firstTries.filter((r) => r.at >= w && r.at < w + 7 * DAY && r.score >= GOAL_SCORE).length;
    const done = n >= Math.max(1, goal);
    // the current week counts only once it is met (it is not over yet)
    if (w === thisWeek && !done) continue;
    weeks++;
    if (done) met++;
  }
  return { met, weeks };
}

// ------------------------------------------------------------------ teacher signals (pure)

/** 🔴 no counted reading for this many days → "Not reading" */
export const NOT_READING_DAYS = 14;
/** 🟠 this many counted first tries in the last BELOW_GOAL_DAYS days, none at 75%+, level unchanged → "Reading, below 75%" */
export const BELOW_GOAL_TRIES = 4, BELOW_GOAL_DAYS = 28;

export interface ReadingSignals {
  /** 🔴 no counted reading (a counted first try — first-try.ts countedTries — scored, reliable, not read too fast) for NOT_READING_DAYS+ days */
  notReading: boolean;
  /** days since the last counted reading (null: never read) */
  daysSinceReading: number | null;
  /** 🟠 BELOW_GOAL_TRIES+ counted first tries in BELOW_GOAL_DAYS days, none at 75%+, no level change in that time */
  belowGoal: boolean;
  tries28: number;
  best28: number | null;
  /** 📉 the weekly goal (engine goalDates: counted first tries at 75%+) missed in each of the last 2 full weeks */
  missedGoal2w: boolean;
  /** first-try articles at 75%+ in the week before last and last week */
  lastWeeks: [number, number];
}

/**
 * The teacher's reading signals for one PLACED student (pure). `runs` = the student's runs (any; the counted ones are
 * chosen here), `placedAt` / `weeklyGoal` from RRStudent, `changes` = the times of the level changes.
 * A student placed less than NOT_READING_DAYS days ago is not "not reading"; the goal flag needs two full weeks
 * after the placement.
 */
export function readingSignals(runs: readonly Row[], st: { placedAt: number; weeklyGoal: number }, changes: readonly number[], now: number): ReadingSignals {
  // a counted reading: a counted first try (first-try.ts countedTries), scored, reliable, not read too fast
  const counted = countedTries(runs).filter((r) => scoredRun(r) && !isUnreliableRun(r) && !rapidRead(r));
  const at = (r: Row) => time(r.completedAt) ?? 0;
  const last = counted.reduce((m, r) => Math.max(m, at(r)), 0);
  const daysSinceReading = last ? Math.floor((now - last) / DAY) : null;
  const notReading = now - Math.max(last, st.placedAt) >= NOT_READING_DAYS * DAY;
  const from = now - BELOW_GOAL_DAYS * DAY;
  const recent = counted.filter((r) => at(r) >= from);
  const best28 = recent.length ? Math.max(...recent.map((r) => Number(r.score))) : null;
  const moved = changes.some((c) => c >= from && c <= now);
  const belowGoal = recent.length >= BELOW_GOAL_TRIES && (best28 ?? 0) < GOAL_SCORE && !moved;
  const cur = weekStart(now), w1 = cur - 7 * DAY, w2 = cur - 14 * DAY;
  const goal = Math.max(1, st.weeklyGoal || 2);
  const met = goalDates(runs as Row[]).map((d) => d.getTime());
  const inWeek = (w: number) => met.filter((t) => t >= w && t < w + 7 * DAY).length;
  const lastWeeks: [number, number] = [inWeek(w2), inWeek(w1)];
  const missedGoal2w = st.placedAt <= w2 && lastWeeks[0] < goal && lastWeeks[1] < goal;
  return { notReading, daysSinceReading, belowGoal, tries28: recent.length, best28, missedGoal2w, lastWeeks };
}

// ------------------------------------------------------------------ loading

interface Data {
  names: Map<string, string>;
  rr: Map<string, Row>;
  changes: Map<string, { at: number; toLevel: number }[]>;
  runs: Row[];
  map: Map<string, { lexile: number; at: number }>;
  /** students with a completed placement test */
  placedTest: Set<string>;
  /** students taking the placement now (a test started, not finished: a teacher can restart it) */
  openTest: Set<string>;
}

/** `runCols` = the reading columns a report needs (default: all it may show; the school dashboard needs only scores and times) */
async function loadData(repo: Repo, ids: string[], opts: { map?: boolean; runCols?: string[] } = {}): Promise<Data> {
  if (!ids.length) return { names: new Map(), rr: new Map(), changes: new Map(), runs: [], map: new Map(), placedTest: new Set(), openTest: new Set() };
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
  const many = async (model: string, where: (part: string[]) => Record<string, unknown>, select?: string[]) =>
    (await Promise.all(chunks.map((p) => repo.findMany(model, where(p) as never, select ? { select } : undefined)))).flat();
  const [students, rr, changes, runs, maps, placements] = await Promise.all([
    many("Student", (p) => ({ id: { in: p } }), ["id", "userId"]),
    many("RRStudent", (p) => ({ studentId: { in: p } })),
    many("RRLevelChange", (p) => ({ studentId: { in: p } }), ["studentId", "toLevel", "createdAt"]),
    many("RRRun", (p) => ({ studentId: { in: p } }), opts.runCols ?? ["id", "studentId", "articleId", "band", "versionLevel", "step", "prePoll", "postPoll", "answers", "score", "writing", "writingScore", "writingAiScore", "writingAiComment", "firstTry", "stretch", "levelBefore", "levelAfter", "startedAt", "completedAt", "unreliable", "answerMs", "readSeconds"]),
    opts.map === false ? Promise.resolve([] as Row[]) : many("MapResult", (p) => ({ studentId: { in: p }, lexile: { not: null } }), ["studentId", "lexile", "testDate"]),
    many("RRPlacement", (p) => ({ studentId: { in: p } }), ["studentId", "completedAt", "result"]),
  ]);
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const uname = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const ch = new Map<string, { at: number; toLevel: number }[]>();
  for (const c of changes) { const l = ch.get(s(c.studentId)) ?? []; l.push({ at: time(c.createdAt)!, toLevel: Number(c.toLevel) }); ch.set(s(c.studentId), l); }
  for (const l of ch.values()) l.sort((a, b) => a.at - b.at);
  const map = new Map<string, { lexile: number; at: number }>();
  for (const m of maps) {
    const at = time(m.testDate) ?? 0, cur = map.get(s(m.studentId));
    if (!cur || at > cur.at) map.set(s(m.studentId), { lexile: Number(m.lexile), at });
  }
  // a "Not valid" placement (closed with no result, round 4) is not a placement
  const placedTest = new Set(placements.filter((p) => p.completedAt && p.result !== null && p.result !== undefined).map((p) => s(p.studentId)));
  const openTest = new Set(placements.filter((p) => !p.completedAt).map((p) => s(p.studentId)));
  // 🎯 only REAL levels (readRisePlaced): the working start of a first visit (MAP / grade default) is "No placement yet"
  const placedRR = rr.filter((r) => readRisePlaced(r, placedTest.has(s(r.studentId))));
  return { names: new Map(students.map((x) => [s(x.id), uname.get(s(x.userId)) ?? "Student"])), rr: new Map(placedRR.map((r) => [s(r.studentId), r])), changes: ch, runs, map, placedTest, openTest };
}

/**
 * The runs that count for the goal and the accuracy (round 4, first-try.ts tallyRuns): scored, reliable, counted first
 * tries — a re-read never; a stretch only in a new question band. Articles are counted with articleRuns (ONE
 * definition: reliable non-stretch first tries); stretch readings on their own line (stretchRuns).
 */
const firstTryDone = (runs: Row[]) => tallyRuns(runs).filter((r) => !unreliableRun(r));

async function classMembers(repo: Repo, classId: string): Promise<string[]> {
  return (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
}
async function gradeOfClass(repo: Repo, klass: Row): Promise<number> {
  return Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
}

// ------------------------------------------------------------------ class report

export interface StudentReportRow {
  studentId: string; name: string; placed: boolean; level: number | null; startLevel: number | null; growth: number | null; source: string | null;
  mapLexile: number | null; weekArticles: number; totalArticles: number; firstTryAvg: number | null; goal: number; goalMet: number; goalWeeks: number;
  /** completed readings, first tries and re-reads (Update 39C, ReadRise export) */
  runs: number;
  /** round 4: stretch readings that counted (their own line: never in the article counts) */
  stretchArticles: number;
  lastActivity: string | null; writingToScore: number;
  /** notReading 🔴 / belowGoal 🟠 / missedGoal2w 📉: readingSignals (placed students only) */
  flags: { notPlaced: boolean; inactive: boolean; belowBand: boolean; notReading: boolean; belowGoal: boolean; missedGoal2w: boolean };
  /** a placement test is started and not finished (a teacher can restart it) */
  placementOpen: boolean;
}
export interface ClassReport {
  classId: string; className: string; grade: number; band: { low: number; high: number };
  students: StudentReportRow[];
  summary: { students: number; placed: number; notPlaced: number; medianLevel: number | null; avgGrowth: number | null; inactive: number; belowBand: number; writingToScore: number; notReading: number; belowGoal: number; missedGoal2w: number };
  history: { weeks: string[]; series: { studentId: string; name: string; points: (number | null)[] }[]; median: (number | null)[] };
  /** label: "BR" (below 0) · "0" … "1500" · "1600+" */
  distribution: { from: number; to: number; count: number; inBand: boolean; label: string }[];
}

// 🐛 fix (audit finding, Oct 2026): was 13 buckets ending "1400+", one catch-all bin for everything at or above
// 1400 — two more buckets give the 1500/1600 levels (level.ts) their own bars.
// Round 6 (owner: levels below 300, shown "BR…L"): the first bucket is "BR" (every level below 0, down to RR_FLOOR),
// then 0–99, 100–199, 200–299 … 1500–1599 and "1600+" — a level under 300 is no longer hidden in the 200s bar.
export const HIST_BUCKETS = [RR_FLOOR, ...Array.from({ length: 17 }, (_, i) => i * 100)]; // BR, 0–99 … 1600+

/** A histogram bucket's short label: "BR" (below 0), "0", "100" … "1600+". */
export const bucketLabel = (from: number, i: number, n = HIST_BUCKETS.length): string => (i === 0 && from < 0 ? "BR" : i === n - 1 ? `${from}+` : String(from));

export function histogram(levels: number[], band?: { low: number; high: number }): ClassReport["distribution"] {
  return HIST_BUCKETS.map((from, i) => {
    const to = i === HIST_BUCKETS.length - 1 ? 9999 : i === 0 ? HIST_BUCKETS[1] - 1 : from + 99;
    const count = levels.filter((l) => (i === 0 ? l <= to : l >= from && l <= to)).length;
    return { from, to, count, inBand: !!band && to >= band.low && from <= band.high, label: bucketLabel(from, i) };
  });
}

export async function classReport(repo: Repo, actor: Actor, classId: string, now = new Date(), weeks = 12): Promise<ClassReport> {
  const klass = await assertClassRead(repo, actor, classId);
  const grade = await gradeOfClass(repo, klass);
  const band = gradeBand(grade);
  const ids = await classMembers(repo, classId);
  const d = await loadData(repo, ids);
  const nowT = now.getTime(), thisWeek = weekStart(nowT);
  const rows: StudentReportRow[] = ids.map((id) => {
    const st = d.rr.get(id);
    const runs = d.runs.filter((r) => s(r.studentId) === id);
    const ft = goalRuns(runs); // the engine's goal readings (one credit per article, careful reads only)
    const arts = articleRuns(runs);
    const last = Math.max(0, ...runs.map((r) => Math.max(time(r.completedAt) ?? 0, time(r.startedAt) ?? 0)));
    const level = st ? Number(st.level) : null, start = st ? Number(st.startLevel) : null;
    const placedAt = st ? time(st.placedAt)! : null;
    const gw = st ? goalWeeks(placedAt!, Number(st.weeklyGoal ?? 2), ft.map((r) => ({ at: time(r.completedAt)!, score: Number(r.score) })), nowT) : { met: 0, weeks: 0 };
    const lastRef = last || placedAt || 0;
    const sig = st ? readingSignals(runs, { placedAt: placedAt!, weeklyGoal: Number(st.weeklyGoal ?? 2) }, (d.changes.get(id) ?? []).map((c) => c.at), nowT) : null;
    return {
      studentId: id, name: d.names.get(id) ?? "Student", placed: !!st, level, startLevel: start, growth: st ? level! - start! : null, source: st ? s(st.source) : null,
      mapLexile: d.map.get(id)?.lexile ?? null,
      weekArticles: arts.filter((r) => time(r.completedAt)! >= thisWeek).length, totalArticles: arts.length, runs: runs.filter((r) => r.completedAt).length,
      stretchArticles: stretchRuns(runs).length,
      firstTryAvg: avg(arts.map((r) => Number(r.score))), goal: st ? Number(st.weeklyGoal ?? 2) : 0, goalMet: gw.met, goalWeeks: gw.weeks,
      lastActivity: last ? new Date(last).toISOString() : null,
      writingToScore: runs.filter((r) => s(r.writing).trim() && (r.writingScore === null || r.writingScore === undefined)).length,
      flags: { notPlaced: !st, inactive: !!st && nowT - lastRef >= INACTIVE_DAYS * DAY, belowBand: level !== null && level < band.low, notReading: !!sig?.notReading, belowGoal: !!sig?.belowGoal, missedGoal2w: !!sig?.missedGoal2w },
      placementOpen: d.openTest.has(id),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  // weekly history (end of each week), oldest first
  const ends = Array.from({ length: weeks }, (_, i) => thisWeek - (weeks - 1 - i) * 7 * DAY + 7 * DAY - 1).map((t) => Math.min(t, nowT));
  const series = rows.filter((r) => r.placed).map((r) => {
    const st = d.rr.get(r.studentId)!;
    const info = { startLevel: Number(st.startLevel), placedAt: time(st.placedAt)! };
    return { studentId: r.studentId, name: r.name, points: ends.map((t) => levelAt(info, d.changes.get(r.studentId) ?? [], t)) };
  });
  // the current level wins for "now" (a change may not have a history row)
  for (const sr of series) sr.points[sr.points.length - 1] = rows.find((r) => r.studentId === sr.studentId)!.level;
  const medianSeries = ends.map((_, i) => median(series.map((x) => x.points[i]).filter((v): v is number => v !== null)));
  const placed = rows.filter((r) => r.placed);
  return {
    classId, className: s(klass.name), grade, band, students: rows,
    summary: {
      students: rows.length, placed: placed.length, notPlaced: rows.length - placed.length, medianLevel: median(placed.map((r) => r.level!)),
      avgGrowth: avg(placed.map((r) => r.growth!)), inactive: rows.filter((r) => r.flags.inactive).length, belowBand: rows.filter((r) => r.flags.belowBand).length,
      writingToScore: rows.reduce((a, r) => a + r.writingToScore, 0),
      notReading: rows.filter((r) => r.flags.notReading).length, belowGoal: rows.filter((r) => r.flags.belowGoal).length, missedGoal2w: rows.filter((r) => r.flags.missedGoal2w).length,
    },
    // round 4: the label is the week's Sunday in Riyadh time (weekStart is Saturday 21:00 UTC)
    history: { weeks: ends.map((t) => weekLabel(weekStart(t))), series, median: medianSeries },
    distribution: histogram(placed.map((r) => r.level!), band),
  };
}

// ------------------------------------------------------------------ skills

export interface SkillCell { correct: number; total: number; pct: number | null }
export interface SkillsReport {
  skills: string[];
  classBySkill: Record<string, SkillCell>;
  students: { studentId: string; name: string; bySkill: Record<string, SkillCell>; total: SkillCell }[];
}

const cell = (c: number, t: number): SkillCell => ({ correct: c, total: t, pct: t ? Math.round((100 * c) / t) : null });

/** The class's careful answers through the ONE tally (first-try.ts tallyRuns → tallyAnswers). */
async function classTally(repo: Repo, runs: Row[]) {
  const counted = firstTryDone(runs);
  const key = await questionKeys(repo, [...new Set(counted.map((r) => s(r.articleId)))]);
  return tallyAnswers(counted, keyRowsLookup(key));
}
/** student → (group → [correct, total]) */
function perStudent(answers: ReturnType<typeof tallyAnswers>, group: (a: ReturnType<typeof tallyAnswers>[number]) => string): Map<string, Map<string, [number, number]>> {
  const by = new Map<string, typeof answers>();
  for (const a of answers) { const l = by.get(a.studentId); if (l) l.push(a); else by.set(a.studentId, [a]); }
  return new Map([...by].map(([id, list]) => [id, tallyBy(list, group)]));
}

/** First-try accuracy by question skill (central idea, inference, vocabulary …), per class and per student. */
export async function skillsReport(repo: Repo, actor: Actor, classId: string): Promise<SkillsReport> {
  await assertClassRead(repo, actor, classId);
  const ids = await classMembers(repo, classId);
  const d = await loadData(repo, ids, { map: false });
  // round 4: the ONE accuracy tally (first-try.ts): counted first tries of reliable runs, rapid answers out, skills normalised
  const answers = await classTally(repo, d.runs);
  const classT = tallyBy(answers, (a) => a.type);
  const tally = perStudent(answers, (a) => a.type);
  const skills = [...new Set([...RR_SKILLS, ...classT.keys()])].filter((k) => classT.has(k));
  const toCells = (m: Map<string, [number, number]>) => Object.fromEntries([...m].map(([k, [c, t]]) => [k, cell(c, t)]));
  return {
    skills,
    classBySkill: toCells(classT),
    students: ids.map((id) => {
      const m = tally.get(id) ?? new Map();
      const tot = [...m.values()].reduce((a, [c, t]) => [a[0] + c, a[1] + t], [0, 0]);
      return { studentId: id, name: d.names.get(id) ?? "Student", bySkill: toCells(m), total: cell(tot[0], tot[1]) };
    }).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ------------------------------------------------------------------ standards (CCSS Reading Anchor Standards)

export interface StandardsReport {
  standards: string[];
  classByStandard: Record<string, SkillCell>;
  students: { studentId: string; name: string; byStandard: Record<string, SkillCell>; total: SkillCell }[];
}

/**
 * First-try accuracy by CCSS Reading Anchor Standard (CCRA.R.1–6), per class and per student. Each question's
 * skill tag is mapped to the one anchor standard it measures (standardOfSkill, ./growth-words.ts) — questions
 * are not individually tagged with a standard, so several skills (e.g. cause-effect, sequence, compare) roll
 * up into the one standard (CCRA.R.3) they all belong to.
 */
export async function standardsReport(repo: Repo, actor: Actor, classId: string): Promise<StandardsReport> {
  await assertClassRead(repo, actor, classId);
  const ids = await classMembers(repo, classId);
  const d = await loadData(repo, ids, { map: false });
  // round 4: the ONE accuracy tally (first-try.ts), each type rolled up to its anchor standard
  const answers = await classTally(repo, d.runs);
  const classT = tallyBy(answers, (a) => standardOfSkill(a.type));
  const tally = perStudent(answers, (a) => standardOfSkill(a.type));
  const standards = [...classT.keys()].sort();
  const toCells = (m: Map<string, [number, number]>) => Object.fromEntries([...m].map(([k, [c, t]]) => [k, cell(c, t)]));
  return {
    standards,
    classByStandard: toCells(classT),
    students: ids.map((id) => {
      const m = tally.get(id) ?? new Map();
      const tot = [...m.values()].reduce((a, [c, t]) => [a[0] + c, a[1] + t], [0, 0]);
      return { studentId: id, name: d.names.get(id) ?? "Student", byStandard: toCells(m), total: cell(tot[0], tot[1]) };
    }).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ------------------------------------------------------------------ polls

export interface PollRow { articleId: string; title: string; responses: number; before: number[]; after: number[]; avgBefore: number | null; avgAfter: number | null; shift: number | null; changed: number }

/** Per article: how the class answered the poll before vs after reading (0 strongly agree … 3 strongly disagree). */
export async function pollReport(repo: Repo, actor: Actor, classId: string): Promise<PollRow[]> {
  await assertClassRead(repo, actor, classId);
  const ids = await classMembers(repo, classId);
  const d = await loadData(repo, ids, { map: false });
  const runs = d.runs.filter((r) => r.prePoll !== null && r.prePoll !== undefined && r.postPoll !== null && r.postPoll !== undefined && (r.firstTry === true || r.firstTry === 1));
  const by = new Map<string, Row[]>();
  for (const r of runs) { const l = by.get(s(r.articleId)) ?? []; l.push(r); by.set(s(r.articleId), l); }
  const arts = by.size ? await repo.findMany("RRArticle", { id: { in: [...by.keys()] } }, { select: ["id", "title"] }) : [];
  return [...by].map(([articleId, rs]) => {
    const before = [0, 0, 0, 0], after = [0, 0, 0, 0];
    for (const r of rs) { before[Number(r.prePoll)]++; after[Number(r.postPoll)]++; }
    const ab = avg1(rs.map((r) => Number(r.prePoll))), aa = avg1(rs.map((r) => Number(r.postPoll)));
    return { articleId, title: s(arts.find((a) => a.id === articleId)?.title) || "Article", responses: rs.length, before, after, avgBefore: ab, avgAfter: aa, shift: ab !== null && aa !== null ? Math.round((aa - ab) * 10) / 10 : null, changed: rs.filter((r) => Number(r.prePoll) !== Number(r.postPoll)).length };
  }).sort((a, b) => b.responses - a.responses);
}

// ------------------------------------------------------------------ writing queue

export interface WritingItem { runId: string; studentId: string; name: string; articleId: string; title: string; band: string; prompt: string; checklist: string[]; writing: string; completedAt: string | null; score: number | null; aiScore: number | null; aiComment: string | null }

/** Written answers of a class waiting for a score (newest first); `scored` adds the 20 most recent scored ones. */
export async function writingQueue(repo: Repo, actor: Actor, classId: string, opts: { scored?: boolean } = {}): Promise<{ pending: WritingItem[]; scored: WritingItem[] }> {
  await assertClassRead(repo, actor, classId);
  const ids = await classMembers(repo, classId);
  const d = await loadData(repo, ids, { map: false });
  const withText = d.runs.filter((r) => s(r.writing).trim());
  const articleIds = [...new Set(withText.map((r) => s(r.articleId)))];
  const [arts, prompts] = articleIds.length ? await Promise.all([
    repo.findMany("RRArticle", { id: { in: articleIds } }, { select: ["id", "title"] }),
    repo.findMany("RRPrompt", { articleId: { in: articleIds } }, { select: ["articleId", "band", "prompt", "checklist"] }),
  ]) : [[], []];
  const item = (r: Row): WritingItem => {
    const p = prompts.find((x) => x.articleId === r.articleId && x.band === baseBand(r.band)); // a stretch set (S-M) uses its band's prompt
    let checklist: unknown = p?.checklist ?? [];
    if (typeof checklist === "string") { try { checklist = JSON.parse(checklist); } catch { checklist = []; } }
    return {
      runId: s(r.id), studentId: s(r.studentId), name: d.names.get(s(r.studentId)) ?? "Student", articleId: s(r.articleId), title: s(arts.find((a) => a.id === r.articleId)?.title) || "Article",
      band: s(r.band), prompt: s(p?.prompt), checklist: Array.isArray(checklist) ? checklist.map(String) : [], writing: s(r.writing),
      completedAt: r.completedAt ? new Date(r.completedAt as string).toISOString() : null, score: r.writingScore === null || r.writingScore === undefined ? null : Number(r.writingScore),
      aiScore: r.writingAiScore === null || r.writingAiScore === undefined ? null : Number(r.writingAiScore),
      aiComment: r.writingAiComment ? s(r.writingAiComment) : null,
    };
  };
  const by = (a: WritingItem, b: WritingItem) => s(b.completedAt).localeCompare(s(a.completedAt));
  return {
    pending: withText.filter((r) => r.writingScore === null || r.writingScore === undefined).map(item).sort(by),
    scored: opts.scored ? withText.filter((r) => r.writingScore !== null && r.writingScore !== undefined).map(item).sort(by).slice(0, 20) : [],
  };
}

// ------------------------------------------------------------------ school dashboard

export interface GroupStats {
  students: number; placed: number; notPlaced: number; medianLevel: number | null; band: { low: number; high: number };
  avgGrowth: number | null; perStudentPerWeek: number | null; goalPct: number | null;
}
export interface SchoolDashboard {
  weeks: string[];
  grades: (GroupStats & { grade: number; usage: (number | null)[]; distribution: ClassReport["distribution"] })[];
  classes: (GroupStats & { classId: string; name: string; grade: number; usage: (number | null)[] })[];
  usage: (number | null)[];
  top: { classId: string; name: string; avgGrowth: number }[];
  bottom: { classId: string; name: string; avgGrowth: number }[];
  distribution: ClassReport["distribution"];
}

/** round 4: the school dashboard reads its students this many at a time (512 MB server) */
export const SCHOOL_BATCH = 25;

/**
 * The admin's school-wide view (last 8 weeks for usage and goals).
 * Round 4 (memory): only the runs inside the dashboard's window are read (completedAt ≥ the first week's start —
 * goalWeeks never looks earlier), SCHOOL_BATCH students at a time, only the columns used; class and grade membership
 * are grouped once (Maps), never filtered again per class or grade.
 */
export async function schoolDashboard(repo: Repo, actor: Actor, now = new Date(), weeks = 8): Promise<SchoolDashboard> {
  assertCan(actor, "analytics:school");
  // ⚡ only the columns used below, both reads at once
  const [classes, grades] = actor.schoolId ? await Promise.all([
    repo.findMany("Class", { schoolId: actor.schoolId, deletedAt: null }, { select: ["id", "name", "gradeId"] }),
    repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] }),
  ]) : [[], []];
  const gradeOf = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"] }) : [];
  // membership grouped ONCE: class → students, grade → students
  const classGrade = new Map(classes.map((c) => [s(c.id), gradeOf.get(s(c.gradeId)) ?? 0]));
  const byClass = new Map<string, Set<string>>(), byGrade = new Map<number, Set<string>>();
  for (const m of members) {
    const cid = s(m.classId), sid = s(m.studentId);
    (byClass.get(cid) ?? byClass.set(cid, new Set()).get(cid)!).add(sid);
    const g = classGrade.get(cid) ?? 0;
    (byGrade.get(g) ?? byGrade.set(g, new Set()).get(g)!).add(sid);
  }
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const nowT = now.getTime(), thisWeek = weekStart(nowT);
  const starts = Array.from({ length: weeks }, (_, i) => thisWeek - (weeks - 1 - i) * 7 * DAY);
  const from = new Date(starts[0]);
  // per student: the real level row (placed only) and the counted first tries in the window — SCHOOL_BATCH at a time
  const rrBy = new Map<string, { level: number; startLevel: number; placedAt: number; weeklyGoal: number }>();
  const ftBy = new Map<string, { at: number; score: number }[]>();
  const goalBy = new Map<string, { at: number; score: number }[]>();
  for (let i = 0; i < ids.length; i += SCHOOL_BATCH) {
    const part = ids.slice(i, i + SCHOOL_BATCH);
    const [rr, placements, runs] = await Promise.all([
      repo.findMany("RRStudent", { studentId: { in: part } }, { select: ["studentId", "level", "startLevel", "placedAt", "weeklyGoal", "source"] }),
      repo.findMany("RRPlacement", { studentId: { in: part }, completedAt: { not: null }, result: { not: null } }, { select: ["studentId"] }),
      repo.findMany("RRRun", { studentId: { in: part }, completedAt: { gte: from } }, { select: ["studentId", "articleId", "band", "score", "firstTry", "stretch", "completedAt", "unreliable", "readSeconds"] }),
    ]);
    const placedTest = new Set(placements.map((p) => s(p.studentId)));
    for (const r of rr) if (readRisePlaced(r, placedTest.has(s(r.studentId)))) rrBy.set(s(r.studentId), { level: Number(r.level), startLevel: Number(r.startLevel), placedAt: time(r.placedAt) ?? 0, weeklyGoal: Number(r.weeklyGoal ?? 2) });
    // a stretch whose first read is before the window has no band to compare here: it is left out (never over-counted)
    for (const r of firstTryDone(runs)) { const l = ftBy.get(s(r.studentId)) ?? []; l.push({ at: time(r.completedAt)!, score: Number(r.score) }); ftBy.set(s(r.studentId), l); }
    for (const r of goalRuns(runs)) { const l = goalBy.get(s(r.studentId)) ?? []; l.push({ at: time(r.completedAt)!, score: Number(r.score) }); goalBy.set(s(r.studentId), l); }
  }
  const stats = (studentIds: string[], band: { low: number; high: number }): GroupStats & { usage: (number | null)[] } => {
    const placed = studentIds.filter((id) => rrBy.has(id));
    const levels = placed.map((id) => rrBy.get(id)!.level);
    const usage = starts.map((w) => studentIds.length ? Math.round((10 * studentIds.reduce((a, id) => a + (ftBy.get(id) ?? []).filter((r) => r.at >= w && r.at < w + 7 * DAY).length, 0)) / studentIds.length) / 10 : null);
    let met = 0, wk = 0;
    for (const id of placed) {
      const st = rrBy.get(id)!;
      const g = goalWeeks(st.placedAt, st.weeklyGoal, goalBy.get(id) ?? [], nowT, weeks);
      met += g.met; wk += g.weeks;
    }
    const used = usage.filter((u): u is number => u !== null);
    return {
      students: studentIds.length, placed: placed.length, notPlaced: studentIds.length - placed.length, medianLevel: median(levels), band,
      avgGrowth: avg(placed.map((id) => rrBy.get(id)!.level - rrBy.get(id)!.startLevel)),
      perStudentPerWeek: used.length ? Math.round((10 * used.reduce((a, b) => a + b, 0)) / used.length) / 10 : null,
      goalPct: wk ? Math.round((100 * met) / wk) : null, usage,
    };
  };
  const classRows = classes.map((c) => {
    const grade = classGrade.get(s(c.id)) ?? 0;
    const st = stats([...(byClass.get(s(c.id)) ?? [])], gradeBand(grade));
    return { classId: s(c.id), name: s(c.name), grade, ...st };
  }).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  const gradeLevels = [...new Set(classRows.map((c) => c.grade))].sort((a, b) => a - b);
  const gradeRows = gradeLevels.map((g) => {
    const sids = [...(byGrade.get(g) ?? [])];
    const st = stats(sids, gradeBand(g));
    return { grade: g, ...st, distribution: histogram(sids.filter((id) => rrBy.has(id)).map((id) => rrBy.get(id)!.level), gradeBand(g)) };
  });
  const ranked = classRows.filter((c) => c.avgGrowth !== null).map((c) => ({ classId: c.classId, name: c.name, avgGrowth: c.avgGrowth! })).sort((a, b) => b.avgGrowth - a.avgGrowth);
  const all = stats(ids, { low: 0, high: 0 });
  return {
    // round 4: the label is the week's Sunday in Riyadh time
    weeks: starts.map((w) => weekLabel(w)), grades: gradeRows, classes: classRows, usage: all.usage,
    top: ranked.slice(0, 3), bottom: ranked.length > 3 ? ranked.slice(-3).reverse() : [],
    distribution: histogram(ids.filter((id) => rrBy.has(id)).map((id) => rrBy.get(id)!.level)),
  };
}
