/**
 * 🇸🇦 "Complete NAFS test (all standards)": the guide's proportions and the COVERAGE of a list of questions over the
 * 13 Ministry standards (S01–S13, under the three content areas). Pure and client-safe (the builder recomputes the
 * table after every change the teacher makes): each standard → questions, difficulty mix, PIRLS processes, covered
 * or not, and how many the bank lacks. A question without a Ministry standard never covers one.
 */
import { DIFFICULTIES, MOE_AREAS, MOE_STANDARDS, PROCESSES, type Difficulty, type MoeArea, type NafsProcess } from "./framework";

/** The fewest questions of a complete test: one per standard. */
export const FULL_MIN_QUESTIONS = MOE_STANDARDS.length;
/** The guide's complete model: two texts of 35 questions. */
export const FULL_MAX_QUESTIONS = 70;
/** Default difficulty of a complete test: balanced (30% Easy, 40% Medium, 30% Hard). */
export const BALANCED_MIX = { 1: 30, 2: 40, 3: 30 } as const;
export const FULL_DEFAULT = { questions: 35, minutes: 45, written: true } as const;
/** The guide's timing (35 questions, 45 minutes) scaled to n questions. */
export const fullMinutes = (n: number) => Math.max(10, Math.min(120, Math.round((Math.max(1, n) * 45) / 35)));

/** Largest remainder over weights (ties in the given order); always adds up to total. */
function share(total: number, weights: [string, number][]): Record<string, number> {
  const sum = weights.reduce((a, [, w]) => a + w, 0) || 1;
  const raw = weights.map(([k, w]) => ({ k, v: (total * w) / sum }));
  const out = Object.fromEntries(raw.map((r) => [r.k, Math.floor(r.v)]));
  let left = total - raw.reduce((a, r) => a + Math.floor(r.v), 0);
  for (const r of [...raw].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))) { if (left <= 0) break; out[r.k]++; left--; }
  return out;
}

/**
 * Questions per standard for a complete test of `total` questions: NEVER below one per standard (so at least 13);
 * every standard one, the rest shared over the guide's weights beyond one (3 → 2 extra; S11 and S12 keep one):
 * 13 → 1 each · 35 → the guide (3 … 3, 1, 1, 3) · 70 → twice the guide.
 */
export function fullDistribution(total: number): Record<string, number> {
  const n = Math.max(FULL_MIN_QUESTIONS, Math.min(FULL_MAX_QUESTIONS, Math.round(Number(total) || 0)));
  const extra = n - MOE_STANDARDS.length;
  // beyond the guide's 35, the rest follows the guide's own weights (two texts = twice the guide)
  const guide = MOE_STANDARDS.reduce((a, x) => a + x.perBooklet, 0);
  const extraShare = n <= guide
    ? share(extra, MOE_STANDARDS.map((x) => [x.code, x.perBooklet - 1]))
    : (() => { const over = share(n - guide, MOE_STANDARDS.map((x) => [x.code, x.perBooklet])); return Object.fromEntries(MOE_STANDARDS.map((x) => [x.code, x.perBooklet - 1 + over[x.code]])); })();
  return Object.fromEntries(MOE_STANDARDS.map((x) => [x.code, 1 + (extraShare[x.code] ?? 0)]));
}

/** The teacher's counts per standard, each 1 or more (a missing one = the guide's share). */
export function cleanFullCounts(v: unknown, total: number): Record<string, number> {
  const base = fullDistribution(total);
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  return Object.fromEntries(MOE_STANDARDS.map((x) => {
    const n = Math.round(Number(o[x.code]));
    return [x.code, Number.isFinite(n) ? Math.max(1, Math.min(FULL_MAX_QUESTIONS, n)) : base[x.code]];
  }));
}

export interface CoverItem { id: string; standard: string | null; difficulty: Difficulty; process: NafsProcess; kind?: string; passageId?: string | null; textType?: "LIT" | "INFO" | null }
export interface CoverRow {
  code: string; short: string; area: MoeArea; text: string;
  /** questions wanted (the teacher's count) and in the list now */
  want: number; got: number;
  byDifficulty: Record<Difficulty, number>; processes: NafsProcess[];
  covered: boolean;
  /** usable questions of this standard in the bank (null = unknown) and how many are missing for `want` */
  available: number | null; missing: number;
}
export interface Coverage {
  rows: CoverRow[]; total: number;
  /** standards with no question in the list */
  uncovered: string[];
  /** standards with fewer questions than wanted */
  short: string[];
  /** questions in the list without a Ministry standard (they cover nothing) */
  noStandard: number;
  byDifficulty: Record<Difficulty, number>; byProcess: Record<NafsProcess, number>; missingProcesses: NafsProcess[];
  texts: { LIT: number; INFO: number; other: number };
  duplicates: number;
}

export function fullCoverage(items: CoverItem[], want: Record<string, number>, available?: Record<string, number> | null): Coverage {
  const byDifficulty = { 1: 0, 2: 0, 3: 0 } as Record<Difficulty, number>;
  const byProcess = { P1: 0, P2: 0, P3: 0, P4: 0 } as Record<NafsProcess, number>;
  for (const e of items) { byDifficulty[e.difficulty] = (byDifficulty[e.difficulty] ?? 0) + 1; byProcess[e.process] = (byProcess[e.process] ?? 0) + 1; }
  const rows: CoverRow[] = MOE_STANDARDS.map((x) => {
    const mine = items.filter((e) => e.standard === x.code);
    const d = { 1: 0, 2: 0, 3: 0 } as Record<Difficulty, number>;
    for (const e of mine) d[e.difficulty]++;
    const w = Math.max(1, Math.round(Number(want[x.code] ?? 1)));
    const av = available ? Number(available[x.code] ?? 0) : null;
    return {
      code: x.code, short: x.short, area: x.area, text: x.text, want: w, got: mine.length, byDifficulty: d,
      processes: PROCESSES.filter((p) => mine.some((e) => e.process === p)), covered: mine.length > 0,
      available: av, missing: av === null ? 0 : Math.max(0, w - av),
    };
  });
  const passages = new Map<string, "LIT" | "INFO" | null>();
  for (const e of items) if (e.passageId) passages.set(e.passageId, e.textType ?? passages.get(e.passageId) ?? null);
  const kinds = [...passages.values()];
  return {
    rows, total: items.length,
    uncovered: rows.filter((r) => !r.covered).map((r) => r.code),
    short: rows.filter((r) => r.got < r.want).map((r) => r.code),
    noStandard: items.filter((e) => !e.standard || !MOE_STANDARDS.some((x) => x.code === e.standard)).length,
    byDifficulty, byProcess, missingProcesses: PROCESSES.filter((p) => !byProcess[p]),
    texts: { LIT: kinds.filter((k) => k === "LIT").length, INFO: kinds.filter((k) => k === "INFO").length, other: kinds.filter((k) => !k).length },
    duplicates: items.length - new Set(items.map((e) => e.id)).size,
  };
}

/** The three content areas with their standards (the table's groups). */
export const AREAS_WITH_STANDARDS = MOE_AREAS.map((a) => ({ ...a, standards: MOE_STANDARDS.filter((x) => x.area === a.code).map((x) => x.code) }));
export { DIFFICULTIES };
