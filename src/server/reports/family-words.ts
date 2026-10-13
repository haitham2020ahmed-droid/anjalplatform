/**
 * 👪 Friendly level words for every family-facing report. The student sees these reports too, so a level is never
 * told as Below / On / Above, Tier or RTI: "Growing toward the grade goal", "Meeting the grade goal", "Reading faster
 * than the grade goal". A tiny module so pages can use it without loading the report builders.
 */
/** Fluency (words correct per minute) against the grade goal, in words a student may read about themselves. */
export function fluencyGoalWords(level: unknown): string {
  return level === "ABOVE" ? "Reading faster than the grade goal" : level === "ON" ? "Meeting the grade goal" : "Growing toward the grade goal";
}
/** A test result (e.g. the Diagnostic) against the grade goal. */
export function gradeGoalWords(level: unknown): string {
  return level === "ABOVE" ? "Doing better than the grade goal" : level === "ON" ? "Meeting the grade goal" : "Growing toward the grade goal";
}
/** Level / tier wording that must never appear in a family-facing report (the student sees it too). */
export const LEVEL_WORDS = /\b(Below|Above|Tier|Tiers|RTI)\b/;
const LEVEL_PHRASES = /\bon (grade )?level\b|\b(below|above) (the )?(grade|level|benchmark)\b|\btiers? \d/i;
export const hasLevelWords = (text: string) => LEVEL_WORDS.test(text) || LEVEL_PHRASES.test(text);

