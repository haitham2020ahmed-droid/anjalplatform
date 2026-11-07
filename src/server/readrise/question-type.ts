/**
 * 🏷️ ReadRise question types (owner r69): main idea, details, inference, vocabulary, text structure, author's purpose,
 * cause–effect, sequence, compare. A question without a type (an older import, a school's file) gets one by a
 * DETERMINISTIC rule from its stem (inferQuestionType: the first matching rule wins). Pure, no imports (safe anywhere).
 */
const s = (v: unknown) => String(v ?? "");

export const QUESTION_TYPES = ["central-idea", "detail", "inference", "vocabulary", "text-structure", "author-purpose", "cause-effect", "sequence", "compare"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_NAME: Record<QuestionType, string> = {
  "central-idea": "Main idea", detail: "Details", inference: "Inference", vocabulary: "Vocabulary", "text-structure": "Text structure",
  "author-purpose": "Author's purpose", "cause-effect": "Cause and effect", sequence: "Sequence", compare: "Compare and contrast",
};
/** "main-idea" and other spellings → a type of the list (null when it is not one). */
export function normalizeQuestionType(v: unknown): QuestionType | null {
  const k = s(v).trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/'/g, "");
  const alias: Record<string, QuestionType> = { "main-idea": "central-idea", "authors-purpose": "author-purpose", purpose: "author-purpose", structure: "text-structure", details: "detail", "key-details": "detail", "compare-contrast": "compare", "cause-and-effect": "cause-effect", vocab: "vocabulary", "word-meaning": "vocabulary" };
  return (QUESTION_TYPES as readonly string[]).includes(k) ? (k as QuestionType) : alias[k] ?? null;
}

/** The type of a question from its stem — a deterministic rule (first match wins), used only when no type is given. */
export function inferQuestionType(stem: string): QuestionType {
  const t = ` ${s(stem).toLowerCase().replace(/[’‘]/g, "'")} `;
  if (/main idea|central idea|mostly about|best summar|summary of|whole (text|article|passage) is about|mainly about/.test(t)) return "central-idea";
  if (/\bmean\b|\bmeans\b|meaning|closest in meaning|as used in/.test(t)) return "vocabulary";
  if (/organi[sz]e|structure|how is (the|most of the) (text|article|passage)|heading|support the (claim|idea)/.test(t)) return "text-structure";
  if (/author's purpose|why (did|does) the author|the author (wrote|writes|includes|included|uses|used|mentions|mentioned|most likely wrote)|purpose of (the|this|paragraph)|author want/.test(t)) return "author-purpose";
  if (/in what order|\bin order\b|sequence|right (after|before)|just (after|before)|happens? (first|next|last)|happened (first|next|last)|\bfirst\b.*\b(then|next)\b|what happens next/.test(t)) return "sequence";
  if (/compare|\balike\b|differ|similar|in common|unlike/.test(t)) return "compare";
  if (/infer|most likely|probably|suggest|conclude|can tell|would (most )?likely|\bmight\b|based on the (article|text)/.test(t)) return "inference";
  if (/\bwhy\b|cause|because|result|effect|led to|lead to|so that|what happens (to|when|if)|what can happen/.test(t)) return "cause-effect";
  return "detail";
}

/** The stored type of a question, else the type from its stem. */
export const questionTypeOf = (q: Record<string, unknown>): QuestionType => normalizeQuestionType(q.skill) ?? inferQuestionType(s(q.stem));


/**
 * 🔢 Round 6 (owner, "like Achieve3000"): a version below SHORT_QUIZ_BELOW (the 300 version) shows 4 of the band's
 * questions; 400+ shows all (8). The 4 are picked by a FIXED rule: one per skill type where possible — main / central
 * idea, detail, vocabulary in context, inference or cause and effect — each the lowest-numbered question of its type
 * not taken yet; any gap is filled with the lowest-numbered questions left. Returned in number order. The score is the
 * % of the questions SHOWN.
 */
export const SHORT_QUIZ_BELOW = 400;
export const SHORT_QUIZ_SIZE = 4;
const SHORT_QUIZ_PICK: readonly (readonly QuestionType[])[] = [["central-idea"], ["detail"], ["vocabulary"], ["inference", "cause-effect"]];
export function pickShownQuestions<T extends Record<string, unknown>>(questions: readonly T[], versionLevel: number): T[] {
  const sorted = [...questions].sort((a, b) => Number(a.number) - Number(b.number));
  if (!(Number(versionLevel) < SHORT_QUIZ_BELOW) || sorted.length <= SHORT_QUIZ_SIZE) return sorted;
  const taken = new Set<T>();
  for (const types of SHORT_QUIZ_PICK) {
    const q = sorted.find((x) => !taken.has(x) && types.includes(questionTypeOf(x)));
    if (q) taken.add(q);
  }
  for (const q of sorted) { if (taken.size >= SHORT_QUIZ_SIZE) break; taken.add(q); }
  return sorted.filter((q) => taken.has(q));
}
