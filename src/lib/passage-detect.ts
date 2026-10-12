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
  const t = String(stem ?? "");
  if (!t.trim()) return false;
  if (SELF_CONTAINED.test(t) && !PATTERNS.slice(0, 4).some((p) => p.test(t))) return false;
  return PATTERNS.some((p) => p.test(t));
}

/** A question without a passage whose wording seems to need one. */
export const possibleMissingPassage = (stem: string, hasPassage: boolean) => !hasPassage && needsPassage(stem);

/** The words that show the question refers to a text (for logs and reports), or null. */
export function passageReference(stem: string): string | null {
  const t = String(stem ?? "");
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
export function definitelyNeedsPassage(stem: string): boolean {
  const t = String(stem ?? "").trim();
  if (!t || t.length >= 260 || OWN_TEXT.test(t)) return false;
  return STRONG.some((p) => p.test(t));
}
