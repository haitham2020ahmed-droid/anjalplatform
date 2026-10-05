/**
 * Import specifications: which columns a file may have (with aliases, so both NWEA's own
 * export headers and the school templates work), how each value is validated, and how
 * MAP goal names are matched to the platform's MAP goal areas.
 * Values are stored exactly as imported; nothing is recalculated or converted.
 */
import { excelSerialToDate } from "./xlsx";

export type DateOrder = "MDY" | "DMY";

export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface Column {
  key: string;
  aliases: string[]; // normalized header names
  required?: boolean;
}

export function mapHeaders(header: string[], cols: Column[]): { index: Record<string, number>; missing: string[]; unknown: string[] } {
  const norm = header.map(normHeader);
  const index: Record<string, number> = {};
  for (const c of cols) {
    const i = norm.findIndex((h) => c.aliases.includes(h));
    if (i >= 0) index[c.key] = i;
  }
  const known = new Set(Object.values(index));
  return {
    index,
    missing: cols.filter((c) => c.required && index[c.key] === undefined).map((c) => c.aliases[0]),
    unknown: header.filter((_, i) => !known.has(i) && !/^goal\d/i.test(normHeader(header[i]))),
  };
}

/** Dates: ISO (2026-09-14), slash dates in the chosen order, or Excel serial numbers. */
export function parseDate(raw: string, order: DateOrder): { date?: Date; error?: string } {
  const v = raw.trim();
  if (!v) return { error: "is empty" };
  if (/^\d{5}(\.\d+)?$/.test(v)) return { date: excelSerialToDate(Number(v)) };
  let y: number, m: number, d: number;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  const sl = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\s.*)?$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (sl) {
    const a = Number(sl[1]), b = Number(sl[2]);
    y = Number(sl[3]);
    [m, d] = order === "MDY" ? [a, b] : [b, a];
    if (m > 12) return { error: `"${v}" is not a valid ${order === "MDY" ? "month/day/year" : "day/month/year"} date. Check the date format setting.` };
  } else return { error: `"${v}" is not a date (use 2026-09-14${order === "MDY" ? " or 9/14/2026" : " or 14/9/2026"})` };
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return { error: `"${v}" is not a real date` };
  if (y < 2000 || y > 2100) return { error: `"${v}" has an unlikely year` };
  return { date };
}

export function parseNumber(raw: string, opts: { min: number; max: number; integer?: boolean; label: string }): { value?: number | null; error?: string } {
  const v = raw.trim();
  if (v === "") return { value: null };
  const n = Number(v);
  if (!Number.isFinite(n)) return { error: `${opts.label} "${v}" is not a number` };
  if (opts.integer && !Number.isInteger(n)) return { error: `${opts.label} "${v}" must be a whole number` };
  if (n < opts.min || n > opts.max) return { error: `${opts.label} ${v} is outside the valid range ${opts.min}–${opts.max}` };
  return { value: n };
}

// --------------------------------------------------------------------- MAP Growth

export const MAP_COLUMNS: Column[] = [
  { key: "studentNumber", aliases: ["studentid", "studentnumber", "studentno", "schoolstudentid"], required: true },
  { key: "subject", aliases: ["subject", "measurementscale", "course"], required: true },
  { key: "testDate", aliases: ["teststartdate", "testdate", "date"], required: true },
  { key: "rit", aliases: ["testritscore", "rit", "ritscore"], required: true },
  { key: "ritSE", aliases: ["teststandarderror", "ritse", "standarderror"] },
  { key: "percentile", aliases: ["testpercentile", "percentile", "achievementpercentile"] },
  { key: "growthPercentile", aliases: ["conditionalgrowthpercentile", "falltospringconditionalgrowthpercentile", "falltowinterconditionalgrowthpercentile", "growthpercentile"] },
  { key: "projectedGrowth", aliases: ["falltospringprojectedgrowth", "typicalfalltospringgrowth", "projectedgrowth"] },
  { key: "termName", aliases: ["termname", "term"] },
];

/** NWEA "Goal1Name/Goal1RitScore/Goal1StdErr" or template "goal_1_name/goal_1_rit". */
export function goalColumns(header: string[]): { n: number; name: number; rit: number; se: number | null }[] {
  const norm = header.map(normHeader);
  const out: { n: number; name: number; rit: number; se: number | null }[] = [];
  for (let n = 1; n <= 10; n++) {
    const name = norm.findIndex((h) => h === `goal${n}name`);
    const rit = norm.findIndex((h) => h === `goal${n}ritscore` || h === `goal${n}rit`);
    const se = norm.findIndex((h) => h === `goal${n}stderr` || h === `goal${n}se`);
    if (name >= 0 && rit >= 0) out.push({ n, name, rit, se: se >= 0 ? se : null });
  }
  return out;
}

export function normalizeSubject(raw: string): { subject?: string; skip?: string } {
  const v = raw.trim().toLowerCase();
  if (/^reading|^read\b/.test(v)) return { subject: "READING" };
  if (/language/.test(v)) return { subject: "LANGUAGE_USAGE" };
  if (!v) return {};
  return { skip: `Subject "${raw.trim()}" is not English (row skipped)` };
}

/** Match an NWEA goal name to a platform MAP goal area code (null = unmatched). */
export function matchGoalArea(goalName: string): string | null {
  const g = goalName.toLowerCase();
  if (/vocabulary/.test(g)) return "VOCAB";
  if (/literary|literature/.test(g)) return /structure|craft|point of view|multimedia/.test(g) ? "LIT_STRUCTURE" : "LIT_THEME";
  if (/informational/.test(g)) return /structure|craft|purpose|point of view|features/.test(g) ? "INFO_STRUCTURE" : "INFO_CENTRAL_IDEA";
  if (/mechanic|capitali|punctuat|spelling/.test(g)) return "LANG_MECHANICS";
  if (/grammar|usage/.test(g)) return "LANG_GRAMMAR";
  if (/style|precise language|word choice/.test(g)) return "WRITING_STYLE";
  if (/support|research|develop/.test(g)) return "WRITING_SUPPORT";
  if (/writ|organi[sz]|plan|cohesion|transition/.test(g)) return "WRITING_ORG";
  return null;
}

// ------------------------------------------------------- other external results (e.g. IXL)

export const EXTERNAL_COLUMNS: Column[] = [
  { key: "studentNumber", aliases: ["studentid", "studentnumber", "studentno"], required: true },
  { key: "skill", aliases: ["skill", "skillname", "skilldescription"], required: true },
  { key: "skillCode", aliases: ["skillcode", "code", "skillid"] },
  { key: "score", aliases: ["smartscore", "score"] },
  { key: "questions", aliases: ["questionsanswered", "questions"] },
  { key: "timeMinutes", aliases: ["timespentmin", "timespentminutes", "minutes", "timespent"] },
  { key: "date", aliases: ["date", "lastpracticed", "lastpracticeddate", "dateanswered"], required: true },
];

export const TEMPLATES: Record<"MAP_RESULTS" | "EXTERNAL_RESULTS", string[][]> = {
  MAP_RESULTS: [
    ["student_number", "term", "subject", "test_date", "rit", "rit_se", "percentile", "growth_percentile", "projected_growth", "goal_1_name", "goal_1_rit", "goal_2_name", "goal_2_rit"],
    ["DEMO-1001", "Fall 2026-2027", "Reading", "2026-09-20", "205", "3.1", "61", "", "8", "Vocabulary: Acquisition and Use", "209", "Literary Text: Key Ideas and Details", "201"],
  ],
  EXTERNAL_RESULTS: [
    ["student_number", "skill", "skill_code", "score", "questions", "time_spent_min", "date"],
    ["DEMO-1001", "Find words using context", "LQN", "80", "24", "12", "2026-10-05"],
  ],
};
