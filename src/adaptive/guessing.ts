/**
 * 🎲 Guessing floor (readiness I-14 / Update 39B item 6).
 *
 * A student who knows nothing still gets a 4-option multiple-choice question right one time in four. Scoring such
 * an item as if a correct answer could only come from ability (c = 0, as 1,684 of 1,748 bank items were stored)
 * reads lucky guesses as ability and pushes estimates UP (47 of 98 On-level students were rated Above in the
 * readiness simulation). The lower asymptote c of the 3-parameter model is therefore set from the item's FORMAT at
 * run time (no question is rewritten):
 *   selected response with n choices (multiple choice, dropdown) → c = 1/n   (4 options → 0.25, 3 → 0.33)
 *   true / false                                                → c = 0.5
 *   constructed / multi-part responses (fill in, order, match, multi-select, error tap, two-part, grid…) → c = 0
 * A calibrated c stored on the question (irtC) is kept when it is higher. c is capped at 0.5.
 */
export const MAX_GUESS_C = 0.5;

/** The chance floor for an item format (pure). */
export function guessingFloor(type: string | null | undefined, optionCount?: number | null): number {
  const t = String(type ?? "").toUpperCase();
  if (t === "TRUE_FALSE") return 0.5;
  if (t === "MULTIPLE_CHOICE" || t === "DROPDOWN") {
    const n = Number(optionCount ?? 0);
    return n >= 2 ? Math.min(MAX_GUESS_C, 1 / n) : 0.25;
  }
  return 0;
}

/** c actually used for scoring: the stored c or the format's floor, whichever is higher (capped at 0.5). */
export function effectiveGuessing(storedC: unknown, type: string | null | undefined, optionCount?: number | null): number {
  const c = Number(storedC);
  return Math.min(MAX_GUESS_C, Math.max(Number.isFinite(c) && c > 0 ? c : 0, guessingFloor(type, optionCount)));
}

/** Chance-corrected proportion correct: (p − c) / (1 − c), never below 0. */
export function chanceCorrected(p: number, c: number): number {
  if (c <= 0) return p;
  return Math.max(0, (p - c) / (1 - c));
}
