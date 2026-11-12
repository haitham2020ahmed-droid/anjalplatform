import { stripMarks } from "./inline-marks";
/**
 * “Possible missing passage”: does a question's wording refer to a text that should be shown with it?
 * Used as a WARNING only (list badge, filter, editor hint, import warning); never to reject.
 * Shared by server and browser, so it has no imports.
 *
 * Flags wording such as “According to the passage”, “In paragraph 3”, “In the story”, “Which detail from
 * the text…”, “What does the author mean…”, “At the beginning of the story”, “the narrator”, “stanza 2”.
 * Does NOT flag questions about a sentence or word given in the question itself (“Read the sentence…”).
 */
const TEXT = "(?:passage|story|article|text|poem|selection|excerpt|essay|fable|myth|legend|folktale|letter|speech|biography|play|drama)";
const PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:according to|based on|in|from|throughout|reread|read) (?:the|this) ${TEXT}\\b`, "i"),
  new RegExp(`\\b(?:the|this) ${TEXT} (?:says|states|suggests|shows|explains|describes|tells|mainly|mostly|is mostly|is mainly|ends|begins)\\b`, "i"),
  new RegExp(`\\b(?:which|what) (?:detail|sentence|evidence|line|word|phrase|event|quotation|quote) (?:from|in) (?:the|this) ${TEXT}\\b`, "i"),
  new RegExp(`\\b(?:beginning|middle|end|title|theme|main idea|central idea|narrator|setting|climax|plot) of (?:the|this) ${TEXT}\\b`, "i"),
  /\b(?:in|from|reread) (?:paragraph|stanza|section|line|lines) \d+\b/i,
  /\bparagraphs? \d+(?: and \d+)?\b/i,
  /\bstanzas? \d+\b/i,
  /\bwhat does the (?:author|poet|writer|narrator) (?:mean|want|suggest|think|believe)\b/i,
  /\bthe (?:author|poet|writer)(?:'s|’s)? (?:purpose|point of view|claim|opinion|message|main purpose)\b/i,
  /\bwhy (?:does|did) the (?:author|poet|writer) (?:include|use|mention|write|describe)\b/i,
  /\b(?:the narrator|the speaker of the poem|the main character)\b/i,
  // “Based on the reading…”, “According to the reading…” (not “reading lesson”, “reading skills”)
  /\b(?:based on|according to|from|after) (?:the|this) reading\b(?! (?:lesson|skill|skills|level|log|time|class|test|strategy))/i,
];

/** Wording that clearly refers to the question's own sentence, not to a separate text. */
const SELF_CONTAINED = /\b(?:read the sentence|in (?:the|this) sentence|the underlined (?:word|phrase)|in the following sentence|complete the sentence)\b/i;

export function needsPassage(stem: string): boolean {
  const t = stripMarks(String(stem ?? "")); // "the <u>underlined</u> word" is read as plain text
  if (!t.trim()) return false;
  if (SELF_CONTAINED.test(t) && !PATTERNS.slice(0, 4).some((p) => p.test(t))) return false;
  return PATTERNS.some((p) => p.test(t));
}

/** A question without a passage whose wording seems to need one. */
export const possibleMissingPassage = (stem: string, hasPassage: boolean) => !hasPassage && needsPassage(stem);

/** The words that show the question refers to a text (for logs and reports), or null. */
export function passageReference(stem: string): string | null {
  const t = stripMarks(String(stem ?? ""));
  if (!needsPassage(t)) return null;
  for (const p of PATTERNS) { const m = t.match(p); if (m) return m[0]; }
  return null;
}

/**
 * 🧹 A STRICT version for hiding questions automatically (Update 55): only wording that certainly points to a text that
 * must be shown — "according to the passage", "in paragraph 3", "which detail from the article", "the excerpt"… —
 * and only when the question does not carry its own text (a quotation of 8+ words, or a long stem). General
 * questions about reading ("the main character", "a story", "the text says, \"…\"") are never hidden.
 */
const STRONG_TEXT = "(?:passage|article|selection|excerpt|poem|story|text|essay|speech)";
const STRONG: RegExp[] = [
  new RegExp(`\\b(?:according to|based on|reread) (?:the|this) ${STRONG_TEXT}\\b`, "i"),
  new RegExp(`\\b(?:which|what) (?:detail|sentence|evidence|line|lines|word|phrase|quotation|quote|paragraph) (?:from|in) (?:the|this) ${STRONG_TEXT}\\b`, "i"),
  /\b(?:in|from|reread) (?:paragraph|stanza)s? \d+\b/i,
  /\b(?:the|this) (?:passage|excerpt|selection)\b/i,
  /\b(?:in|from|of) (?:the|this) article\b/i,   // (not the grammar word: "Choose the article: a / an")
];
const OWN_TEXT = /["“][^"”]{40,}["”]/;
/**
 * 🩹 Nov 2026 (owner audit): stems that carry their OWN text were hidden from every student —
 *   "An author writes an article that begins by … How do the parts of the article work together?"
 *   "A passage explains that … What is the passage's main purpose?"
 *   "… What does this passage of time within the setting foreshadow?" ("passage of time" is not a text)
 * A stem that opens by describing its text ("A/An author|passage|article|story … ") is self-contained, and so is a
 * stem whose long opening statement (80+ characters, a full sentence) is what "this passage/article" points back to.
 */
const INTRODUCES_TEXT = /^(?:an?|one) (?:author|writer|poet|passage|article|story|text|poem|essay|speech|excerpt|selection|short story|news article)\b/i;
const LONG_LEAD = /^[^.?!]{80,}[.!]\s+\S/;
const THIS_REF = /\b(?:this|the following) (?:passage|article|selection|excerpt|poem|story|text|essay|speech)\b/i;
export function definitelyNeedsPassage(stem: string): boolean {
  const t = stripMarks(String(stem ?? "")).trim().replace(/\bpassages? of time\b/gi, "time going by");
  if (!t || t.length >= 260 || OWN_TEXT.test(t)) return false;
  if (INTRODUCES_TEXT.test(t) && LONG_LEAD.test(t)) return false; // it describes its text in a full opening sentence
  if (!STRONG.some((p) => p.test(t))) return false;
  // "Because … over time. According to this passage, …": the stem's own opening is the passage
  if (LONG_LEAD.test(t) && THIS_REF.test(t) && !/\b(?:the) (?:passage|article|selection|excerpt)\b/i.test(t.replace(THIS_REF, ""))) return false;
  return true;
}

/**
 * A question whose passageId is SET but does not resolve to a passage with real text: the row was
 * never created, or left blank. The FK is ON DELETE SET NULL, so a deleted passage clears the id
 * instead of leaving it dangling; the real-world case here is a passage row with empty/blank text.
 * Unlike needsPassage()/passageReference() (wording guesses), this is unambiguous — the question
 * itself says it needs this exact passage — so it is used both to flag such questions for cleanup
 * and, at serving time, to keep them from ever reaching a student, independent of any wording
 * heuristic and regardless of how the dangling reference happened.
 */
export function isDanglingPassageRef(passageId: string | null | undefined, resolvedBody: string | null | undefined): boolean {
  return Boolean(passageId) && !String(resolvedBody ?? "").trim();
}
