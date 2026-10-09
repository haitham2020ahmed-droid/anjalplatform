/**
 * ✏️ MAP manual entry: one table for a whole class, Reading or Language Usage, for one term (Fall, Winter,
 * Spring). Students are matched by their platform record (Student ID), never by name. Goal areas take either
 * the RIT NWEA printed or its descriptor (Low / LoAvg / Avg / HiAvg / High); a descriptor is stored as the RIT
 * at the middle of that percentile range for the grade and season (NWEA norms), so plans and charts work the
 * same way. Saving goes through the same checks as the file import (importMapScores).
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { GOAL_COLUMNS, MAP_TEMPLATE_HEADERS, importMapScores, type MapImportResult } from "./student-map";
import { ensureNationalNorms, nationalNorm, type Season } from "./rit";
import { classMembers, studentNames } from "../insights/student-data";

const s = (v: unknown) => String(v ?? "").trim();
export type EntrySubject = "READING" | "LANGUAGE";
export const BANDS = ["Low", "LoAvg", "Avg", "HiAvg", "High"] as const;
/** the middle percentile of each NWEA descriptor (Low < 21 · LoAvg 21–40 · Avg 41–60 · HiAvg 61–80 · High > 80) */
const BAND_MID: Record<(typeof BANDS)[number], number> = { Low: 10, LoAvg: 30, Avg: 50, HiAvg: 70, High: 90 };
const SEASON_NAME: Record<Season, string> = { FALL: "Fall", WINTER: "Winter", SPRING: "Spring" };

export interface EntryRow { studentId: string; name: string; number: string; rit: string; percentile: string; projection: string; lexile: string; goals: Record<string, string> }
export interface EntryGrid { classId: string; className: string; grade: number; subject: EntrySubject; season: Season; year: number; term: string; goals: { code: string; header: string }[]; rows: EntryRow[]; missingNumbers: number }

const subjectGoals = (subject: EntrySubject) => GOAL_COLUMNS.filter((g) => g.subject === (subject === "READING" ? "READING" : "LANGUAGE_USAGE"));
export const termName = (season: Season, year: number) => `${SEASON_NAME[season]} ${year}`;

/** Inverse of the standard normal CDF (Acklam's rational approximation; plenty for a percentile → RIT). */
function zOf(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q = p < 0.02425 ? Math.sqrt(-2 * Math.log(p)) : p > 1 - 0.02425 ? Math.sqrt(-2 * Math.log(1 - p)) : 0;
  if (p < 0.02425) return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p > 1 - 0.02425) return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  const r = p - 0.5, r2 = r * r;
  return ((((((a[0] * r2 + a[1]) * r2 + a[2]) * r2 + a[3]) * r2 + a[4]) * r2 + a[5]) * r) / (((((b[0] * r2 + b[1]) * r2 + b[2]) * r2 + b[3]) * r2 + b[4]) * r2 + 1);
}

/** A goal-area cell → RIT: a number is kept; a descriptor becomes the RIT at its middle percentile. */
export async function goalRit(repo: Repo, raw: string, grade: number, season: Season): Promise<string> {
  const v = s(raw);
  if (!v) return "";
  if (/^\d{3}$/.test(v)) return v;
  const range = v.match(/^(\d{3})\s*-\s*(\d{3})$/);
  if (range) return String(Math.round((Number(range[1]) + Number(range[2])) / 2));
  const band = BANDS.find((b) => b.toLowerCase() === v.toLowerCase().replace(/[^a-z]/g, ""));
  if (!band) throw new ValidationError(`Goal area “${v}”: write a RIT (e.g. 205) or Low, LoAvg, Avg, HiAvg or High.`);
  await ensureNationalNorms(repo);
  const n = await nationalNorm(repo, grade, season);
  if (!n) throw new ValidationError(`No national norms for Grade ${grade}: write the goal area RIT instead of “${v}”.`);
  return String(Math.round(n.mean + zOf(BAND_MID[band] / 100) * n.sd));
}

export async function mapEntryGrid(repo: Repo, actor: Actor, input: { classId: string; subject: EntrySubject; season: Season; year: number }): Promise<EntryGrid> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const term = termName(input.season, input.year);
  const ids = await classMembers(repo, input.classId);
  const names = await studentNames(repo, ids);
  const results = ids.length ? (await repo.findMany("MapResult", { studentId: { in: ids }, termName: term })).filter((r) => (input.subject === "READING" ? /read/i : /language/i).test(s(r.subject))) : [];
  const goals = subjectGoals(input.subject);
  const areas = await repo.findMany("MapGoalArea", {}, { select: ["id", "code"] });
  const codeOfArea = new Map(areas.map((a) => [s(a.id), s(a.code)]));
  const rows = ids.map((id) => {
    const mine = results.filter((r) => s(r.studentId) === id);
    const o = mine.find((r) => !r.goalName);
    const g: Record<string, string> = {};
    for (const r of mine.filter((x) => x.goalName)) { const code = codeOfArea.get(s(r.goalAreaId)); if (code) g[code] = s(r.rit); }
    const n = names.get(id);
    return {
      studentId: id, name: n?.name ?? "Student", number: n?.number ?? "", rit: o ? s(o.rit) : "", percentile: o?.achievementPercentile !== null && o?.achievementPercentile !== undefined ? s(o.achievementPercentile) : "",
      projection: o && o.projectedGrowth !== null && o.projectedGrowth !== undefined ? String(Number(o.rit) + Number(o.projectedGrowth)) : "", lexile: o?.lexile !== null && o?.lexile !== undefined ? s(o.lexile) : "", goals: g,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { classId: input.classId, className: s(klass.name), grade, subject: input.subject, season: input.season, year: input.year, term, goals: goals.map((x) => ({ code: x.code, header: x.header.replace(/^[RL]:\s*/, "") })), rows, missingNumbers: rows.filter((r) => !r.number).length };
}

/** Saves the table (empty rows are skipped; a filled row replaces that student's scores of this term and subject). */
export async function saveMapEntry(repo: Repo, actor: Actor, input: { classId: string; subject: EntrySubject; season: Season; year: number; rows: Omit<EntryRow, "name" | "number">[] }, now = new Date()): Promise<MapImportResult> {
  assertCan(actor, "assignments:create");
  if (!(input.year >= 2000 && input.year <= 2100)) throw new ValidationError("Choose the year of the test (e.g. 2026).");
  const grid = await mapEntryGrid(repo, actor, input);   // checks the class and gives each student's ID
  const byId = new Map(grid.rows.map((r) => [r.studentId, r]));
  const H = MAP_TEMPLATE_HEADERS, col = (h: string) => H.indexOf(h);
  const read = input.subject === "READING";
  const goals = subjectGoals(input.subject);
  const table: string[][] = [[...H]];
  const errors: MapImportResult["errors"] = [];
  for (const r of input.rows) {
    const st = byId.get(r.studentId);
    if (!st) continue;   // not in this class: ignored
    if (!s(r.rit) && !Object.values(r.goals ?? {}).some((x) => s(x))) continue;
    if (!st.number) { errors.push({ row: 0, message: `${st.name} has no Student ID on the platform: add it in Users first.` }); continue; }
    const row = H.map(() => "");
    row[0] = st.number; row[1] = st.name; row[2] = String(grid.grade);
    row[col(read ? "Reading Fall RIT" : "Language Fall RIT")] = s(r.rit);
    row[col(read ? "Reading Fall Percentile" : "Language Fall Percentile")] = s(r.percentile);
    if (input.season === "FALL") row[col(read ? "Reading Spring Projection" : "Language Spring Projection")] = s(r.projection);
    if (read) row[col("Fall Lexile")] = s(r.lexile);
    try { for (const g of goals) row[col(g.header)] = await goalRit(repo, s(r.goals?.[g.code]), grid.grade, input.season); }
    catch (e) { if (e instanceof ValidationError) { errors.push({ row: 0, message: `${st.name}: ${e.message}` }); continue; } throw e; }
    if (s(r.goals && Object.values(r.goals).join("")) && !s(r.rit)) { errors.push({ row: 0, message: `${st.name}: write the overall RIT too.` }); continue; }
    table.push(row);
  }
  if (table.length === 1) return { imported: 0, skipped: 0, errors: errors.length ? errors : [{ row: 0, message: "Nothing to save: write at least one RIT." }], term: grid.term, created: [] };
  const date = new Date(Date.UTC(input.season === "FALL" ? input.year : input.year, input.season === "FALL" ? 8 : input.season === "WINTER" ? 0 : 3, 15));
  const r = await importMapScores(repo, actor, table, input.year, now, { term: { name: grid.term, date } });
  // the file import numbers rows by line: here a name is clearer
  const nameOfRow = (row: number) => table[row - 1]?.[1] ?? "";
  return { ...r, errors: [...errors, ...r.errors.map((e) => ({ row: 0, message: e.row ? `${nameOfRow(e.row)}: ${e.message}` : e.message }))] };
}
