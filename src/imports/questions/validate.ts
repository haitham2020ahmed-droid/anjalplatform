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
] as const;
export type QuestionTypeCode = (typeof QUESTION_TYPES)[number];

export interface BankOption {
  label: string;
  text: string;
  correct: boolean;
  rationale: string | null;
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
      const n = it.options?.filter((o) => o.correct).length ?? 0;
      if (n !== 1) bad(`must have exactly one correct option (has ${n})`);
      break;
    }
    case "MULTI_SELECT": {
      const n = it.options?.filter((o) => o.correct).length ?? 0;
      if (n < 2) bad("multi-select needs 2+ correct options");
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
    case "ERROR_CORRECTION":
      if (!it.segments || it.errorIndex === undefined || it.errorIndex < 0 || it.errorIndex >= it.segments.length) bad("invalid error index");
      if (!it.correction) bad("missing correction");
      break;
    case "MATCHING":
      if ((it.pairs?.length ?? 0) < 3) bad("matching needs 3+ pairs");
      break;
  }
  if (it.options) {
    const texts = it.options.map((o) => o.text.trim());
    if (new Set(texts).size !== texts.length) bad("duplicate options");
    if (it.options.some((o) => !o.correct && !o.rationale)) bad("every distractor needs a rationale (feedback for wrong answers)");
  }
  return out;
}

/** Type-specific payload stored in Question.content (answers live in options / QuestionAnswer). */
export function contentPayload(it: BankItem): Record<string, unknown> {
  switch (it.type) {
    case "SENTENCE_ORDER":
    case "WORD_ORDER":
      return { elements: it.sequence }; // stored in correct order; UI shuffles
    case "ERROR_CORRECTION":
      return { segments: it.segments };
    case "MATCHING":
      return { left: it.pairs!.map((p) => p.left), right: it.pairs!.map((p) => p.right) };
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
    case "ERROR_CORRECTION":
      return [{ errorIndex: it.errorIndex, correction: it.correction }];
    case "MATCHING":
      return [it.pairs];
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
      return response === it.errorIndex ? 1 : 0;
    case "MATCHING": {
      const map = (response ?? {}) as Record<string, string>;
      const right = it.pairs!.filter((p) => map[p.left] === p.right).length;
      return right / it.pairs!.length;
    }
    default:
      return 0; // SHORT_ANSWER is teacher-scored
  }
}
