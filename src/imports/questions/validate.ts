import { MISCONCEPTION_BY_CODE } from "../../insights/misconceptions";

/**
 * Validates and normalizes question-bank records before import.
 * Pure (no DB): used by prisma/seed/questions.ts now and by the admin bulk-import
 * pipeline (CSV/XLSX) later, so both paths enforce the same rules.
 */

export const QUESTION_TYPES = [
  "MULTIPLE_CHOICE",
  "MULTI_SELECT",
  "TRUE_FALSE",
  "DROPDOWN",
  "FILL_BLANK",
  "SENTENCE_ORDER",
  "WORD_ORDER",
  "ERROR_CORRECTION",
  "MATCHING",
  "SHORT_ANSWER",
  // evidence-based and technology-enhanced types (Part A / Part B, table match, select-the-sentence)
  "TWO_PART",
  "GRID",
  "HOT_TEXT",
  // word study: the player speaks a word (browser speech), the student types its spelling
  "DICTATION",
  // writing: join 2–4 short sentences into one (typed; any accepted answer, normalized)
  "SENTENCE_COMBINE",
] as const;
export type QuestionTypeCode = (typeof QUESTION_TYPES)[number];

export interface BankOption {
  label: string;
  text: string;
  correct: boolean;
  rationale: string | null;
  /** why a student picks this wrong option (src/insights/misconceptions.ts) */
  misconception?: string | null;
}
export interface BankItem {
  ref: string;
  grade: number;
  family: string;
  skillKey: string;
  standard: string;
  level: number;
  type: QuestionTypeCode;
  stem: string;
  passage: string | null;
  subskill: string | null;
  explanation: { whyCorrect: string; tip: string };
  estimatedSeconds: number;
  irt: { a: number; b: number; c: number };
  options?: BankOption[];
  answer?: boolean;
  answers?: string[];
  sequence?: string[];
  segments?: string[];
  errorIndex?: number;
  correction?: string;
  pairs?: { left: string; right: string }[];
  /**
   * ERROR_CORRECTION (optional, newer items): several errors (`errorIndexes` + one `corrections` entry each; an entry
   * may list accepted variants separated by “|”), a “No error” choice (`noErrorOption`; then `errorIndexes` may be
   * empty), a “type the correction” step (`typeCorrection`) and the kind of mistake (`errorKind`, a misconception code).
   * Older items keep `errorIndex` + `correction` and work exactly as before.
   */
  errorIndexes?: number[];
  corrections?: string[];
  noErrorOption?: boolean;
  typeCorrection?: boolean;
  errorKind?: string | null;
  /** TWO_PART: Part A (the answer) and Part B (the evidence: usually sentences from the passage). */
  twoPart?: TwoPart;
  /** GRID: one choice (column) per row. */
  grid?: Grid;
  /** HOT_TEXT: the student selects sentence(s) of an excerpt. */
  hotText?: HotText;
  /** DICTATION: the word the player says (and an optional sentence that uses it); the student types the word. */
  dictation?: Dictation;
  /** SENTENCE_COMBINE: the short sentences to join (and the joining word to use); the student types one sentence. */
  combine?: Combine;
}
export interface Combine {
  sentences: string[];
  /** the joining word the student must use (and, but, because, who…); optional */
  connector?: string | null;
  /** a hint shown before answering (optional) */
  hint?: string | null;
  /** the accepted combined sentences (the first is the model answer) */
  accepted: string[];
}
export interface Dictation {
  word: string;
  sentence?: string | null;
}
/** A dictation word: letters, with an inner apostrophe or hyphen (no spaces). */
export const DICTATION_WORD = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/;
/** Typed spelling vs the word: exact, ignoring case and outer spaces (curly apostrophes count as straight). */
export const sameSpelling = (typed: unknown, word: string) => typeof typed === "string" && typed.trim().replace(/’/g, "'").toLowerCase() === word.trim().replace(/’/g, "'").toLowerCase();
export interface TwoPart {
  partA: { stem: string; options: BankOption[] };
  partB: { stem: string; options: BankOption[]; multiple?: boolean };
}
export interface Grid {
  rows: { id: string; text: string }[];
  columns: { id: string; text: string }[];
  /** row id → column id */
  answer: Record<string, string>;
}
export interface HotText {
  segments: { id: string; text: string }[];
  correct: string[];
  /** how many sentences the student may select (at least the number of correct ones) */
  maxSelect: number;
}

/** The errors of an ERROR_CORRECTION item, old (errorIndex/correction) or new (errorIndexes/corrections) form. */
export function errorKey(it: Pick<BankItem, "errorIndex" | "errorIndexes" | "correction" | "corrections">): { indexes: number[]; corrections: string[] } {
  if (Array.isArray(it.errorIndexes)) return { indexes: it.errorIndexes, corrections: it.corrections ?? [] };
  return { indexes: it.errorIndex === undefined || it.errorIndex === null || it.errorIndex < 0 ? [] : [it.errorIndex], corrections: it.correction ? [it.correction] : it.corrections ?? [] };
}

/** An ERROR_CORRECTION item that behaves exactly like the original type (one error, tap only): its answer is a number. */
export function isClassicErrorItem(it: Pick<BankItem, "errorIndex" | "errorIndexes" | "correction" | "corrections" | "noErrorOption" | "typeCorrection">): boolean {
  return !it.noErrorOption && !it.typeCorrection && errorKey(it).indexes.length === 1;
}
export interface BankPassage {
  id: string;
  grade: number;
  title: string;
  genre: string;
  text: string;
}

export interface ValidationIssue {
  ref: string;
  message: string;
}

/** Validate one item against the type rules and the known skills/standards. */
export function validateItem(it: BankItem, ctx: { skillKeys: ReadonlySet<string>; standards: ReadonlySet<string>; passages: ReadonlySet<string> }): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const bad = (message: string) => out.push({ ref: it.ref, message });
  if (!QUESTION_TYPES.includes(it.type)) bad(`unknown type ${it.type}`);
  if (!ctx.skillKeys.has(it.skillKey)) bad(`unknown skill ${it.skillKey}`);
  if (!ctx.standards.has(it.standard)) bad(`unknown standard ${it.standard}`);
  if (!(it.level >= 1 && it.level <= 7)) bad(`level ${it.level} out of range 1-7`);
  if (it.passage && !ctx.passages.has(it.passage)) bad(`unknown passage ${it.passage}`);
  if (!it.stem.trim()) bad("empty stem");
  if (!it.explanation?.whyCorrect?.trim()) bad("missing explanation");
  switch (it.type) {
    case "MULTIPLE_CHOICE":
    case "DROPDOWN": {
      if ((it.options?.length ?? 0) < 2) bad("needs at least 2 options");
      const n = it.options?.filter((o) => o.correct).length ?? 0;
      if (n !== 1) bad(`must have exactly one correct option (has ${n})`);
      break;
    }
    case "MULTI_SELECT": {
      const n = it.options?.filter((o) => o.correct).length ?? 0;
      if (n < 2) bad("multi-select needs 2+ correct options");
      if ((it.options?.length ?? 0) > 0 && n === it.options!.length) bad("multi-select needs at least one wrong option");
      break;
    }
    case "TRUE_FALSE":
      if (typeof it.answer !== "boolean") bad("true/false needs a boolean answer");
      break;
    case "FILL_BLANK":
      if (!it.answers?.length) bad("fill-in needs accepted answers");
      break;
    case "SENTENCE_ORDER":
    case "WORD_ORDER":
      if ((it.sequence?.length ?? 0) < 3) bad("ordering needs 3+ elements");
      break;
    case "ERROR_CORRECTION": {
      const { indexes, corrections } = errorKey(it);
      const n = it.segments?.length ?? 0;
      if (!it.segments || indexes.some((i) => !Number.isInteger(i) || i < 0 || i >= n) || (!indexes.length && !it.noErrorOption)) bad(indexes.length || it.noErrorOption ? "invalid error index" : it.errorIndexes ? "error correction needs at least one error part (or the “No error” choice)" : "invalid error index");
      if (it.segments?.some((x) => !String(x ?? "").trim())) bad("error correction: a sentence part is empty");
      if (new Set(indexes).size !== indexes.length) bad("error correction: the same part is listed twice as an error");
      if (indexes.length === 1 && !corrections[0]?.trim()) bad("missing correction");
      else if (indexes.length > 1 && (corrections.length !== indexes.length || corrections.some((c) => !String(c ?? "").trim()))) bad(`every error needs its correction (${indexes.length} errors, ${corrections.filter((c) => String(c ?? "").trim()).length} corrections)`);
      if (it.errorKind && !MISCONCEPTION_BY_CODE.has(it.errorKind)) bad(`unknown error kind ${it.errorKind}`);
      break;
    }
    case "MATCHING":
      if ((it.pairs?.length ?? 0) < 3) bad("matching needs 3+ pairs");
      break;
    case "TWO_PART": {
      const tp = it.twoPart;
      if (!tp?.partA || !tp?.partB) { bad("two-part needs Part A and Part B"); break; }
      for (const [name, p, multi] of [["Part A", tp.partA, false], ["Part B", tp.partB, Boolean(tp.partB.multiple)]] as const) {
        if (!String(p.stem ?? "").trim()) bad(`${name}: the question is empty`);
        const opts = p.options ?? [];
        if (opts.length < 2) bad(`${name}: needs at least 2 options`);
        const k = opts.filter((o) => o.correct).length;
        if (multi) {
          if (k < 2) bad(`${name}: “choose more than one” needs 2+ correct options (has ${k})`);
          if (opts.length && k === opts.length) bad(`${name}: needs at least one wrong option`);
        } else if (k !== 1) bad(`${name}: must have exactly one correct option (has ${k})`);
        const labels = opts.map((o) => String(o.label ?? "").trim());
        if (labels.some((l) => !l) || new Set(labels).size !== labels.length) bad(`${name}: every option needs its own label`);
        const texts = opts.map((o) => String(o.text ?? "").trim());
        if (texts.some((t) => !t)) bad(`${name}: an option is empty`);
        else if (new Set(texts).size !== texts.length) bad(`${name}: duplicate options`);
      }
      if (it.options?.length) bad("two-part keeps its choices in Part A and Part B");
      break;
    }
    case "GRID": {
      const g = it.grid;
      if (!g) { bad("grid needs rows, columns and an answer"); break; }
      const rows = g.rows ?? [], cols = g.columns ?? [];
      if (rows.length < 2) bad("grid needs at least 2 rows");
      if (cols.length < 2) bad("grid needs at least 2 columns");
      for (const [what, list] of [["row", rows], ["column", cols]] as const) {
        const ids = list.map((x) => String(x.id ?? "").trim());
        if (ids.some((x) => !x) || new Set(ids).size !== ids.length) bad(`grid: every ${what} needs its own id`);
        const texts = list.map((x) => String(x.text ?? "").trim().toLowerCase());
        if (texts.some((x) => !x)) bad(`grid: a ${what} is empty`);
        else if (new Set(texts).size !== texts.length) bad(`grid: two ${what}s are the same`);
      }
      const colIds = new Set(cols.map((c) => c.id));
      const ans = g.answer ?? {};
      for (const r of rows) {
        const c = ans[r.id];
        if (!c) bad(`grid: row “${r.text}” has no answer`);
        else if (!colIds.has(c)) bad(`grid: the answer of row “${r.text}” is not a column (${c})`);
      }
      for (const k of Object.keys(ans)) if (!rows.some((r) => r.id === k)) bad(`grid: the answer names an unknown row (${k})`);
      break;
    }
    case "HOT_TEXT": {
      const h = it.hotText;
      if (!h) { bad("hot text needs sentences and the correct one(s)"); break; }
      const segs = h.segments ?? [];
      if (segs.length < 2) bad("hot text needs at least 2 sentences to choose from");
      const ids = segs.map((x) => String(x.id ?? "").trim());
      if (ids.some((x) => !x) || new Set(ids).size !== ids.length) bad("hot text: every sentence needs its own id");
      if (segs.some((x) => !String(x.text ?? "").trim())) bad("hot text: a sentence is empty");
      const correct = h.correct ?? [];
      if (!correct.length) bad("hot text needs at least one correct sentence");
      if (correct.some((c) => !ids.includes(c))) bad("hot text: a correct sentence is not in the excerpt");
      if (new Set(correct).size !== correct.length) bad("hot text: a correct sentence is listed twice");
      if (segs.length && correct.length >= segs.length) bad("hot text needs at least one sentence that is not correct");
      const max = h.maxSelect ?? correct.length;
      if (!Number.isInteger(max) || max < correct.length || max > segs.length) bad(`hot text: maxSelect must be a whole number from ${correct.length} to ${segs.length}`);
      break;
    }
    case "DICTATION": {
      const d = it.dictation;
      const word = String(d?.word ?? "").trim();
      if (!word) { bad("dictation needs the word to say"); break; }
      if (word.length > 40 || !DICTATION_WORD.test(word)) bad(`dictation: “${word}” must be one word (letters only, up to 40)`);
      const sentence = String(d?.sentence ?? "").trim();
      if (sentence.length > 300) bad("dictation: the sentence must be 300 characters or fewer");
      if (sentence && !new RegExp(`\\b${word.replace(/[-'’]/g, ".")}\\b`, "i").test(sentence)) bad(`dictation: the sentence must use the word “${word}”`);
      if (it.options?.length) bad("dictation has no answer choices");
      break;
    }
    case "SENTENCE_COMBINE": {
      const c = it.combine;
      if (!c) { bad("sentence combining needs the sentences and the accepted answers"); break; }
      const sents = (c.sentences ?? []).map((x) => String(x ?? "").trim());
      if (sents.length < 2 || sents.length > 4) bad("sentence combining needs 2 to 4 sentences to join");
      if (sents.some((x) => !x)) bad("sentence combining: a sentence is empty");
      if (sents.some((x) => x.length > 300)) bad("sentence combining: each sentence must be 300 characters or fewer");
      const acc = (c.accepted ?? []).map((x) => String(x ?? "").trim());
      if (!acc.length || acc.some((x) => !x)) bad("sentence combining needs at least one accepted answer (and no empty one)");
      if (acc.some((x) => x.length > 400)) bad("sentence combining: each accepted answer must be 400 characters or fewer");
      if (new Set(acc.map(normalizeCombined)).size !== acc.length) bad("sentence combining: the same accepted answer is listed twice");
      const conn = String(c.connector ?? "").trim();
      if (conn && (conn.length > 30 || !/^[A-Za-z][A-Za-z ,'’-]*$/.test(conn))) bad(`sentence combining: the joining word “${conn}” must be a word or two (letters only)`);
      if (conn) for (const a of acc) if (!new RegExp(`(^|[^a-z])${conn.toLowerCase().replace(/[-'’ ,]/g, ".")}([^a-z]|$)`).test(a.toLowerCase())) bad(`sentence combining: the accepted answer “${a}” does not use the joining word “${conn}”`);
      if (acc.some((a) => sents.some((x) => normalizeCombined(x) === normalizeCombined(a)))) bad("sentence combining: an accepted answer is one of the sentences to join");
      if (String(c.hint ?? "").length > 300) bad("sentence combining: the hint must be 300 characters or fewer");
      if (it.options?.length) bad("sentence combining has no answer choices");
      break;
    }
  }
  if (it.options) {
    const texts = it.options.map((o) => o.text.trim());
    if (new Set(texts).size !== texts.length) bad("duplicate options");
    if (it.options.some((o) => !o.correct && !o.rationale)) bad("every distractor needs a rationale (feedback for wrong answers)");
  }
  return out;
}

/** The same `ref` twice in one batch (the second would be skipped silently as “already seeded”). */
export function duplicateRefs(items: readonly Pick<BankItem, "ref">[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const it of items) {
    if (seen.has(it.ref)) out.push({ ref: it.ref, message: "duplicate ref in this batch" });
    seen.add(it.ref);
  }
  return out;
}

/** Type-specific payload stored in Question.content (answers live in options / QuestionAnswer). */
export function contentPayload(it: BankItem): Record<string, unknown> {
  switch (it.type) {
    case "SENTENCE_ORDER":
    case "WORD_ORDER":
      return { elements: it.sequence }; // stored in correct order; UI shuffles
    case "ERROR_CORRECTION": {
      if (isClassicErrorItem(it)) return { segments: it.segments };
      return { segments: it.segments, ...(it.noErrorOption ? { noErrorOption: true } : {}), ...(it.typeCorrection ? { typeCorrection: true } : {}), ...(errorKey(it).indexes.length > 1 ? { multiple: true } : {}) };
    }
    case "MATCHING":
      return { left: it.pairs!.map((p) => p.left), right: it.pairs!.map((p) => p.right) };
    // the browser-safe part only: the key lives in QuestionAnswer (answerValues)
    case "TWO_PART": {
      const safe = (o: BankOption) => ({ label: o.label, text: o.text });
      return { partA: { stem: it.twoPart!.partA.stem, options: it.twoPart!.partA.options.map(safe) }, partB: { stem: it.twoPart!.partB.stem, options: it.twoPart!.partB.options.map(safe), multiple: Boolean(it.twoPart!.partB.multiple) } };
    }
    case "GRID":
      return { rows: it.grid!.rows, columns: it.grid!.columns };
    case "HOT_TEXT":
      return { segments: it.hotText!.segments, maxSelect: it.hotText!.maxSelect ?? it.hotText!.correct.length };
    // the sentence only: the word (the key) lives in QuestionAnswer
    case "DICTATION":
      return it.dictation!.sentence?.trim() ? { sentence: it.dictation!.sentence.trim() } : {};
    // the sentences, the joining word and the hint only: the accepted answers (the key) live in QuestionAnswer
    case "SENTENCE_COMBINE": {
      const c = it.combine!;
      return { sentences: c.sentences.map((x) => x.trim()), ...(c.connector?.trim() ? { connector: c.connector.trim() } : {}), ...(c.hint?.trim() ? { hint: c.hint.trim() } : {}) };
    }
    default:
      return {};
  }
}

/**
 * The reverse of contentPayload + answerValues: the type-specific fields of a stored question (Question.content and
 * its primary QuestionAnswer value). Used by practice (items.ts) and the question editor.
 */
export function storedParts(type: string, content: Record<string, unknown> | null | undefined, primary: unknown): Partial<BankItem> {
  const c = (content ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const v = (primary ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (type) {
    case "ERROR_CORRECTION": {
      const out: Partial<BankItem> = { segments: (c.segments as string[]) ?? [] };
      if (typeof v.errorIndex === "number" && v.errorIndex >= 0) out.errorIndex = v.errorIndex;
      if (typeof v.correction === "string" && v.correction) out.correction = v.correction;
      if (Array.isArray(v.errorIndexes)) { out.errorIndexes = v.errorIndexes.map(Number); out.corrections = Array.isArray(v.corrections) ? v.corrections.map(String) : []; }
      if (c.noErrorOption) out.noErrorOption = true;
      if (c.typeCorrection) out.typeCorrection = true;
      if (v.errorKind) out.errorKind = String(v.errorKind);
      return out;
    }
    case "TWO_PART": {
      const part = (p: Record<string, any> | undefined, key: BankOption[] | undefined) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        stem: String(p?.stem ?? ""),
        options: (Array.isArray(key) ? key : (p?.options ?? []).map((o: BankOption) => ({ ...o, correct: false, rationale: null }))).map((o: BankOption) => ({ label: String(o.label), text: String(o.text), correct: Boolean(o.correct), rationale: o.rationale ? String(o.rationale) : null, ...(o.misconception ? { misconception: String(o.misconception) } : {}) })),
      });
      return { twoPart: { partA: part(c.partA, v.partA), partB: { ...part(c.partB, v.partB), multiple: Boolean(c.partB?.multiple) } } };
    }
    case "GRID":
      return { grid: { rows: c.rows ?? [], columns: c.columns ?? [], answer: (primary && typeof primary === "object" && !Array.isArray(primary) ? primary : {}) as Record<string, string> } };
    case "HOT_TEXT": {
      const correct = Array.isArray(primary) ? (primary as unknown[]).map(String) : [];
      return { hotText: { segments: c.segments ?? [], correct, maxSelect: Number(c.maxSelect ?? correct.length) || correct.length } };
    }
    case "DICTATION":
      return { dictation: { word: typeof primary === "string" ? primary : String(v.word ?? ""), sentence: c.sentence ? String(c.sentence) : null } };
    case "SENTENCE_COMBINE":
      return { combine: { sentences: Array.isArray(c.sentences) ? c.sentences.map(String) : [], connector: c.connector ? String(c.connector) : null, hint: c.hint ? String(c.hint) : null, accepted: Array.isArray(v.accepted) ? v.accepted.map(String) : Array.isArray(primary) ? (primary as unknown[]).map(String) : [] } };
    default:
      return {};
  }
}

/** Accepted answers for non-option types (QuestionAnswer rows). */
export function answerValues(it: BankItem): unknown[] {
  switch (it.type) {
    case "TRUE_FALSE":
      return [it.answer];
    case "FILL_BLANK":
      return it.answers!;
    case "SENTENCE_ORDER":
    case "WORD_ORDER":
      return [it.sequence];
    case "ERROR_CORRECTION": {
      const { indexes, corrections } = errorKey(it);
      const kind = it.errorKind ? { errorKind: it.errorKind } : {};
      // older single-error items keep exactly the stored shape they always had
      if (isClassicErrorItem(it)) return [{ errorIndex: indexes[0], correction: corrections[0] ?? it.correction, ...kind }];
      return [{ errorIndex: indexes[0] ?? -1, correction: corrections[0] ?? "", errorIndexes: indexes, corrections, ...kind }];
    }
    case "MATCHING":
      return [it.pairs];
    case "TWO_PART": {
      const key = (o: BankOption) => ({ label: o.label, text: o.text, correct: Boolean(o.correct), rationale: o.rationale ?? null, ...(o.misconception ? { misconception: o.misconception } : {}) });
      return [{ partA: it.twoPart!.partA.options.map(key), partB: it.twoPart!.partB.options.map(key) }];
    }
    case "GRID":
      return [it.grid!.answer];
    case "HOT_TEXT":
      return [it.hotText!.correct];
    case "DICTATION":
      return [it.dictation!.word.trim()];
    case "SENTENCE_COMBINE":
      return [{ accepted: it.combine!.accepted.map((x) => x.trim()) }];
    default:
      return [];
  }
}

/** Scores a student response for any auto-scored type. Returns credit 0..1. */
export function scoreResponse(it: BankItem, response: unknown): number {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  switch (it.type) {
    case "MULTIPLE_CHOICE":
    case "DROPDOWN":
      return it.options!.find((o) => o.label === response)?.correct ? 1 : 0;
    case "MULTI_SELECT": {
      const chosen = new Set(Array.isArray(response) ? (response as string[]) : []);
      const correct = it.options!.filter((o) => o.correct).map((o) => o.label);
      const wrongChosen = it.options!.filter((o) => !o.correct && chosen.has(o.label)).length;
      const hits = correct.filter((l) => chosen.has(l)).length;
      // partial credit, but any wrong choice removes it: guessing everything earns 0
      return wrongChosen > 0 ? 0 : hits / correct.length;
    }
    case "TRUE_FALSE":
      return response === it.answer ? 1 : 0;
    case "FILL_BLANK":
      return typeof response === "string" && it.answers!.some((a) => norm(a) === norm(response)) ? 1 : 0;
    case "SENTENCE_ORDER":
    case "WORD_ORDER":
      return Array.isArray(response) && JSON.stringify(response) === JSON.stringify(it.sequence) ? 1 : 0;
    case "ERROR_CORRECTION":
      return scoreErrorCorrection(it, response);
    case "MATCHING": {
      const map = (response ?? {}) as Record<string, string>;
      const right = it.pairs!.filter((p) => map[p.left] === p.right).length;
      return right / it.pairs!.length;
    }
    case "TWO_PART": {
      // each part is scored on its own: half of the credit each
      const p = twoPartScores(it, response);
      return round((p.a + p.b) / 2);
    }
    case "GRID": {
      const map = (response && typeof response === "object" && !Array.isArray(response) ? response : {}) as Record<string, unknown>;
      const rows = it.grid!.rows;
      return round(rows.filter((r) => map[r.id] === it.grid!.answer[r.id]).length / rows.length);
    }
    case "HOT_TEXT": {
      const chosen = new Set(Array.isArray(response) ? (response as unknown[]).map(String) : []);
      const correct = it.hotText!.correct;
      const hits = correct.filter((id) => chosen.has(id)).length;
      const wrong = [...chosen].filter((id) => !correct.includes(id)).length;
      // partial credit for several sentences; every wrong sentence takes back one right one
      return round(Math.max(0, (hits - wrong) / correct.length));
    }
    case "DICTATION":
      return sameSpelling(response, it.dictation!.word) ? 1 : 0;
    case "SENTENCE_COMBINE":
      return combinedMatches(response, it.combine!.accepted) ? 1 : 0;
    default:
      return 0; // SHORT_ANSWER is teacher-scored
  }
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** TWO_PART: the credit (0..1) of each part, scored independently. */
export function twoPartScores(it: BankItem, response: unknown): { a: number; b: number } {
  const r = (response && typeof response === "object" && !Array.isArray(response) ? response : {}) as { a?: unknown; b?: unknown };
  const tp = it.twoPart!;
  const a = tp.partA.options.find((o) => o.label === r.a)?.correct ? 1 : 0;
  const chosen = new Set((Array.isArray(r.b) ? r.b : r.b === undefined || r.b === null ? [] : [r.b]).map(String));
  const correct = tp.partB.options.filter((o) => o.correct).map((o) => o.label);
  const wrong = tp.partB.options.filter((o) => !o.correct && chosen.has(o.label)).length;
  const hits = correct.filter((l) => chosen.has(l)).length;
  const b = tp.partB.multiple ? (wrong > 0 ? 0 : hits / correct.length) : wrong === 0 && hits === 1 && chosen.size === 1 ? 1 : 0;
  return { a, b };
}

/** An ERROR_CORRECTION answer in one shape: the parts tapped, “No error”, and the typed fixes (by part index). */
export function readErrorResponse(response: unknown): { picks: number[]; none: boolean; fixes: Record<number, string> } {
  if (typeof response === "number") return { picks: [response], none: false, fixes: {} };
  if (response === "NONE") return { picks: [], none: true, fixes: {} };
  if (Array.isArray(response)) return { picks: response.filter((x) => typeof x === "number"), none: false, fixes: {} };
  if (response && typeof response === "object") {
    const r = response as { picks?: unknown; none?: unknown; fixes?: unknown };
    const fixes: Record<number, string> = {};
    for (const [k, v] of Object.entries((r.fixes && typeof r.fixes === "object" ? r.fixes : {}) as Record<string, unknown>)) if (typeof v === "string") fixes[Number(k)] = v;
    return { picks: Array.isArray(r.picks) ? r.picks.filter((x): x is number => typeof x === "number") : [], none: r.none === true, fixes };
  }
  return { picks: [], none: false, fixes: {} };
}

const canon = (s: string) => s.normalize("NFKC").replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, " ").trim();
const punctOf = (s: string) => canon(s).replace(/[\p{L}\p{N}\s]+/gu, "");
const noPunct = (s: string) => canon(s).replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();

/** The words the correction changes (common words at the start and end removed): “fed the sheeps” → “fed the sheep” gives “sheep”. */
function changedPart(original: string, fixed: string): string {
  const a = canon(original).split(" "), b = canon(fixed).split(" ");
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return b.slice(i, b.length - j).join(" ");
}

/**
 * Is the typed fix one of the accepted corrections? Case, spacing and punctuation are ignored, EXCEPT when the
 * mistake itself is about capitals or punctuation (then they must be right). The changed word(s) alone are accepted too.
 */
export function fixMatches(typed: string, accepted: string, original: string): boolean {
  const t = canon(String(typed ?? ""));
  if (!t) return false;
  return accepted.split("|").map((x) => x.trim()).filter(Boolean).some((alt) => {
    // punctuation counts when the fix changes it; capitals count when the fix changes them
    const punctMatters = punctOf(original) !== punctOf(alt);
    const caseMatters = noPunct(original) !== noPunct(alt) && noPunct(original).toLowerCase() === noPunct(alt).toLowerCase();
    const n = (x: string) => { const y = punctMatters ? canon(x) : noPunct(x); return caseMatters ? y : y.toLowerCase(); };
    const part = changedPart(original, alt);
    return n(t) === n(alt) || (part !== "" && n(t) === n(part));
  });
}

/**
 * ERROR_CORRECTION: each error is worth an equal share. A tapped error earns its share; with the “type the
 * correction” step (and stored corrections) the tap earns half of it and the right fix the other half. Every
 * tapped part that has no error takes one share back. “No error” is right only when there is none.
 */
export function scoreErrorCorrection(it: BankItem, response: unknown): number {
  const { indexes, corrections } = errorKey(it);
  const r = readErrorResponse(response);
  if (!indexes.length) return r.none && !r.picks.length ? 1 : 0;
  if (r.none) return 0;
  const share = 1 / indexes.length;
  const graded = Boolean(it.typeCorrection) && corrections.length === indexes.length && corrections.every((c) => String(c ?? "").trim());
  let credit = 0;
  for (const p of new Set(r.picks)) {
    const k = indexes.indexOf(p);
    if (k < 0) credit -= share;
    else credit += graded ? share * (fixMatches(r.fixes[p] ?? "", corrections[k], it.segments?.[p] ?? "") ? 1 : 0.5) : share;
  }
  return round(Math.max(0, Math.min(1, credit)));
}

// ------------------------------------------------------------------ SENTENCE_COMBINE

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "cannot"], [/\bwon't\b/g, "will not"], [/\bshan't\b/g, "shall not"], [/\bain't\b/g, "is not"],
  [/n't\b/g, " not"], [/'re\b/g, " are"], [/'m\b/g, " am"], [/'ll\b/g, " will"], [/'ve\b/g, " have"], [/'d\b/g, " would"],
  [/\b(it|that|there|here|what|who|he|she|where|how)'s\b/g, "$1 is"], [/\blet's\b/g, "let us"],
];

/**
 * A combined sentence in one comparable form: case, spaces, curly quotes, spaces around punctuation and contractions
 * (“didn't” = “did not”, “can't” = “cannot” = “can not”) do not matter; the end mark (. ! ?) is optional.
 * Commas DO matter (a compound sentence needs its comma before the joining word).
 */
export function normalizeCombined(text: unknown): string {
  let t = String(text ?? "").normalize("NFKC").replace(/[\u2018\u2019\u02BC`]/g, "'").replace(/[\u201C\u201D]/g, '"').toLowerCase();
  for (const [re, to] of CONTRACTIONS) t = t.replace(re, to);
  t = t.replace(/\bcan not\b/g, "cannot");
  t = t.replace(/\s+([,.;:!?])/g, "$1").replace(/([,;:])(?=\S)/g, "$1 ").replace(/\s+/g, " ").trim();
  return t.replace(/[.!?]+$/, "").trim();
}

/** Is the typed sentence one of the accepted combined sentences (after normalizeCombined)? */
export function combinedMatches(typed: unknown, accepted: readonly string[]): boolean {
  if (typeof typed !== "string" || !typed.trim()) return false;
  const t = normalizeCombined(typed);
  return accepted.some((a) => normalizeCombined(a) === t);
}

/**
 * Guidance for a wrong combined sentence (never the answer itself): the joining word is missing, an important word
 * from the short sentences is missing, or the comma before and / but / or / so is missing.
 */
export function combineGuidance(c: Combine, typed: unknown): string | null {
  if (typeof typed !== "string" || !typed.trim()) return null;
  if (combinedMatches(typed, c.accepted)) return null;
  const t = normalizeCombined(typed);
  const conn = String(c.connector ?? "").trim().toLowerCase();
  if (conn && !new RegExp(`(^|[^a-z])${conn.replace(/[-' ,]/g, ".")}([^a-z]|$)`).test(t)) return `Use the joining word “${c.connector!.trim()}” to join the sentences.`;
  const words = (x: string) => normalizeCombined(x).replace(/[^a-z0-9' ]+/g, " ").split(" ").filter((w) => w.length > 3);
  const have = new Set(words(typed));
  const model = new Set(words(c.accepted[0] ?? ""));
  const missing = [...model].filter((w) => !have.has(w));
  if (missing.length) return "Keep the important words from every short sentence. Check that no idea is missing.";
  if (/^(and|but|or|so)$/.test(conn) && !new RegExp(`, ${conn}\\b`).test(t) && normalizeCombined(c.accepted[0] ?? "").includes(`, ${conn}`)) return `Put a comma before “${conn}” when it joins two complete sentences.`;
  return "Check the order of the words and the punctuation: the new sentence should read smoothly.";
}
