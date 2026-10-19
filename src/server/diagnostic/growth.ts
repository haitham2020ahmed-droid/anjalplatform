/**
 * 📈 Diagnostic growth across the year: BOY → MOY → EOY for a class (or the whole grade) and for one student —
 * scores, level changes (Below / On / Above counts), strand and standard deltas, and the students who did not grow.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { studentNames } from "../insights/student-data";
import { areaOfStandard, STRAND_LABEL, type Strand } from "./standards";
import { asPeriod, codeFor, PERIODS, schoolYear, type Period } from "./test";
import { isInvalidResult } from "../curriculum-map/level-evidence";

const s = (v: unknown) => String(v ?? "");
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };
const r1 = (x: number) => Math.round(x * 10) / 10;
const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
type Cell = { correct: number; total: number; score?: number };
const cellPct = (x: Cell) => (typeof x.score === "number" ? x.score : x.total ? r1((100 * x.correct) / x.total) : 0);
type Level = "ABOVE" | "ON" | "BELOW";

/** one finished Diagnostic of one student */
export interface GrowthInput { studentId: string; name: string; period: Period; pct: number; level: Level; byStrand: ({ strand: Strand; carried?: boolean } & Cell)[]; byStandard: ({ anchor: string; code?: string; label?: string } & Cell)[] }
export interface PeriodScore { pct: number; level: Level; strands: Partial<Record<Strand, number>>; anchors: Record<string, number> }
export interface StudentGrowth {
  id: string; name: string; scores: Partial<Record<Period, PeriodScore>>;
  deltas: { boyMoy: number | null; moyEoy: number | null; boyEoy: number | null; total: number | null };
  levelFrom: Level | null; levelTo: Level | null;
  /** null when the student has fewer than two results */
  grew: boolean | null;
  strandDeltas: Partial<Record<Strand, number>>;
}
export interface GrowthSummary {
  periods: Period[];
  levels: Partial<Record<Period, Record<Level, number>>>;
  mean: Partial<Record<Period, number | null>>;
  strands: { strand: Strand; label: string; values: Partial<Record<Period, number | null>>; delta: number | null }[];
  standards: { anchor: string; label: string; values: Partial<Record<Period, number | null>>; delta: number | null }[];
  students: StudentGrowth[];
  notGrowing: StudentGrowth[];
}

const delta = (a?: number | null, b?: number | null) => (a === null || a === undefined || b === null || b === undefined ? null : r1(b - a));
/** the first and the last value of the periods that have one */
const firstLast = <T>(vals: Partial<Record<Period, T | null>>): [T | null, T | null] => { const have = PERIODS.filter((p) => vals[p] !== undefined && vals[p] !== null); return have.length >= 2 ? [vals[have[0]] as T, vals[have[have.length - 1]] as T] : [null, null]; };

/** Pure: growth from finished results (any mix of BOY / MOY / EOY). “Did not grow” = the latest score is not above the first. */
export function summarizeGrowth(rows: GrowthInput[], anchorLabel: (a: string) => string = (a) => a): GrowthSummary {
  const periods = PERIODS.filter((p) => rows.some((r) => r.period === p));
  const byStudent = new Map<string, StudentGrowth>();
  for (const r of rows) {
    const st = byStudent.get(r.studentId) ?? { id: r.studentId, name: r.name, scores: {}, deltas: { boyMoy: null, moyEoy: null, boyEoy: null, total: null }, levelFrom: null, levelTo: null, grew: null, strandDeltas: {} };
    st.scores[r.period] = {
      pct: Number(r.pct), level: r.level,
      // a strand carried over from an earlier result (focus form) is not a new measure
      strands: Object.fromEntries(r.byStrand.filter((x) => !x.carried).map((x) => [x.strand, cellPct(x)])),
      anchors: Object.fromEntries(r.byStandard.filter((x) => x.anchor).map((x) => [x.anchor, cellPct(x)])),
    };
    byStudent.set(r.studentId, st);
  }
  const students = [...byStudent.values()].map((st) => {
    const have = PERIODS.filter((p) => st.scores[p]);
    const first = have.length ? st.scores[have[0]]! : null, last = have.length ? st.scores[have[have.length - 1]]! : null;
    const total = have.length >= 2 ? delta(first!.pct, last!.pct) : null;
    const strandDeltas: Partial<Record<Strand, number>> = {};
    for (const k of Object.keys(STRAND_LABEL) as Strand[]) { const [a, b] = firstLast(Object.fromEntries(have.map((p) => [p, st.scores[p]!.strands[k] ?? null])) as Partial<Record<Period, number | null>>); const dd = delta(a, b); if (dd !== null) strandDeltas[k] = dd; }
    return { ...st, deltas: { boyMoy: delta(st.scores.BOY?.pct, st.scores.MOY?.pct), moyEoy: delta(st.scores.MOY?.pct, st.scores.EOY?.pct), boyEoy: delta(st.scores.BOY?.pct, st.scores.EOY?.pct), total }, levelFrom: first?.level ?? null, levelTo: last?.level ?? null, grew: total === null ? null : total > 0, strandDeltas };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const levels: GrowthSummary["levels"] = {}, mean: GrowthSummary["mean"] = {};
  for (const p of periods) {
    const list = students.map((st) => st.scores[p]).filter((x): x is PeriodScore => !!x);
    levels[p] = { ABOVE: list.filter((x) => x.level === "ABOVE").length, ON: list.filter((x) => x.level === "ON").length, BELOW: list.filter((x) => x.level === "BELOW").length };
    mean[p] = avg(list.map((x) => x.pct));
  }
  const series = <K extends string>(keys: K[], pick: (x: PeriodScore, k: K) => number | undefined) => keys.map((k) => {
    const values: Partial<Record<Period, number | null>> = {};
    for (const p of periods) values[p] = avg(students.map((st) => (st.scores[p] ? pick(st.scores[p]!, k) : undefined)).filter((v): v is number => v !== undefined));
    const [a, b] = firstLast(values);
    return { k, values, delta: delta(a, b) };
  });
  const strandKeys = (Object.keys(STRAND_LABEL) as Strand[]).filter((k) => students.some((st) => PERIODS.some((p) => st.scores[p]?.strands[k] !== undefined)));
  const anchorKeys = [...new Set(students.flatMap((st) => PERIODS.flatMap((p) => Object.keys(st.scores[p]?.anchors ?? {}))))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return {
    periods, levels, mean,
    strands: series(strandKeys, (x, k) => x.strands[k]).map((x) => ({ strand: x.k, label: STRAND_LABEL[x.k], values: x.values, delta: x.delta })),
    standards: series(anchorKeys, (x, k) => x.anchors[k]).map((x) => ({ anchor: x.k, label: anchorLabel(x.k), values: x.values, delta: x.delta })),
    students,
    notGrowing: students.filter((st) => st.grew === false).sort((a, b) => (a.deltas.total ?? 0) - (b.deltas.total ?? 0)),
  };
}

async function inputsFor(repo: Repo, tests: Row[], ids: string[], names: Map<string, { name: string }>, sharedOnly = false): Promise<GrowthInput[]> {
  if (!tests.length || !ids.length) return [];
  const scores = await repo.findMany("DiagnosticScore", { diagnosticId: { in: tests.map((t) => t.id) }, studentId: { in: ids } });
  // r85 audit: a DiagnosticScore with 30%+ rapid-guess answers is "invalid" everywhere else in the codebase
  // (test.ts skips recordLevel/priors for it; tiers.ts, weekly-plan.ts, insights/alerts.ts all exclude it) — this
  // growth panel (and the family/weekly reports built from it) used to still fold the invalid score into the class
  // mean, the BOY→MOY delta and the "did not grow" list, showing a fabricated drop/spike from guessed answers.
  return scores.filter((r) => (!sharedOnly || r.sharedAt) && !isInvalidResult(Number(r.rapid ?? 0), Number(r.total ?? 0))).map((r) => {
    const t = tests.find((x) => x.id === r.diagnosticId)!;
    return { studentId: s(r.studentId), name: names.get(s(r.studentId))?.name ?? "Student", period: asPeriod(t.period), pct: Number(r.pct), level: s(r.level) as Level, byStrand: json(r.byStrand, []), byStandard: json(r.byStandard, []) };
  });
}

/** the tests of the grade for the year (latest year with a test when none is given), one per period */
async function yearTests(repo: Repo, schoolId: string, grade: number, year?: string | null): Promise<{ year: string; tests: Row[] }> {
  const all = (await repo.findMany("DiagnosticTest", { schoolId, grade })).filter((t) => s(t.status) !== "DRAFT");
  const y = year || [...new Set(all.map((t) => s(t.year)))].sort().reverse()[0] || schoolYear();
  const tests = all.filter((t) => s(t.year) === y).sort((a, b) => PERIODS.indexOf(asPeriod(a.period)) - PERIODS.indexOf(asPeriod(b.period)));
  // one test per period (the first built)
  const seen = new Set<string>();
  return { year: y, tests: tests.filter((t) => { const p = asPeriod(t.period); if (seen.has(p)) return false; seen.add(p); return true; }) };
}

export interface ClassGrowth extends GrowthSummary { grade: number; year: string; scope: string; classId: string | null; classes: { id: string; name: string }[]; tests: { period: Period; id: string; title: string }[] }

/** The growth panel of a class of the teacher (or, for admins and coordinators, the whole grade when classId is empty). */
export async function classGrowth(repo: Repo, actor: Actor, input: { grade: number; classId?: string | null; year?: string | null }): Promise<ClassGrowth> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  const gradeRow = (await repo.findMany("Grade", { schoolId: actor.schoolId, level: input.grade }))[0];
  const mine = (await readableClasses(repo, actor)).filter((c) => gradeRow && s(c.gradeId) === s(gradeRow.id) && !c.deletedAt).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  if (!mine.length) throw new ForbiddenError("You have no class in this grade.");
  const whole = !input.classId && actor.role !== "TEACHER";
  const scope = input.classId ? mine.filter((c) => c.id === input.classId) : whole ? mine : [mine[0]];
  if (!scope.length) throw new ForbiddenError("This class is not yours.");
  const ids = [...new Set((await repo.findMany("ClassMembership", { classId: { in: scope.map((c) => s(c.id)) }, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))];
  const { year, tests } = await yearTests(repo, s(actor.schoolId), input.grade, input.year);
  const names = await studentNames(repo, ids);
  const sum = summarizeGrowth(await inputsFor(repo, tests, ids, names), (a) => areaOfStandard(codeFor(a, input.grade))?.label ?? a);
  return { ...sum, grade: input.grade, year, scope: whole ? `Grade ${input.grade} · all classes` : s(scope[0].name), classId: whole ? null : s(scope[0].id), classes: mine.map((c) => ({ id: s(c.id), name: s(c.name) })), tests: tests.map((t) => ({ period: asPeriod(t.period), id: s(t.id), title: s(t.title) })) };
}

/** One student's growth this year (staff of their class; the student or their parent see shared results only). */
export async function studentGrowth(repo: Repo, actor: Actor, studentId: string, year?: string | null): Promise<(StudentGrowth & { year: string; strands: GrowthSummary["strands"]; standards: GrowthSummary["standards"] }) | null> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Student not found.");
  const family = actor.role === "STUDENT" || actor.role === "PARENT";
  if (actor.role === "STUDENT" && actor.studentId !== studentId) throw new ForbiddenError("Student not found.");
  if (actor.role === "PARENT" && !actor.parentChildIds?.has(studentId)) throw new ForbiddenError("Student not found.");
  const m = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  if (!family) {
    assertCan(actor, "reports:read");
    if (actor.role === "TEACHER" && !(await readableClasses(repo, actor)).some((c) => m && c.id === m.classId)) throw new ForbiddenError("This student is not in your classes.");
  }
  const klass = m ? await repo.findUnique("Class", { id: m.classId }) : null;
  const g = klass ? await repo.findUnique("Grade", { id: klass.gradeId }) : null;
  if (!g) return null;
  const grade = Number(g.level);
  const { year: y, tests } = await yearTests(repo, s(actor.schoolId), grade, year);
  const names = await studentNames(repo, [studentId]);
  const sum = summarizeGrowth(await inputsFor(repo, tests, [studentId], names, family), (a) => areaOfStandard(codeFor(a, grade))?.label ?? a);
  const me = sum.students[0];
  return me ? { ...me, year: y, strands: sum.strands, standards: sum.standards } : null;
}
