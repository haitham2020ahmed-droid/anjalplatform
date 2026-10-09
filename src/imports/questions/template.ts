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
import type { BankOption, QuestionTypeCode } from "./validate";
import { needsPassage } from "../../lib/passage-detect";

// ------------------------------------------------------------------ columns

export type ColumnKey =
  | "stem" | "type" | "optA" | "optB" | "optC" | "optD" | "optE" | "optF" | "answer" | "explanation"
  | "grade" | "skill" | "standard" | "level" | "cognitive" | "passage"
  // optional: Placement / MAP test uses (Question Bank import) and the Curriculum Map place (Curriculum import)
  | "use" | "mapCode" | "unit" | "set" | "category" | "mapLevel" | "lexile";

interface ColumnSpec { key: ColumnKey; header: string; required: boolean; aliases: string[]; help: string }

/** The template's columns, in order. Option E and F are optional extras (not in the template). */
export const TEMPLATE_COLUMNS: readonly ColumnSpec[] = [
  { key: "stem", header: "Question Text", required: true, aliases: ["question", "question text", "stem"], help: "The question students read. To add a blank, write ____ (four underscores)." },
  { key: "type", header: "Question Type", required: true, aliases: ["question type", "type"], help: "Multiple Choice, Multi Select, True/False, Dropdown, Fill in the Blank or Short Answer." },
  { key: "optA", header: "Option A", required: true, aliases: ["option a", "choice a"], help: "First answer choice." },
  { key: "optB", header: "Option B", required: true, aliases: ["option b", "choice b"], help: "Second answer choice." },
  { key: "optC", header: "Option C", required: true, aliases: ["option c", "choice c"], help: "Third answer choice (may be empty)." },
  { key: "optD", header: "Option D", required: true, aliases: ["option d", "choice d"], help: "Fourth answer choice (may be empty)." },
  { key: "optE", header: "Option E", required: false, aliases: ["option e", "choice e"], help: "" },
  { key: "optF", header: "Option F", required: false, aliases: ["option f", "choice f"], help: "" },
  { key: "answer", header: "Correct Answer", required: true, aliases: ["correct answer", "answer", "answer key"], help: "The letter of the correct choice (A, B, C or D). Multi Select: letters with commas (A, C). True/False: True or False. Fill in the Blank: the answer; several accepted answers separated by |." },
  { key: "explanation", header: "Explanation", required: true, aliases: ["explanation"], help: "Why the answer is correct (students see it after answering)." },
  { key: "grade", header: "Grade", required: true, aliases: ["grade", "grade level"], help: "The grade number, e.g. 4 (or Grade 4)." },
  { key: "skill", header: "Skill", required: true, aliases: ["skill", "skill name", "skill code"], help: "The exact skill name or code from the Curriculum sheet." },
  { key: "standard", header: "Standard", required: true, aliases: ["standard", "standard code", "ccss"], help: "The standard code from the Curriculum sheet, e.g. RL.4.1." },
  { key: "level", header: "Difficulty Level", required: true, aliases: ["difficulty level", "difficulty", "level"], help: "A number from 1 (very easy) to 7 (advanced); 4 = grade level." },
  { key: "cognitive", header: "Cognitive Level", required: true, aliases: ["cognitive level", "bloom", "bloom's level", "blooms level"], help: "Remember, Understand, Apply, Analyze, Evaluate or Create (may be empty)." },
  { key: "passage", header: "Passage/Text", required: false, aliases: ["passage/text", "passage", "text", "passage text", "reading passage"], help: "Optional: a reading text the question is about. Repeat the same text on each of its questions." },
  { key: "lexile", header: "Lexile", required: false, aliases: ["lexile", "lexile measure", "lexile level", "text lexile"], help: "Optional: the Lexile of the question or its passage, e.g. 820 or 820L. It decides Below / On / Above." },
  { key: "use", header: "Use", required: false, aliases: ["use", "uses", "use for", "placement / map", "placement/map"], help: "Optional: Placement, MAP, or both (e.g. Placement, MAP). Empty = practice only." },
  { key: "unit", header: "Unit", required: false, aliases: ["unit", "unit number"], help: "Curriculum import: the unit number, e.g. 1 or Unit 1." },
  { key: "set", header: "Text Set / Selection", required: false, aliases: ["text set / selection", "text set/selection", "text set", "selection"], help: "Curriculum import: the number (e.g. 2) or the exact title (e.g. Amigo Brothers)." },
  { key: "category", header: "Category", required: false, aliases: ["category", "curriculum category"], help: "Curriculum import: Concept Vocabulary, Analyze Craft and Structure or Respond to Reading." },
  { key: "mapLevel", header: "Map Level", required: false, aliases: ["map level", "category level", "above/on/below", "reading level"], help: "Curriculum import: Above, On or Below (leave empty for Concept Vocabulary)." },
  { key: "mapCode", header: "Curriculum Map ID", required: false, aliases: ["curriculum map id", "map id", "map code", "curriculum map code"], help: "Optional instead of the four columns above, e.g. G4.U1.TS1.ACS.ON." },
];

/** Headers of the template, in order (Option E/F are accepted but not part of the template). */
export const MAP_COLUMNS: readonly ColumnKey[] = ["unit", "set", "category", "mapLevel", "mapCode"];
export const TEMPLATE_HEADERS = TEMPLATE_COLUMNS.filter((c) => c.key !== "optE" && c.key !== "optF" && !MAP_COLUMNS.includes(c.key)).map((c) => c.header);
/** Curriculum import: the place on the Curriculum Map instead of Use; Skill, Standard and Cognitive Level optional. */
export const CURRICULUM_TEMPLATE_HEADERS = TEMPLATE_COLUMNS.filter((c) => c.key !== "optE" && c.key !== "optF" && c.key !== "use" && c.key !== "mapCode").map((c) => c.header);
export type ImportTarget = "BANK" | "CURRICULUM";
/** Columns that must be present for each kind of import. */
function requiredKeys(target: ImportTarget, present: Set<ColumnKey>, placeKnown = false): ColumnKey[] {
  const base = TEMPLATE_COLUMNS.filter((c) => c.required).map((c) => c.key);
  if (target === "BANK") return base;
  // uploaded from one place of the Curriculum Map: the place (and its grade) is already known
  if (placeKnown) return base.filter((k) => !["skill", "standard", "cognitive", "level", "grade"].includes(k));
  const notNeeded: ColumnKey[] = ["skill", "standard", "cognitive", "level"];
  return [...base.filter((k) => !notNeeded.includes(k)), ...(present.has("mapCode") ? [] : (["unit", "set", "category"] as ColumnKey[]))];
}

export const SUPPORTED_TYPES: readonly { name: string; code: QuestionTypeCode }[] = [
  { name: "Multiple Choice", code: "MULTIPLE_CHOICE" },
  { name: "Multi Select", code: "MULTI_SELECT" },
  { name: "True/False", code: "TRUE_FALSE" },
  { name: "Dropdown", code: "DROPDOWN" },
  { name: "Fill in the Blank", code: "FILL_BLANK" },
  { name: "Short Answer", code: "SHORT_ANSWER" },
];

export const COGNITIVE_LEVELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"] as const;

export const MAX_IMPORT_ROWS = 5000;
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
  if (missing.length === required.length) {
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
}

export interface RowResult { question: RowQuestion | null; grade: number | null; errors: string[]; warnings: string[] }

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

  const t = questionTypeFrom(get("type"));
  if (t.error) errors.push(t.error);
  // curriculum rows: an empty Difficulty Level follows the Map Level (Above 5, On 4, Below 3; Concept Vocabulary 4)
  const mapLv = get("mapLevel").trim().toLowerCase().replace(/\s*level$/, "");
  const lv = target === "CURRICULUM" && !get("level").trim() ? { level: LEVEL_FROM_MAP[mapLv] ?? 4 } : difficultyFrom(get("level"));
  if (lv.error) errors.push(lv.error);
  const cg = target === "CURRICULUM" && !get("cognitive").trim() ? { value: null as string | null } : cognitiveFrom(get("cognitive"));
  if ("error" in cg && cg.error) errors.push(cg.error);
  const gr = gradeFrom(get("grade"));
  if (gr.error) errors.push(gr.error);

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
    if (!answerRaw) errors.push("Correct Answer is empty.");
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
        let correct: number[] = [];
        if (answerRaw) {
          const byText = texts.findIndex((v) => v && v.toLowerCase() === answerRaw.toLowerCase());
          const letters = byText >= 0 ? [byText] : letterIndexes(answerRaw);
          if (!letters) errors.push(`Correct Answer “${answerRaw}” is not a letter of a choice. Write the letter, e.g. ${type === "MULTI_SELECT" ? "A, C" : "B"}.`);
          else {
            correct = [...new Set(letters)];
            for (const i of correct) if (!texts[i]) errors.push(`Correct Answer “${LETTERS[i]}” points to Option ${LETTERS[i]}, which is empty.`);
            if (type === "MULTI_SELECT" && correct.length < 2) errors.push("Multi Select needs 2 or more correct answers, e.g. “A, C”. For one correct answer use Multiple Choice.");
            if (type !== "MULTI_SELECT" && correct.length > 1) errors.push(`${type === "DROPDOWN" ? "Dropdown" : "Multiple Choice"} has exactly one correct answer, but “${answerRaw}” gives ${correct.length}. For several correct answers use Multi Select.`);
          }
        }
        q = { ...base, options: texts.map((text, i) => ({ label: LETTERS[i], text, correct: correct.includes(i), rationale: null })) };
        break;
      }
      case "TRUE_FALSE": {
        const a = answerRaw.toLowerCase();
        const value = /^(true|t|yes)$/.test(a) ? true : /^(false|f|no)$/.test(a) ? false : undefined;
        if (answerRaw && value === undefined) errors.push(`Correct Answer for True/False must be True or False (found “${answerRaw}”).`);
        if (texts.some((v) => v && !/^(true|false)$/i.test(v))) warnings.push("Option columns are not used for True/False questions and were ignored.");
        q = { ...base, answer: value };
        break;
      }
      case "FILL_BLANK": {
        const answers = answerRaw.split("|").map((x) => x.trim()).filter(Boolean);
        if (texts.length) warnings.push("Option columns are not used for Fill in the Blank questions and were ignored. Put every accepted answer in Correct Answer, separated by |.");
        if (!/_{2,}/.test(stem)) warnings.push("The question has no blank. Mark the blank with ____ (four underscores).");
        q = { ...base, answers };
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
  if (q && !q.explanationGiven) {
    warnings.push("Explanation is empty: students will see “The correct answer is …”. Add an explanation before approving.");
    q.explanation = defaultExplanation(q);
  }
  if (q && q.explanation.length > 1000) errors.push(`Explanation is too long (${q.explanation.length} characters; the limit is 1,000).`);
  return { question: q, grade: gr.grade ?? null, errors, warnings };
}

function defaultExplanation(q: RowQuestion): string {
  if (q.type === "TRUE_FALSE") return q.answer === undefined ? "See the correct answer." : `The statement is ${q.answer ? "true" : "false"}.`;
  if (q.type === "SHORT_ANSWER") return q.answers?.[0] ? `Model answer: ${q.answers[0]}` : "See the model answer.";
  if (q.answers) return q.answers[0] ? `The correct answer is “${q.answers[0]}”.` : "See the correct answer.";
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

interface Fingerprint { id: string; stem: string; full: string; stemTokens: Set<string>; fullTokens: Set<string> }
const tokens = (s: string) => new Set(s.split(" ").filter(Boolean));
function fingerprint(id: string, stem: string, options: string[]): Fingerprint {
  const s = normText(stem);
  const f = normText([stem, ...options].join(" "));
  return { id, stem: s, full: f, stemTokens: tokens(s), fullTokens: tokens(f) };
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size / big.size < SIMILAR_THRESHOLD) return small.size / big.size; // cannot reach the threshold
  let i = 0;
  for (const w of small) if (big.has(w)) i++;
  return i / (a.size + b.size - i);
}

/** Question text and choices this similar (word overlap) = a similar question. */
export const SIMILAR_THRESHOLD = 0.8;
/** The question text alone this similar = the same question asked again. */
export const SAME_STEM_THRESHOLD = 0.9;

export interface DuplicateHit { id: string; score: number; exact: boolean }

/**
 * Index of existing questions for duplicate checks. Exact = same question text and same choices
 * (ignoring case, punctuation and spacing). Similar = 80%+ word overlap of text and choices, or
 * 90%+ overlap of the question text alone.
 */
export class DuplicateIndex {
  private readonly items: Fingerprint[] = [];
  private readonly exact = new Map<string, string>();
  private readonly stems = new Map<string, string>();

  add(id: string, stem: string, options: string[]): void {
    const fp = fingerprint(id, stem, options);
    if (!fp.stem) return;
    this.items.push(fp);
    if (!this.exact.has(fp.full)) this.exact.set(fp.full, id);
    if (!this.stems.has(fp.stem)) this.stems.set(fp.stem, id);
  }

  find(stem: string, options: string[]): DuplicateHit | null {
    const fp = fingerprint("", stem, options);
    if (!fp.stem) return null;
    const ex = this.exact.get(fp.full);
    if (ex) return { id: ex, score: 1, exact: true };
    let best: DuplicateHit | null = null;
    const sameStem = this.stems.get(fp.stem);
    if (sameStem) best = { id: sameStem, score: SAME_STEM_THRESHOLD, exact: false };
    for (const e of this.items) {
      const whole = jaccard(fp.fullTokens, e.fullTokens);
      const stemOnly = whole >= SIMILAR_THRESHOLD ? 0 : jaccard(fp.stemTokens, e.stemTokens);
      const score = whole >= SIMILAR_THRESHOLD ? whole : stemOnly >= SAME_STEM_THRESHOLD ? stemOnly : 0;
      if (score && (!best || score > best.score)) best = { id: e.id, score, exact: false };
    }
    return best;
  }
}
