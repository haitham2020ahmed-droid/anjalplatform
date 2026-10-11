/**
 * ⚡ The 60-second speed drill: a grid of words, one sound/spelling pattern per row, built from the student's own
 * missed words and patterns (FluencyPractice.errors / patterns) plus the original word bank (drill-words.ts).
 * The student reads the rows aloud for one minute; the score is words correct per minute, and a row with more
 * than one miss means "reteach this pattern".
 */
import { DRILL_PATTERNS, PATTERN_BY_CODE, patternForError, patternsOfNotes } from "./drill-words";

export interface DrillRow { pattern: string; label: string; tip: string; words: string[] }
export interface DrillGrid { rows: DrillRow[] }
export const DRILL_ROWS = 5, DRILL_PER_ROW = 6, DRILL_SECONDS = 60;
const DEFAULT_ORDER = ["MULTI", "ED", "TION", "TH", "CLUSTER", "AR_OR", "ER_IR_UR", "EA_EE", "SILENT", "AI_AY"];

/** A small seeded random generator (deterministic: the same seed builds the same grid). */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const clean = (w: string) => w.toLowerCase().replace(/[^a-z'-]/g, "").replace(/^['-]+|['-]+$/g, "");

/** The patterns to drill, most needed first: the student's missed words and pattern notes, then a default order. */
export function drillPatterns(errorWords: string[], notes: string[], rows = DRILL_ROWS): string[] {
  const count = new Map<string, number>();
  const add = (c: string | null, n = 1) => { if (c && PATTERN_BY_CODE.has(c)) count.set(c, (count.get(c) ?? 0) + n); };
  for (const w of errorWords) add(patternForError(w, notes));
  for (const c of patternsOfNotes(notes)) add(c, 2);
  const mine = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  return [...new Set([...mine, ...DEFAULT_ORDER])].slice(0, rows);
}

/** Builds the grid: each row = the student's own words of that pattern (up to 3) + bank words. */
export function buildDrill(input: { errorWords: string[]; notes: string[]; seed: string; rows?: number; perRow?: number }): DrillGrid {
  const perRow = input.perRow ?? DRILL_PER_ROW;
  const rnd = seeded(input.seed);
  const own = [...new Set(input.errorWords.map(clean).filter((w) => w.length > 1))];
  const used = new Set<string>();
  const rows = drillPatterns(own, input.notes, input.rows ?? DRILL_ROWS).map((code) => {
    const p = PATTERN_BY_CODE.get(code)!;
    const mine = own.filter((w) => patternForError(w, input.notes) === code && !used.has(w)).slice(0, 3);
    mine.forEach((w) => used.add(w));
    const bank = shuffle(p.words.filter((w) => !used.has(w)), rnd).slice(0, perRow - mine.length);
    bank.forEach((w) => used.add(w));
    return { pattern: code, label: p.label, tip: p.tip, words: shuffle([...mine, ...bank], rnd) };
  });
  return { rows };
}

/** Checks a grid sent back by the browser: known patterns, each word from the bank or the student's own words. */
export function validateGrid(data: unknown, ownWords: string[]): DrillGrid | null {
  const o = data as { rows?: unknown } | null;
  if (!o || !Array.isArray(o.rows) || !o.rows.length || o.rows.length > 8) return null;
  const own = new Set(ownWords.map(clean));
  const rows: DrillRow[] = [];
  for (const r of o.rows as { pattern?: unknown; words?: unknown }[]) {
    const p = PATTERN_BY_CODE.get(String(r?.pattern ?? ""));
    if (!p || !Array.isArray(r.words) || !r.words.length || r.words.length > 10) return null;
    const words = (r.words as unknown[]).map((w) => clean(String(w ?? "")));
    if (words.some((w) => !w || (!p.words.includes(w) && !own.has(w)))) return null;
    rows.push({ pattern: p.code, label: p.label, tip: p.tip, words });
  }
  return { rows };
}

export const gridWords = (g: DrillGrid) => g.rows.flatMap((r) => r.words);

export interface DrillResult {
  wordsRead: number; wordsCorrect: number; seconds: number; wcpm: number;
  rows: { pattern: string; label: string; tip: string; reached: number; misses: number; missed: string[]; reteach: boolean }[];
  reteach: string[];
}
/** Words correct per minute over the grid; a row with more than one miss → reteach this pattern. */
export function scoreDrill(grid: DrillGrid, marks: { lastWordIndex: number; errors: { i: number }[] }, seconds: number): DrillResult {
  const words = gridWords(grid);
  const last = Math.min(words.length - 1, marks.lastWordIndex);
  const errs = new Set(marks.errors.filter((e) => e.i <= last).map((e) => e.i));
  const wordsRead = last + 1, wordsCorrect = Math.max(0, wordsRead - errs.size);
  const secs = Math.max(5, Math.min(DRILL_SECONDS, Math.round(seconds)));
  let at = 0;
  const rows = grid.rows.map((r) => {
    const idx = r.words.map((_, k) => at + k); at += r.words.length;
    const reached = idx.filter((i) => i <= last).length;
    const missed = idx.filter((i) => errs.has(i)).map((i) => words[i]);
    return { pattern: r.pattern, label: r.label, tip: r.tip, reached, misses: missed.length, missed, reteach: missed.length > 1 };
  });
  return { wordsRead, wordsCorrect, seconds: secs, wcpm: Math.round((wordsCorrect * 60) / secs), rows, reteach: rows.filter((r) => r.reteach).map((r) => r.pattern) };
}

/** Every pattern with its label (for pages). */
export const DRILL_LABELS = Object.fromEntries(DRILL_PATTERNS.map((p) => [p.code, p.label])) as Record<string, string>;
