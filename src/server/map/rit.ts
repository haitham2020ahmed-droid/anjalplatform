/**
 * MAP Reading RIT: students ranked by RIT against the national average (NWEA norms, stored in
 * BenchmarkReference with their source) and against their class average.
 *   - National: difference from the grade/season mean, percentile (NWEA's when imported, otherwise
 *     estimated from the mean and SD, marked ≈) and NWEA's bands: Low <21, LoAvg 21–40, Avg 41–60,
 *     HiAvg 61–80, High 81+.
 *   - Class: Above / At / Below the class average, with a ±3 RIT band (MAP's typical standard error).
 * RIT scores come from imported MAP files (MapResult) or are entered by staff here.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { accessibleClasses } from "../teacher/assign";
import { assertClassAccess } from "../teacher/assignments";
import { NATIONAL_NORMS_SOURCE, NATIONAL_READING_NORMS } from "./national-norms";

const s = (v: unknown) => String(v ?? "");
export type Season = "FALL" | "WINTER" | "SPRING";
export const SEASONS: Season[] = ["FALL", "WINTER", "SPRING"];
export const CLASS_BAND_RIT = 3;
const MEAN = "MAP_READING_RIT_MEAN", SD = "MAP_READING_RIT_SD";
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : s(v));

/** “Fall 2026” → FALL; otherwise from the test month (Aug–Nov fall, Dec–Feb winter, Mar–Jul spring). */
export function seasonOf(termName: unknown, testDate?: unknown): Season {
  const t = s(termName).toLowerCase();
  if (/fall|autumn/.test(t)) return "FALL";
  if (/winter/.test(t)) return "WINTER";
  if (/spring/.test(t)) return "SPRING";
  const d = testDate ? new Date(iso(testDate)) : null;
  const m = d && !Number.isNaN(d.getTime()) ? d.getUTCMonth() + 1 : 9;
  return m >= 8 && m <= 11 ? "FALL" : m === 12 || m <= 2 ? "WINTER" : "SPRING";
}

const isReading = (subject: unknown) => /read/i.test(s(subject));

/** Puts the bundled national norms in the database once (never overwrites values an admin changed). */
export async function ensureNationalNorms(repo: Repo): Promise<void> {
  if (await repo.count("BenchmarkReference", { scope: "NATIONAL", metric: MEAN })) return;
  const rows: Row[] = [];
  for (const [g, bySeason] of Object.entries(NATIONAL_READING_NORMS)) for (const season of SEASONS) {
    rows.push({ scope: "NATIONAL", metric: MEAN, gradeLevel: Number(g), season, value: bySeason[season].mean, source: NATIONAL_NORMS_SOURCE, importedAt: new Date() });
    rows.push({ scope: "NATIONAL", metric: SD, gradeLevel: Number(g), season, value: bySeason[season].sd, source: NATIONAL_NORMS_SOURCE, importedAt: new Date() });
  }
  await repo.createMany("BenchmarkReference", rows);
}

export async function nationalNorm(repo: Repo, grade: number, season: Season): Promise<{ mean: number; sd: number; source: string } | null> {
  const rows = await repo.findMany("BenchmarkReference", { scope: "NATIONAL", gradeLevel: grade, season, metric: { in: [MEAN, SD] } });
  const mean = rows.find((r) => r.metric === MEAN), sd = rows.find((r) => r.metric === SD);
  return mean && sd ? { mean: Number(mean.value), sd: Number(sd.value), source: s(mean.source) } : null;
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26): an estimated percentile when NWEA's is not imported. */
function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}
export const bandOf = (pct: number) => (pct < 21 ? "Low" : pct <= 40 ? "LoAvg" : pct <= 60 ? "Avg" : pct <= 80 ? "HiAvg" : "High");

export interface RitRow {
  rank: number; studentId: string; name: string; className: string; classId: string; grade: number; rit: number; term: string;
  national: { mean: number; diff: number; percentile: number | null; estimated: boolean; band: string | null } | null;
  /** NWEA rapid-guessing % of this test (30%+: NWEA suggests a retest) */
  rapidGuess: number | null;
  vsClass: "ABOVE" | "AT" | "BELOW"; classAvg: number; diffClass: number;
  /** Spring projection from the Fall test (Fall RIT + NWEA projected growth); vsProjection = RIT − projection (Winter/Spring) */
  projection: number | null; vsProjection: number | null;
  /** the student's Lexile from MAP (this term, else their latest) */
  lexile: number | null;
}
export interface RitView {
  grades: number[]; classes: { id: string; name: string; grade: number }[]; terms: string[];
  grade: number | null; classId: string | null; term: string | null; season: Season | null;
  norm: { mean: number; sd: number; source: string } | null;
  rows: RitRow[];
  summary: { students: number; average: number | null; atOrAboveNational: number | null; bands: Record<string, number>; classAverages: { classId: string; name: string; average: number; students: number }[] };
  canEdit: boolean;
}

/** Ranked RIT list for a grade (all the actor's classes of it) or one class, for one term (default: latest). */
export async function ritView(repo: Repo, actor: Actor, opts: { grade?: number; classId?: string; term?: string; subject?: "READING" | "LANGUAGE" } = {}): Promise<RitView> {
  assertCan(actor, "reports:read");
  await ensureNationalNorms(repo);
  const all = await accessibleClasses(repo, actor);
  const gradeRows = all.length ? await repo.findMany("Grade", { id: { in: [...new Set(all.map((c) => c.gradeId))] } }, { select: ["id", "level"] }) : [];
  const levelOf = new Map(gradeRows.map((g) => [s(g.id), Number(g.level)]));
  const classes = all.map((c) => ({ id: s(c.id), name: s(c.name), grade: levelOf.get(s(c.gradeId)) ?? 0 })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  const grades = [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b);
  const cls = opts.classId ? classes.find((c) => c.id === opts.classId) ?? null : null;
  const grade = cls ? cls.grade : grades.includes(Number(opts.grade)) ? Number(opts.grade) : grades[0] ?? null;
  const canEdit = actor.role === "TEACHER" || actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  const empty: RitView = { grades, classes, terms: [], grade, classId: cls?.id ?? null, term: null, season: null, norm: null, rows: [], summary: { students: 0, average: null, atOrAboveNational: null, bands: {}, classAverages: [] }, canEdit };
  if (grade === null) return empty;
  const scope = cls ? [cls] : classes.filter((c) => c.grade === grade);
  const members = scope.length ? await repo.findMany("ClassMembership", { classId: { in: scope.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"] }) : [];
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  if (!ids.length) return empty;
  const wantLanguage = opts.subject === "LANGUAGE";
  const results = (await repo.findMany("MapResult", { studentId: { in: ids } })).filter((r) => (wantLanguage ? /language/i.test(s(r.subject)) : isReading(r.subject)) && !r.goalName);
  const time = (r: Row) => new Date(iso(r.testDate)).getTime();
  const termOf = (r: Row) => { if (s(r.termName).trim()) return s(r.termName).trim(); const se = seasonOf(null, r.testDate); return `${se[0]}${se.slice(1).toLowerCase()} ${new Date(iso(r.testDate)).getUTCFullYear()}`; };
  const terms = [...new Set([...results].sort((a, b) => time(b) - time(a)).map(termOf))];
  const term = opts.term && terms.includes(opts.term) ? opts.term : terms[0] ?? null;
  if (!term) return { ...empty, terms };
  const season = seasonOf(term);
  // Reading: mean + SD (2025 norms). Language Usage: the grade-level mean from NWEA's Grade Report (Fall);
  // its SD is not known here, so its percentile is NWEA's own from the file (never estimated)
  const LANGUAGE_FALL_MEAN: Record<number, number> = { 4: 194.7, 5: 201.9, 6: 206.5 };
  const norm = wantLanguage
    ? (season === "FALL" && LANGUAGE_FALL_MEAN[grade] ? { mean: LANGUAGE_FALL_MEAN[grade], sd: 0, source: "NWEA 2025 norms · Language Usage grade-level mean (Grade Report, Fall)" } : null)
    : await nationalNorm(repo, grade, season);
  // one result per student for the term (their most recent test in it)
  const best = new Map<string, Row>();
  for (const r of results.filter((x) => termOf(x) === term)) { const cur = best.get(s(r.studentId)); if (!cur || time(r) > time(cur)) best.set(s(r.studentId), r); }
  const students = best.size ? await repo.findMany("Student", { id: { in: [...best.keys()] } }, { select: ["id", "userId"] }) : [];
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(students.map((x) => [s(x.id), s(users.find((u) => u.id === x.userId)?.displayName ?? "Student")]));
  const classOf = new Map(members.map((m) => [s(m.studentId), s(m.classId)]));
  const byClass = new Map<string, number[]>();
  for (const [sid, r] of best) { const c = classOf.get(sid)!; byClass.set(c, [...(byClass.get(c) ?? []), Number(r.rit)]); }
  const avg = (xs: number[]) => Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10;
  const rows: RitRow[] = [...best.entries()].map(([sid, r]): RitRow => {
    const rit = Number(r.rit), cid = classOf.get(sid)!, classAvg = avg(byClass.get(cid)!);
    let national: RitRow["national"] = null;
    if (norm) {
      const imported = r.achievementPercentile !== null && r.achievementPercentile !== undefined;
      const pct = imported ? Number(r.achievementPercentile) : norm.sd > 0 ? Math.max(1, Math.min(99, Math.round(100 * phi((rit - norm.mean) / norm.sd)))) : null;
      national = { mean: norm.mean, diff: Math.round((rit - norm.mean) * 10) / 10, percentile: pct, estimated: !imported && pct !== null, band: pct === null ? null : bandOf(pct) };
    }
    const diffClass = Math.round((rit - classAvg) * 10) / 10;
    const fall = results.filter((x) => s(x.studentId) === sid && seasonOf(x.termName, x.testDate) === "FALL" && x.projectedGrowth !== null && x.projectedGrowth !== undefined && time(x) <= time(r)).sort((a, b) => time(b) - time(a))[0];
    const projection = fall ? Number(fall.rit) + Number(fall.projectedGrowth) : null;
    const vsProjection = projection !== null && season !== "FALL" ? rit - projection : null;
    const lexRow = r.lexile !== null && r.lexile !== undefined ? r : results.filter((x) => s(x.studentId) === sid && x.lexile !== null && x.lexile !== undefined).sort((a, b) => time(b) - time(a))[0];
    return { rapidGuess: r.rapidGuessPct === null || r.rapidGuessPct === undefined ? null : Number(r.rapidGuessPct), lexile: lexRow ? Number(lexRow.lexile) : null, projection, vsProjection, rank: 0, studentId: sid, name: nameOf.get(sid) ?? "Student", className: scope.find((c) => c.id === cid)?.name ?? "", classId: cid, grade, rit, term, national, vsClass: diffClass > CLASS_BAND_RIT ? "ABOVE" : diffClass < -CLASS_BAND_RIT ? "BELOW" : "AT", classAvg, diffClass };
  }).sort((a, b) => b.rit - a.rit || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].rit === r.rit ? rows[i - 1].rank : i + 1; });
  const bands: Record<string, number> = { Low: 0, LoAvg: 0, Avg: 0, HiAvg: 0, High: 0 };
  for (const r of rows) if (r.national?.band) bands[r.national.band]++;
  return {
    grades, classes, terms, grade, classId: cls?.id ?? null, term, season, norm, rows, canEdit,
    summary: {
      students: rows.length, average: rows.length ? avg(rows.map((r) => r.rit)) : null,
      atOrAboveNational: norm && rows.length ? Math.round((100 * rows.filter((r) => r.rit >= norm.mean).length) / rows.length) : null, bands,
      classAverages: [...byClass].map(([id, xs]) => ({ classId: id, name: scope.find((c) => c.id === id)?.name ?? "", average: avg(xs), students: xs.length })).sort((a, b) => b.average - a.average),
    },
  };
}

/** Staff enter (or correct) Reading RIT scores for a class and term; an existing score for that term is replaced. */
export async function enterRitScores(repo: Repo, actor: Actor, input: { classId: string; term: string; testDate: Date; scores: { studentId: string; rit: number }[] }): Promise<number> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, input.classId);
  const term = s(input.term).replace(/\s+/g, " ").trim();
  if (!/^(Fall|Winter|Spring) \d{4}$/.test(term)) throw new ValidationError("Term must look like “Fall 2026”, “Winter 2027” or “Spring 2027”.");
  const inClass = new Set((await repo.findMany("ClassMembership", { classId: input.classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)));
  let n = 0;
  for (const sc of input.scores) {
    if (!inClass.has(sc.studentId)) throw new ForbiddenError("That student is not in this class.");
    if (!Number.isInteger(sc.rit) || sc.rit < 100 || sc.rit > 350) throw new ValidationError(`RIT ${sc.rit} is not a valid score (100–350).`);
    const old = (await repo.findMany("MapResult", { studentId: sc.studentId, termName: term })).filter((r) => isReading(r.subject) && !r.goalName);
    if (old.length) await repo.deleteMany("MapResult", { id: { in: old.map((r) => r.id) } });
    await repo.create("MapResult", { studentId: sc.studentId, testDate: input.testDate, subject: "Reading", goalName: null, rit: sc.rit, termName: term, importedAt: new Date() });
    n++;
  }
  return n;
}

/** Sets each student's Curriculum Map level from the class comparison (Above / At → On / Below). */
export async function levelsFromClassAverage(repo: Repo, actor: Actor, classId: string, term?: string, now = new Date()): Promise<{ above: number; on: number; below: number }> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  const v = await ritView(repo, actor, { classId, term });
  const out = { above: 0, on: 0, below: 0 };
  for (const r of v.rows) {
    const level = r.vsClass === "ABOVE" ? "ABOVE" : r.vsClass === "BELOW" ? "BELOW" : "ON";
    await repo.upsert("StudentLevel", { studentId: r.studentId }, { level, source: "MAP_RIT", setById: actor.userId, updatedAt: now }, { level, source: "MAP_RIT", setById: actor.userId, updatedAt: now });
    out[level === "ABOVE" ? "above" : level === "BELOW" ? "below" : "on"]++;
  }
  return out;
}

/** Admins update the national norms (e.g. when NWEA publishes new ones). */
export async function updateNationalNorms(repo: Repo, actor: Actor, entries: { grade: number; season: Season; mean: number; sd: number }[], source: string): Promise<void> {
  assertCan(actor, "settings:school");
  if (!s(source).trim()) throw new ValidationError("Write where the norms come from (e.g. NWEA 2025 norms).");
  for (const e of entries) {
    if (!(e.mean > 100 && e.mean < 350 && e.sd > 0 && e.sd < 60)) throw new ValidationError(`Grade ${e.grade} ${e.season}: mean or SD out of range.`);
    for (const [metric, value] of [[MEAN, e.mean], [SD, e.sd]] as const) {
      await repo.upsert("BenchmarkReference", { scope: "NATIONAL", metric, gradeLevel: e.grade, season: e.season }, { value, source: s(source).slice(0, 190), importedAt: new Date() }, { value, source: s(source).slice(0, 190), importedAt: new Date() });
    }
  }
}
