/**
 * 🎚️ Difficulty bands inside one skill (Nov 2026, IXL's "Level 1 / 2 / 3" of a skill). Every question has a difficulty
 * on the engine's scale (IRT b; the authoring levels 1–7 map to −2.25 … +2.25, src/config/engine.ts LEVEL_TO_B):
 *   EASY    b < −0.375   levels 1–3 (very easy, easy, below grade level)
 *   MEDIUM  −0.375 … 0.375  level 4 (grade level)
 *   HARD    b > 0.375    levels 5–7 (above grade level, challenging)
 * The cut points sit half-way between the levels, so a calibrated b still lands in the nearest band.
 *
 * `stuckBand`: the lowest band where a student's recent careful answers are under 60 % right (at least 3 answers in
 * that band) — "stuck at the easy questions" means go back to the basics; "doing well" = no such band and at least
 * 70 % right on the hard ones (or nothing missed). Pure functions only.
 */
export type Band = "EASY" | "MEDIUM" | "HARD";
export const BANDS: readonly Band[] = ["EASY", "MEDIUM", "HARD"];
export const BAND_CUT = 0.375;
export const BAND_LABEL: Record<Band, string> = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };
/** the recent answers looked at per student and skill */
export const RECENT_PER_SKILL = 30;
export const STUCK_BELOW_PCT = 60;
export const MIN_IN_BAND = 3;

export function bandOf(b: number | null | undefined): Band {
  const v = Number(b);
  if (!Number.isFinite(v)) return "MEDIUM";
  return v < -BAND_CUT ? "EASY" : v > BAND_CUT ? "HARD" : "MEDIUM";
}

export interface BandScore { answered: number; correct: number; pct: number | null }
export type Where = Band | "WELL" | "TOO_FEW";

/** Right / answered per band for one student's answers on one skill (rapid guesses left out by the caller). */
export function bandScores(answers: readonly { b: number | null; correct: boolean }[]): Record<Band, BandScore> {
  const out = { EASY: { answered: 0, correct: 0, pct: null }, MEDIUM: { answered: 0, correct: 0, pct: null }, HARD: { answered: 0, correct: 0, pct: null } } as Record<Band, BandScore>;
  for (const a of answers) { const k = bandOf(a.b); out[k].answered++; if (a.correct) out[k].correct++; }
  for (const k of BANDS) out[k].pct = out[k].answered ? Math.round((100 * out[k].correct) / out[k].answered) : null;
  return out;
}

/** Where a student stands in the skill: stuck at the lowest weak band, doing well, or too few answers to say. */
export function stuckBand(scores: Record<Band, BandScore>): Where {
  const total = BANDS.reduce((x, k) => x + scores[k].answered, 0);
  if (total < MIN_IN_BAND) return "TOO_FEW";
  for (const k of BANDS) if (scores[k].answered >= MIN_IN_BAND && (scores[k].pct ?? 100) < STUCK_BELOW_PCT) return k;
  return "WELL";
}

/** The plain next step for a group (English interface strings, translated through t()). */
export const BAND_ADVICE: Record<Where, string> = {
  EASY: "Back to the basics: re-teach the skill from the start with the easy questions (a Learn lesson helps).",
  MEDIUM: "A small group on the grade-level questions: model one together, then practise.",
  HARD: "Nearly there: practise the hardest questions with a worked example first.",
  WELL: "Doing well: ready for a challenge or the next skill.",
  TOO_FEW: "Too few answers to tell yet.",
};
