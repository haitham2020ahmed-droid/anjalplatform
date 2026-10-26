/**
 * 📊 MAP Growth reports in NWEA's style, joined to the platform.
 *
 *   - Student Profile: a tile per subject (RIT ± error, percentile, growth, conditional growth index, projected growth
 *     met, Lexile range, test minutes, rapid guessing, projected proficiency), the RIT history against the national
 *     percentile bands, the instructional areas with their descriptor (relative strength / suggested focus), an action
 *     plan, and the Learning Continuum (Reinforce · Develop · Introduce) through the Personal Study Plan.
 *   - Class Profile: the percentile distribution (quintiles), the class against the national mean, the class by
 *     instructional area, test details with retest flags, projected proficiency, the growth summary (only with 10+
 *     students, as NWEA advises) and the achievement × growth quadrant.
 *   - School overview: every grade and class side by side.
 *
 * Everything is read from MapResult rows (file import, data file, template or by hand). National values come from
 * the NWEA norms on the platform (estimated ones are flagged). No data leaves the school.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { readableClasses } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";
import { bandOf, percentileFromNorm, seasonOf, type Season } from "./rit";
import { normFor, type NormPoint } from "./norm-tables";
import { reportStudent, type ReportStudent } from "./map-reports";
import type { Subject } from "./map-plan";
import { mapCache, MAP_KEEP_MS } from "./map-cache";

const s = (v: unknown) => String(v ?? "");
const n = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const isSubj = (subject: Subject) => (v: unknown) => (subject === "READING" ? /read/i : /language/i).test(s(v));
export const SUBJECT_NAME: Record<Subject, string> = { READING: "Reading", LANGUAGE: "Language Usage" };
export const DESCRIPTOR_NAME: Record<string, string> = { Low: "Low", LoAvg: "Low Average", Avg: "Average", HiAvg: "High Average", High: "High" };
/** z-scores of the 21st, 41st, 61st and 81st percentiles: the edges of NWEA's five achievement bands */
const BAND_Z = [-0.806, -0.228, 0.279, 0.878];
export const RAPID_FLAG = 30, SHORT_MINUTES = 15, GROWTH_MIN_N = 10;

const shortLabel = (term: string, season: Season) => { const y = term.match(/(\d{4})/)?.[1] ?? ""; return `${season[0]}${season.slice(1).toLowerCase()} '${y.slice(2)}`; };
const yearOf = (term: string, date: unknown) => Number(term.match(/(\d{4})/)?.[1] ?? new Date(time(date)).getUTCFullYear());
const schoolYear = (season: Season, year: number) => (season === "FALL" ? year : year - 1);
const median = (xs: number[]) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round(((a[m - 1] + a[m]) / 2) * 10) / 10; };
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((t, x) => t + x, 0) / xs.length) * 10) / 10 : null);
const areaName = (goal: string) => s(goal).split(":")[0].trim();
export const quintileOf = (pct: number) => (pct < 21 ? 0 : pct <= 40 ? 1 : pct <= 60 ? 2 : pct <= 80 ? 3 : 4);
export const QUINTILES = ["Low (<21)", "LoAvg (21–40)", "Avg (41–60)", "HiAvg (61–80)", "High (>80)"];

// ------------------------------------------------------------------ proficiency cut scores (school setting)

export type CutScores = Record<Subject, Record<number, number | null>>;
const CUT_KEY = "map.cutScores";
/** The school's Spring “proficient” RIT per grade (used when the data file has no projected proficiency). */
export async function cutScores(repo: Repo, schoolId: string): Promise<CutScores> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: CUT_KEY }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === "object" ? v : {}) as Partial<CutScores>;
  return { READING: { ...(o.READING ?? {}) }, LANGUAGE: { ...(o.LANGUAGE ?? {}) } };
}
export async function setCutScores(repo: Repo, actor: Actor, v: CutScores, now = new Date()): Promise<void> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins set the cut scores.");
  const clean: CutScores = { READING: {}, LANGUAGE: {} };
  for (const subj of ["READING", "LANGUAGE"] as const) for (const [g, x] of Object.entries(v[subj] ?? {})) {
    const val = n(x);
    if (val !== null && (val < 140 || val > 300)) throw new ValidationError(`Grade ${g}: a RIT cut score is between 140 and 300.`);
    clean[subj][Number(g)] = val;
  }
  await repo.upsert("SchoolSetting", { schoolId: s(actor.schoolId), key: CUT_KEY }, { value: clean, updatedBy: actor.userId, updatedAt: now }, { value: clean, updatedBy: actor.userId, updatedAt: now });
}
function projectedLevel(r: { proficiency: string | null; projectedSpring: number | null }, cut: number | null): string | null {
  if (r.proficiency) return r.proficiency;
  if (cut === null || r.projectedSpring === null) return null;
  return r.projectedSpring >= cut ? "Proficient (projected)" : "Not yet proficient (projected)";
}

// ------------------------------------------------------------------ one test result, as the reports show it

export interface TestResult {
  term: string; season: Season; date: string; rit: number; se: number | null; ritLow: number | null; ritHigh: number | null;
  percentile: number | null; descriptor: string | null; growth: number | null; projectedGrowth: number | null; projectedSpring: number | null;
  met: boolean | null; cgi: number | null; cgp: number | null; typicalGrowth: number | null; lexile: number | null; lexileLow: number | null; lexileHigh: number | null;
  minutes: number | null; rapid: number | null; proficiency: string | null; flags: string[];
}
function testOf(r: Row): TestResult {
  const rit = Number(r.rit), se = n(r.ritSE), pct = n(r.achievementPercentile), pg = n(r.projectedGrowth), rapid = n(r.rapidGuessPct), minutes = n(r.testMinutes), growth = n(r.observedGrowth);
  const met = r.metProjectedGrowth ? /^(yes|y|true|met)/i.test(s(r.metProjectedGrowth)) : null;
  const flags: string[] = [];
  if (rapid !== null && rapid >= RAPID_FLAG) flags.push(`Rapid guessing ${rapid}%: consider a retest`);
  if (minutes !== null && minutes < SHORT_MINUTES) flags.push(`Short test (${minutes} min)`);
  if (growth !== null && se !== null && growth < -2 * se) flags.push(`Large drop (${growth} RIT)`);
  return {
    term: s(r.termName), season: seasonOf(r.termName, r.testDate), date: new Date(time(r.testDate)).toISOString().slice(0, 10), rit, se, ritLow: se !== null ? Math.round(rit - se) : null, ritHigh: se !== null ? Math.round(rit + se) : null,
    percentile: pct, descriptor: pct !== null ? bandOf(pct) : null, growth, projectedGrowth: pg, projectedSpring: pg !== null && seasonOf(r.termName, r.testDate) !== "SPRING" ? rit + pg : null,
    met, cgi: n(r.conditionalGrowthIndex), cgp: n(r.growthPercentile), typicalGrowth: n(r.typicalGrowth), lexile: n(r.lexile), lexileLow: n(r.lexileLow), lexileHigh: n(r.lexileHigh),
    minutes, rapid, proficiency: r.proficiency ? s(r.proficiency) : null, flags,
  };
}

// ------------------------------------------------------------------ 🧑‍🎓 Student Profile

export interface HistoryPoint { term: string; label: string; grade: number; rit: number; se: number | null; national: number | null; exact: boolean; bands: number[] | null }
export interface ProfileArea { name: string; rit: number; se: number | null; low: number | null; high: number | null; descriptor: string | null; relative: "STRENGTH" | "FOCUS" | null }
export interface ProfileSubject { subject: Subject; name: string; latest: TestResult; projected: string | null; history: HistoryPoint[]; areas: ProfileArea[]; plan: string[] }
export interface StudentProfile { student: ReportStudent; subjects: ProfileSubject[] }

const AREA_TIPS: [RegExp, string][] = [
  [/informational/i, "Informational text: find the central idea and two supporting details; compare how two articles present the same topic."],
  [/literary/i, "Literary text: talk about the theme and how a character changes; point to the sentence that shows it."],
  [/vocab/i, "Vocabulary: use context clues, prefixes and roots; keep a word log and use new words in sentences."],
  [/mechanic/i, "Mechanics: capitals, commas and spelling patterns — edit one short paragraph a day."],
  [/grammar|usage/i, "Grammar & usage: sentence types, verb tenses and agreement; combine short sentences correctly."],
  [/writ/i, "Writing: plan, then revise for purpose and audience — a clear topic sentence, details and a closing."],
];

export async function studentProfile(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<StudentProfile> {
  assertCan(actor, "reports:read");
  const student = await reportStudent(repo, actor, studentId);
  const rows = await repo.findMany("MapResult", { studentId });
  const cuts = await cutScores(repo, s(actor.schoolId));
  const syNow = now.getUTCMonth() + 1 >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const subjects: ProfileSubject[] = [];
  for (const subject of ["READING", "LANGUAGE"] as const) {
    const mine = rows.filter((r) => isSubj(subject)(r.subject));
    const overall = mine.filter((r) => !r.goalName).sort((a, b) => time(a.testDate) - time(b.testDate));
    if (!overall.length) continue;
    const byTerm = new Map<string, Row>();
    for (const r of overall) byTerm.set(s(r.termName) || s(r.testDate), r);
    const terms = [...byTerm.values()].sort((a, b) => time(a.testDate) - time(b.testDate)).slice(-8);
    const history: HistoryPoint[] = [];
    for (const r of terms) {
      const season = seasonOf(r.termName, r.testDate), grade = student.grade - (syNow - schoolYear(season, yearOf(s(r.termName), r.testDate)));
      const nm = await normFor(repo, subject, grade, season);
      history.push({ term: s(r.termName), label: shortLabel(s(r.termName), season), grade, rit: Number(r.rit), se: n(r.ritSE), national: nm ? Math.round(nm.mean) : null, exact: Boolean(nm?.exact), bands: nm ? BAND_Z.map((z) => Math.round(nm.mean + z * nm.sd)) : null });
    }
    const last = terms[terms.length - 1], latest = testOf(last);
    // instructional areas of the latest term (one per area: several platform goals can hold the same NWEA area)
    const byArea = new Map<string, Row>();
    for (const g of mine.filter((r) => r.goalName && s(r.termName) === s(last.termName))) { const k = areaName(s(g.goalName)); if (!byArea.has(k)) byArea.set(k, g); }
    const areas: ProfileArea[] = [...byArea].map(([name, g]) => {
      const rit = Number(g.rit), se = n(g.ritSE) ?? 6.5;
      const relative = rit - latest.rit >= se ? "STRENGTH" : latest.rit - rit >= se ? "FOCUS" : null;
      return { name, rit, se: n(g.ritSE), low: Math.round(rit - se), high: Math.round(rit + se), descriptor: g.descriptor ? s(g.descriptor) : null, relative } as ProfileArea;
    }).sort((a, b) => b.rit - a.rit);
    const focus = areas.filter((a) => a.relative === "FOCUS"), weakest = focus.length ? focus : areas.length ? [areas[areas.length - 1]] : [];
    const plan: string[] = [];
    if (latest.projectedSpring !== null) plan.push(`Goal: ${latest.projectedSpring} RIT by Spring (${latest.projectedGrowth! >= 0 ? "+" : ""}${latest.projectedGrowth} RIT).`);
    for (const a of weakest.slice(0, 2)) { const tip = AREA_TIPS.find(([re]) => re.test(a.name)); plan.push(tip ? tip[1] : `${a.name}: practise this area first.`); }
    if (areas.some((a) => a.relative === "STRENGTH")) plan.push(`Build on the strength in ${areas.filter((a) => a.relative === "STRENGTH").map((a) => a.name).join(" and ")}: offer harder texts and tasks there.`);
    if (latest.flags.some((f) => /Rapid|Short/.test(f))) plan.push("This score may not show what the student knows (rapid guessing / short test): talk with the student and consider a retest.");
    plan.push("Use the Personal Study Plan: Reinforce · Develop · Introduce statements from the Learning Continuum, with the platform skills to practise.");
    subjects.push({ subject, name: SUBJECT_NAME[subject], latest, projected: projectedLevel(latest, cuts[subject][student.grade] ?? null), history, areas, plan });
  }
  return { student, subjects };
}

// ------------------------------------------------------------------ 👥 Class Profile

export interface ClassStudent { id: string; name: string; test: TestResult; areas: Record<string, { rit: number; descriptor: string | null; estimated: boolean }>; projected: string | null; quadrant: "HIGH_ACH_HIGH_GROWTH" | "HIGH_ACH_LOW_GROWTH" | "LOW_ACH_HIGH_GROWTH" | "LOW_ACH_LOW_GROWTH" | null }
/** One instructional (goal) area's name and how many students fall in each of NWEA's five national-percentile
 *  bands (Low · LoAvg · Avg · HiAvg · High, same order as `QUINTILES`) — the "Instructional Area Achievement
 *  Percentiles" chart's one row, for a whole class (`ClassProfile.areas`) or one student (`studentAreaQuintiles`,
 *  a single 1 in the one band that student's own descriptor falls in). `estimated`: true when at least one of
 *  these counts is not NWEA's own band but one guessed from the area's RIT against the grade/season national
 *  norm (same ≈ estimate the rest of the platform uses when NWEA's own percentile wasn't imported) — this is
 *  what lets a plain RIT-per-area file (no comprehensive data file, no typed band word) still populate this
 *  chart, just marked as an estimate rather than NWEA's own band. */
export interface AreaQuintileRow { name: string; quintiles: number[]; estimated: boolean }
export interface ClassProfile {
  classId: string; className: string; grade: number; subject: Subject; term: string; terms: string[];
  n: number; notTested: { id: string; name: string }[]; meanRit: number | null; medianRit: number | null; medianPct: number | null; national: number | null; nationalExact: boolean;
  quintiles: number[]; areaNames: string[]; areas: (AreaQuintileRow & { mean: number | null })[]; students: ClassStudent[];
  growth: { n: number; meanObserved: number | null; meanProjected: number | null; pctMet: number | null; medianCgp: number | null; enough: boolean };
  /** ⚡ class-average RIT per term (up to the last 8), the same shape `studentProfile`'s own `history` uses — so the
   *  existing `GrowthBandsChart` (built for one student) draws the whole class's line against the same national bands
   *  with no changes of its own. Empty unless the current term has NWEA's advised 10+ tested students (`growth.enough`
   *  uses the same bar) — a sparse class average would be as misleading as the growth summary it already guards. */
  history: HistoryPoint[];
  proficiency: { level: string; count: number }[]; flagged: number;
}

const DESCRIPTORS = ["Low", "LoAvg", "Avg", "HiAvg", "High"];

/** The true ordinal median band index (0–4) from a set of counts — never an invented exact percentile, since the
 *  comprehensive MAP file only gives each area a band (descriptor), not a raw number. `null` with no students banded. */
export function medianQuintile(counts: number[]): number | null {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const mid = (total - 1) / 2;
  let cum = 0;
  for (let i = 0; i < counts.length; i++) { cum += counts[i]; if (cum > mid) return i; }
  return counts.length - 1;
}

/** `ClassProfile.areas`, for one student only — every area the class tracks, one-hot in the band that student's own
 *  descriptor falls in (nothing set for an area this student has no descriptor for yet). Same source, same instructional
 *  areas as the whole-class chart, so the student and class views of "Instructional Area Achievement Percentiles" always
 *  list the same rows. */
export function studentAreaQuintiles(d: ClassProfile, studentId: string): AreaQuintileRow[] {
  const st = d.students.find((x) => x.id === studentId);
  return d.areaNames.map((name) => {
    const quintiles = [0, 0, 0, 0, 0];
    const a = st?.areas[name];
    const i = DESCRIPTORS.indexOf(s(a?.descriptor ?? ""));
    if (i >= 0) quintiles[i] = 1;
    return { name, quintiles, estimated: i >= 0 && Boolean(a?.estimated) };
  });
}

async function termsOf(repo: Repo, ids: string[], subject: Subject, overallOnly = false): Promise<{ terms: string[]; rows: Row[] }> {
  // r79: the school overview needs the overall scores only (not every goal-area row of every student)
  const rows = ids.length ? (await repo.findMany("MapResult", overallOnly ? { studentId: { in: ids }, goalName: null } : { studentId: { in: ids } })).filter((r) => isSubj(subject)(r.subject)) : [];
  const latestByTerm = new Map<string, number>();
  for (const r of rows.filter((x) => !x.goalName)) latestByTerm.set(s(r.termName), Math.max(latestByTerm.get(s(r.termName)) ?? 0, time(r.testDate)));
  return { terms: [...latestByTerm].sort((a, b) => b[1] - a[1]).map(([t]) => t), rows };
}

/** A goal-area RIT with no NWEA descriptor: the same ≈-estimate the rest of the platform already uses for an
 *  overall RIT with no imported percentile — the area RIT against the *subject's* grade/season national norm
 *  (NWEA doesn't publish one per area), bucketed into the same five bands. `null` with no norm to estimate from. */
function estimatedBand(rit: number, norm: NormPoint | null): (typeof DESCRIPTORS)[number] | null {
  if (!norm || norm.sd <= 0) return null;
  // 🔧 fix (Oct 2026): was pctOfZ's logistic approximation — unified onto the one shared true-normal-CDF formula
  // (percentileFromNorm, rit.ts) so this estimate matches the percentile shown everywhere else for the same RIT.
  return DESCRIPTORS[quintileOf(percentileFromNorm(rit, norm)!)];
}

function profileOf(rows: Row[], ids: string[], names: Map<string, { name: string }>, term: string, cut: number | null, norm: NormPoint | null): Omit<ClassProfile, "classId" | "className" | "grade" | "subject" | "terms" | "national" | "nationalExact" | "history"> {
  const students: ClassStudent[] = [];
  const notTested: { id: string; name: string }[] = [];
  const areaSet = new Set<string>();
  // ⚡ r79: each student's rows of the term by id (was a scan of every row of the school for each student)
  const byStudent = new Map<string, Row[]>();
  for (const r of rows) { if (s(r.termName) !== term) continue; const k = s(r.studentId); const l = byStudent.get(k); if (l) l.push(r); else byStudent.set(k, [r]); }
  for (const id of ids) {
    const mine = byStudent.get(id) ?? [];
    const o = mine.filter((r) => !r.goalName).sort((a, b) => time(b.testDate) - time(a.testDate))[0];
    if (!o) { notTested.push({ id, name: names.get(id)?.name ?? "Student" }); continue; }
    const test = testOf(o);
    const areas: ClassStudent["areas"] = {};
    for (const g of mine.filter((r) => r.goalName)) {
      const k = areaName(s(g.goalName));
      if (!areas[k]) {
        const rit = Number(g.rit), real = g.descriptor ? s(g.descriptor) : null;
        areas[k] = real ? { rit, descriptor: real, estimated: false } : { rit, descriptor: estimatedBand(rit, norm), estimated: true };
        areaSet.add(k);
      }
    }
    const q = test.percentile !== null && test.cgp !== null ? `${test.percentile >= 50 ? "HIGH" : "LOW"}_ACH_${test.cgp >= 50 ? "HIGH" : "LOW"}_GROWTH` as ClassStudent["quadrant"] : null;
    students.push({ id, name: names.get(id)?.name ?? "Student", test, areas, projected: projectedLevel(test, cut), quadrant: q });
  }
  students.sort((a, b) => b.test.rit - a.test.rit);
  const pcts = students.map((x) => x.test.percentile).filter((x): x is number => x !== null);
  const quintiles = [0, 0, 0, 0, 0]; for (const p of pcts) quintiles[quintileOf(p)]++;
  const areaNames = [...areaSet].sort();
  const areas = areaNames.map((name) => {
    const v = students.map((x) => x.areas[name]).filter(Boolean);
    const q = [0, 0, 0, 0, 0];
    let estimated = false;
    for (const a of v) { const i = DESCRIPTORS.indexOf(s(a.descriptor)); if (i >= 0) { q[i]++; if (a.estimated) estimated = true; } }
    return { name, mean: mean(v.map((a) => a.rit)), quintiles: q, estimated };
  });
  const grown = students.filter((x) => x.test.growth !== null);
  const metKnown = students.filter((x) => x.test.met !== null);
  const growth = {
    n: grown.length, meanObserved: mean(grown.map((x) => x.test.growth!)), meanProjected: mean(students.filter((x) => x.test.projectedGrowth !== null && x.test.growth !== null).map((x) => x.test.projectedGrowth!)),
    pctMet: metKnown.length ? Math.round((100 * metKnown.filter((x) => x.test.met).length) / metKnown.length) : null, medianCgp: median(students.map((x) => x.test.cgp).filter((x): x is number => x !== null)), enough: grown.length >= GROWTH_MIN_N,
  };
  const prof = new Map<string, number>(); for (const x of students) if (x.projected) prof.set(x.projected, (prof.get(x.projected) ?? 0) + 1);
  return {
    term, n: students.length, notTested, meanRit: mean(students.map((x) => x.test.rit)), medianRit: median(students.map((x) => x.test.rit)), medianPct: median(pcts),
    quintiles, areaNames, areas, students, growth, proficiency: [...prof].map(([level, count]) => ({ level, count })).sort((a, b) => a.level.localeCompare(b.level)), flagged: students.filter((x) => x.test.flags.length).length,
  };
}

// ⚡ Oct 2026 (server-stability audit, r79): every open of a class's Class Profile (achievement × growth, instructional
// areas, quintiles) recomputes the whole class from every member's MapResult rows, from scratch, every time — a
// teacher or admin flipping between Reading/Language or between terms for the same class reruns it each click. The
// access check (assertCan + readableClasses) runs on every call, before the cache, so a class that isn't this actor's
// never reaches a cached answer; once access is confirmed the result depends only on classId/subject/term, same as
// schoolOverview's sibling cache above.
const CLASS_PROFILE_MODELS = ["MapResult", "ClassMembership", "ClassTeacher", "Class", "Student", "Grade", "SchoolSetting", "BenchmarkReference"];
const classProfileCache = mapCache<ClassProfile>("map.nwea-reports.classProfile", MAP_KEEP_MS, 40);

export async function classProfile(repo: Repo, actor: Actor, classId: string, subject: Subject, term?: string | null): Promise<ClassProfile> {
  assertCan(actor, "reports:read");
  const klass = (await readableClasses(repo, actor)).find((c) => c.id === classId);
  if (!klass) throw new ForbiddenError("Class not found.");
  const key = `${classId}|${subject}|${term ?? ""}`;
  return structuredClone(await classProfileCache.get(repo, key, CLASS_PROFILE_MODELS, () => classProfileNow(repo, actor, klass, classId, subject, term)));
}

/** Class-average RIT per term, grouped from the same overall rows `profileOf` already has in memory — no new reads.
 *  Mirrors `studentProfile`'s own per-term loop (grade/season adjustment, same `shortLabel`/norm lookup) but averages
 *  the term's tested students instead of reading one student's row. */
async function classHistoryOf(repo: Repo, rows: Row[], grade: number, subject: Subject, syNow: number): Promise<HistoryPoint[]> {
  const overall = rows.filter((r) => !r.goalName);
  const byTerm = new Map<string, Row[]>();
  for (const r of overall) { const k = s(r.termName) || s(r.testDate); const l = byTerm.get(k); if (l) l.push(r); else byTerm.set(k, [r]); }
  const terms = [...byTerm.entries()].sort((a, b) => time(a[1][0].testDate) - time(b[1][0].testDate)).slice(-8);
  const history: HistoryPoint[] = [];
  for (const [term, rs] of terms) {
    const r0 = rs[0];
    const season = seasonOf(r0.termName, r0.testDate), g = grade - (syNow - schoolYear(season, yearOf(s(r0.termName), r0.testDate)));
    const nm = await normFor(repo, subject, g, season);
    const avg = mean(rs.map((r) => Number(r.rit)));
    if (avg === null) continue;
    history.push({ term, label: shortLabel(s(r0.termName), season), grade: g, rit: avg, se: null, national: nm ? Math.round(nm.mean) : null, exact: Boolean(nm?.exact), bands: nm ? BAND_Z.map((z) => Math.round(nm.mean + z * nm.sd)) : null });
  }
  return history;
}

async function classProfileNow(repo: Repo, actor: Actor, klass: Row, classId: string, subject: Subject, term?: string | null): Promise<ClassProfile> {
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = await classMembers(repo, classId);
  const [names, { terms, rows }, cuts] = await Promise.all([studentNames(repo, ids), termsOf(repo, ids, subject), cutScores(repo, s(actor.schoolId))]);
  const t = term && terms.includes(term) ? term : terms[0] ?? "";
  const season = seasonOf(t, null);
  const nm = t ? await normFor(repo, subject, grade, season) : null;
  const p = profileOf(rows, ids, names, t, cuts[subject][grade] ?? null, nm);
  const syNow = new Date().getUTCMonth() + 1 >= 8 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  const history = p.n >= GROWTH_MIN_N ? await classHistoryOf(repo, rows, grade, subject, syNow) : [];
  return { classId, className: s(klass.name), grade, subject, terms, national: nm ? Math.round(nm.mean * 10) / 10 : null, nationalExact: Boolean(nm?.exact), history, ...p };
}

// ------------------------------------------------------------------ 🏫 School overview (admins; a teacher sees their classes)

export interface OverviewRow { grade: number; classId: string | null; className: string; n: number; meanRit: number | null; national: number | null; medianPct: number | null; quintiles: number[]; meanGrowth: number | null; pctMet: number | null; flagged: number }
export interface SchoolOverview { subject: Subject; term: string; terms: string[]; grades: OverviewRow[]; classes: OverviewRow[] }

/**
 * ⚡ r79: the overview reads every MAP score of the school (an admin): kept per viewer, subject and term until a MAP
 * score, a class or its roster, the cut scores or the norms change (write counters; at most 10 min); at most 8.
 */
const OVERVIEW_MODELS = ["MapResult", "ClassMembership", "ClassTeacher", "Class", "Student", "Grade", "SchoolSetting", "BenchmarkReference"];
const overviewCache = mapCache<SchoolOverview>("map.nwea-reports.overview", MAP_KEEP_MS, 8);
export async function schoolOverview(repo: Repo, actor: Actor, subject: Subject, term?: string | null): Promise<SchoolOverview> {
  assertCan(actor, "reports:read");
  const key = `${actor.userId}|${actor.role}|${s(actor.schoolId)}|${subject}|${term ?? ""}`;
  return structuredClone(await overviewCache.get(repo, key, OVERVIEW_MODELS, () => schoolOverviewNow(repo, actor, subject, term)));
}

async function schoolOverviewNow(repo: Repo, actor: Actor, subject: Subject, term?: string | null): Promise<SchoolOverview> {
  const classes = (await readableClasses(repo, actor)).filter((c) => !c.deletedAt);
  const grades = await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] });
  const levelOf = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const mem = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId", "classId"] }) : [];
  const ids = [...new Set(mem.map((m) => s(m.studentId)))];
  const [names, { terms, rows }, cuts] = await Promise.all([studentNames(repo, ids), termsOf(repo, ids, subject, true), cutScores(repo, s(actor.schoolId))]);
  const t = term && terms.includes(term) ? term : terms[0] ?? "";
  const season = seasonOf(t, null);
  const rowOf = async (grade: number, classId: string | null, className: string, members: string[]): Promise<OverviewRow> => {
    const p = profileOf(rows, members, names, t, cuts[subject][grade] ?? null, null); // overall-only rows here: no goal areas to estimate a band for
    const nm = await normFor(repo, subject, grade, season);
    return { grade, classId, className, n: p.n, meanRit: p.meanRit, national: nm ? Math.round(nm.mean * 10) / 10 : null, medianPct: p.medianPct, quintiles: p.quintiles, meanGrowth: p.growth.meanObserved, pctMet: p.growth.pctMet, flagged: p.flagged };
  };
  const classRows: OverviewRow[] = [];
  for (const c of [...classes].sort((a, b) => (levelOf.get(s(a.gradeId)) ?? 0) - (levelOf.get(s(b.gradeId)) ?? 0) || s(a.name).localeCompare(s(b.name))))
    classRows.push(await rowOf(levelOf.get(s(c.gradeId)) ?? 0, s(c.id), s(c.name), mem.filter((m) => m.classId === c.id).map((m) => s(m.studentId))));
  const gradeRows: OverviewRow[] = [];
  for (const g of [...new Set(classRows.map((r) => r.grade))].sort((a, b) => a - b)) {
    const members = mem.filter((m) => levelOf.get(s(classes.find((c) => c.id === m.classId)?.gradeId)) === g).map((m) => s(m.studentId));
    gradeRows.push(await rowOf(g, null, `Grade ${g}`, [...new Set(members)]));
  }
  return { subject, term: t, terms, grades: gradeRows, classes: classRows };
}
