/**
 * 🧠 Question intelligence (pure rules, no database, no AI): what a question demands of a student.
 *
 *   estimateDok          Depth of Knowledge 1–4 from the skill family and the wording of the stem
 *   estimateDifficulty   a difficulty level 1–7 BEFORE any student answers, from five measurable factors:
 *                          vocabulary complexity · text length · question structure · cognitive demand (DOK) ·
 *                          distractor quality (how close the wrong options are to the right one)
 *   textLevel            text complexity on the platform's Lexile-like scale (100–1400; an estimate, not a Lexile)
 *   metadataGaps         which of the required metadata a question is missing
 *   estimateQar / estimateThinking / estimateClueType / spellingPattern
 *                        reading and word-study tags kept in Question.tags (qar, thinking, clueType, pattern)
 *
 * After students answer, the nightly calibration replaces the estimate with data (src/server/jobs/item-analysis.ts).
 */
import { analyzeText, platformReadingLevel } from "../reading/prl";

const family = (code: string) => (code.includes(".") ? code.slice(code.indexOf(".") + 1) : code);

const DOK1 = new Set(["nouns", "verbs", "adjectives", "adverbs", "prepositions", "capitalization", "spelling", "plural-nouns", "possessive-nouns", "apostrophes-contractions", "titles-abbreviations", "commas", "irregular-verbs", "verb-tenses", "pronoun-homophones", "homographs-homophones", "negatives", "comparatives", "reference-materials", "text-features", "prefixes", "suffixes", "subjects-predicates", "quotations-dialogue", "sentences"]);
const DOK3 = new Set(["inference", "theme", "text-evidence", "author-purpose", "author-claim", "author-perspective", "point-of-view", "character-perspective", "compare-texts", "make-predictions", "plot-foreshadowing", "writing-informative", "writing-argument", "writing-narrative", "writing-research"]);
const CATEGORY_DOK: Record<string, number> = { LITERATURE: 2, INFORMATIONAL: 2, COMPREHENSION: 2, VOCABULARY: 2, WORD_STUDY: 1, GRAMMAR: 1, MECHANICS: 1, PHONICS_WORD_STUDY: 1, WRITING: 3 };

const RAISE = /\b(best supports?|most likely|can the reader (infer|conclude)|what can you infer|why does the author|author'?s purpose|which (two|2) (details|sentences)|what is the (theme|central idea|main idea)|how does .* (develop|contribute|affect)|best (explains|describes|summarizes)|compare|contrast|evidence)\b/i;
const LOWER = /^(which (word|one) is (a|an|the) (noun|verb|adjective|adverb|preposition)|choose the correct spelling|which word is spelled|which word should be capitalized|what is the plural)/i;

/** Depth of Knowledge 1–4 (rules). */
export function estimateDok(skillCode: string, stem: string, category = ""): number {
  const f = family(skillCode);
  let dok = DOK1.has(f) ? 1 : DOK3.has(f) ? 3 : f ? 2 : CATEGORY_DOK[category] ?? 2;
  if (!DOK1.has(f) && !DOK3.has(f) && !f) dok = CATEGORY_DOK[category] ?? 2;
  if (RAISE.test(stem) && dok < 3) dok += 1;
  if (LOWER.test(stem.trim()) && dok > 1) dok -= 1;
  if (/\bwrite\b.*\b(essay|paragraph|argument)\b/i.test(stem)) dok = 4;
  return Math.max(1, Math.min(4, dok));
}

const STRUCTURE: Record<string, number> = { TRUE_FALSE: 0.1, MULTIPLE_CHOICE: 0.35, DROPDOWN: 0.35, ERROR_CORRECTION: 0.5, FILL_BLANK: 0.6, MATCHING: 0.6, SENTENCE_ORDER: 0.65, WORD_ORDER: 0.55, MULTI_SELECT: 0.75, SHORT_ANSWER: 0.8, GRID: 0.6, HOT_TEXT: 0.65, TWO_PART: 0.8, DICTATION: 0.6, SENTENCE_COMBINE: 0.7 };
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((w) => w.length > 2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface DifficultyInput { stem: string; type: string; passage?: string | null; options?: { text: string; correct: boolean }[]; dok: number; grade?: number }
export interface DifficultyEstimate { level: number; b: number; score: number; factors: { vocabulary: number; length: number; structure: number; cognitive: number; distractors: number } }

/** How close the wrong options are to the key (word overlap and similar length): close distractors are harder. */
export function distractorPlausibility(options: { text: string; correct: boolean }[] | undefined): number {
  if (!options || options.length < 2) return 0.3;
  const key = options.filter((o) => o.correct);
  const wrong = options.filter((o) => !o.correct);
  if (!key.length || !wrong.length) return 0.3;
  const k = new Set(key.flatMap((o) => words(o.text)));
  const kLen = key.reduce((a, o) => a + o.text.length, 0) / key.length;
  const per = wrong.map((o) => {
    const w = new Set(words(o.text));
    let inter = 0; for (const x of w) if (k.has(x)) inter++;
    const jac = w.size + k.size ? inter / (w.size + k.size - inter || 1) : 0;
    const len = Math.min(o.text.length, kLen) / Math.max(o.text.length, kLen, 1);
    return 0.5 * clamp01(jac * 2) + 0.5 * len;
  });
  return clamp01(per.reduce((a, x) => a + x, 0) / per.length);
}

/** Difficulty before any student data: level 1–7 and the IRT b it implies (4 = grade level = b 0). */
export function estimateDifficulty(q: DifficultyInput): DifficultyEstimate {
  const own = [q.stem, ...(q.options ?? []).map((o) => o.text)].join(". ");
  const so = analyzeText(own);
  const sp = q.passage ? analyzeText(q.passage) : null;
  const syl = sp ? 0.6 * so.avgSyllablesPerWord + 0.4 * sp.avgSyllablesPerWord : so.avgSyllablesPerWord;
  const sentence = sp ? 0.5 * so.avgSentenceLength + 0.5 * sp.avgSentenceLength : so.avgSentenceLength;
  // grade expectation: older students read longer words and sentences (grade 4 baseline)
  const g = Math.max(0, (q.grade ?? 4) - 4);
  const vocabulary = clamp01(0.7 * (syl - 1.2 - 0.04 * g) / 0.5 + 0.3 * (sentence - 8 - g) / 14);
  const stemLen = clamp01(q.stem.length / 200);
  const optLen = q.options?.length ? clamp01(q.options.reduce((a, o) => a + o.text.length, 0) / q.options.length / 80) : 0.3;
  const length = clamp01(0.55 * stemLen + 0.4 * optLen + 0.05 * ((sp?.wordCount ?? 0) / 600));
  let structure = STRUCTURE[q.type] ?? 0.4;
  if (/\b(NOT|EXCEPT|LEAST)\b/.test(q.stem)) structure += 0.2;
  if (/\b(TWO|THREE|two|three) (details|sentences|words|answers)\b|choose two/i.test(q.stem)) structure += 0.15;
  structure = clamp01(structure);
  const cognitive = clamp01((q.dok - 1) / 3);
  const distractors = distractorPlausibility(q.options);
  // weights fitted on the platform's 1,082 authored questions (5-fold cross-validated r ≈ 0.48 with the authors' levels)
  const cont = Math.max(1, Math.min(7, 0.2 + 0.7 * vocabulary + 4.7 * structure + 3.1 * stemLen + 2.25 * optLen + 0.3 * cognitive + 0.2 * distractors));
  const score = (cont - 1) / 6;
  const level = Math.round(cont);
  return { level, b: Math.round((cont - 4) * 0.75 * 100) / 100, score: Math.round(score * 1000) / 1000, factors: { vocabulary: r2(vocabulary), length: r2(length), structure: r2(structure), cognitive: r2(cognitive), distractors: r2(distractors) } };
}
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Text complexity of the question (its passage when it has one) on the platform's Lexile-like scale. */
export function textLevel(stem: string, passage?: string | null): number {
  return platformReadingLevel(analyzeText(passage && passage.length > 80 ? passage : stem));
}

export type MetaField = "skill" | "standard" | "mapArea" | "difficulty" | "dok" | "readingLevel" | "misconceptions" | "explanation" | "qar" | "thinking" | "clueType" | "pattern";
export const META_FIELDS: { key: MetaField; label: string }[] = [
  { key: "skill", label: "Skill" }, { key: "standard", label: "Standard" }, { key: "mapArea", label: "MAP domain" },
  { key: "difficulty", label: "Difficulty" }, { key: "dok", label: "Cognitive level (DOK)" }, { key: "readingLevel", label: "Reading level" },
  { key: "misconceptions", label: "Misconception tags" }, { key: "explanation", label: "Explanation" },
  { key: "qar", label: "Question type (QAR)" }, { key: "thinking", label: "Level of thinking" },
  { key: "clueType", label: "Context clue type" }, { key: "pattern", label: "Spelling pattern" },
];

export type MetaRow = Record<string, unknown>

/** What kind of item a question is, so only the tags that apply to it are required. */
export interface MetaContext { family?: string; category?: string; hasPassage?: boolean; stem?: string }

/**
 * Missing metadata of one question. `wrongOptions` = wrong options and whether each has a misconception.
 * With `ctx` (the skill family / category), the literacy tags that apply are checked too: qar + thinking for
 * reading items, clueType for context-clue items, pattern for spelling items (all kept in Question.tags).
 */
export function metadataGaps(q: MetaRow, wrongOptions: Record<string, unknown>[], hasExplanation: boolean, ctx?: MetaContext): MetaField[] {
  const out: MetaField[] = [];
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  if (empty(q.skillId)) out.push("skill");
  if (empty(q.standardId)) out.push("standard");
  if (empty(q.mapInstructionalArea)) out.push("mapArea");
  if (empty(q.difficultyLevel)) out.push("difficulty");
  if (empty(q.dok)) out.push("dok");
  if (empty(q.lexile) && empty(q.textLevel)) out.push("readingLevel");
  if (wrongOptions.some((o) => empty(o.misconception))) out.push("misconceptions");
  if (!hasExplanation) out.push("explanation");
  if (ctx) {
    const t = tagsObject(q.tags);
    const fam = family(ctx.family ?? "");
    if (isReadingItem(fam, ctx.category, ctx.hasPassage)) {
      if (empty(t.qar)) out.push("qar");
      if (empty(t.thinking)) out.push("thinking");
    }
    if (isContextClueItem(fam, ctx.stem ?? String(q.stem ?? ""), ctx.category) && empty(t.clueType)) out.push("clueType");
    if (isSpellingItem(fam) && empty(t.pattern)) out.push("pattern");
  }
  return out;
}

// ------------------------------------------------------------------ literacy tags (QAR, thinking, clue type, pattern)

export const QAR_TYPES = ["RIGHT_THERE", "THINK_AND_SEARCH", "AUTHOR_AND_ME", "ON_MY_OWN"] as const;
export const THINKING_LEVELS = ["LOCATE", "COMBINE", "CONNECT", "ANALYZE"] as const;
export const CLUE_TYPES = ["DEFINITION", "RESTATEMENT", "EXAMPLE", "SYNONYM", "ANTONYM", "CAUSE_EFFECT", "COMPARISON", "PARAGRAPH", "GRAMMAR_POS", "NONE"] as const;
export const SPELLING_PATTERNS = ["SHORT_VOWEL", "LONG_VOWEL", "VOWEL_TEAM", "R_CONTROLLED", "DIPHTHONG", "SILENT_LETTER", "SOFT_C_G", "SYLLABLE_TYPES", "INFLECTION_CHANGE"] as const;
export type Qar = (typeof QAR_TYPES)[number];
export type Thinking = (typeof THINKING_LEVELS)[number];
export type ClueType = (typeof CLUE_TYPES)[number];
export type SpellingPattern = (typeof SPELLING_PATTERNS)[number];
/** Question.tags keys these values live under, and the allowed values of each. */
export const LITERACY_TAGS = { qar: QAR_TYPES, thinking: THINKING_LEVELS, clueType: CLUE_TYPES, pattern: SPELLING_PATTERNS } as const;
export type LiteracyTag = keyof typeof LITERACY_TAGS;

function tagsObject(v: unknown): Record<string, unknown> {
  let t = v;
  if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } }
  return t && typeof t === "object" && !Array.isArray(t) ? (t as Record<string, unknown>) : {};
}

const READING_CATEGORIES = new Set(["LITERATURE", "INFORMATIONAL", "COMPREHENSION"]);
const READING_FAMILIES = new Set(["theme", "summarize", "character", "character-perspective", "point-of-view", "plot-conflict", "plot-events", "plot-setting", "plot-flashback", "plot-foreshadowing", "make-predictions", "visualize", "ask-answer-questions", "reread", "drama-elements", "poetry-elements", "sound-devices", "imagery", "inference", "text-evidence", "compare-texts", "central-idea", "compare-contrast", "cause-effect", "problem-solution", "sequence", "text-features", "author-perspective", "author-purpose", "author-claim", "description"]);
const CONTEXT_FAMILIES = new Set(["context-clues", "multiple-meaning", "academic-vocabulary"]);

/** A comprehension item (reading families / categories). */
export function isReadingItem(fam: string, category?: string, _hasPassage?: boolean): boolean {
  const f = family(fam);
  return READING_FAMILIES.has(f) || (!f && READING_CATEGORIES.has(category ?? "")) || (READING_CATEGORIES.has(category ?? "") && !CONTEXT_FAMILIES.has(f));
}
/** A word-meaning-from-context item. */
export function isContextClueItem(fam: string, stem = "", category?: string): boolean {
  const f = family(fam);
  if (CONTEXT_FAMILIES.has(f)) return true;
  return (category === "VOCABULARY" || !f) && /\bcontext\b|\bas (it is )?used in\b|\bclues?\b.*\bmean/i.test(stem);
}
export const isSpellingItem = (fam: string) => family(fam) === "spelling";

const qarFamily: Record<string, Qar> = {};
for (const f of ["inference", "theme", "make-predictions", "character", "character-perspective", "point-of-view", "author-purpose", "author-perspective", "figurative-language", "imagery", "plot-foreshadowing", "visualize"]) qarFamily[f] = "AUTHOR_AND_ME";
for (const f of ["central-idea", "summarize", "compare-contrast", "compare-texts", "sequence", "cause-effect", "problem-solution", "plot-events", "plot-conflict", "plot-flashback", "author-claim", "text-evidence", "description"]) qarFamily[f] = "THINK_AND_SEARCH";
for (const f of ["ask-answer-questions", "reread", "text-features", "plot-setting", "poetry-elements", "drama-elements", "sound-devices"]) qarFamily[f] = "RIGHT_THERE";

const TEXT_REF = /\b(text|story|passage|poem|article|paragraph|selection|author|narrator|play|scene|stanza|chapter|speaker|character)\b/i;
const QAR_OWN = /\b(have you ever|in your (own )?life|your own (experience|opinion|life|words)|what would you (do|have done)|do you (think|agree)|how would you feel|if you were)\b/i;
const QAR_AUTHOR_ME = /\b(infer|inference|conclude|conclusion|most likely|predict|probably|suggests?|impl(y|ies)|theme|lesson|message|moral|why do you think|author'?s purpose|why (does|did) the (author|writer|poet)|what does .{1,60} (show|reveal) about|what kind of person|trait|feel(s|ing)? (about|when)|how does .{1,40} feel|figurative|simile|metaphor|personification|idiom|what is the meaning of the phrase)\b/i;
const QAR_SEARCH = /\b(main idea|central idea|summary|summari[sz]e|sequence|in what order|first|before|after|alike|different|similar|compare|contrast|cause|effect|result|because|why did .{1,60} happen|problem|solution|which (two|2|three|3) (details|sentences)|paragraphs \d+ (and|through|to|-) \d+|throughout|both (texts|passages|stories|authors)|change[sd]? (from|over|throughout)|best supports?)\b/i;
const QAR_RIGHT = /\b(according to (the )?(paragraph|sentence|text|passage|article|story|poem|chart|diagram|caption|map|timeline)|the (text|passage|article|story|author) (says|states|tells)|in (paragraph|line|stanza) \d+,? (what|who|where|when|which|how many)|which (word|detail|sentence) (from|in) (the )?(paragraph|sentence|caption)|(what|which) (does|did) the (caption|heading|diagram|chart|map|label) (show|tell))\b/i;
const LITERAL_START = /^(who|when|where|what (is|was|are|were|did|does|do)|which|how many|how much|name)\b/i;

/**
 * Question-Answer Relationship of a reading item, from its wording and skill (rules, deterministic):
 * RIGHT_THERE (stated in one place) · THINK_AND_SEARCH (put together from several places) ·
 * AUTHOR_AND_ME (text + what the reader knows) · ON_MY_OWN (the reader's own experience). null = not a reading item.
 */
export function estimateQar(skillCode: string, stem: string, opts: { category?: string; hasPassage?: boolean } = {}): Qar | null {
  const f = family(skillCode);
  if (!isReadingItem(f, opts.category, opts.hasPassage)) return null;
  const t = stem.trim();
  if (QAR_OWN.test(t) && !TEXT_REF.test(t)) return "ON_MY_OWN";
  if (QAR_RIGHT.test(t)) return "RIGHT_THERE";
  if (QAR_AUTHOR_ME.test(t)) return "AUTHOR_AND_ME";
  if (QAR_SEARCH.test(t)) return "THINK_AND_SEARCH";
  if (qarFamily[f]) return qarFamily[f];
  return LITERAL_START.test(t) ? "RIGHT_THERE" : "THINK_AND_SEARCH";
}

const ANALYZE_CUE = /\b(why (does|did) the (author|writer|poet|playwright)|how does the (author|writer|poet|playwright)|author'?s (purpose|craft|word choice|use of|point of view|perspective|claim)|purpose of (the|this|paragraph|stanza)|(effect|impact) of|structure|organi[sz]ed|word choice|tone|mood|evaluate|claim|argument|reasons? and evidence|how does .{1,60} (contribute|develop|affect|help|shape)|why is .{1,40} (important|included))\b/i;
const ANALYZE_FAMILIES = new Set(["author-purpose", "author-claim", "author-perspective", "poetry-elements", "drama-elements", "sound-devices", "precise-language", "description", "point-of-view"]);
const THINKING_OF_QAR: Record<Qar, Thinking> = { RIGHT_THERE: "LOCATE", THINK_AND_SEARCH: "COMBINE", AUTHOR_AND_ME: "CONNECT", ON_MY_OWN: "CONNECT" };

/**
 * Level of thinking a reading item asks for: LOCATE (find it) · COMBINE (put parts together) ·
 * CONNECT (link the text with what you know) · ANALYZE (how and why the author built it). null = not reading.
 */
export function estimateThinking(skillCode: string, stem: string, opts: { category?: string; hasPassage?: boolean; qar?: Qar | null } = {}): Thinking | null {
  const f = family(skillCode);
  const qar = opts.qar ?? estimateQar(skillCode, stem, opts);
  if (!qar) return null;
  if (qar !== "RIGHT_THERE" && (ANALYZE_CUE.test(stem) || ANALYZE_FAMILIES.has(f))) return "ANALYZE";
  if (qar === "RIGHT_THERE" && ANALYZE_CUE.test(stem)) return "ANALYZE";
  return THINKING_OF_QAR[qar];
}

const CLUE_NAMED: [RegExp, ClueType][] = [
  [/\bparagraph clues?\b|\b(other|nearby|surrounding) sentences\b|\bsentences? (in|from) (the|this) paragraph (help|give)/i, "PARAGRAPH"],
  [/\bpart of speech\b|\bused as an? (noun|verb|adjective|adverb)\b|\bwhich (form|kind) of word\b/i, "GRAMMAR_POS"],
  [/\bantonym\b|\bopposite\b/i, "ANTONYM"],
  [/\bsynonym\b|\bmeans the same\b/i, "SYNONYM"],
  [/\bdefinition clue\b/i, "DEFINITION"],
  [/\bexample clue\b|\bexamples? (in|from) the sentence\b/i, "EXAMPLE"],
  [/\brestatement\b/i, "RESTATEMENT"],
  [/\bcause[- ]and[- ]effect clue\b/i, "CAUSE_EFFECT"],
  [/\bcomparison clue\b/i, "COMPARISON"],
];
// signal words inside the sentence that holds the word (first match wins: the most specific signals first)
const CLUE_SIGNAL: [RegExp, ClueType][] = [
  [/\b(is|are|was|were) (called|known as|defined as)\b|\bwhich means\b|\b(means|refers to)\b/i, "DEFINITION"],
  [/\bin other words\b|\bthat is\b|\bi\.e\.|,\s*or\s+[a-z]+(\s+[a-z]+){0,8}\s*,|[—–(]\s*[a-z]+(\s+[a-z]+){0,4}\s*[—–)]/i, "RESTATEMENT"],
  [/\bsuch as\b|\bfor (example|instance)\b|\bincluding\b|\blike [a-z]+,\s/i, "EXAMPLE"],
  [/\bbut\b|\bhowever\b|\bunlike\b|\bdespite\b|\beven though\b|\binstead( of)?\b|\balthough\b|\bon the other hand\b|\bwhereas\b|\bnot\b[^.]{0,40}\bbut\b|\brather than\b/i, "ANTONYM"],
  [/\bbecause\b|\bas a result\b|\btherefore\b|\bso that\b|\bsince\b|\bdue to\b|,\s*so\b/i, "CAUSE_EFFECT"],
  [/\bjust as\b|\bsimilar to\b|\bthe same way\b|\bcompared (to|with)\b|\bas [a-z]+ as\b|\blike a\b/i, "COMPARISON"],
  [/\balso\b|\blikewise\b|\bsimilarly\b|\bin the same way\b|\banother word for\b/i, "SYNONYM"],
];
const quoted = (t: string) => [...t.matchAll(/[“"']([^”"']{2,400})[”"']/g)].map((m) => m[1]);

/**
 * The kind of context clue a word-meaning item relies on (rules, deterministic). Reads the quoted sentence of the
 * stem (or the passage sentence that holds the quoted word). null = not a context-clue item; NONE = no clue signal.
 */
export function estimateClueType(skillCode: string, stem: string, opts: { category?: string; passage?: string | null; label?: string } = {}): ClueType | null {
  const f = family(skillCode);
  if (!isContextClueItem(f, stem, opts.category)) return null;
  for (const [re, c] of CLUE_NAMED) if (re.test(stem) || (opts.label && re.test(opts.label))) return c;
  const q = quoted(stem);
  const sentences = q.filter((x) => x.trim().split(/\s+/).length >= 4);
  let scope = sentences.join(" ");
  if (!scope && opts.passage) {
    const word = q.find((x) => !/\s/.test(x.trim())) ?? stem.match(/\bwhat does (?:the word )?([a-z'-]+) mean/i)?.[1];
    if (word) {
      const re = new RegExp(`[^.!?]*\\b${word.trim().replace(/[^A-Za-z'-]/g, "")}\\b[^.!?]*[.!?]?`, "i");
      const hit = opts.passage.match(re);
      if (hit) {
        // the sentence with the word and the one after it (clues often follow)
        const at = opts.passage.indexOf(hit[0]);
        scope = opts.passage.slice(at, at + hit[0].length + 200).split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
      }
    }
  }
  if (!scope) scope = stem.replace(/\b(what|which) (does|do|is|word|best|phrase)\b.*\?$/i, "");
  // the stem's own question words ("which word means …") must not count as a definition signal
  const body = scope.replace(/\bwhich (word|phrase)[^?]*\?/gi, "");
  const target = (stem.match(/\bwhat does (?:the word )?["“]?([a-z'-]+)["”]? mean/i) ?? stem.match(/\bmeaning of (?:the word )?["“]?([a-z'-]+)/i))?.[1]?.toLowerCase();
  if (target) {
    const w = target.replace(/[^a-z'-]/g, "");
    if (new RegExp(`\\bso ${w} that\\b|\\b${w}\\b[^.]{0,30}\\bthat (it|he|she|they|we|no|even)\\b`, "i").test(body)) return "CAUSE_EFFECT";
    if (new RegExp(`\\b${w}\\b\\s*[;:—–]`, "i").test(body)) return "RESTATEMENT";
    if (new RegExp(`\\b${w}s? (is|are) (a|an|the|one|someone|something|when|what)\\b`, "i").test(body)) return "DEFINITION";
  }
  for (const [re, c] of CLUE_SIGNAL) if (re.test(body)) return c;
  return "NONE";
}

// ---- spelling patterns (word study): deterministic detector on the words an item targets

const VOWELS = "aeiouy";
const syllables = (w: string) => (w.toLowerCase().replace(/e$/, "").match(/[aeiouy]+/g) ?? []).length || 1;
const LONG_OW = new Set(["own", "owner", "grown", "shown", "blown", "known", "flown", "thrown", "sown", "mown", "bowl", "bowls", "lower", "slower", "mower", "bowler"]);
const OU_NOT_DIPHTHONG = /ould|^you|ough|ous$|ousl|^(touch|young|country|cousin|double|trouble|soup|group|four|pour|course|journey|tough|rough|enough|famous|nervous)/;

/** The inflection rule a base word + suffix needs (null = add the ending as is). */
export function inflectionRule(base: string, suffix: string): "DOUBLING_RULE" | "DROP_E" | "Y_TO_I" | "F_TO_V" | null {
  const b = base.toLowerCase().trim(), sfx = suffix.toLowerCase().replace(/^-/, "");
  const vowelStart = /^[aeiouy]/.test(sfx);
  if (/[^aeiou]y$/.test(b) && !/^i/.test(sfx)) return "Y_TO_I";
  if (/e$/.test(b) && !/[aeiou]e$/.test(b) && vowelStart && !/^(ee|ye|oe)$/.test(b.slice(-2))) return "DROP_E";
  if (vowelStart && syllables(b) === 1 && /^[^aeiou]*[aeiou][bdfgklmnprtvz]$/.test(b)) return "DOUBLING_RULE";
  if (/(f|fe)$/.test(b) && /^(s|es)$/.test(sfx)) return "F_TO_V";
  return null;
}

/** Every spelling pattern a word shows, most specific first (the first one is the word's main pattern). */
export function detectSpellingPatterns(word: string): SpellingPattern[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length < 2) return [];
  const out: SpellingPattern[] = [];
  const add = (p: SpellingPattern) => { if (!out.includes(p)) out.push(p); };
  // inflected forms whose base changed: hopping, making, cried, babies, happily, leaves
  if (/[^aeiou][aeiou]([bdfgmnprtvz])\1(ing|ed|er|est|y)$/.test(w) || /[^aeiou]i(es|ed|er|est|ly|ness|ful)$/.test(w) || (w.length <= 8 && /^[^aeiou]*[aeiou][^aeiouwxy](ing|ed)$/.test(w)) || /(ves)$/.test(w) && /[^aeiou][aeiou]?ves$/.test(w) && !/(ive|ove|ave|eve)s$/.test(w)) add("INFLECTION_CHANGE");
  if (/^kn|^wr|^gn|mb$|mb[^aeiou]|[^aeiou]ght|ight|aught|ought|eigh|^ps|^rh|rh|stle$|[ao]lk|alm|^hon|^hour|bt|gue$|^sc[ei]/.test(w)) add("SILENT_LETTER");
  if (/oi|oy/.test(w) || (/ou/.test(w) && !OU_NOT_DIPHTHONG.test(w)) || (/ow(n|l|d|er|s)?$/.test(w) && /ow(n|l|d|er)/.test(w) && !LONG_OW.has(w)) || /^(how|now|cow|wow|plow|vow|brow|allow|bow)$/.test(w)) add("DIPHTHONG");
  if (/[aeiou]r(?![aeiouyr])|[aeiou]r$/.test(w)) add("R_CONTROLLED");
  if (/ai|ay|ee|ea|oa|oe|ue|ew|ie|ei|igh|oo|au|aw/.test(w) || (/ow/.test(w) && !out.includes("DIPHTHONG"))) add("VOWEL_TEAM");
  if (/c[eiy]/.test(w) || /dge|[^dg]ge$|^ge[mno]|gi[aeo]|gy$|gen|gest|gic/.test(w)) add("SOFT_C_G");
  const syl = syllables(w);
  if (syl === 1 && /[aeiou][^aeiou]e$/.test(w)) add("LONG_VOWEL");
  if (syl === 1 && /^[^aeiou]*[aeiou]$/.test(w) && w.length <= 3) add("LONG_VOWEL");
  if (syl >= 2) add("SYLLABLE_TYPES");
  if (syl === 1 && /^[^aeiouy]*[aeiou][^aeiouy]+$/.test(w)) add("SHORT_VOWEL");
  return out;
}

/**
 * The main spelling pattern of a spelling item: the words it targets are the base word of an "add -ing to …"
 * task, the words of the correct option that the wrong options misspell, or the accepted answers.
 */
export function spellingPattern(item: { stem: string; options?: { text: string; correct: boolean }[]; answers?: string[] }): SpellingPattern | null {
  const add = item.stem.match(/\badd\s+["“]?-?([a-z]+)["”]?\s+to\s+(?:the\s+word\s+)?["“]?([a-z]+)/i);
  if (add && inflectionRule(add[2], add[1])) return "INFLECTION_CHANGE";
  if (/\b(plural|plurals)\b/i.test(item.stem) && (item.answers ?? []).some((a) => /ves$|ies$/i.test(a))) return "INFLECTION_CHANGE";
  const tok = (t: string) => t.toLowerCase().match(/[a-z]+/g) ?? [];
  let targets: string[] = [];
  const correct = (item.options ?? []).filter((o) => o.correct);
  const wrong = (item.options ?? []).filter((o) => !o.correct);
  if (correct.length) {
    const wrongSets = wrong.map((o) => new Set(tok(o.text)));
    targets = correct.flatMap((o) => tok(o.text)).filter((w) => wrongSets.some((s) => !s.has(w)));
  }
  if (!targets.length && item.answers?.length) targets = item.answers.flatMap(tok);
  if (!targets.length) targets = [...item.stem.matchAll(/[“"(]([a-z]+)[”")]/gi)].map((m) => m[1].toLowerCase());
  const counts = new Map<SpellingPattern, number>();
  for (const w of targets) { const p = detectSpellingPatterns(w)[0]; if (p) counts.set(p, (counts.get(p) ?? 0) + 1); }
  if (!counts.size) return null;
  // ties: the more specific pattern (earlier in SPELLING_PATTERNS order of detection) wins
  const order: SpellingPattern[] = ["INFLECTION_CHANGE", "SILENT_LETTER", "DIPHTHONG", "R_CONTROLLED", "VOWEL_TEAM", "SOFT_C_G", "LONG_VOWEL", "SYLLABLE_TYPES", "SHORT_VOWEL"];
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0][0];
}

export interface LiteracyInput { skillCode: string; category?: string; stem: string; passage?: string | null; options?: { text: string; correct: boolean }[]; answers?: string[]; subskillLabel?: string }

/** Every literacy tag that applies to one question (rules only). */
export function estimateLiteracyTags(i: LiteracyInput): Partial<Record<LiteracyTag, string>> {
  const out: Partial<Record<LiteracyTag, string>> = {};
  const qar = estimateQar(i.skillCode, i.stem, { category: i.category, hasPassage: Boolean(i.passage) });
  if (qar) { out.qar = qar; out.thinking = estimateThinking(i.skillCode, i.stem, { category: i.category, qar }) ?? undefined; }
  const clue = estimateClueType(i.skillCode, i.stem, { category: i.category, passage: i.passage, label: i.subskillLabel });
  if (clue) out.clueType = clue;
  if (isSpellingItem(i.skillCode)) { const p = spellingPattern(i); if (p) out.pattern = p; }
  for (const k of Object.keys(out) as LiteracyTag[]) if (!out[k]) delete out[k];
  return out;
}

/** A valid value for a literacy tag (case-insensitive), or null. */
export function literacyValue(tag: LiteracyTag, v: unknown): string | null {
  const x = String(v ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (LITERACY_TAGS[tag] as readonly string[]).includes(x) ? x : null;
}

/**
 * Merges estimated literacy tags into Question.tags without overwriting a person's value: a value is replaced only
 * when it is missing or was set by the rules (tags.literacySource[tag] === "RULE"). Returns the new tags and what changed.
 */
export function mergeLiteracyTags(current: unknown, values: Partial<Record<LiteracyTag, string>>, source: "RULE" | "AI" | "ADMIN" | "IMPORT" = "RULE"): { tags: Record<string, unknown>; changed: LiteracyTag[] } {
  const t = { ...tagsObject(current) };
  const src = { ...tagsObject(t.literacySource) } as Record<string, string>;
  const changed: LiteracyTag[] = [];
  for (const k of Object.keys(LITERACY_TAGS) as LiteracyTag[]) {
    const v = literacyValue(k, values[k]);
    if (!v) continue;
    const has = t[k] !== undefined && t[k] !== null && t[k] !== "";
    const personal = has && src[k] !== "RULE";
    if (personal && source === "RULE") continue;          // a person's (or an import's) value stays
    if (has && t[k] === v && src[k] === source) continue;
    t[k] = v; src[k] = source; changed.push(k);
  }
  if (changed.length) t.literacySource = src;
  return { tags: t, changed };
}
