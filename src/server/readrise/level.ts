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

// ------------------------------------------------------------------ measured level and fit (version precision)

/** One version as the picker sees it: its nominal level and what the text measures. */
export interface MeasuredVersion { level: number; estLevel?: unknown; officialLexile?: unknown }

/**
 * The text's MEASURED level: the official measure when the school stored one, else the platform's cached estimate
 * (RRVersion.estLevel, computed with estimateLevel at import), else the nominal version level.
 */
export function measuredLevel(v: MeasuredVersion): number {
  const off = v.officialLexile === null || v.officialLexile === undefined ? NaN : Number(v.officialLexile);
  if (Number.isFinite(off) && off > 0) return off;
  const est = v.estLevel === null || v.estLevel === undefined ? NaN : Number(v.estLevel);
  return Number.isFinite(est) && est > 0 ? est : Number(v.level);
}

/** The band around the student's level that counts as a just-right text (± this many points). */
export const FIT_BAND = 75;
export type Fit = "EXACT" | "STRETCH" | "EASY";

/** How a text fits a reader: within ± FIT_BAND = exact, harder = stretch, easier = easy. */
export function fitOf(textLevel: number, studentLevel: number): Fit {
  const d = textLevel - studentLevel;
  return d > FIT_BAND ? "STRETCH" : d < -FIT_BAND ? "EASY" : "EXACT";
}

/**
 * The version to show, using each version's MEASURED level: among the nominal pick (versionFor) and its two
 * neighbours, the one whose measured level is closest to the student's level (a text measuring more than 50 above
 * the student counts 1.5× as far: a little easy beats too hard). Ties keep the nominal pick, so when every text
 * measures at its target this is exactly versionFor. Never more than one version away from the nominal pick.
 */
export function chooseVersion(studentLevel: number, versions: MeasuredVersion[]): number {
  if (!versions.length) return RR_MIN;
  const nominal = versionFor(studentLevel, versions.map((v) => Number(v.level)));
  const cost = (v: MeasuredVersion) => { const m = measuredLevel(v), d = m - studentLevel; return d > 50 ? d * 1.5 : Math.abs(d); };
  let best = versions.find((v) => Number(v.level) === nominal)!, bestCost = cost(best);
  for (const v of versions) {
    if (Math.abs(Number(v.level) - nominal) > 100 || Number(v.level) === nominal) continue;
    const c = cost(v);
    if (c < bestCost) { best = v; bestCost = c; }
  }
  return Number(best.level);
}

/** The stretch version: the next version above the one the student reads, or null. */
export function stretchAbove(current: number, available: number[]): number | null {
  return [...available].sort((a, b) => a - b).find((l) => l > current) ?? null;
}
