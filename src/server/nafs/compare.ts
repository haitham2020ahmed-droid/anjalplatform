/**
 * 🇸🇦 NAFS center → Reports → COMPARE (owner r75: "did my students go UP or DOWN?" — easy to read, few big numbers):
 *
 *   1. Tests & Booklets — Assessment 1 (before) and Assessment 2 (after) from ONE list of the class's NAFS tests and
 *      Ministry booklets (default: the first and the latest). Per student: before % → after %, the change and an arrow.
 *      FAIR: the change uses the Ministry standards (S01–S13) BOTH assessments have (the whole-test change is shown too);
 *      a warning when they share fewer than half of their standards. The standard that rose / fell the most.
 *   2. Practice (adaptive) — two periods (default: the first 2 weeks of the range vs the last 2 weeks; preset "last
 *      month vs this month"). Per student: accuracy, the hardest level answered right and the standards / skills
 *      mastered, before → after. Rapid guesses and the answers of an Unreliable practice (more than 20 % guesses) are
 *      left out.
 *   3. All — one line per student joining both arrows into one plain case and one action (owner-approved wording).
 *
 * ONE rule for every arrow: up = +5 points or more, down = −5 points or less, anything between = the same.
 * Light: bounded reads (the result list without answers; the answers of the TWO chosen assessments only; the practice
 * answers of the two periods only), everything else in memory. Teacher / admin pages only: students never see it.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { assertNafs } from "../teacher/nafs-access";
import { safeIfBehind } from "../db/schema-errors";
import { isRapidGuess, UNRELIABLE_SHARE } from "../practice/guessing";
import { MOE_BY_CODE, type Difficulty } from "./framework";
import { loadNafsQuestions, nafsIndex } from "./bank";
import { cleanScores, gradeAnswers, json, markOf, nafsClasses, type Answer, type NafsClass } from "./tests";
import { wholeBookletOf } from "./booklet-center";
import { isMastered, targetShort } from "./practice";
import { averageOf, MIN_ANSWERS, roundPct } from "./strengths";

const s = (v: unknown) => String(v ?? "");
const ms = (v: unknown): number => { const t = (v instanceof Date ? v : new Date(s(v))).getTime(); return Number.isFinite(t) ? t : 0; };
const DAY_MS = 86_400_000;
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

// ------------------------------------------------------------------ the ONE up / same / down rule

/** Points (percentage points) of change that count as "went up" / "went down". */
export const MOVE_POINTS = 5;
export type Arrow = "UP" | "SAME" | "DOWN";
export const ARROW_MARK: Record<Arrow, string> = { UP: "⬆️", SAME: "➖", DOWN: "⬇️" };
export const ARROW_NAME: Record<Arrow, string> = { UP: "Went up", SAME: "Same", DOWN: "Went down" };
export const ARROW_RULE = "Went up = 5 points or more higher. Went down = 5 points or more lower. Anything in between = the same.";
/** +5 or more → UP, −5 or less → DOWN, else SAME; null when there is nothing to compare. */
export function arrowOf(change: number | null | undefined): Arrow | null {
  if (change === null || change === undefined || !Number.isFinite(change)) return null;
  return change >= MOVE_POINTS ? "UP" : change <= -MOVE_POINTS ? "DOWN" : "SAME";
}
const diff = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : b - a);
interface Counts { improved: number; same: number; dropped: number }
const countArrows = (list: (Arrow | null)[]): Counts => ({ improved: list.filter((x) => x === "UP").length, same: list.filter((x) => x === "SAME").length, dropped: list.filter((x) => x === "DOWN").length });

/** The plain words of the Compare page's ⓘ tooltips (interface strings). */
export const COMPARE_TIPS = {
  arrow: ARROW_RULE,
  before: "The score on the first assessment (or the first period).",
  after: "The score on the second assessment (or the second period).",
  change: "After minus before, in points. Uses the standards both assessments have, so the comparison is fair.",
  whole: "The change on the whole test (every question), for information.",
  shared: "Only the Ministry standards (S01–S13) that BOTH assessments have are compared, so the comparison is fair.",
  accuracy: "Out of every 100 careful answers, how many were right. Quick guesses (under 3 seconds) are left out.",
  level: "The hardest level the student answered right: Easy, Medium or Hard.",
  mastered: "Standards or skills mastered in that period: 4 of the last 5 answers right, at least 2 of them Medium or Hard.",
  cases: "Tests arrow + practice arrow together: what it means and what to do.",
  only: "These students took only one of the two assessments: give them a make-up test so they can be compared.",
} as const;

export type CompareMode = "tests" | "practice" | "all";
export const COMPARE_MODES: { key: CompareMode; label: string }[] = [{ key: "tests", label: "Tests & Booklets" }, { key: "practice", label: "Practice" }, { key: "all", label: "All" }];
export const cleanMode = (v: unknown): CompareMode => (v === "practice" || v === "all" ? v : "tests");

export interface StudentRef { id: string; name: string; classId: string; className: string }
const rosterOf = (classes: NafsClass[]): StudentRef[] => classes.flatMap((c) => c.students.map((x) => ({ id: x.id, name: x.name, classId: c.id, className: c.name })));

/** Classes side by side (the admin's / several classes' view). */
export interface ClassCompareRow extends Counts { classId: string; name: string; compared: number; before: number | null; after: number | null; change: number | null; arrow: Arrow | null }
function classRows<T extends { classId: string; before: number | null; after: number | null; arrow: Arrow | null }>(classes: { id: string; name: string }[], rows: T[]): ClassCompareRow[] {
  return classes.map((c) => {
    const mine = rows.filter((r) => r.classId === c.id);
    const before = averageOf(mine.map((r) => r.before)), after = averageOf(mine.map((r) => r.after));
    return { classId: c.id, name: c.name, compared: mine.length, before, after, change: diff(before, after), arrow: arrowOf(diff(before, after)), ...countArrows(mine.map((r) => r.arrow)) };
  });
}

// ------------------------------------------------------------------ 1. tests & booklets (pure core)

export interface Acc { sum: number; n: number }
/** One student's result on one assessment: credit per Ministry standard + the whole test (scored answers only). */
export interface Take { studentId: string; classId: string; perStd: Record<string, Acc>; overall: Acc }
export interface TestOption { id: string; title: string; kind: "TEST" | "BOOKLET"; date: string; taken: number }
export interface TestStudentRow extends StudentRef {
  /** the numbers the arrow uses: the SHARED standards when the two have any, else the whole test */
  before: number | null; after: number | null; change: number | null; arrow: Arrow | null;
  wholeBefore: number | null; wholeAfter: number | null; wholeChange: number | null;
  sharedBefore: number | null; sharedAfter: number | null; sharedChange: number | null;
}
export interface StdChange { code: string; short: string; text: string; before: number | null; after: number | null; change: number | null; arrow: Arrow | null }
export interface TestsCompare extends Counts {
  a: TestOption | null; b: TestOption | null; options: TestOption[];
  shared: string[]; onlyA: string[]; onlyB: string[];
  /** they share fewer than half of their standards (or none): compare with care */
  fewShared: boolean; basis: "SHARED" | "WHOLE";
  avgBefore: number | null; avgAfter: number | null; avgChange: number | null;
  wholeAvgBefore: number | null; wholeAvgAfter: number | null;
  rows: TestStudentRow[];
  /** took only one of the two (→ a make-up test); `took` = the one they took */
  onlyOne: (StudentRef & { took: "A" | "B"; pct: number | null })[];
  /** took neither */
  neither: StudentRef[];
  standards: StdChange[]; mostImproved: StdChange | null; mostDropped: StdChange | null;
  classes: ClassCompareRow[];
}

const pctOf = (a: Acc | undefined) => (a && a.n ? roundPct(a.sum, a.n) : null);
const addAcc = (into: Acc, a: Acc | undefined) => { if (a) { into.sum += a.sum; into.n += a.n; } };
const stdsOf = (takes: Take[], declared?: string[]) => new Set([...(declared ?? []), ...takes.flatMap((t) => Object.keys(t.perStd))].filter((c) => MOE_BY_CODE.has(c)));

/**
 * The comparison from the two assessments' results (pure — the tests build it from rows). `standardsA/B` = the
 * standards each assessment HAS (from its questions), so a standard counts as shared even if a student skipped it.
 */
export function compareTests(input: { a: TestOption | null; b: TestOption | null; options?: TestOption[]; standardsA?: string[]; standardsB?: string[]; takesA: Take[]; takesB: Take[]; students: StudentRef[]; classes: { id: string; name: string }[] }): TestsCompare {
  const { a, b, takesA, takesB, students } = input;
  const sa = stdsOf(takesA, input.standardsA), sb = stdsOf(takesB, input.standardsB);
  const order = (l: string[]) => l.sort((x, y) => (MOE_BY_CODE.get(x)?.n ?? 99) - (MOE_BY_CODE.get(y)?.n ?? 99));
  const shared = order([...sa].filter((c) => sb.has(c)));
  const onlyA = order([...sa].filter((c) => !sb.has(c))), onlyB = order([...sb].filter((c) => !sa.has(c)));
  const union = shared.length + onlyA.length + onlyB.length;
  const fewShared = union > 0 && shared.length * 2 < union;
  const basis: TestsCompare["basis"] = shared.length ? "SHARED" : "WHOLE";
  const byA = new Map(takesA.map((t) => [t.studentId, t])), byB = new Map(takesB.map((t) => [t.studentId, t]));
  const sharedOf = (t: Take) => { const acc = { sum: 0, n: 0 }; for (const c of shared) addAcc(acc, t.perStd[c]); return pctOf(acc); };
  const rows: TestStudentRow[] = [], onlyOne: TestsCompare["onlyOne"] = [], neither: StudentRef[] = [];
  const both: { ta: Take; tb: Take }[] = [];
  for (const st of students) {
    const ta = byA.get(st.id), tb = byB.get(st.id);
    if (ta && tb) {
      both.push({ ta, tb });
      const wholeBefore = pctOf(ta.overall), wholeAfter = pctOf(tb.overall);
      const sharedBefore = shared.length ? sharedOf(ta) : null, sharedAfter = shared.length ? sharedOf(tb) : null;
      const before = basis === "SHARED" ? sharedBefore : wholeBefore, after = basis === "SHARED" ? sharedAfter : wholeAfter;
      const change = diff(before, after);
      rows.push({ ...st, before, after, change, arrow: arrowOf(change), wholeBefore, wholeAfter, wholeChange: diff(wholeBefore, wholeAfter), sharedBefore, sharedAfter, sharedChange: diff(sharedBefore, sharedAfter) });
    } else if (ta || tb) onlyOne.push({ ...st, took: ta ? "A" : "B", pct: pctOf((ta ?? tb)!.overall) });
    else neither.push(st);
  }
  // results of students no longer in the roster are left out (they cannot be followed up here)
  rows.sort((x, y) => (x.change ?? 999) - (y.change ?? 999) || x.name.localeCompare(y.name));
  onlyOne.sort((x, y) => x.name.localeCompare(y.name));
  const standards: StdChange[] = shared.map((code) => {
    const ba = { sum: 0, n: 0 }, aa = { sum: 0, n: 0 };
    for (const { ta, tb } of both) { addAcc(ba, ta.perStd[code]); addAcc(aa, tb.perStd[code]); }
    const before = ba.n >= MIN_ANSWERS ? pctOf(ba) : null, after = aa.n >= MIN_ANSWERS ? pctOf(aa) : null;
    const m = MOE_BY_CODE.get(code)!;
    return { code, short: m.short, text: m.text, before, after, change: diff(before, after), arrow: arrowOf(diff(before, after)) };
  });
  const ranked = standards.filter((x) => x.change !== null).sort((x, y) => (y.change ?? 0) - (x.change ?? 0) || x.code.localeCompare(y.code));
  const mostImproved = ranked.find((x) => x.arrow === "UP") ?? null;
  const mostDropped = [...ranked].reverse().find((x) => x.arrow === "DOWN") ?? null;
  const avgBefore = averageOf(rows.map((r) => r.before)), avgAfter = averageOf(rows.map((r) => r.after));
  return {
    a, b, options: input.options ?? [], shared, onlyA, onlyB, fewShared, basis,
    avgBefore, avgAfter, avgChange: diff(avgBefore, avgAfter),
    wholeAvgBefore: averageOf(rows.map((r) => r.wholeBefore)), wholeAvgAfter: averageOf(rows.map((r) => r.wholeAfter)),
    rows, onlyOne, neither, standards, mostImproved, mostDropped,
    ...countArrows(rows.map((r) => r.arrow)),
    classes: classRows(input.classes, rows),
  };
}

// ------------------------------------------------------------------ 1. tests & booklets (the loader)

export const MAX_COMPARE_RESULTS = 5000;
export const MAX_COMPARE_TESTS = 60;

/** The class's NAFS tests and Ministry booklets with results (oldest first) — no answers read. */
async function testOptions(repo: Repo, actor: Actor, classes: NafsClass[]): Promise<TestOption[]> {
  if (!classes.length) return [];
  const rows = await repo.findMany("NafsResult", { classId: { in: classes.map((c) => c.id) }, submittedAt: { not: null } }, { select: ["testId", "studentId", "submittedAt"], orderBy: [{ field: "submittedAt", dir: "desc" }], take: MAX_COMPARE_RESULTS });
  const first = new Map<string, number>(), taken = new Map<string, Set<string>>();
  for (const r of rows) {
    const id = s(r.testId), t = ms(r.submittedAt);
    if (!first.has(id) || t < first.get(id)!) first.set(id, t);
    const set = taken.get(id) ?? new Set<string>(); set.add(s(r.studentId)); taken.set(id, set);
  }
  const ids = [...first.keys()].slice(0, MAX_COMPARE_TESTS);
  if (!ids.length) return [];
  const tests = await repo.findMany("NafsTest", { id: { in: ids }, schoolId: actor.schoolId, deletedAt: null }, { select: ["id", "title", "mode", "settings"] });
  return tests.map((t) => ({ id: s(t.id), title: s(t.title), kind: (wholeBookletOf(t) ? "BOOKLET" : "TEST") as TestOption["kind"], date: new Date(first.get(s(t.id))!).toISOString(), taken: taken.get(s(t.id))?.size ?? 0 }))
    .sort((x, y) => x.date.localeCompare(y.date) || x.title.localeCompare(y.title));
}

/** Default pair: the first and the latest (or the teacher's choice when it is in the list). */
export function pickPair(options: TestOption[], a?: string | null, b?: string | null): { a: TestOption | null; b: TestOption | null } {
  const A = options.find((x) => x.id === a) ?? options[0] ?? null;
  const B = options.find((x) => x.id === b && x.id !== A?.id) ?? [...options].reverse().find((x) => x.id !== A?.id) ?? null;
  return { a: A, b: B };
}

async function takesOf(repo: Repo, actor: Actor, testIds: string[], classes: NafsClass[]): Promise<{ takes: Map<string, Take[]>; standards: Map<string, string[]> }> {
  const takes = new Map<string, Take[]>(), standards = new Map<string, string[]>();
  if (!testIds.length || !classes.length) return { takes, standards };
  const [tests, rows] = await Promise.all([
    repo.findMany("NafsTest", { id: { in: testIds }, schoolId: actor.schoolId, deletedAt: null }, { select: ["id", "questionIds", "marks"] }),
    repo.findMany("NafsResult", { testId: { in: testIds }, classId: { in: classes.map((c) => c.id) }, submittedAt: { not: null } }, { select: ["testId", "classId", "studentId", "answers", "writtenScores", "submittedAt"], orderBy: [{ field: "submittedAt", dir: "desc" }], take: 3000 }),
  ]);
  const idx = new Map((await nafsIndex(repo, actor.schoolId!)).map((e) => [e.id, e]));
  const qs = new Map((await loadNafsQuestions(repo, [...new Set(tests.flatMap((t) => json<string[]>(t.questionIds, [])))])).map((q) => [q.id, q]));
  for (const t of tests) {
    const ids = json<string[]>(t.questionIds, []);
    const marks = json<Record<string, number> | null>(t.marks, null);
    const key = ids.map((id) => qs.get(id)?.correct ?? -1), mk = ids.map((id) => markOf(marks, id));
    const std = ids.map((id) => idx.get(id)?.standard ?? null);
    standards.set(s(t.id), [...new Set(std.filter((c): c is string => Boolean(c)))]);
    const seen = new Set<string>();
    const list: Take[] = [];
    for (const r of rows) {
      if (r.testId !== t.id || seen.has(s(r.studentId))) continue; // the newest result of a student counts
      seen.add(s(r.studentId));
      const ans = json<Answer[]>(r.answers, []);
      const g = gradeAnswers(key, mk, ids.map((_x, i) => ans[i] ?? null), cleanScores(r.writtenScores, key));
      const perStd: Record<string, Acc> = {}, overall = { sum: 0, n: 0 };
      g.credit.forEach((c, i) => { if (c === null) return; overall.sum += c; overall.n++; const k = std[i]; if (k) { const a = perStd[k] ?? { sum: 0, n: 0 }; a.sum += c; a.n++; perStd[k] = a; } });
      list.push({ studentId: s(r.studentId), classId: s(r.classId), perStd, overall });
    }
    takes.set(s(t.id), list);
  }
  return { takes, standards };
}

async function scope(repo: Repo, actor: Actor, classId: string | null | undefined): Promise<{ all: NafsClass[]; classes: NafsClass[] }> {
  await assertNafs(repo, actor);
  const all = await nafsClasses(repo, actor);
  const classes = classId ? all.filter((c) => c.id === classId) : all;
  if (classId && !classes.length) throw new ForbiddenError("Class not found.");
  return { all, classes };
}

/** Tests & Booklets: Assessment 1 vs Assessment 2 for one class (or all the actor's Grade 6 classes). */
export async function nafsCompareTests(repo: Repo, actor: Actor, opts: { classId?: string | null; a?: string | null; b?: string | null } = {}): Promise<TestsCompare> {
  const { classes } = await scope(repo, actor, opts.classId);
  const options = await testOptions(repo, actor, classes);
  const { a, b } = pickPair(options, opts.a, opts.b);
  const { takes, standards } = await takesOf(repo, actor, [a?.id, b?.id].filter((x): x is string => Boolean(x)), classes);
  return compareTests({ a, b, options, standardsA: a ? standards.get(a.id) : [], standardsB: b ? standards.get(b.id) : [], takesA: a ? takes.get(a.id) ?? [] : [], takesB: b ? takes.get(b.id) ?? [] : [], students: rosterOf(classes), classes });
}

// ------------------------------------------------------------------ 2. practice (pure core)

export interface Period { from: string; to: string }
export type PracticePreset = "edges" | "month";
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const startOf = (d: string) => Date.parse(`${d}T00:00:00Z`);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const okDay = (v: unknown) => (DAY_RE.test(s(v)) && Number.isFinite(Date.parse(s(v))) ? s(v) : null);
/** Each period is this many days (the first 2 weeks vs the last 2 weeks). */
export const PERIOD_DAYS = 14;
/** A student needs this many careful answers in EACH period to be compared. */
export const PRACTICE_MIN = 3;

/**
 * The two periods: preset "month" = last calendar month vs this month (up to today); otherwise the first 14 days of
 * the range vs its last 14 days (a range under 28 days is cut in two halves). The range defaults to the data's dates.
 */
export function practicePeriods(o: { from?: unknown; to?: unknown; preset?: unknown; dataFrom?: number | null; dataTo?: number | null; now?: Date }): { a: Period; b: Period; range: Period; preset: PracticePreset } {
  const now = o.now ?? new Date();
  if (o.preset === "month") {
    const y = now.getUTCFullYear(), m = now.getUTCMonth();
    const thisStart = Date.UTC(y, m, 1), lastStart = Date.UTC(y, m - 1, 1);
    const a = { from: ymd(lastStart), to: ymd(thisStart - DAY_MS) }, b = { from: ymd(thisStart), to: ymd(now.getTime()) };
    return { a, b, range: { from: a.from, to: b.to }, preset: "month" };
  }
  let from = okDay(o.from) ?? (o.dataFrom ? ymd(o.dataFrom) : ymd(now.getTime() - 27 * DAY_MS));
  let to = okDay(o.to) ?? (o.dataTo ? ymd(o.dataTo) : ymd(now.getTime()));
  if (from > to) [from, to] = [to, from];
  const days = Math.round((startOf(to) - startOf(from)) / DAY_MS) + 1;
  if (days >= 2 * PERIOD_DAYS) return { a: { from, to: ymd(startOf(from) + (PERIOD_DAYS - 1) * DAY_MS) }, b: { from: ymd(startOf(to) - (PERIOD_DAYS - 1) * DAY_MS), to }, range: { from, to }, preset: "edges" };
  const half = Math.max(1, Math.floor(days / 2));
  return { a: { from, to: ymd(startOf(from) + (half - 1) * DAY_MS) }, b: { from: days > 1 ? ymd(startOf(from) + half * DAY_MS) : from, to }, range: { from, to }, preset: "edges" };
}

export interface PracticeAnswer { studentId: string; runId: string; target: string; difficulty: number; correct: boolean; ms: number; at: number }
export interface PracticeSide { answers: number; right: number; pct: number | null; best: 0 | Difficulty; mastered: number; masteredCodes: string[]; guesses: number }
export interface PracticeStudentRow extends StudentRef { a: PracticeSide; b: PracticeSide; before: number | null; after: number | null; change: number | null; arrow: Arrow | null; enough: boolean }
export interface PracticeCompare extends Counts {
  a: Period; b: Period; range: Period; preset: PracticePreset;
  avgBefore: number | null; avgAfter: number | null; avgChange: number | null;
  rows: PracticeStudentRow[];
  /** practised, but fewer than PRACTICE_MIN careful answers in one of the periods */
  tooFew: PracticeStudentRow[];
  /** answers left out: rapid guesses, and the answers of Unreliable practices */
  guesses: number; unreliable: number;
  classes: ClassCompareRow[];
}
const inPeriod = (p: Period) => { const lo = startOf(p.from), hi = startOf(p.to) + DAY_MS; return (t: number) => t >= lo && t < hi; };

/** One side (one student, one period): careful answers only, in time order. */
function sideOf(list: PracticeAnswer[], guesses: number): PracticeSide {
  const ordered = [...list].sort((x, y) => x.at - y.at);
  const right = ordered.filter((x) => x.correct).length;
  const best = ordered.reduce<number>((m, x) => (x.correct && x.difficulty > m ? x.difficulty : m), 0) as 0 | Difficulty;
  const last = new Map<string, [Difficulty, 0 | 1][]>(), mastered = new Set<string>();
  for (const x of ordered) {
    const l = [...(last.get(x.target) ?? []), [Math.min(3, Math.max(1, x.difficulty)) as Difficulty, x.correct ? 1 : 0] as [Difficulty, 0 | 1]].slice(-5);
    last.set(x.target, l);
    if (isMastered(l)) mastered.add(x.target);
  }
  return { answers: ordered.length, right, pct: roundPct(right, ordered.length), best, mastered: mastered.size, masteredCodes: [...mastered].sort(), guesses };
}

/** The practice comparison from the answers (pure). Rapid guesses and Unreliable practices' answers are left out. */
export function comparePractice(input: { answers: PracticeAnswer[]; periods: { a: Period; b: Period; range: Period; preset: PracticePreset }; students: StudentRef[]; classes: { id: string; name: string }[] }): PracticeCompare {
  const { a, b } = input.periods;
  const inA = inPeriod(a), inB = inPeriod(b);
  const rapid = (x: PracticeAnswer) => isRapidGuess(x.ms);
  // a practice (run) with more than 20 % rapid guesses is Unreliable: none of its answers count
  const perRun = new Map<string, { n: number; g: number }>();
  for (const x of input.answers) { const r = perRun.get(x.runId) ?? { n: 0, g: 0 }; r.n++; if (rapid(x)) r.g++; perRun.set(x.runId, r); }
  const unreliableRuns = new Set([...perRun].filter(([, r]) => r.n > 0 && r.g / r.n > UNRELIABLE_SHARE).map(([k]) => k));
  let guesses = 0, unreliable = 0;
  const careful: PracticeAnswer[] = [];
  const guessesOf = new Map<string, { a: number; b: number }>();
  for (const x of input.answers) {
    if (!inA(x.at) && !inB(x.at)) continue;
    if (rapid(x) || unreliableRuns.has(x.runId)) {
      if (rapid(x)) guesses++; else unreliable++;
      const g = guessesOf.get(x.studentId) ?? { a: 0, b: 0 }; if (inA(x.at)) g.a++; else g.b++; guessesOf.set(x.studentId, g);
      continue;
    }
    careful.push(x);
  }
  const rows: PracticeStudentRow[] = [];
  for (const st of input.students) {
    const mine = careful.filter((x) => x.studentId === st.id);
    const g = guessesOf.get(st.id) ?? { a: 0, b: 0 };
    if (!mine.length && !g.a && !g.b) continue;
    const sa = sideOf(mine.filter((x) => inA(x.at)), g.a), sb = sideOf(mine.filter((x) => inB(x.at) && !inA(x.at)), g.b);
    const enough = sa.answers >= PRACTICE_MIN && sb.answers >= PRACTICE_MIN;
    const before = enough ? sa.pct : null, after = enough ? sb.pct : null;
    rows.push({ ...st, a: sa, b: sb, before, after, change: diff(before, after), arrow: arrowOf(diff(before, after)), enough });
  }
  const compared = rows.filter((r) => r.enough).sort((x, y) => (x.change ?? 999) - (y.change ?? 999) || x.name.localeCompare(y.name));
  const tooFew = rows.filter((r) => !r.enough).sort((x, y) => x.name.localeCompare(y.name));
  const avgBefore = averageOf(compared.map((r) => r.before)), avgAfter = averageOf(compared.map((r) => r.after));
  return { ...input.periods, avgBefore, avgAfter, avgChange: diff(avgBefore, avgAfter), rows: compared, tooFew, guesses, unreliable, ...countArrows(compared.map((r) => r.arrow)), classes: classRows(input.classes, compared) };
}

export const MAX_COMPARE_PRACTICES = 300;
export const MAX_COMPARE_ANSWERS = 20000;

/** Practice: period 1 vs period 2 for one class (or all the actor's Grade 6 classes). Bounded reads. */
export async function nafsComparePractice(repo: Repo, actor: Actor, opts: { classId?: string | null; from?: unknown; to?: unknown; preset?: unknown } = {}, now = new Date()): Promise<PracticeCompare> {
  const { classes } = await scope(repo, actor, opts.classId);
  const empty = (dataFrom: number | null = null, dataTo: number | null = null) => comparePractice({ answers: [], periods: practicePeriods({ ...opts, dataFrom, dataTo, now }), students: rosterOf(classes), classes });
  if (!classes.length || !actor.schoolId) return empty();
  const practices = await safeIfBehind("nafs.compare", repo.findMany("NafsPractice", { schoolId: actor.schoolId, classId: { in: classes.map((c) => c.id) }, deletedAt: null }, { select: ["id"], orderBy: [{ field: "createdAt", dir: "desc" }], take: MAX_COMPARE_PRACTICES }), [] as Row[]);
  if (!practices.length) return empty();
  const pids = practices.map((p) => s(p.id));
  // the data's dates (for the default range) from the runs — never every answer
  const runs = await safeIfBehind("nafs.compare", repo.findMany("NafsPracticeRun", { practiceId: { in: pids } }, { select: ["startedAt", "updatedAt"], take: 6000 }), [] as Row[]);
  if (!runs.length) return empty();
  const dataFrom = Math.min(...runs.map((r) => ms(r.startedAt)).filter(Boolean)), dataTo = Math.max(...runs.map((r) => ms(r.updatedAt) || ms(r.startedAt)));
  const periods = practicePeriods({ ...opts, dataFrom, dataTo, now });
  const lo = new Date(startOf(periods.a.from)), hi = new Date(startOf(periods.b.to) + DAY_MS);
  const rows = await safeIfBehind("nafs.compare", repo.findMany("NafsPracticeAnswer", { practiceId: { in: pids }, at: { gte: lo, lt: hi } }, { select: ["runId", "studentId", "target", "difficulty", "correct", "ms", "at"], orderBy: [{ field: "at", dir: "desc" }], take: MAX_COMPARE_ANSWERS }), [] as Row[]);
  const answers: PracticeAnswer[] = rows.map((r) => ({ studentId: s(r.studentId), runId: s(r.runId), target: s(r.target), difficulty: Number(r.difficulty ?? 2), correct: Boolean(r.correct), ms: Number(r.ms ?? 0), at: ms(r.at) }));
  return comparePractice({ answers, periods, students: rosterOf(classes), classes });
}

// ------------------------------------------------------------------ 3. all (tests + practice in one line)

export type CaseKey = "EXCELLENT" | "NOT_USED" | "LESS_PRACTICE" | "SUPPORT" | "SAME" | "TOO_EARLY";
/** The owner-approved plain meaning and action of each case (teacher-facing only). */
export const CASES: { key: CaseKey; mark: string; name: string; action: string; tests: Arrow | null; practice: Arrow | null }[] = [
  { key: "EXCELLENT", mark: "🌟", name: "Excellent 🌟", action: "Give a bigger challenge", tests: "UP", practice: "UP" },
  { key: "NOT_USED", mark: "⏱️", name: "Understands, but not used to the test yet", action: "Practise the test format and timing", tests: "DOWN", practice: "UP" },
  { key: "LESS_PRACTICE", mark: "💤", name: "Practising less", action: "Encourage more practice", tests: "UP", practice: "DOWN" },
  { key: "SUPPORT", mark: "⚠️", name: "Needs support ⚠️", action: "Small group + contact parent", tests: "DOWN", practice: "DOWN" },
  { key: "SAME", mark: "➖", name: "Same level", action: "Keep the usual plan", tests: null, practice: null },
  { key: "TOO_EARLY", mark: "⏳", name: "Too early to judge", action: "Collect more results first", tests: null, practice: null },
];
export const CASE_BY_KEY = new Map(CASES.map((c) => [c.key, c]));
/** The case of a student from the two arrows: the four up / down pairs, else "Same level", or "Too early" without both. */
export function caseOf(tests: Arrow | null, practice: Arrow | null): CaseKey {
  if (!tests || !practice) return "TOO_EARLY";
  return CASES.find((c) => c.tests === tests && c.practice === practice)?.key ?? "SAME";
}
export interface AllRow extends StudentRef { tests: Arrow | null; testChange: number | null; practice: Arrow | null; practiceChange: number | null; case: CaseKey; before: number | null; after: number | null; arrow: Arrow | null }
export interface AllCompare { tests: TestsCompare; practice: PracticeCompare; rows: AllRow[]; counts: Record<CaseKey, number>; groups: { key: CaseKey; rows: AllRow[] }[]; classes: (ClassCompareRow & { cases: Record<CaseKey, number> })[] }

/** Both comparisons joined per student (pure). Every student of the classes gets a line. */
export function compareAll(t: TestsCompare, p: PracticeCompare, students: StudentRef[], classes: { id: string; name: string }[]): AllCompare {
  const tr = new Map(t.rows.map((r) => [r.id, r])), pr = new Map(p.rows.map((r) => [r.id, r]));
  const rows: AllRow[] = students.map((st) => {
    const a = tr.get(st.id), b = pr.get(st.id);
    const c = caseOf(a?.arrow ?? null, b?.arrow ?? null);
    // for the classes view: the test change (before / after) is the line's number
    return { ...st, tests: a?.arrow ?? null, testChange: a?.change ?? null, practice: b?.arrow ?? null, practiceChange: b?.change ?? null, case: c, before: a?.before ?? null, after: a?.after ?? null, arrow: a?.arrow ?? null };
  }).sort((x, y) => x.name.localeCompare(y.name));
  const zero = () => Object.fromEntries(CASES.map((c) => [c.key, 0])) as Record<CaseKey, number>;
  const counts = zero();
  for (const r of rows) counts[r.case]++;
  return {
    tests: t, practice: p, rows, counts,
    groups: CASES.map((c) => ({ key: c.key, rows: rows.filter((r) => r.case === c.key) })).filter((g) => g.rows.length),
    classes: classRows(classes, rows.filter((r) => r.tests)).map((c) => { const k = zero(); for (const r of rows) if (r.classId === c.classId) k[r.case]++; return { ...c, cases: k }; }),
  };
}

/** All: Tests & Booklets + Practice, joined. */
export async function nafsCompareAll(repo: Repo, actor: Actor, opts: { classId?: string | null; a?: string | null; b?: string | null; from?: unknown; to?: unknown; preset?: unknown } = {}, now = new Date()): Promise<AllCompare> {
  const { classes } = await scope(repo, actor, opts.classId);
  const [t, p] = await Promise.all([nafsCompareTests(repo, actor, opts), nafsComparePractice(repo, actor, opts, now)]);
  return compareAll(t, p, rosterOf(classes), classes);
}

/** Admins (and teachers with several classes) see the classes side by side when no class is chosen. */
export const showClasses = (actor: Actor, classId: string | null, classes: number) => !classId && (isAdmin(actor) || classes > 1);

// ------------------------------------------------------------------ links (the page, the files)

export interface CompareQuery { mode: CompareMode; classId?: string | null; a?: string | null; b?: string | null; from?: string | null; to?: string | null; preset?: string | null }
const pairs = (q: CompareQuery): [string, string][] => [["mode", q.mode], ...(q.classId ? [["class", q.classId]] : []), ...(q.a ? [["a", q.a]] : []), ...(q.b ? [["b", q.b]] : []), ...(q.from ? [["from", q.from]] : []), ...(q.to ? [["to", q.to]] : []), ...(q.preset === "month" ? [["preset", "month"]] : [])] as [string, string][];
export const compareHref = (q: CompareQuery) => `/teacher/nafs?${new URLSearchParams([["tab", "reports"], ["view", "compare"], ...pairs(q)])}`;
export const compareDownload = (format: "xlsx" | "pdf", q: CompareQuery) => `/api/nafs/compare?${new URLSearchParams([["format", format], ...pairs(q).map(([k, v]) => [k === "class" ? "classId" : k, v] as [string, string]), ...(format === "pdf" ? [["print", "1"] as [string, string]] : [])])}`;

export const shortCode = (code: string | null | undefined) => (code ? MOE_BY_CODE.get(code)?.short ?? targetShort(code) : "—");
