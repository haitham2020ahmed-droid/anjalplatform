/**
 * 🇸🇦 NAFS — ONE rule for the numbers every NAFS report shows (owner r70 "simple, clear, CORRECT"): tests, Ministry
 * booklets, adaptive practice (all practices and one practice), the overall Reports tab, the student page and the
 * Excel / PDF exports all use this module, never their own copy.
 *
 *   - SCORE %   = credit ÷ scored answers, whole percent (halves up). A half-marked written answer gives ½.
 *   - RIGHT     = answers fully right; WRONG = scored answers − RIGHT (blanks and half marks count as WRONG), so
 *                 RIGHT + WRONG = the answers behind the score, always.
 *   - STRENGTH  = a standard / skill at STRENGTH_FROM % or more with at least MIN_ANSWERS answers;
 *     WEAKNESS  = under WEAKNESS_BELOW % with at least MIN_ANSWERS answers. The percent used is the whole percent the
 *                 teacher SEES (so an "80%" cell is always a strength). Strongest first / weakest first.
 *   - "—" only when there is not enough data, with the reason (NoneWhy → WHY_TEXT) for a tooltip.
 *   - CLASS     = the average of the students' scores (each student counted once), how many finished, the strongest
 *                 and the weakest standard (pooled answers, at least MIN_ANSWERS answers).
 * Pure functions: computed from data the report already loaded (no read of its own).
 */

/** Exact → whole percent (halves up); null when nothing was answered. */
export const roundPct = (sum: number, n: number): number | null => (n ? Math.floor((100 * sum) / n + 0.5 + 1e-9) : null);

export const STRENGTH_FROM = 80;
export const WEAKNESS_BELOW = 60;
// r97 fix: 2 answers (e.g. 2/2 = "100%, strength") has essentially no reliability as a mastery estimate, and the
// Ministry blueprint gives most standards only 3 items per booklet — one missed item could flip a reported
// "strength" to average. Raised to 4 as a safer floor for a number shown to teachers and parents as fact.
export const MIN_ANSWERS = 4;

export interface Cell { pct: number | null; n: number }
export type NoneWhy = "NO_ANSWERS" | "TOO_FEW" | "NONE_HIGH" | "NONE_LOW";
/** Why a strength / weakness shows "—" (the tooltip). */
export const WHY_TEXT: Record<NoneWhy, string> = {
  NO_ANSWERS: "No answers yet.",
  TOO_FEW: "Not enough answers yet: a standard needs at least 4 answers.",
  NONE_HIGH: "No standard at 80% or more yet (with at least 4 answers).",
  NONE_LOW: "No standard under 60% (with at least 4 answers): nothing weak.",
};
/** The rule in one plain sentence (the column tooltips). */
export const RULE_TEXT = "Strength = a standard at 80% or more with at least 4 answers. Weakness = under 60% with at least 4 answers.";

export interface StrengthsWeaknesses {
  strengths: string[]; weaknesses: string[];
  /** the top strength / weakness (the first of the lists) */
  top: string | null; weak: string | null;
  /** why top / weak is empty (null when there is one) */
  topWhy: NoneWhy | null; weakWhy: NoneWhy | null;
}

type Cells = Record<string, Cell | undefined> | Map<string, Cell> | readonly [string, Cell][];
const entries = (c: Cells): [string, Cell][] => (c instanceof Map ? [...c] : Array.isArray(c) ? [...c] : Object.entries(c as Record<string, Cell | undefined>).filter((e): e is [string, Cell] => Boolean(e[1])));

/** A cell from counts (credit may be fractional). */
export const cellOf = (right: number, n: number): Cell => ({ pct: roundPct(right, n), n });

/** A student's strengths and weaknesses from their cells (code → whole percent + answers). */
export function strengthsWeaknesses(cells: Cells, max = 3): StrengthsWeaknesses {
  const all = entries(cells);
  const enough = all.filter(([, c]) => c.n >= MIN_ANSWERS && c.pct !== null);
  const strengths = enough.filter(([, c]) => c.pct! >= STRENGTH_FROM).sort((a, b) => b[1].pct! - a[1].pct! || b[1].n - a[1].n || a[0].localeCompare(b[0])).slice(0, max).map(([k]) => k);
  const weaknesses = enough.filter(([, c]) => c.pct! < WEAKNESS_BELOW).sort((a, b) => a[1].pct! - b[1].pct! || b[1].n - a[1].n || a[0].localeCompare(b[0])).slice(0, max).map(([k]) => k);
  const none = (high: boolean): NoneWhy => (!all.some(([, c]) => c.n > 0) ? "NO_ANSWERS" : !enough.length ? "TOO_FEW" : high ? "NONE_HIGH" : "NONE_LOW");
  return { strengths, weaknesses, top: strengths[0] ?? null, weak: weaknesses[0] ?? null, topWhy: strengths.length ? null : none(true), weakWhy: weaknesses.length ? null : none(false) };
}

export interface ScoreLine { pct: number | null; right: number; wrong: number; answers: number }
/** Score, right and wrong from the scored answers: `credit` defaults to `right` (no half marks). */
export function scoreLine(right: number, answers: number, credit: number = right): ScoreLine {
  const r = Math.max(0, Math.min(right, answers));
  return { pct: roundPct(credit, answers), right: r, wrong: answers - r, answers };
}

/** The mean of the students' scores (each student once; null scores left out), whole percent halves up. */
export function averageOf(pcts: readonly (number | null | undefined)[]): number | null {
  const v = pcts.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? roundPct(v.reduce((a, b) => a + b, 0), v.length * 100) : null;
}

export interface ClassLine {
  /** students with a score */ students: number;
  average: number | null; finished: number; of: number;
  strongest: string | null; weakest: string | null; strongestWhy: NoneWhy | null; weakestWhy: NoneWhy | null;
}
/**
 * The class line: the average of the students' scores, how many finished (of `of`), the strongest and the weakest
 * standard (pooled cells with at least MIN_ANSWERS answers; with one such standard it is the strongest when it is not
 * under WEAKNESS_BELOW, else the weakest).
 */
export function classLine(students: readonly { pct: number | null; finished: boolean }[], pooled: Cells, of = students.length): ClassLine {
  const all = entries(pooled);
  const enough = all.filter(([, c]) => c.n >= MIN_ANSWERS && c.pct !== null).sort((a, b) => b[1].pct! - a[1].pct! || b[1].n - a[1].n || a[0].localeCompare(b[0]));
  let strongest: string | null = enough[0]?.[0] ?? null;
  let weakest: string | null = enough.length > 1 ? enough[enough.length - 1][0] : null;
  if (enough.length === 1 && enough[0][1].pct! < WEAKNESS_BELOW) { weakest = strongest; strongest = null; }
  const why: NoneWhy = !all.some(([, c]) => c.n > 0) ? "NO_ANSWERS" : !enough.length ? "TOO_FEW" : strongest ? "NONE_LOW" : "NONE_HIGH";
  const scored = students.filter((x) => x.pct !== null);
  return { students: scored.length, average: averageOf(scored.map((x) => x.pct)), finished: students.filter((x) => x.finished).length, of, strongest, weakest, strongestWhy: strongest ? null : why, weakestWhy: weakest ? null : why };
}
