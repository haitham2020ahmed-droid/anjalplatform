/**
 * 🚀 ReadRise Level — an ESTIMATE on a Lexile-like scale (about 300–1400), not an official Lexile measure.
 *
 * From the public Flesch–Kincaid grade (sentence length + syllables per word), mapped onto the familiar
 * Lexile-style range with a gently flattening curve, fitted on reference texts (a very simple text ≈ 280, a typical
 * Grade 4–5 informational paragraph ≈ 900, a dense high-school science paragraph ≈ 1350):
 *   level ≈ 370 + 76·FKGL − 0.6·FKGL²   (FKGL clamped to −3…18)
 * The fit is re-checked against students' results over time (texts that their readers find much harder or easier).
 * The 12 version levels are 300, 400 … 1400. An official measure (licensed analyzer) can be stored per version and
 * then wins. Pure functions only.
 */
import { analyzeText } from "../../reading/prl";

export const RR_LEVELS = [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400] as const;
export type RRBand = "LOW" | "MID" | "HIGH";
export const RR_MIN = 300, RR_MAX = 1400;

/** Estimated ReadRise Level of a prose text (rounded to 10). */
export function estimateLevel(text: string): number {
  const st = analyzeText(text);
  if (st.wordCount < 20) return RR_MIN;
  const fk = Math.min(18, Math.max(-3, 0.39 * st.avgSentenceLength + 11.8 * st.avgSyllablesPerWord - 15.59));
  const lvl = 370 + 76 * fk - 0.6 * fk * fk;
  return Math.round(Math.min(1500, Math.max(100, lvl)) / 10) * 10;
}

/** The question band of a version level. */
export const bandOf = (level: number): RRBand => (level <= 600 ? "LOW" : level <= 1000 ? "MID" : "HIGH");

/** The version to show a student: the highest version at or below level + 50 (never below the lowest version). */
export function versionFor(studentLevel: number, available: number[]): number {
  const sorted = [...available].sort((a, b) => a - b);
  if (!sorted.length) return RR_MIN;
  let pick = sorted[0];
  for (const l of sorted) if (l <= studentLevel + 50) pick = l;
  return pick;
}

/** A sensible start when there is no placement or MAP Lexile yet: the middle of the grade's band. */
export function defaultLevel(grade: number): number {
  return grade <= 3 ? 550 : grade === 4 ? 750 : grade === 5 ? 850 : grade === 6 ? 950 : 1050;
}

/** Target words per version (shorter for low levels). */
export function targetWords(level: number): { min: number; max: number } {
  const min = Math.round(110 + (level - 300) * 0.3), max = Math.round(170 + (level - 300) * 0.38);
  return { min, max };
}

export const clampLevel = (l: number) => Math.min(RR_MAX + 100, Math.max(RR_MIN - 100, Math.round(l / 10) * 10));
