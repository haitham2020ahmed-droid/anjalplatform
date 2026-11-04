/**
 * 🎯 The answer-length clue (pure, shared by the admin "Answer-length check", the question editor, the AI question
 * writers, Question Check and the teacher's "Picks the longest answer" signal).
 *
 * In a multiple-choice question whose choices are sentences, a correct answer that is clearly the LONGEST choice can be
 * guessed without reading (test-wise students learn "pick the longest"). A question is FLAGGED when:
 *   - its choices are sentence-like: the correct choice has at least SENTENCE_WORDS words (one-word / short-phrase
 *     choices such as vocabulary meanings are naturally of different lengths and are never flagged);
 *   - the correct choice is the UNIQUE longest one; and
 *   - it is more than LENGTH_RATIO × the second-longest choice (a little longer is normal).
 * Length = characters of the visible text (markup such as <u>…</u> and **…** removed, spaces collapsed).
 */

/** the correct choice needs at least this many words for the choices to count as sentence-like */
export const SENTENCE_WORDS = 4;
/** flagged when the correct choice is more than this many times the second-longest choice */
export const LENGTH_RATIO = 1.15;
/** the warning shown in the question editor (an English source string; translated with t()) */
export const LENGTH_WARNING = "⚠️ The correct answer is clearly longer than the other choices — students can guess it. Make the wrong choices about as long.";

/** The visible text of a choice: tags and ** / __ marks removed, spaces collapsed. */
export function visibleText(text: unknown): string {
  return String(text ?? "").replace(/<[^>]*>/g, "").replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim();
}
export const choiceLength = (text: unknown): number => visibleText(text).length;
export const wordCount = (text: unknown): number => visibleText(text).split(" ").filter(Boolean).length;

export interface LengthCue {
  /** the correct choice is clearly the longest of sentence-like choices (see the header) */
  flagged: boolean;
  /** the correct choice's length ÷ the longest OTHER choice (2 decimals; 0 when it cannot be told) */
  ratio: number;
  /** the correct choice is the unique longest choice (any length, any ratio) */
  longest: boolean;
}

/** Pure: the length clue of one question's choices (`correctIndex` = the correct choice's position). */
export function lengthCue(options: readonly string[], correctIndex: number): LengthCue {
  if (!Array.isArray(options) || options.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return { flagged: false, ratio: 0, longest: false };
  const lens = options.map(choiceLength);
  const mine = lens[correctIndex];
  const other = Math.max(...lens.filter((_, i) => i !== correctIndex));
  const longest = mine > other;
  const ratio = other > 0 ? Math.round((mine / other) * 100) / 100 : 0;
  const sentenceLike = wordCount(options[correctIndex]) >= SENTENCE_WORDS;
  return { flagged: sentenceLike && longest && other > 0 && mine > LENGTH_RATIO * other, ratio, longest };
}

/** Pure: lengthCue for choices given as { text, correct } (exactly one correct; otherwise never flagged). */
export function lengthCueOf(options: readonly { text: unknown; correct: unknown }[]): LengthCue {
  const idx = options.map((o, i) => (o.correct === true || o.correct === 1 || o.correct === "1" ? i : -1)).filter((i) => i >= 0);
  if (idx.length !== 1) return { flagged: false, ratio: 0, longest: false };
  return lengthCue(options.map((o) => String(o.text ?? "")), idx[0]);
}

/** The rule added to every AI question-writing prompt. */
export const LENGTH_PROMPT_RULE = "Answer-choice length: all options within ±20% of each other's length; the correct option must not be the longest more often than the others (vary which option is longest, and make the wrong options as detailed as the correct one).";
/** The reason a generated question is rejected / flagged for. */
export const LENGTH_REJECT_REASON = "the correct answer is clearly the longest choice (students can guess it)";
