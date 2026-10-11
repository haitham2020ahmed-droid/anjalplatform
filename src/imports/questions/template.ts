/**
 * Question-bank import, step 2: the OFFICIAL TEMPLATE and the rules that turn one row into one
 * question. Pure (no database), so every rule is tested directly.
 *
 *   header row  → required columns present? (exact names; case, spaces and "_" are ignored)
 *   each row    → question type, answer choices, correct answer, difficulty, cognitive level, grade
 *   curriculum  → Grade, Skill and Standard must already exist on the platform (matched exactly,
 *                 never created, never guessed). See matchCurriculum.
 *
 * No AI is involved anywhere in the import.
 */
import { DICTATION_WORD, normalizeCombined, type BankOption, type Combine, type Dictation, type Grid, type HotText, type QuestionTypeCode, type TwoPart } from "./validate";
import { needsPassage } from "../../lib/passage-detect";

// ------------------------------------------------------------------ columns

export type ColumnKey =
  | "stem" | "type" | "optA" | "optB" | "optC" | "optD" | "optE" | "optF" | "answer" | "explanation"
  | "grade" | "skill" | "standard" | "level" | "cognitive" | "passage"
  // optional: Placement / MAP test uses (Question Bank import) and the Curriculum Map place (Curriculum import)
  | "use" | "mapCode" | "unit" | "set" | "category" | "mapLevel" | "lexile"
  // optional extras: NWEA MAP test and instructional area, Depth of Knowledge, domain, passage title
  | "mapTest" | "mapArea" | "dok" | "domain" | "passageTitle"
  // optional: the columns of the newer types (Two-Part, Grid, Hot Text) and of Error Correction
  | "partB" | "partBOptions" | "partBAnswer" | "gridRows" | "hotText" | "parts" | "correction"
  // optional: Dictation (the word the platform says, and a sentence that uses it)
  | "dictWord" | "dictSentence"
  // optional: Sentence Combining (the short sentences and the joining word) and Sentence Order (the items in order)
  | "combineSentences" | "connector" | "orderItems";

interface ColumnSpec { key: ColumnKey; header: string; required: boolean; aliases: string[]; help: string }

/** The template's columns, in order. Option E and F are optional extras (not in the template). */
export const TEMPLATE_COLUMNS: readonly ColumnSpec[] = [
  { key: "stem", header: "Question Text", required: true, aliases: ["question", "question text", "stem", "question stem"], help: "The question students read. To add a blank, write ____ (four underscores)." },
  { key: "type", header: "Question Type", required: true, aliases: ["question type", "type"], help: "Multiple Choice, Multi Select, True/False, Dropdown, Fill in the Blank or Short Answer." },
  { key: "optA", header: "Option A", required: true, aliases: ["option a", "choice a"], help: "First answer choice." },
  { key: "optB", header: "Option B", required: true, aliases: ["option b", "choice b"], help: "Second answer choice." },
  { key: "optC", header: "Option C", required: true, aliases: ["option c", "choice c"], help: "Third answer choice (may be empty)." },
  { key: "optD", header: "Option D", required: true, aliases: ["option d", "choice d"], help: "Fourth answer choice (may be empty)." },
  { key: "optE", header: "Option E", required: false, aliases: ["option e", "choice e"], help: "" },
  { key: "optF", header: "Option F", required: false, aliases: ["option f", "choice f"], help: "" },
  { key: "answer", header: "Correct Answer", required: true, aliases: ["correct answer", "answer", "answer key", "correct option", "key"], help: "The letter of the correct choice (A, B, C or D). Multi Select: letters with commas (A, C). True/False: True or False. Fill in the Blank: the answer; several accepted answers separated by |." },
  { key: "explanation", header: "Explanation", required: true, aliases: ["explanation"], help: "Why the answer is correct (students see it after answering)." },
  { key: "grade", header: "Grade", required: true, aliases: ["grade", "grade level"], help: "The grade number, e.g. 4 (or Grade 4)." },
  { key: "skill", header: "Skill", required: true, aliases: ["skill", "skill name", "skill code"], help: "The exact skill name or code from the Curriculum sheet." },
  { key: "standard", header: "Standard", required: true, aliases: ["standard", "standard code", "ccss", "ccss standard", "ccss code", "common core standard"], help: "The standard code from the Curriculum sheet, e.g. RL.4.1." },
  { key: "level", header: "Difficulty Level", required: true, aliases: ["difficulty level", "difficulty", "level"], help: "A number from 1 (very easy) to 7 (advanced); 4 = grade level." },
  { key: "cognitive", header: "Cognitive Level", required: true, aliases: ["cognitive level", "bloom", "bloom's level", "blooms level"], help: "Remember, Understand, Apply, Analyze, Evaluate or Create (may be empty)." },
  { key: "passage", header: "Passage/Text", required: false, aliases: ["passage/text", "passage", "text", "passage text", "reading passage"], help: "Optional: a reading text the question is about. Repeat the same text on each of its questions." },
  { key: "lexile", header: "Lexile", required: false, aliases: ["lexile", "lexile measure", "lexile level", "text lexile"], help: "Optional: the Lexile of the question or its passage, e.g. 820 or 820L. It decides Below / On / Above." },
  { key: "mapTest", header: "MAP Test", required: false, aliases: ["map test", "map subject", "nwea test"], help: "Optional: Reading or Language Usage. Empty = decided by the platform from the standard." },
  { key: "mapArea", header: "MAP Instructional Area", required: false, aliases: ["map instructional area", "instructional area", "map goal area", "goal area", "nwea instructional area"], help: "Optional: Literary Text, Informational Text, Vocabulary, Language: Understand, Edit for Grammar, Usage, Language: Understand, Edit for Mechanics, or Writing: Write, Revise Texts for Purpose and Audience." },
  { key: "dok", header: "DOK", required: false, aliases: ["dok", "depth of knowledge", "dok level"], help: "Optional: Depth of Knowledge, 1–4." },
  { key: "domain", header: "Domain", required: false, aliases: ["domain", "strand", "ela domain"], help: "Optional: e.g. Reading Literature, Reading Informational, Language, Writing." },
  { key: "passageTitle", header: "Passage Title", required: false, aliases: ["passage title", "text title", "title of passage"], help: "Optional: the title of the passage." },
  { key: "use", header: "Use", required: false, aliases: ["use", "uses", "use for", "placement / map", "placement/map"], help: "Optional: Placement, MAP, or both (e.g. Placement, MAP). Empty = practice only." },
  { key: "unit", header: "Unit", required: false, aliases: ["unit", "unit number"], help: "Curriculum import: the unit number, e.g. 1 or Unit 1." },
  { key: "set", header: "Text Set / Selection", required: false, aliases: ["text set / selection", "text set/selection", "text set", "selection"], help: "Curriculum import: the number (e.g. 2) or the exact title (e.g. Amigo Brothers)." },
  { key: "category", header: "Category", required: false, aliases: ["category", "curriculum category"], help: "Curriculum import: Concept Vocabulary, Analyze Craft and Structure or Respond to Reading." },
  { key: "mapLevel", header: "Map Level", required: false, aliases: ["map level", "category level", "above/on/below", "reading level"], help: "Curriculum import: Above, On or Below (leave empty for Concept Vocabulary)." },
  { key: "mapCode", header: "Curriculum Map ID", required: false, aliases: ["curriculum map id", "map id", "map code", "curriculum map code"], help: "Optional instead of the four columns above, e.g. G4.U1.TS1.ACS.ON." },
  { key: "partB", header: "Part B Question", required: false, aliases: ["part b question", "part b", "part b stem", "evidence question"], help: "Two-Part only: the Part B question (empty = “Which sentence from the passage best supports the answer to Part A?”). Part A is the Question Text with Options A–F and Correct Answer." },
  { key: "partBOptions", header: "Part B Options", required: false, aliases: ["part b options", "part b choices", "evidence options"], help: "Two-Part only: the Part B choices (usually sentences from the passage), separated by | — they are lettered A, B, C… in that order." },
  { key: "partBAnswer", header: "Part B Answer", required: false, aliases: ["part b answer", "part b correct answer", "evidence answer"], help: "Two-Part only: the letter(s) of the Part B answer, e.g. C, or B, D when students choose two." },
  { key: "gridRows", header: "Grid Rows", required: false, aliases: ["grid rows", "rows", "table rows"], help: "Grid only: the rows (e.g. sentences), separated by |. The columns are Option A, Option B…; Correct Answer gives one column letter per row in order, e.g. A, B, A." },
  { key: "hotText", header: "Hot Text", required: false, aliases: ["hot text", "selectable sentences", "excerpt sentences"], help: "Hot Text only: the sentences students can tap, separated by |. Correct Answer gives the sentence number(s), e.g. 3 or 2, 4." },
  { key: "parts", header: "Sentence Parts", required: false, aliases: ["sentence parts", "segments", "parts"], help: "Error Correction only: the sentence split into parts, separated by |. Correct Answer gives the number(s) of the part(s) with a mistake (e.g. 2 or 1, 3), or No error. A “No error” choice is always shown." },
  { key: "dictWord", header: "Dictation Word", required: false, aliases: ["dictation word", "dictation", "spelling word", "word to say"], help: "Dictation only: the word the platform says aloud; students type it. (Correct Answer may hold the word instead.)" },
  { key: "dictSentence", header: "Dictation Sentence", required: false, aliases: ["dictation sentence", "sentence to say", "context sentence"], help: "Dictation only (optional): a short sentence that uses the word, said after the word." },
  { key: "combineSentences", header: "Sentences to Combine", required: false, aliases: ["sentences to combine", "combine sentences", "short sentences"], help: "Sentence Combining only: the 2–4 short sentences to join, separated by |. Correct Answer gives the accepted combined sentence(s), separated by | (the first is the model answer)." },
  { key: "connector", header: "Joining Word", required: false, aliases: ["joining word", "connector", "conjunction"], help: "Sentence Combining only (optional): the word students must use to join the sentences, e.g. because, but, who." },
  { key: "orderItems", header: "Order Items", required: false, aliases: ["order items", "items in order", "sentences in order"], help: "Sentence Order only: the sentences (or parts) in the CORRECT order, separated by | (at least 3). Students see them shuffled." },
  { key: "correction", header: "Correction", required: false, aliases: ["correction", "corrections", "corrected part"], help: "Error Correction only: each wrong part written correctly, separated by | in the same order. Question Type “Error Correction (type the fix)” makes students type the fix: tap = half credit, right fix = full." },
];

/** Headers of the template, in order (Option E/F are accepted but not part of the template). */
export const MAP_COLUMNS: readonly ColumnKey[] = ["unit", "set", "category", "mapLevel", "mapCode"];
/** accepted when present, not part of the downloadable template (except the two MAP columns) */
const EXTRA_COLUMNS: readonly ColumnKey[] = ["dok", "domain", "passageTitle", "partB", "partBOptions", "partBAnswer", "gridRows", "hotText", "parts", "correction", "dictWord", "dictSentence", "combineSentences", "connector", "orderItems"];
export const TEMPLATE_HEADERS = TEMPLATE_COLUMNS.filter((c) => c.key !== "optE" && c.key !== "optF" && !MAP_COLUMNS.includes(c.key) && !EXTRA_COLUMNS.includes(c.key)).map((c) => c.header);
/** Curriculum import: the place on the Curriculum Map instead of Use; Skill, Standard and Cognitive Level optional. */
export const CURRICULUM_TEMPLATE_HEADERS = TEMPLATE_COLUMNS.filter((c) => c.key !== "optE" && c.key !== "optF" && c.key !== "use" && c.key !== "mapCode" && !EXTRA_COLUMNS.includes(c.key)).map((c) => c.header);
export type ImportTarget = "BANK" | "CURRICULUM";
/** Columns that must be present for each kind of import. */
function requiredKeys(target: ImportTarget, present: Set<ColumnKey>, placeKnown = false): ColumnKey[] {
  // Only the question itself is required: an empty or missing column (type, answer, explanation, grade, skill,
  // standard, level…) is completed by the platform — by rules first, then by its AI (see autofill.ts).
  const base: ColumnKey[] = ["stem"];
  if (target === "BANK" || placeKnown) return base;
  return [...base, ...(present.has("mapCode") ? [] : (["unit", "set", "category"] as ColumnKey[]))];
}

export const SUPPORTED_TYPES: readonly { name: string; code: QuestionTypeCode }[] = [
  { name: "Multiple Choice", code: "MULTIPLE_CHOICE" },
  { name: "Multi Select", code: "MULTI_SELECT" },
  { name: "True/False", code: "TRUE_FALSE" },
  { name: "Dropdown", code: "DROPDOWN" },
  { name: "Fill in the Blank", code: "FILL_BLANK" },
  { name: "Short Answer", code: "SHORT_ANSWER" },
  { name: "Two-Part", code: "TWO_PART" },
  { name: "Grid", code: "GRID" },
  { name: "Hot Text", code: "HOT_TEXT" },
  { name: "Error Correction", code: "ERROR_CORRECTION" },
  { name: "Dictation", code: "DICTATION" },
  { name: "Sentence Combining", code: "SENTENCE_COMBINE" },
  { name: "Sentence Order", code: "SENTENCE_ORDER" },
];
/** types read from their own columns (Part B…, Grid Rows, Hot Text, Sentence Parts): their key is never completed by the AI */
const OWN_COLUMN_TYPES = new Set<QuestionTypeCode>(["TWO_PART", "GRID", "HOT_TEXT", "ERROR_CORRECTION", "DICTATION", "SENTENCE_COMBINE", "SENTENCE_ORDER"]);

export const COGNITIVE_LEVELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"] as const;

export const MAX_IMPORT_ROWS = 10000;
/** Example rows in the downloadable template start with this, so they are never imported by mistake. */
export const EXAMPLE_MARK = "[Example]";
const EXAMPLE_PREFIX = /^\[example\]/i;
export const MAX_PASSAGE_CHARS = 20_000;

export const TEACHER_RULES = [
  "One question per row.",
  "Keep answer choices in separate columns (Option A, Option B, Option C, Option D).",
  "Do not merge cells, and do not change or remove the header row.",
  "Use consistent formatting: plain text, no line breaks inside a cell unless the passage needs them.",
  "Use the exact Grade, Skill and Standard from the platform (see the Curriculum sheet).",
];

// ------------------------------------------------------------------- header

const normHeader = (h: string) => String(h ?? "").replace(/\(optional\)|\(required\)|\*/gi, "").toLowerCase().replace(/[_\s]+/g, " ").replace(/\s*\/\s*/g, "/").trim();

export interface ParsedRow { row: number; cells: Partial<Record<ColumnKey, string>> }
export type ParsedTable =
  | { ok: true; rows: ParsedRow[]; ignoredColumns: string[] }
  | { ok: false; errors: string[] };

/**
 * Checks the header row and returns the data rows. The header must be the first non-empty row.
 * Every missing required column is reported by name ("Missing required column: Correct Answer").
 */
export function parseTemplateTable(table: string[][], target: ImportTarget = "BANK", opts: { placeKnown?: boolean } = {}): ParsedTable {
  const at = table.findIndex((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (at < 0) return { ok: false, errors: ["The file is empty."] };
  const header = table[at].map((h) => String(h ?? ""));
  const col = new Map<ColumnKey, number>();
  const errors: string[] = [];
  const ignored: string[] = [];
  header.forEach((h, i) => {
    const n = normHeader(h);
    if (!n) return;
    const spec = TEMPLATE_COLUMNS.find((c) => c.aliases.includes(n) || normHeader(c.header) === n);
    if (!spec) return void ignored.push(h.trim());
    if (col.has(spec.key)) errors.push(`The column “${spec.header}” appears twice in the header row. Keep only one.`);
    else col.set(spec.key, i);
  });
  const required = requiredKeys(target, new Set(col.keys()), opts.placeKnown);
  if (!col.has("stem")) {
    // a file for another page, uploaded here by mistake: say where it goes
    const hs = header.map((h) => normHeader(h));
    if (hs.includes(normHeader("Sentence Starters")) || hs.includes(normHeader("Word Bank"))) return { ok: false, errors: ["This is a Respond to Reading file, not a questions file. Upload it here instead: Curriculum Map → ✍️ Respond to Reading → 📥 Import activities (/admin/curriculum-map/respond)."] };
    if (hs.includes(normHeader("RIT Low")) && hs.includes(normHeader("Statement"))) return { ok: false, errors: ["This is a Learning Continuum file, not a questions file. Upload it in MAP → Learning Continuum (/admin/map-continuum)."] };
    if (hs.includes(normHeader("Article Code"))) return { ok: false, errors: ["This is a ReadMaster file, not a questions file. Upload it in ReadMaster → Import many (/admin/readmaster)."] };
    if (hs.includes(normHeader("Reading Fall RIT")) || hs.includes(normHeader("Language Fall RIT"))) return { ok: false, errors: ["This is a MAP scores file, not a questions file. Upload it in MAP → MAP Data (/teacher/map-rit)."] };
    if (hs.includes("role") && hs.includes(normHeader("display_name"))) return { ok: false, errors: ["This is a users (roster) file, not a questions file. Upload it in School → Users → Import Users (/admin/roster)."] };
  }
  const missing = TEMPLATE_COLUMNS.filter((c) => required.includes(c.key) && !col.has(c.key));
  if (missing.length === required.length && !col.size) {
    return { ok: false, errors: [`The first row must be the template’s header row (${TEMPLATE_HEADERS.slice(0, 4).join(", ")}, …). Download the template and keep its first row unchanged.`] };
  }
  for (const m of missing) errors.push(`Missing required column: ${m.header}`);
  if (errors.length) return { ok: false, errors };
  const rows: ParsedRow[] = [];
  for (let r = at + 1; r < table.length; r++) {
    const raw = table[r];
    if (!raw.some((c) => String(c ?? "").trim() !== "")) continue;
    const cells: Partial<Record<ColumnKey, string>> = {};
    for (const [k, i] of col) cells[k] = String(raw[i] ?? "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").trim();
    rows.push({ row: r + 1, cells });
  }
  return { ok: true, rows, ignoredColumns: ignored };
}

// --------------------------------------------------------------- one row

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const LETTERS = "ABCDEF";
const OPTION_KEYS: ColumnKey[] = ["optA", "optB", "optC", "optD", "optE", "optF"];

const TYPE_NAMES: Record<string, QuestionTypeCode> = {
  "multiple choice": "MULTIPLE_CHOICE", "multiple-choice": "MULTIPLE_CHOICE", mcq: "MULTIPLE_CHOICE", mc: "MULTIPLE_CHOICE", "single choice": "MULTIPLE_CHOICE",
  "multi select": "MULTI_SELECT", "multi-select": "MULTI_SELECT", "multiple select": "MULTI_SELECT", "multiple answer": "MULTI_SELECT", "multiple answers": "MULTI_SELECT", "select all": "MULTI_SELECT", "select all that apply": "MULTI_SELECT",
  "true/false": "TRUE_FALSE", "true false": "TRUE_FALSE", "true or false": "TRUE_FALSE", "t/f": "TRUE_FALSE", tf: "TRUE_FALSE",
  dropdown: "DROPDOWN", "drop down": "DROPDOWN", "drop-down": "DROPDOWN",
  "fill in the blank": "FILL_BLANK", "fill in the blanks": "FILL_BLANK", "fill in blank": "FILL_BLANK", "fill blank": "FILL_BLANK", "fill-in": "FILL_BLANK", "fill in": "FILL_BLANK", "gap fill": "FILL_BLANK",
  "short answer": "SHORT_ANSWER", "open ended": "SHORT_ANSWER", "open-ended": "SHORT_ANSWER", "open response": "SHORT_ANSWER",
  "two-part": "TWO_PART", "two part": "TWO_PART", "part a/part b": "TWO_PART", "evidence-based": "TWO_PART", "evidence based": "TWO_PART", ebsr: "TWO_PART",
  grid: "GRID", "table match": "GRID", "table": "GRID", matrix: "GRID",
  "hot text": "HOT_TEXT", "hot-text": "HOT_TEXT", hottext: "HOT_TEXT", "select text": "HOT_TEXT", "select the sentence": "HOT_TEXT",
  dictation: "DICTATION", "spelling dictation": "DICTATION", "hear and spell": "DICTATION", "listen and spell": "DICTATION",
  "sentence combining": "SENTENCE_COMBINE", "sentence combine": "SENTENCE_COMBINE", "combine sentences": "SENTENCE_COMBINE", "combining sentences": "SENTENCE_COMBINE",
  "sentence order": "SENTENCE_ORDER", "sentence ordering": "SENTENCE_ORDER", "order the sentences": "SENTENCE_ORDER",
  "error correction": "ERROR_CORRECTION", "error correction (type the fix)": "ERROR_CORRECTION", "error correction - type the fix": "ERROR_CORRECTION", editing: "ERROR_CORRECTION",
};
const NOT_IN_TEMPLATE = /match|order|sequence|arrange|error correction|drag/i;

export function questionTypeFrom(raw: string): { code?: QuestionTypeCode; error?: string } {
  const t = oneLine(raw).toLowerCase().replace(/\s*\/\s*/g, "/");
  if (!t) return { error: "Question Type is empty. Use one of: " + SUPPORTED_TYPES.map((x) => x.name).join(", ") + "." };
  const code = TYPE_NAMES[t] ?? SUPPORTED_TYPES.find((x) => x.code === t.toUpperCase().replace(/[\s-]+/g, "_"))?.code;
  if (code) return { code };
  if (NOT_IN_TEMPLATE.test(t)) return { error: `“${oneLine(raw)}” questions cannot be imported from the template (they need more columns). Create them in the question editor.` };
  return { error: `Question Type “${oneLine(raw)}” is not supported. Use one of: ${SUPPORTED_TYPES.map((x) => x.name).join(", ")}.` };
}

const LEVEL_WORDS: Record<string, number> = {
  "very easy": 1, easy: 2, "below grade level": 3, "below grade": 3, "grade level": 4, "on grade level": 4, medium: 4, "above grade level": 5, "above grade": 5,
  challenging: 6, hard: 6, difficult: 6, advanced: 7, "very hard": 7,
  below: 3, "below level": 3, approaching: 3, on: 4, "on level": 4, "at grade level": 4, above: 5, "above level": 5, "beyond": 5,
};

export function difficultyFrom(raw: string): { level?: number; error?: string } {
  const t = oneLine(raw).toLowerCase();
  if (!t) return { error: "Difficulty Level is empty. Write a number from 1 (very easy) to 7 (advanced)." };
  const m = t.match(/^(?:level\s*|l)?(\d+(?:\.0+)?)$/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 7) return { level: n };
    return { error: `Difficulty Level “${oneLine(raw)}” must be a whole number from 1 to 7.` };
  }
  if (LEVEL_WORDS[t]) return { level: LEVEL_WORDS[t] };
  return { error: `Difficulty Level “${oneLine(raw)}” is not valid. Write a number from 1 (very easy) to 7 (advanced).` };
}

export function cognitiveFrom(raw: string): { value: string | null; error?: string } {
  const t = oneLine(raw).toLowerCase().replace(/^analyse$/, "analyze");
  if (!t) return { value: null };
  const hit = COGNITIVE_LEVELS.find((c) => c.toLowerCase() === t);
  return hit ? { value: hit } : { value: null, error: `Cognitive Level “${oneLine(raw)}” is not valid. Use one of: ${COGNITIVE_LEVELS.join(", ")} (or leave it empty).` };
}

export function gradeFrom(raw: string): { grade?: number; error?: string } {
  const t = oneLine(raw);
  if (!t) return { error: "Grade is empty. Write the grade number, e.g. 4." };
  const m = t.match(/^(?:grade|gr\.?|g)?\s*(\d{1,2})(?:\.0+)?$/i);
  return m ? { grade: Number(m[1]) } : { error: `Grade “${t}” is not a grade number. Write it as 4 or Grade 4.` };
}

/** Letters such as "B", "(b)", "Option B", "A, C", "A and C" → indexes. Null when it is not a letter list. */
function letterIndexes(raw: string): number[] | null {
  const t = oneLine(raw).replace(/^(?:options?|choices?|letters?|answers?)\s*/i, "");
  if (!/^\(?[A-Fa-f]\)?\.?(?:\s*(?:,|;|&|\/|and|\s)\s*\(?[A-Fa-f]\)?\.?)*$/.test(t)) return null;
  return [...t.matchAll(/\b[A-Fa-f]\b/g)].map((m) => LETTERS.indexOf(m[0].toUpperCase()));
}

/** The question as read from one row, before it is placed in the curriculum. */
export interface RowQuestion {
  type: QuestionTypeCode;
  stem: string;
  options?: BankOption[];
  answer?: boolean;
  answers?: string[];
  explanation: string;
  explanationGiven: boolean;
  level: number;
  cognitiveLevel: string | null;
  passage: string | null;
  twoPart?: TwoPart;
  grid?: Grid;
  hotText?: HotText;
  dictation?: Dictation;
  combine?: Combine;
  sequence?: string[];
  segments?: string[];
  errorIndexes?: number[];
  corrections?: string[];
  noErrorOption?: boolean;
  typeCorrection?: boolean;
}

export interface RowResult { question: RowQuestion | null; grade: number | null; errors: string[]; warnings: string[]; /** what the platform must complete: answer, explanation */ needs: string[] }

/** An empty Question Type, read from the row: choices → Multiple Choice (two or more letters → Multi Select;
 *  True/False choices → True/False); no choices → Fill in the Blank when there is a blank, True/False when the
 *  answer is True or False, else Short Answer. */
export function inferType(cells: Partial<Record<ColumnKey, string>>): string {
  const opts = OPTION_KEYS.map((k) => oneLine(cells[k] ?? "")).filter(Boolean);
  const ans = oneLine(cells.answer ?? "");
  if (opts.length >= 2) {
    if (opts.length === 2 && opts.every((o) => /^(true|false)$/i.test(o))) return "True/False";
    const letters = letterIndexes(ans);
    return letters && letters.length > 1 ? "Multi Select" : "Multiple Choice";
  }
  if (/^(true|false)$/i.test(ans)) return "True/False";
  if (/_{2,}/.test(cells.stem ?? "")) return "Fill in the Blank";
  return "Short Answer";
}

/** Reads one row: everything except the curriculum (Grade/Skill/Standard are matched separately). */
const LEVEL_FROM_MAP: Record<string, number> = { above: 5, on: 4, below: 3 };
export function readRow(cells: Partial<Record<ColumnKey, string>>, target: ImportTarget = "BANK"): RowResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const get = (k: ColumnKey) => cells[k] ?? "";
  const stem = get("stem").replace(/[ \t]+/g, " ").trim();
  if (!stem) errors.push("Question Text is empty.");
  else if (EXAMPLE_PREFIX.test(stem)) errors.push("This is an example row from the template. Delete it (or replace it with your own question) before importing.");
  else if (stem.length > 2000) errors.push(`Question Text is too long (${stem.length} characters; the limit is 2,000).`);

  const needs: string[] = [];
  // empty cells are completed, never a reason to refuse the row
  const typeCell = get("type").trim() || inferType(cells);
  if (!get("type").trim() && stem) warnings.push(`Question Type was empty: read as ${typeCell}.`);
  const t = questionTypeFrom(typeCell);
  if (t.error) errors.push(t.error);
  // an empty Difficulty Level follows the Map Level (Above 5, On 4, Below 3), else 4 (grade level)
  const mapLv = get("mapLevel").trim().toLowerCase().replace(/\s*level$/, "");
  const lv = !get("level").trim() ? { level: LEVEL_FROM_MAP[mapLv] ?? 4 } : difficultyFrom(get("level"));
  if (lv.error) errors.push(lv.error);
  const cg = !get("cognitive").trim() ? { value: null as string | null } : cognitiveFrom(get("cognitive"));
  if ("error" in cg && cg.error) errors.push(cg.error);
  const gr = get("grade").trim() ? gradeFrom(get("grade")) : { grade: undefined as number | undefined };
  if ("error" in gr && gr.error) errors.push(gr.error);

  const passage = get("passage").trim() || null;
  if (passage && passage.length > MAX_PASSAGE_CHARS) errors.push(`Passage/Text is too long (${passage.length} characters; the limit is ${MAX_PASSAGE_CHARS.toLocaleString("en")}).`);

  // answer choices: in order, no gaps, no repeats
  const raw = OPTION_KEYS.map((k) => oneLine(get(k)));
  const last = raw.reduce((acc, v, i) => (v ? i : acc), -1);
  const texts = raw.slice(0, last + 1);
  const gap = texts.findIndex((v) => !v);
  const answerRaw = oneLine(get("answer"));
  const explanationRaw = get("explanation").replace(/\s+/g, " ").trim();

  let q: RowQuestion | null = null;
  if (t.code) {
    const type = t.code;
    const base = { type, stem, explanation: explanationRaw, explanationGiven: Boolean(explanationRaw), level: lv.level ?? 4, cognitiveLevel: cg.value, passage };
    // no answer: the platform's AI chooses it after the import (the question stays a draft until it is checked)
    if (!answerRaw && type !== "SHORT_ANSWER" && !OWN_COLUMN_TYPES.has(type)) needs.push("answer");
    switch (type) {
      case "MULTIPLE_CHOICE":
      case "DROPDOWN":
      case "MULTI_SELECT": {
        if (gap >= 0) errors.push(`Option ${LETTERS[gap]} is empty but Option ${LETTERS[last]} is filled. Keep the answer choices in order with no empty choice between them.`);
        if (texts.length < 2) errors.push(`${type === "MULTI_SELECT" ? "Multi Select" : type === "DROPDOWN" ? "Dropdown" : "Multiple Choice"} needs at least 2 answer choices (Option A and Option B).`);
        const seen = new Map<string, number>();
        texts.forEach((v, i) => {
          if (!v) return;
          // capital letters count: “central park” and “Central Park” are different choices in a capitalization question
          const k = v.replace(/\s+/g, " ").trim();
          if (seen.has(k)) errors.push(`Option ${LETTERS[seen.get(k)!]} and Option ${LETTERS[i]} are the same (“${v}”). Each choice must be different.`);
          else seen.set(k, i);
        });
        const tooLong = texts.findIndex((v) => v.length > 500);
        if (tooLong >= 0) errors.push(`Option ${LETTERS[tooLong]} is too long (the limit is 500 characters).`);
        // no Correct Answer: NO choice is marked correct (never a guessed “A”); the AI chooses it after the import
        // and the question stays a draft that cannot be published until it has a correct answer
        let correct: number[] = [];
        if (answerRaw) {
          const byText = texts.findIndex((v) => v && v.toLowerCase() === answerRaw.toLowerCase());
          const letters = byText >= 0 ? [byText] : letterIndexes(answerRaw);
          if (!letters) errors.push(`Correct Answer “${answerRaw}” is not a letter of a choice. Write the letter, e.g. ${type === "MULTI_SELECT" ? "A, C" : "B"}.`);
          else {
            correct = [...new Set(letters)];
            for (const i of correct) if (!texts[i]) errors.push(`Correct Answer “${LETTERS[i]}” points to Option ${LETTERS[i]}, which is empty.`);
            if (type === "MULTI_SELECT" && correct.length < 2) errors.push("Multi Select needs 2 or more correct answers, e.g. “A, C”. For one correct answer use Multiple Choice.");
            if (type === "MULTI_SELECT" && correct.length >= texts.filter(Boolean).length && texts.length >= 2) errors.push("Multi Select needs at least one wrong answer choice: not every choice can be correct.");
            if (type !== "MULTI_SELECT" && correct.length > 1) errors.push(`${type === "DROPDOWN" ? "Dropdown" : "Multiple Choice"} has exactly one correct answer, but “${answerRaw}” gives ${correct.length}. For several correct answers use Multi Select.`);
          }
        }
        q = { ...base, options: texts.map((text, i) => ({ label: LETTERS[i], text, correct: correct.includes(i), rationale: null })) };
        break;
      }
      case "TRUE_FALSE": {
        const a = answerRaw.toLowerCase();
        const value = !a ? undefined : /^(true|t|yes)$/.test(a) ? true : /^(false|f|no)$/.test(a) ? false : undefined;
        if (answerRaw && value === undefined) errors.push(`Correct Answer for True/False must be True or False (found “${answerRaw}”).`);
        if (texts.some((v) => v && !/^(true|false)$/i.test(v))) warnings.push("Option columns are not used for True/False questions and were ignored.");
        q = { ...base, answer: value };
        break;
      }
      case "FILL_BLANK": {
        const answers = answerRaw ? answerRaw.split("|").map((x) => x.trim()).filter(Boolean) : [];
        if (texts.length) warnings.push("Option columns are not used for Fill in the Blank questions and were ignored. Put every accepted answer in Correct Answer, separated by |.");
        if (!/_{2,}/.test(stem)) warnings.push("The question has no blank. Mark the blank with ____ (four underscores).");
        q = { ...base, answers };
        break;
      }
      case "TWO_PART":
      case "GRID":
      case "HOT_TEXT":
      case "ERROR_CORRECTION":
      case "DICTATION":
      case "SENTENCE_COMBINE":
      case "SENTENCE_ORDER": {
        const r = readOwnColumns(type, { texts, gap, last, answerRaw, typeRaw: typeCell, get });
        if (r.fields.twoPart) r.fields.twoPart.partA.stem = stem; // Part A is the Question Text
        errors.push(...r.errors);
        warnings.push(...r.warnings);
        q = { ...base, ...r.fields };
        break;
      }
      case "SHORT_ANSWER": {
        warnings.push("Short answers are scored by the teacher and are not used in adaptive practice.");
        if (texts.length) warnings.push("Option columns are not used for Short Answer questions and were ignored.");
        q = { ...base, answers: answerRaw ? [answerRaw] : [] };
        break;
      }
      default:
        break;
    }
  }
  if (q && !q.passage && needsPassage(q.stem)) warnings.push("The question seems to refer to a passage (passage, story, paragraph…), but Passage/Text is empty.");
  if (q && needs.includes("answer")) warnings.push("Correct Answer is empty: the platform's AI will choose it after the import (the question stays a draft until it is checked).");
  if (q && !q.explanationGiven) {
    warnings.push("Explanation is empty: the platform's AI will write it after the import.");
    needs.push("explanation");
    q.explanation = needs.includes("answer") ? "The explanation will be added." : defaultExplanation(q);
  }
  if (q && q.explanation.length > 1000) errors.push(`Explanation is too long (${q.explanation.length} characters; the limit is 1,000).`);
  return { question: q, grade: gr.grade ?? null, errors, warnings, needs };
}

/** “a | b | c” (or one per line) → the pieces, trimmed, empty ones dropped. */
const pieces = (v: string) => v.split(/\s*\|\s*|\n+/).map((x) => oneLine(x)).filter(Boolean);
/** “2”, “2, 4”, “2 and 4” → [2, 4]; null when it is not a list of numbers. */
const numberList = (v: string): number[] | null => {
  const t = oneLine(v).replace(/^(?:parts?|sentences?|numbers?)\s*/i, "");
  return /^\d+(?:\s*(?:,|;|&|\/|and|\s)\s*\d+)*$/i.test(t) ? [...t.matchAll(/\d+/g)].map((m) => Number(m[0])) : null;
};
export const DEFAULT_PART_B = "Which sentence from the passage best supports the answer to Part A?";

/** Two-Part, Grid, Hot Text and Error Correction: read from their own columns, every problem named. */
function readOwnColumns(type: QuestionTypeCode, c: { texts: string[]; gap: number; last: number; answerRaw: string; typeRaw: string; get: (k: ColumnKey) => string }): { fields: Partial<RowQuestion>; errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const opts = (list: string[], correct: number[]): BankOption[] => list.map((text, i) => ({ label: LETTERS[i] ?? String(i + 1), text, correct: correct.includes(i), rationale: null }));
  switch (type) {
    case "TWO_PART": {
      if (c.gap >= 0) errors.push(`Option ${LETTERS[c.gap]} is empty but Option ${LETTERS[c.last]} is filled. Keep the Part A choices in order with no empty choice between them.`);
      if (c.texts.length < 2) errors.push("Two-Part needs at least 2 Part A choices (Option A and Option B).");
      const a = letterIndexes(c.answerRaw);
      if (!c.answerRaw) errors.push("Correct Answer is empty: write the letter of the Part A answer, e.g. B.");
      else if (!a || a.length !== 1) errors.push(`Correct Answer “${c.answerRaw}” must be ONE letter (the Part A answer), e.g. B.`);
      else if (!c.texts[a[0]]) errors.push(`Correct Answer “${LETTERS[a[0]]}” points to Option ${LETTERS[a[0]]}, which is empty.`);
      const bList = pieces(c.get("partBOptions"));
      if (bList.length < 2) errors.push("Two-Part needs at least 2 Part B choices in “Part B Options”, separated by |.");
      if (bList.length > 6) errors.push(`Part B Options has ${bList.length} choices; the limit is 6.`);
      const bRaw = oneLine(c.get("partBAnswer"));
      const b = letterIndexes(bRaw);
      if (!bRaw) errors.push("Part B Answer is empty: write the letter(s) of the Part B answer, e.g. C.");
      else if (!b) errors.push(`Part B Answer “${bRaw}” is not a letter of a Part B choice. Write e.g. C, or B, D.`);
      else for (const i of b) if (!bList[i]) errors.push(`Part B Answer “${LETTERS[i]}” points to a Part B choice that does not exist (there are ${bList.length}).`);
      const partBStem = oneLine(c.get("partB"));
      if (!partBStem) warnings.push(`Part B Question was empty: “${DEFAULT_PART_B}” is used.`);
      const bCorrect = [...new Set(b ?? [])];
      return { errors, warnings, fields: { twoPart: {
        partA: { stem: "", options: opts(c.texts, a ?? []) },
        partB: { stem: partBStem || DEFAULT_PART_B, options: opts(bList, bCorrect), multiple: bCorrect.length > 1 },
      } } };
    }
    case "GRID": {
      const cols = c.texts.filter(Boolean);
      if (c.gap >= 0) errors.push(`Option ${LETTERS[c.gap]} is empty but Option ${LETTERS[c.last]} is filled. Keep the grid columns in order with no empty column between them.`);
      if (cols.length < 2) errors.push("Grid needs at least 2 columns: write them in Option A, Option B…");
      const rows = pieces(c.get("gridRows"));
      if (rows.length < 2) errors.push("Grid needs at least 2 rows in “Grid Rows”, separated by |.");
      const ans = letterIndexes(c.answerRaw);
      if (!c.answerRaw) errors.push("Correct Answer is empty: write one column letter per row, in order, e.g. A, B, A.");
      else if (!ans) errors.push(`Correct Answer “${c.answerRaw}” must be column letters, one per row, e.g. A, B, A.`);
      else {
        if (ans.length !== rows.length) errors.push(`Correct Answer gives ${ans.length} letter${ans.length === 1 ? "" : "s"} but there ${rows.length === 1 ? "is 1 row" : `are ${rows.length} rows`}: write one column letter per row.`);
        for (const i of new Set(ans)) if (!cols[i]) errors.push(`Correct Answer “${LETTERS[i]}” points to Option ${LETTERS[i]}, which is not a column.`);
      }
      return { errors, warnings, fields: { grid: {
        rows: rows.map((text, i) => ({ id: `r${i + 1}`, text })), columns: cols.map((text, i) => ({ id: `c${i + 1}`, text })),
        answer: Object.fromEntries(rows.map((_, i) => [`r${i + 1}`, ans?.[i] !== undefined && cols[ans[i]] ? `c${ans[i] + 1}` : ""]).filter(([, v]) => v)),
      } } };
    }
    case "HOT_TEXT": {
      const raw = c.get("hotText");
      let sents = pieces(raw);
      // one block of text: split it into sentences
      if (sents.length === 1) sents = sents[0].split(/(?<=[.!?]["”’]?)\s+(?=[A-Z“"‘'])/).map(oneLine).filter(Boolean);
      if (sents.length < 2) errors.push("Hot Text needs at least 2 sentences in “Hot Text”, separated by |.");
      if (c.texts.length) warnings.push("Option columns are not used for Hot Text questions and were ignored.");
      const nums = numberList(c.answerRaw);
      if (!c.answerRaw) errors.push("Correct Answer is empty: write the number(s) of the correct sentence(s), e.g. 3 or 2, 4.");
      else if (!nums) errors.push(`Correct Answer “${c.answerRaw}” must be sentence numbers, e.g. 3 or 2, 4.`);
      else {
        for (const n of nums) if (n < 1 || n > sents.length) errors.push(`Correct Answer ${n} is not a sentence number (there are ${sents.length} sentences).`);
        if (sents.length && new Set(nums).size >= sents.length) errors.push("Hot Text needs at least one sentence that is not correct.");
      }
      const correct = [...new Set(nums ?? [])].filter((n) => n >= 1 && n <= sents.length).map((n) => `s${n}`);
      return { errors, warnings, fields: { hotText: { segments: sents.map((text, i) => ({ id: `s${i + 1}`, text })), correct, maxSelect: Math.max(1, correct.length) } } };
    }
    case "ERROR_CORRECTION": {
      const parts = pieces(c.get("parts"));
      if (parts.length < 2) errors.push("Error Correction needs the sentence split into at least 2 parts in “Sentence Parts”, separated by |.");
      if (c.texts.length) warnings.push("Option columns are not used for Error Correction questions and were ignored.");
      const none = /^no\s*error$/i.test(c.answerRaw);
      const nums = none ? [] : numberList(c.answerRaw);
      if (!c.answerRaw) errors.push("Correct Answer is empty: write the number(s) of the part(s) with a mistake (e.g. 2 or 1, 3), or No error.");
      else if (!nums) errors.push(`Correct Answer “${c.answerRaw}” must be part numbers (e.g. 2 or 1, 3) or No error.`);
      else for (const n of nums) if (n < 1 || n > parts.length) errors.push(`Correct Answer ${n} is not a part number (there are ${parts.length} parts).`);
      const idx = [...new Set(nums ?? [])].filter((n) => n >= 1 && n <= parts.length).sort((x, y) => x - y).map((n) => n - 1);
      const corrRaw = c.get("correction").trim();
      let corrections = corrRaw ? (idx.length === 1 ? [corrRaw.replace(/\s+/g, " ")] : pieces(corrRaw)) : [];
      if (idx.length > 1 && corrections.length !== idx.length) errors.push(`Correction gives ${corrections.length} corrected part${corrections.length === 1 ? "" : "s"} for ${idx.length} mistakes: write one per mistake, separated by |.`);
      if (idx.length && !corrRaw) errors.push("Correction is empty: write the wrong part(s) correctly.");
      if (!idx.length) corrections = [];
      return { errors, warnings, fields: { segments: parts, errorIndexes: idx, corrections, noErrorOption: true, typeCorrection: /\btype\b/i.test(c.typeRaw) } };
    }
    case "DICTATION": {
      const word = oneLine(c.get("dictWord")) || c.answerRaw;
      const sentence = oneLine(c.get("dictSentence"));
      if (!word) errors.push("Dictation Word is empty: write the word the platform should say (or put it in Correct Answer).");
      else if (!DICTATION_WORD.test(word) || word.length > 40) errors.push(`Dictation Word “${word}” must be one word (letters only, up to 40).`);
      else if (c.answerRaw && oneLine(c.get("dictWord")) && c.answerRaw.toLowerCase() !== word.toLowerCase()) errors.push(`Correct Answer “${c.answerRaw}” is not the Dictation Word “${word}”. Leave Correct Answer empty or write the same word.`);
      if (sentence && word && !new RegExp(`\\b${word.replace(/[-'’]/g, ".")}\\b`, "i").test(sentence)) errors.push(`Dictation Sentence must use the word “${word}”.`);
      if (c.texts.length) warnings.push("Option columns are not used for Dictation questions and were ignored.");
      return { errors, warnings, fields: { dictation: { word, sentence: sentence || null } } };
    }
    case "SENTENCE_COMBINE": {
      const sents = pieces(c.get("combineSentences"));
      if (sents.length < 2) errors.push("Sentence Combining needs 2 to 4 short sentences in “Sentences to Combine”, separated by |.");
      else if (sents.length > 4) errors.push(`Sentences to Combine has ${sents.length} sentences; the limit is 4.`);
      const accepted = c.answerRaw ? c.answerRaw.split("|").map((x) => oneLine(x)).filter(Boolean) : [];
      if (!accepted.length) errors.push("Correct Answer is empty: write the combined sentence (several accepted answers separated by |).");
      const connector = oneLine(c.get("connector"));
      if (connector) for (const a of accepted) if (!new RegExp(`(^|[^a-z])${connector.toLowerCase().replace(/[-'’ ,]/g, ".")}([^a-z]|$)`).test(a.toLowerCase())) errors.push(`Correct Answer “${a}” does not use the Joining Word “${connector}”.`);
      if (new Set(accepted.map(normalizeCombined)).size !== accepted.length) warnings.push("Correct Answer lists the same sentence twice; the copy was ignored.");
      if (c.texts.length) warnings.push("Option columns are not used for Sentence Combining questions and were ignored.");
      const unique = accepted.filter((a, i) => accepted.findIndex((b) => normalizeCombined(b) === normalizeCombined(a)) === i);
      return { errors, warnings, fields: { combine: { sentences: sents, connector: connector || null, hint: null, accepted: unique } } };
    }
    case "SENTENCE_ORDER": {
      const items = pieces(c.get("orderItems"));
      if (items.length < 3) errors.push("Sentence Order needs at least 3 sentences in “Order Items”, in the correct order, separated by |.");
      if (items.length > 12) errors.push(`Order Items has ${items.length} items; the limit is 12.`);
      if (new Set(items.map((x) => x.toLowerCase())).size !== items.length) errors.push("Order Items lists the same sentence twice: every item must be different.");
      if (c.texts.length) warnings.push("Option columns are not used for Sentence Order questions and were ignored.");
      return { errors, warnings, fields: { sequence: items } };
    }
    default:
      return { errors, warnings, fields: {} };
  }
}

function defaultExplanation(q: RowQuestion): string {
  if (q.type === "TRUE_FALSE") return q.answer === undefined ? "See the correct answer." : `The statement is ${q.answer ? "true" : "false"}.`;
  if (q.type === "SHORT_ANSWER") return q.answers?.[0] ? `Model answer: ${q.answers[0]}` : "See the model answer.";
  if (q.answers) return q.answers[0] ? `The correct answer is “${q.answers[0]}”.` : "See the correct answer.";
  if (q.dictation?.word) return `The word is spelled “${q.dictation.word}”.`;
  if (q.combine?.accepted[0]) return `One good way to join the sentences: “${q.combine.accepted[0]}”`;
  if (q.sequence?.length) return "See the correct order.";
  if (q.twoPart || q.grid || q.hotText || q.segments) return "See the correct answer.";
  const c = q.options?.filter((o) => o.correct).map((o) => `“${o.text}”`) ?? [];
  return c.length ? `The correct answer is ${c.join(" and ")}.` : "See the correct answer.";
}

/** Wrong choices need feedback in the bank; the template has none, so a standard sentence is used. */
export const GENERIC_WRONG_FEEDBACK = "This is not the correct answer. Read the question again and compare the choices.";

// ------------------------------------------------------------ curriculum

export interface SkillRef { id: string; code: string; name: string; grade: number; standards: { id: string; code: string; isPrimary: boolean }[] }
export interface StandardRef { id: string; code: string }
export interface CurriculumIndex {
  /** grade level → skills of that grade in this school */
  grades: Map<number, SkillRef[]>;
  /** standard short code (upper case, e.g. "RL.4.1") → standard */
  standards: Map<string, StandardRef>;
}

/** "CCSS.ELA-LITERACY.RL.4.1" or "rl.4.1" → "RL.4.1" (sub-letters keep their case: "L.4.1.a" → "L.4.1.A" for matching only). */
export const shortStandard = (code: string) => String(code ?? "").trim().replace(/^CCSS\.ELA-LITERACY\./i, "").replace(/^CCSS\./i, "").replace(/\s+/g, "").toUpperCase()
  .replace(/^([A-Z]+\.\d+\.\d+)([A-Z])$/, "$1.$2");   // “L.4.4a” (a common way to write it) = “L.4.4.a”
const normName = (s: string) => String(s ?? "").toLowerCase().replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

export function buildCurriculumIndex(skills: SkillRef[], standards: StandardRef[], gradeLevels: number[]): CurriculumIndex {
  const grades = new Map<number, SkillRef[]>(gradeLevels.map((g) => [g, []]));
  for (const s of skills) grades.get(s.grade)?.push(s);
  return { grades, standards: new Map(standards.map((s) => [shortStandard(s.code), s])) };
}

export interface CurriculumMatch { skill: SkillRef | null; standard: StandardRef | null; errors: string[]; warnings: string[] }

/**
 * Exact matching only. Grade: the school must teach it. Skill: exact code (e.g. G4.reread) or exact
 * name within that grade. Standard: must exist, and must be one of the skill's linked standards.
 */
export function matchCurriculum(idx: CurriculumIndex, grade: number | null, skillRaw: string, standardRaw: string): CurriculumMatch {
  const errors: string[] = [];
  const warnings: string[] = [];
  const skillText = oneLine(skillRaw);
  const stdText = oneLine(standardRaw);
  if (!skillText) errors.push("Skill is empty. Use the exact skill name or code from the Curriculum sheet.");
  if (!stdText) errors.push("Standard is empty. Use the standard code from the Curriculum sheet, e.g. RL.4.1.");
  if (grade === null) return { skill: null, standard: null, errors, warnings };
  const skills = idx.grades.get(grade);
  if (!skills) {
    errors.push(`Grade ${grade} does not exist on the platform. Available grades: ${[...idx.grades.keys()].sort((a, b) => a - b).join(", ") || "none"}.`);
    return { skill: null, standard: null, errors, warnings };
  }
  let skill: SkillRef | null = null;
  if (skillText) {
    const k = normName(skillText);
    const byCode = skills.filter((s) => s.code.toLowerCase() === k || s.code.toLowerCase().replace(/^g\d+\./, "") === k);
    const byName = skills.filter((s) => normName(s.name) === k);
    const hits = byCode.length ? byCode : byName;
    if (hits.length === 1) skill = hits[0];
    else if (hits.length > 1) errors.push(`Skill “${skillText}” matches ${hits.length} skills in Grade ${grade} (${hits.map((h) => h.code).join(", ")}). Write the skill code instead.`);
    else {
      const elsewhere = [...idx.grades.entries()].filter(([g]) => g !== grade).flatMap(([, list]) => list).find((s) => s.code.toLowerCase() === k || normName(s.name) === k);
      errors.push(elsewhere
        ? `Skill “${skillText}” is a Grade ${elsewhere.grade} skill, but this row says Grade ${grade}.`
        : `Skill “${skillText}” was not found in Grade ${grade}. Use the exact skill name or code from the Curriculum sheet of the template.`);
    }
  }
  let standard: StandardRef | null = null;
  if (stdText) {
    standard = idx.standards.get(shortStandard(stdText)) ?? null;
    if (!standard) errors.push(`Standard “${stdText}” does not exist on the platform. Use a standard code from the Curriculum sheet, e.g. RL.4.1.`);
    else if (skill) {
      const linked = skill.standards.map((s) => shortStandard(s.code));
      if (linked.length && !linked.includes(shortStandard(standard.code))) {
        errors.push(`Standard ${shortStandard(standard.code)} is not linked to skill “${skill.name}”. Its standards are: ${skill.standards.map((s) => shortStandard(s.code)).join(", ")}.`);
      } else if (!linked.length) warnings.push(`Skill “${skill.name}” has no standards linked in the curriculum; ${shortStandard(standard.code)} is used as written.`);
    }
  }
  return { skill, standard, errors, warnings };
}

// ------------------------------------------------------------ duplicates

const normText = (s: string) => s.toLowerCase().replace(/[‘’`´]/g, "'").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();

interface Fingerprint { id: string; stem: string; full: string; stemTokens: Set<string>; fullTokens: Set<string>; opts: Set<string> }
const tokens = (s: string) => new Set(s.split(" ").filter(Boolean));
function fingerprint(id: string, stem: string, options: string[]): Fingerprint {
  const s = normText(stem);
  const f = normText([stem, ...options].join(" "));
  return { id, stem: s, full: f, stemTokens: tokens(s), fullTokens: tokens(f), opts: new Set(options.map(normText).filter(Boolean)) };
}
function jaccard(a: Set<string>, b: Set<string>, threshold = SIMILAR_THRESHOLD): number {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size / big.size < threshold) return small.size / big.size; // cannot reach the threshold
  let i = 0;
  for (const w of small) if (big.has(w)) i++;
  return i / (a.size + b.size - i);
}
/** Jaccard of two sets with no early exit (option sets are small). */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let i = 0;
  for (const w of a) if (b.has(w)) i++;
  return i / (a.size + b.size - i);
}

/** Question text and choices this similar (word overlap) = a similar question. */
export const SIMILAR_THRESHOLD = 0.8;
/** The question text alone this similar = the same question asked again (when the choices also overlap, see below). */
export const SAME_STEM_THRESHOLD = 0.9;
/** Same question text but different choices: a duplicate only when this share of the choices is the same. */
export const SAME_OPTIONS_THRESHOLD = 0.5;

/**
 * A duplicate hit. `stemOnly` = the question text matches but the answer choices are different (e.g. the generic
 * “Which word is spelled correctly?” with other words): NOT a duplicate, only worth a note in the preview.
 */
export interface DuplicateHit { id: string; score: number; exact: boolean; stemOnly?: boolean }

/**
 * Inverted index for Jaccard ≥ t. Every token of every item is indexed. A match B of a query A has Jaccard ≥ t, so it
 * shares at least ⌈t·|A|⌉ of A's tokens, so it contains at least one of ANY |A| − ⌈t·|A|⌉ + 1 tokens of A: only the
 * postings of A's rarest tokens are read (exact, no match is missed; common words such as “the” are never scanned).
 */
class TokenIndex {
  private readonly postings = new Map<string, number[]>();
  constructor(private readonly t: number) {}
  add(n: number, set: Set<string>): void {
    for (const w of set) {
      const list = this.postings.get(w);
      if (list) list.push(n); else this.postings.set(w, [n]);
    }
  }
  candidates(set: Set<string>): Set<number> {
    const out = new Set<number>();
    if (!set.size) return out;
    const k = set.size - Math.ceil(this.t * set.size - 1e-9) + 1;
    const rare = [...set].map((w) => this.postings.get(w) ?? []).sort((x, y) => x.length - y.length).slice(0, k);
    for (const list of rare) for (const n of list) out.add(n);
    return out;
  }
}

/**
 * Index of existing questions for duplicate checks. Exact = same question text and same choices
 * (ignoring case, punctuation and spacing). Similar = 80%+ word overlap of text and choices, or
 * 90%+ overlap of the question text alone — but when both questions have answer choices, a text-only
 * match is a duplicate only if at least half of the choices are the same (else a `stemOnly` note).
 * Lookups use inverted indexes, so checking a file of n rows is about linear, not n².
 */
/** Items with the same normalized question text: matched once as a group, their choices looked up by text. */
interface StemGroup { tokens: Set<string>; first: number; noOpts: number[]; byOpt: Map<string, number[]> }

export class DuplicateIndex {
  private readonly items: Fingerprint[] = [];
  private readonly exact = new Map<string, string>();
  private readonly fullIx = new TokenIndex(SIMILAR_THRESHOLD);
  private readonly groups: StemGroup[] = [];
  private readonly groupOf = new Map<string, number>();
  private readonly stemIx = new TokenIndex(SAME_STEM_THRESHOLD);

  add(id: string, stem: string, options: string[]): void {
    const fp = fingerprint(id, stem, options);
    if (!fp.stem) return;
    const n = this.items.push(fp) - 1;
    if (!this.exact.has(fp.full)) this.exact.set(fp.full, id);
    this.fullIx.add(n, fp.fullTokens);
    let g = this.groupOf.get(fp.stem);
    if (g === undefined) {
      g = this.groups.push({ tokens: fp.stemTokens, first: n, noOpts: [], byOpt: new Map() }) - 1;
      this.groupOf.set(fp.stem, g);
      this.stemIx.add(g, fp.stemTokens);
    }
    const group = this.groups[g];
    if (!fp.opts.size) group.noOpts.push(n);
    for (const o of fp.opts) { const l = group.byOpt.get(o); if (l) l.push(n); else group.byOpt.set(o, [n]); }
  }

  find(stem: string, options: string[]): DuplicateHit | null {
    const fp = fingerprint("", stem, options);
    if (!fp.stem) return null;
    const ex = this.exact.get(fp.full);
    if (ex) return { id: ex, score: 1, exact: true };
    let best: DuplicateHit | null = null;
    let weak: DuplicateHit | null = null;
    const strong = (e: Fingerprint, score: number) => { if (!best || score > best.score) best = { id: e.id, score, exact: false }; };
    for (const n of this.fullIx.candidates(fp.fullTokens)) {
      const whole = jaccard(fp.fullTokens, this.items[n].fullTokens);
      if (whole >= SIMILAR_THRESHOLD) strong(this.items[n], whole);
    }
    // the same (or 90% the same) question text: a duplicate when either side has no choices, or when at least half of
    // the choices are the same; with other choices it is another question (“Which word is spelled correctly?”)
    const k = fp.opts.size - Math.ceil(SAME_OPTIONS_THRESHOLD * fp.opts.size - 1e-9) + 1;
    for (const g of this.stemIx.candidates(fp.stemTokens)) {
      const group = this.groups[g];
      const st = jaccard(fp.stemTokens, group.tokens, SAME_STEM_THRESHOLD);
      if (st < SAME_STEM_THRESHOLD) continue;
      if (!fp.opts.size) { strong(this.items[group.first], st); continue; }
      if (group.noOpts.length) strong(this.items[group.noOpts[0]], st);
      // choices that overlap ≥ 50% share one of the k rarest choices of the query (same argument as TokenIndex)
      const lists = [...fp.opts].map((o) => group.byOpt.get(o) ?? []).sort((x, y) => x.length - y.length).slice(0, k);
      let found = false;
      for (const list of lists) for (const n of list) if (overlap(fp.opts, this.items[n].opts) >= SAME_OPTIONS_THRESHOLD) { strong(this.items[n], st); found = true; }
      if (!found && !group.noOpts.length && (!weak || st > weak.score)) weak = { id: this.items[group.first].id, score: st, exact: false, stemOnly: true };
    }
    return best ?? weak;
  }
}
