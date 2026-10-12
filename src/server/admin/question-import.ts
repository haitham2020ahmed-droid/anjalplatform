/**
 * Question-bank importer (admins and teachers), integrated with the existing question bank.
 *
 *   upload (CSV / Excel, official template)
 *     → check the file and its header row (missing columns are named)
 *     → read every row (type, choices, correct answer, difficulty, cognitive level, passage)
 *     → match Grade, Skill and Standard EXACTLY to the platform's curriculum (never created, never guessed)
 *     → validate with the bank validator → duplicate check (bank and file)
 *     → ImportJob (kind QUESTIONS) + one ImportedQuestionLog per row                    [preview]
 *   preview: edit any question, select which to import, Skip / Import anyway for duplicates
 *   commit (in chunks of 100, for a progress bar): questions, choices, answers, explanations and
 *   audit rows are written with batch inserts in one transaction per chunk. Origin IMPORTED, status
 *   DRAFT (or PUBLISHED when an admin approves on import).
 *
 * Files that cannot be imported at all (wrong type, missing columns, no rows) are recorded as a
 * FAILED job with the reasons, so the import history shows failed attempts too. No AI is used.
 */
import { createHash, randomBytes } from "node:crypto";
import { saveQuestionImage } from "./question-images";
import { LEVEL_TO_B } from "../../config/engine";
import { ExtractError, extract, type FileKind } from "../../imports/questions/extract";
import {
  DuplicateIndex, GENERIC_WRONG_FEEDBACK, MAX_IMPORT_ROWS, buildCurriculumIndex, matchCurriculum, parseTemplateTable, readRow, shortStandard,
  type CurriculumIndex, type RowQuestion, type SkillRef,
  type ImportTarget, type CurriculumMatch,
} from "../../imports/questions/template";
import { answerValues, contentPayload, type BankItem } from "../../imports/questions/validate";
import { analyzeText, platformReadingLevelFor } from "../../reading/prl";
import { audit } from "../audit";
import { assertCan, can, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { buildBankItem, type EditorInput } from "./questions";
import { schoolOf } from "./users";
import { gradeFromRow, pickSkill } from "../../imports/questions/autofill";
import { log } from "../monitoring/log";
import { BOOT_ID, CRASH_MESSAGE, beginStep, endStep, leftByDeadProcess, type GuardState } from "../jobs/crash-guard";
import { areaByKey, areaFromName, areaFromText, defaultStandard, parseCcss } from "../map/nwea-area";
import { backfillContentHashes, hashOfItem } from "../questions/dedupe-hash";
import { schoolSkillIndex } from "../questions/skill-questions";

export type ImportDecision = "IMPORT" | "SKIP" | "REPLACE" | "FORCE";
export type RowStatus = "VALID" | "INVALID" | "DUPLICATE" | "IMPORTED" | "REPLACED" | "SKIPPED" | "FAILED";

/** What the preview shows for one row (stored as ImportedQuestionLog.detected). */
export interface DetectedRow {
  input: EditorInput | null;
  meta: {
    /** row number in the spreadsheet (header = row 1) */
    row: number;
    grade: number | null; gradeText: string; skillText: string; standardText: string; levelText: string; cognitiveText: string;
    skillName: string | null; standardCode: string | null;
    /** Curriculum import: the place on the map (readable path); any import: Placement / MAP test uses */
    mapPath?: string | null; uses?: string[];
    passage: string | null;
    /** words of the passage (the browser gets only the passage's start, Update 42A) */
    passageWords?: number;
    duplicateExact: boolean;
  };
}

/** A file that could not be imported at all. `details` lists every reason; the job is kept as FAILED. */
export class ImportFileError extends ValidationError {
  constructor(message: string, readonly details: string[], readonly jobId: string | null) {
    super(message);
  }
}

const COMMIT_CHUNK = 100;
/** Preview rows are checked and saved this many at a time (Update 42A: bounded memory). */
export const ANALYZE_CHUNK = 200;
const LOG_BATCH = 500;
const OPEN: RowStatus[] = ["VALID", "INVALID", "DUPLICATE"];

const parseJ = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));
const newId = () => "c" + Date.now().toString(36) + randomBytes(8).toString("hex");

// --------------------------------------------------------------- curriculum

/** The school's grades, skills (with linked standards) and all standards: a handful of queries. */
export async function loadCurriculumIndex(repo: Repo, actor: Actor, opts: { includeUnclassified?: boolean } = {}): Promise<CurriculumIndex> {
  // inactive grades and skills are hidden: they cannot receive new questions
  const grades = (await repo.findMany("Grade", { schoolId: schoolOf(actor) })).filter((g) => g.isActive !== false);
  const curricula = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }) : [];
  const skills = curricula.length ? (await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) } })).filter((s) => !s.deletedAt && (s.isActive !== false || (opts.includeUnclassified && String(s.code).endsWith(".curriculum-map-unclassified")))) : [];
  const links = skills.length ? await repo.findMany("SkillStandard", { skillId: { in: skills.map((s) => s.id) } }) : [];
  const standards = (await repo.findMany("Standard", {})).filter((s) => s.isActive !== false);
  const stdById = new Map(standards.map((s) => [String(s.id), s]));
  const levelOf = new Map(curricula.map((c) => [String(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level)]));
  const refs: SkillRef[] = skills.map((s) => ({
    id: String(s.id), code: String(s.code), name: String(s.name), grade: levelOf.get(String(s.curriculumId)) ?? 0,
    standards: links.filter((l) => l.skillId === s.id && stdById.has(String(l.standardId))).map((l) => ({ id: String(l.standardId), code: String(stdById.get(String(l.standardId))!.code), isPrimary: Boolean(l.isPrimary) })),
  }));
  return buildCurriculumIndex(refs, standards.map((s) => ({ id: String(s.id), code: String(s.code) })), grades.map((g) => Number(g.level)));
}

const skillById = (idx: CurriculumIndex, id: string) => [...idx.grades.values()].flat().find((s) => s.id === id) ?? null;

/** Editor input for a row (skill and standard may be missing when the row has errors). */
function toInput(q: RowQuestion, skillId: string, standardCode: string | null, jobId: string | null): EditorInput {
  return {
    skillId, type: q.type, stem: q.stem, level: q.level, standardCode, whyCorrect: q.explanation, tip: null, cognitiveLevel: q.cognitiveLevel,
    options: q.options?.map((o) => ({ ...o, rationale: o.correct ? null : o.rationale ?? GENERIC_WRONG_FEEDBACK })),
    answer: q.answer, answers: q.answers, imported: true, batch: jobId,
    // the newer types and error correction (read from their own columns)
    ...(q.twoPart ? { twoPart: q.twoPart } : {}), ...(q.grid ? { grid: q.grid } : {}), ...(q.hotText ? { hotText: q.hotText } : {}), ...(q.dictation ? { dictation: q.dictation } : {}),
    ...(q.segments ? { segments: q.segments, errorIndexes: q.errorIndexes, corrections: q.corrections, noErrorOption: q.noErrorOption, typeCorrection: q.typeCorrection } : {}),
    ...(q.combine ? { combine: q.combine } : {}), ...(q.sequence ? { sequence: q.sequence } : {}),
  };
}

const OPTION_TYPES = new Set(["MULTIPLE_CHOICE", "DROPDOWN", "MULTI_SELECT"]);

/** True when the question has a correct answer (a marked choice, a True/False value or an accepted answer). */
export function hasAnswerKey(input: Pick<EditorInput, "type" | "options" | "answer" | "answers">): boolean {
  if (OPTION_TYPES.has(input.type)) return Boolean(input.options?.some((o) => o.correct));
  if (input.type === "TRUE_FALSE") return typeof input.answer === "boolean";
  if (input.type === "FILL_BLANK") return Boolean(input.answers?.some((a) => String(a ?? "").trim()));
  return true; // other types carry their key in their own fields (checked by the bank validator)
}

/** The question waits for the platform's AI to choose its correct answer (no key was given). */
export const waitsForAnswer = (input: EditorInput) => Boolean(input.aiNeeds?.includes("answer")) && !hasAnswerKey(input);

/**
 * A question that waits for its answer is checked against every OTHER bank rule with a stand-in key (the first
 * choice(s), True, “answer”). The stand-in is used only for this check: it is never saved, and the question is saved
 * with NO correct answer, as a draft (publishing refuses it until the answer is set).
 */
function withStandInKey(input: EditorInput): EditorInput {
  if (!waitsForAnswer(input)) return input;
  if (OPTION_TYPES.has(input.type)) {
    const n = input.type === "MULTI_SELECT" ? 2 : 1;
    return { ...input, options: input.options?.map((o, i) => ({ ...o, correct: i < n, rationale: i < n ? null : o.rationale ?? GENERIC_WRONG_FEEDBACK })) };
  }
  if (input.type === "TRUE_FALSE") return { ...input, answer: true };
  if (input.type === "FILL_BLANK") return { ...input, answers: ["answer"] };
  return input;
}

/** The bank item to SAVE for a question that waits for its answer: no choice correct, no answer rows. */
function withoutKey(item: BankItem, input: EditorInput): BankItem {
  if (!waitsForAnswer(input)) return item;
  return { ...item, options: item.options?.map((o) => ({ ...o, correct: false, rationale: o.rationale ?? GENERIC_WRONG_FEEDBACK })), answer: undefined, answers: item.type === "FILL_BLANK" ? [] : item.answers };
}

/** Rules of the importer on top of the bank validator (choices of option questions). */
function optionRules(input: EditorInput): string[] {
  if (!OPTION_TYPES.has(input.type)) return [];
  const opts = input.options ?? [];
  const name = input.type === "MULTI_SELECT" ? "Multi Select" : input.type === "DROPDOWN" ? "Dropdown" : "Multiple Choice";
  const out: string[] = [];
  if (opts.filter((o) => String(o.text ?? "").trim()).length < 2) out.push(`${name} needs at least 2 answer choices.`);
  if (input.type === "MULTI_SELECT" && hasAnswerKey(input) && !opts.some((o) => !o.correct)) out.push("Multi Select needs at least one wrong answer choice: not every choice can be correct.");
  return out;
}

/**
 * Checks an editor input against the curriculum and the bank rules without any database access.
 * Returns every problem (empty = valid). A question with no correct answer is valid ONLY while it waits for the
 * AI to choose it (aiNeeds “answer”); it is then saved as a draft without a key.
 */
export function checkInput(idx: CurriculumIndex, inputIn: EditorInput, opts: { allowNoStandard?: boolean; allowUnlinkedStandard?: boolean } = {}): string[] {
  const rules = optionRules(inputIn);
  if (rules.length) return rules;
  const input = withStandInKey(inputIn);
  const skill = input.skillId ? skillById(idx, input.skillId) : null;
  if (!skill) return ["Choose a skill that exists on the platform."];
  const errors: string[] = [];
  const std = input.standardCode ? idx.standards.get(shortStandard(input.standardCode)) ?? null : null;
  if (!input.standardCode && opts.allowNoStandard) {
    try { buildBankItem(input, { ref: "preview", grade: skill.grade, skillCode: skill.code, standardCode: null, passageRef: null, allowNoStandard: true }); return []; }
    catch (e) { if (e instanceof ValidationError) return friendlyBankErrors(e.message); throw e; }
  }
  if (!input.standardCode) errors.push("Choose the standard this question assesses.");
  else if (!std) errors.push(`Standard “${input.standardCode}” does not exist on the platform.`);
  else if (!opts.allowUnlinkedStandard && skill.standards.length && !skill.standards.some((s) => shortStandard(s.code) === shortStandard(std.code))) {
    errors.push(`Standard ${shortStandard(std.code)} is not linked to skill “${skill.name}”. Its standards are: ${skill.standards.map((s) => shortStandard(s.code)).join(", ")}.`);
  }
  if (errors.length) return errors;
  try {
    buildBankItem(input, { ref: "preview", grade: skill.grade, skillCode: skill.code, standardCode: std!.code, passageRef: null });
    return [];
  } catch (e) {
    if (e instanceof ValidationError) return friendlyBankErrors(e.message);
    throw e;
  }
}

const BANK_MESSAGES: [RegExp, string][] = [
  [/must have exactly one correct option \(has 0\)/, "No correct answer is marked."],
  [/must have exactly one correct option/, "Exactly one choice must be correct."],
  [/multi-select needs 2\+ correct options/, "Multi Select needs 2 or more correct answers."],
  [/true\/false needs a boolean answer/, "Correct Answer must be True or False."],
  [/fill-in needs accepted answers/, "Correct Answer is empty: write the accepted answer(s)."],
  [/duplicate options/, "Two answer choices are the same."],
  [/^needs at least 2 options/, "Add at least 2 answer choices."],
  [/multi-select needs at least one wrong option/, "Multi Select needs at least one wrong answer choice: not every choice can be correct."],
  [/level .* out of range/, "Difficulty Level must be from 1 to 7."],
];
function friendlyBankErrors(message: string): string[] {
  return [...new Set(message.split(/;\s+/).map((m) => BANK_MESSAGES.find(([re]) => re.test(m))?.[1] ?? (m.charAt(0).toUpperCase() + m.slice(1))))];
}

// ------------------------------------------------------------- duplicates

/** A passage's fingerprint (“” when there is none): the same question text about another passage is another question. */
export const passageKey = (text: unknown) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 600);

/**
 * Duplicate lookup that respects passages: a question WITH a passage is compared only with questions about the
 * same passage (“What is the main idea?” about two texts = two questions); a question WITHOUT a passage cannot be
 * about another text, so it is compared with every question (as before).
 */
export class PassageDuplicates {
  private byPassage = new Map<string, DuplicateIndex>();
  private all = new DuplicateIndex();
  add(id: string, stem: string, options: string[], passage: string): void {
    let ix = this.byPassage.get(passage);
    if (!ix) { ix = new DuplicateIndex(); this.byPassage.set(passage, ix); }
    ix.add(id, stem, options);
    this.all.add(id, stem, options);
  }
  find(stem: string, options: string[], passage: string) {
    return passage ? this.byPassage.get(passage)?.find(stem, options) ?? null : this.all.find(stem, options);
  }
}

/** Fingerprints are looked up this many at a time (indexed column, Update 👯). */
const HASH_LOOKUP = 500;

/** The answers stored for an imported item (the same list writeBatch writes). */
function storedAnswers(item: BankItem, input: EditorInput): unknown[] {
  const out: unknown[] = answerValues(item).filter((x) => x !== undefined && x !== null);
  if (input.type === "SHORT_ANSWER" && input.answers?.[0]) out.push(input.answers[0]);
  return out;
}

/**
 * 👯 The content fingerprint of an import row as it will be saved (dedupe-hash.ts), or null when the row is not a
 * valid question yet. No database access.
 */
export function importHash(input: EditorInput | null | undefined, passage: string | null, imageId: string | null): string | null {
  if (!input?.stem) return null;
  try {
    const item = withoutKey(buildBankItem(withStandInKey(input), { ref: "hash", grade: 0, skillCode: "hash", standardCode: null, passageRef: null, allowNoStandard: true }), input);
    return hashOfItem(item, passage || null, imageId, storedAnswers(item, input));
  } catch {
    return null;
  }
}

export interface BankHit { id: string; skillId: string }

/**
 * 👯 The bank questions with these fingerprints (one indexed lookup per HASH_LOOKUP fingerprints, a few columns):
 * the duplicate check of the importer. Replaces the old check that read the bank into memory. Archived and deleted
 * questions do not count. Questions saved before fingerprints existed get theirs first (once, in batches).
 */
export async function bankHashHits(repo: Repo, hashes: (string | null)[]): Promise<Map<string, BankHit[]>> {
  const want = [...new Set(hashes.filter((h): h is string => Boolean(h)))];
  const out = new Map<string, BankHit[]>();
  if (!want.length) return out;
  await backfillContentHashes(repo);
  for (let i = 0; i < want.length; i += HASH_LOOKUP) {
    const rows = await repo.findMany("Question", { contentHash: { in: want.slice(i, i + HASH_LOOKUP) } }, { select: ["id", "skillId", "contentHash", "status", "deletedAt"] });
    for (const r of rows) {
      if (r.deletedAt || r.status === "ARCHIVED") continue;
      const k = String(r.contentHash);
      const l = out.get(k) ?? [];
      l.push({ id: String(r.id), skillId: String(r.skillId) });
      out.set(k, l);
    }
  }
  for (const l of out.values()) l.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/** The first bank question with this fingerprint in the same skill family (the same skill in any grade). */
function sameFamily(hits: BankHit[] | undefined, skillId: string | null | undefined, keyOf: Map<string, string>): BankHit | null {
  if (!hits?.length || !skillId) return null;
  const fam = keyOf.get(skillId) ?? `solo:${skillId}`;
  return hits.find((h) => (keyOf.get(h.skillId) ?? `solo:${h.skillId}`) === fam) ?? null;
}

const optionTexts = (i: EditorInput | null | undefined) => i?.options?.map((o) => o.text) ?? [];

// ------------------------------------------------------------------- analyze

export interface AnalyzeInput {
  fileName: string; bytes: Uint8Array; /** BANK (default) or CURRICULUM */ target?: ImportTarget;
  /** uploaded from one place of the Curriculum Map: rows without a place go there (and get its grade) */
  defaultMapCode?: string;
  /** an already-read table in the template's columns (e.g. the 🔤 Grammar bank, converted on the server) */
  table?: string[][];
}

async function recordFailure(repo: Repo, actor: Actor, fileName: string, bytes: Uint8Array, kind: string | null, stage: string, errors: string[], now: Date): Promise<string | null> {
  try {
    const job = await repo.create("ImportJob", {
      kind: "QUESTIONS", status: "FAILED", fileName, uploadedById: actor.userId, totalRows: 0, validRows: 0, errorRows: 0, duplicateRows: 0,
      fileSha256: createHash("sha256").update(bytes).digest("hex"), errors: errors.map((message) => ({ message })), options: { kind, stage }, createdAt: now, completedAt: now,
    });
    await audit(repo, { actorId: actor.userId, action: "question.import.failed", entityType: "ImportJob", entityId: String(job.id), after: { fileName, stage, errors: errors.slice(0, 20) }, at: now });
    return String(job.id);
  } catch {
    return null; // recording the failure must never hide the real problem
  }
}

/** The message for a file with more questions than one upload may have (Update 42A). */
export const tooManyRowsMessage = (n: number) =>
  `The file has ${n.toLocaleString("en")} questions; the limit is ${MAX_IMPORT_ROWS.toLocaleString("en")} per file. Split the file into smaller files of up to ${MAX_IMPORT_ROWS.toLocaleString("en")} questions each and upload them one after another.`;

/**
 * Reads and checks the file and stores the preview. Throws ImportFileError (with every reason, and
 * the id of the FAILED job kept in the history) when the file cannot be imported at all.
 */
export async function analyzeImport(repo: Repo, actor: Actor, input: AnalyzeInput, now = new Date()): Promise<string> {
  assertCan(actor, "questions:edit");
  const fileName = input.fileName.replace(/[\\/]/g, "_").slice(0, 200) || "upload";
  const sha = createHash("sha256").update(input.bytes).digest("hex");
  const fail = async (kind: string | null, stage: string, message: string, details: string[]) => {
    throw new ImportFileError(message, details, await recordFailure(repo, actor, fileName, input.bytes, kind, stage, details, now));
  };

  let kind: FileKind;
  let table: string[][];
  let images: Map<number, Uint8Array> | undefined;
  try {
    if (input.table) { kind = "xlsx"; table = input.table; }
    else ({ kind, table, images } = extract(fileName, input.bytes));
  } catch (e) {
    const msg = e instanceof ExtractError ? e.message : `The file could not be read: ${(e as Error).message}`;
    return fail(null, "read", msg, [msg]);
  }
  const target: ImportTarget = input.target === "CURRICULUM" ? "CURRICULUM" : "BANK";
  const parsed = parseTemplateTable(table, target, { placeKnown: target === "CURRICULUM" && Boolean(input.defaultMapCode) });
  if (!parsed.ok) return fail(kind, "columns", parsed.errors.length === 1 ? parsed.errors[0] : "The file does not match the template.", parsed.errors);
  // Curriculum template: rows of places with no question written are skipped (the template pre-fills them)
  const QUESTION_CELLS = ["stem", "type", "optA", "optB", "optC", "optD", "answer", "explanation", "passage"] as const;
  const rowsIn = target === "CURRICULUM" ? parsed.rows.filter((r) => QUESTION_CELLS.some((k) => (r.cells[k] ?? "").trim())) : parsed.rows;
  const emptyPlaces = parsed.rows.length - rowsIn.length;
  if (target === "CURRICULUM" && input.defaultMapCode) {
    const code = input.defaultMapCode.trim().toUpperCase();
    for (const r of rowsIn) {
      const c = r.cells as Record<string, string | undefined>;
      if (!(c.mapCode ?? "").trim() && !(c.unit ?? "").trim() && !(c.set ?? "").trim() && !(c.category ?? "").trim()) c.mapCode = code;
      if (!(c.grade ?? "").trim()) c.grade = code.match(/^G(\d+)\./)?.[1] ?? "";
    }
  }
  if (!rowsIn.length) return fail(kind, "rows", "The file has the header row but no questions.", ["The file has the header row but no questions. Add one question per row under the header."]);
  if (rowsIn.length > MAX_IMPORT_ROWS) {
    const msg = tooManyRowsMessage(rowsIn.length);
    return fail(kind, "rows", msg, [msg]);
  }

  // curriculum import: the map's places, and each grade's Unclassified skill for rows without a skill
  const mapNodes = target === "CURRICULUM" ? await attachmentNodes(repo, schoolOf(actor)) : [];
  if (target === "CURRICULUM" && !mapNodes.length) return fail(kind, "curriculum", "The Curriculum Map has not been created yet.", ["The Curriculum Map has not been created yet. Run: npx tsx scripts/curriculum-map.ts seed"]);
  const unclassified = new Map<number, string>();
  for (const g of [...new Set(mapNodes.map((n) => n.grade))]) unclassified.set(g, await unclassifiedSkillId(repo, schoolOf(actor), g));
  const idx = await loadCurriculumIndex(repo, actor, { includeUnclassified: true });
  const bands = await lexileBands(repo, schoolOf(actor));
  if (!idx.grades.size) return fail(kind, "curriculum", "No grades are set up for this school yet.", ["No grades are set up for this school yet. Load the curriculum before importing questions."]);

  // empty Grade cells: the standard's grade, else the skill's, else the grade most rows of the file give
  const gradeVotes = new Map<number, number>();
  for (const r of rowsIn) { const g = Number(String(r.cells.grade ?? "").match(/\d+/)?.[0] ?? gradeFromRow(idx, r.cells) ?? 0); if (idx.grades.has(g)) gradeVotes.set(g, (gradeVotes.get(g) ?? 0) + 1); }
  const fileGrade = [...gradeVotes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const unclassifiedOf = async (g: number) => { if (!unclassified.has(g)) { try { unclassified.set(g, await unclassifiedSkillId(repo, schoolOf(actor), g)); } catch { return undefined; } } return unclassified.get(g); };

  // read and match every row (no database work per row, except a grade's Unclassified skill once)
  const read: { r: (typeof rowsIn)[number]; rr: ReturnType<typeof readRow>; cm: CurriculumMatch; place: ReturnType<typeof resolveMapLocation> | null; uses: ReturnType<typeof usesFrom>; fill: { warnings: string[]; aiNeeds: string[] } }[] = [];
  for (const r of rowsIn) {
    const rr = readRow(r.cells, target);
    // ✨ empty or unknown Grade / Skill / Standard: completed by rules here, by the AI after the import
    const fill = target === "BANK" ? await completeRow(idx, r.cells, rr, fileGrade, unclassifiedOf) : { warnings: [] as string[], aiNeeds: [] as string[] };
    const place = target === "CURRICULUM" ? resolveMapLocation(mapNodes, rr.grade, { code: r.cells.mapCode, unit: r.cells.unit, set: r.cells.set, category: r.cells.category, level: r.cells.mapLevel }) : null;
    const uses = usesFrom(r.cells.use ?? "");
    let cm: CurriculumMatch;
    if (target === "CURRICULUM" && !(r.cells.skill ?? "").trim()) {
      // no platform skill: the grade's Unclassified skill (the question is still on the map and in the bank)
      const sid = rr.grade ? unclassified.get(rr.grade) : undefined;
      const sk = sid ? skillById(idx, sid) : null;
      // the file's standard is kept when it is a real CCSS code (e.g. L.4.4.a), even without a skill
      const stdCell = (r.cells.standard ?? "").trim();
      const fileStd = stdCell ? idx.standards.get(shortStandard(stdCell)) ?? null : null;
      cm = { skill: sk, standard: fileStd, errors: sk ? [] : rr.grade ? [`Grade ${rr.grade} has no Curriculum Map.`] : [], warnings: stdCell && !fileStd ? [`Standard “${stdCell}” is not a CCSS code: saved without a standard.`] : [] };
    } else {
      cm = matchCurriculum(idx, rr.grade, r.cells.skill ?? "", r.cells.standard ?? "");
      if (target === "CURRICULUM" && place?.node) {
        // On the Curriculum Map the PLACE decides where the question goes: a skill name the platform does not
        // know, or a standard not linked to the skill, is a warning here, never a reason to lose the question.
        const fileStd = idx.standards.get(shortStandard(r.cells.standard ?? "")) ?? null;
        const notFound = cm.errors.some((e) => /was not found in Grade/.test(e));
        const notLinked = cm.errors.filter((e) => /is not linked to skill/.test(e));
        if (notFound) {
          const sid = unclassified.get(place.node.grade);
          const sk = sid ? skillById(idx, sid) : null;
          if (sk) cm = { skill: sk, standard: fileStd, errors: cm.errors.filter((e) => !/was not found in Grade|is not linked to skill|does not exist on the platform/.test(e)), warnings: [...cm.warnings, `Skill “${(r.cells.skill ?? "").trim()}” is not a platform skill: the question is placed by its Curriculum Map place.`] };
        } else if (notLinked.length) {
          cm = { ...cm, standard: fileStd ?? cm.standard, errors: cm.errors.filter((e) => !/is not linked to skill/.test(e)), warnings: [...cm.warnings, ...notLinked.map((e) => `${e} The file's standard is kept, and the question stays a draft until someone reviews it.`)] };
        }
        if (cm.errors.some((e) => /does not exist on the platform/.test(e))) cm = { ...cm, standard: null, errors: cm.errors.filter((e) => !/does not exist on the platform/.test(e)), warnings: [...cm.warnings, `Standard “${(r.cells.standard ?? "").trim()}” is not a CCSS code: saved without a standard.`] };
      }
      if (target === "CURRICULUM" && !(r.cells.standard ?? "").trim()) {
        // standard optional here: the skill's primary standard when it has one
        cm.errors = cm.errors.filter((e) => !e.startsWith("Standard is empty"));
        const primary = cm.skill?.standards.find((x) => x.isPrimary) ?? cm.skill?.standards[0];
        cm.standard = primary ? { id: primary.id, code: primary.code } : null;
      }
    }
    if (target === "BANK") {
      // the bank import never loses a question over its standard: a standard the platform does not have, or one
      // not linked to the skill, becomes a warning (the MAP classification checks it after the import)
      const notLinked = cm.errors.filter((e) => /is not linked to skill/.test(e));
      const missingStd = cm.errors.filter((e) => /^Standard “.*” does not exist on the platform|^Standard is empty/.test(e));
      if (notLinked.length || missingStd.length) {
        const primary = cm.skill?.standards.find((x) => x.isPrimary) ?? cm.skill?.standards[0];
        cm = { ...cm, standard: missingStd.length ? (primary ? { id: primary.id, code: primary.code } : null) : cm.standard, errors: cm.errors.filter((e) => !notLinked.includes(e) && !missingStd.includes(e)), warnings: [...cm.warnings, ...notLinked.map((e) => `${e} The file's standard is kept, and the question stays a draft until someone reviews it.`), ...missingStd.map((e) => `${e.replace(/ Use .*$/, "")} ${primary ? `The skill's standard ${shortStandard(primary.code)} is used.` : "Saved without a standard for now."}`)] };
      }
    }
    read.push({ r, rr, cm, place, uses, fill });
  }
  const gradesInFile = new Set(read.map((x) => x.cm.skill?.grade).filter((g): g is number => g !== undefined));
  // 👯 the bank's duplicates: the fingerprint of every row, looked up in the indexed column (never the bank in memory)
  const keyOf = (await schoolSkillIndex(repo, schoolOf(actor))).keyOf;
  const hashOfRow = (x: (typeof read)[number], imageId: string | null) => importHash(x.rr.question ? toInput(x.rr.question, x.cm.skill?.id ?? "", x.cm.standard ? String(x.cm.standard.code) : null, "hash") : null, x.rr.question?.passage ?? null, imageId);
  const existing = await bankHashHits(repo, read.map((x) => hashOfRow(x, null)));
  const inFile = new PassageDuplicates();
  const rowOfStem = new Map<string, number>();

  // the job first (VALIDATING), then its rows in chunks of ANALYZE_CHUNK: memory stays bounded and a server that stops
  // half-way leaves a job the history marks as failed (never one that is checked again at every start)
  let jobId: string;
  try {
    jobId = String((await repo.create("ImportJob", {
      kind: "QUESTIONS", status: "VALIDATING", fileName, uploadedById: actor.userId, totalRows: read.length, validRows: 0, errorRows: 0, duplicateRows: 0,
      fileSha256: sha, options: { kind, target, guard: { inFlight: { boot: BOOT_ID, at: now.toISOString() } } }, createdAt: now,
    })).id);
  } catch (e) {
    const msg = `Database error while saving the preview: ${shortDbMessage(e)}`;
    return fail(kind, "save", msg, [msg]);
  }
  let logs: Row[] = [];
  // each chunk in one transaction (one commit per chunk, not per row)
  const flush = async () => { if (!logs.length) return; const batch = logs; logs = []; await repo.transaction((tx) => tx.createMany("ImportedQuestionLog", batch)); };
  let valid = 0, invalid = 0, dups = 0;
  try {
    for (const [i, { r, rr, cm, place, uses, fill }] of read.entries()) {
      const errors = [...rr.errors, ...cm.errors, ...(place?.errors ?? []), ...(uses.error ? [uses.error] : [])];
      if (place?.node && cm.skill && cm.skill.grade !== place.node.grade) errors.push(`The skill is in Grade ${cm.skill.grade}, but the Curriculum Map place is in Grade ${place.node.grade}.`);
      const warnings = [...fill.warnings, ...rr.warnings, ...cm.warnings];
      const standardCode = cm.standard ? String(cm.standard.code) : null;
      let lexile: number | null = null;
      try { lexile = cleanLexile(r.cells.lexile); } catch (e) { errors.push((e as Error).message); }
      if (lexile !== null && place?.node?.level) {
        const lv = levelForLexile(bands[place.node.grade], lexile);
        const LN = { ABOVE: "Above", ON: "On", BELOW: "Below" } as const;
        if (lv && lv !== place.node.level) warnings.push(`Lexile ${lexile}L is in the ${LN[lv]} Level band for Grade ${place.node.grade} (On Level ${bands[place.node.grade].onMin}–${bands[place.node.grade].onMax}L), but the question is placed at ${LN[place.node.level]} Level.`);
      }
      const c = r.cells;
      const extras = { ...(c.mapArea?.trim() ? { mapArea: c.mapArea.trim(), mapTest: c.mapTest?.trim() || null } : {}), ...(c.dok?.trim() ? { dok: c.dok.trim() } : {}), ...(c.domain?.trim() ? { domain: c.domain.trim() } : {}), ...(c.passageTitle?.trim() ? { passageTitle: c.passageTitle.trim() } : {}) };
      const aiNeeds = [...new Set([...rr.needs, ...fill.aiNeeds])];
      const editor = rr.question ? { ...toInput(rr.question, cm.skill?.id ?? "", standardCode, jobId), ...(place?.node ? { mapNodeCode: place.node.code } : {}), ...(uses.uses.length ? { uses: uses.uses } : {}), ...(lexile !== null ? { lexile } : {}), ...extras, ...(aiNeeds.length ? { aiNeeds } : {}) } : null;
      // a picture placed on this row of the sheet is this question's picture (saved once, shared if identical)
      const pic = images?.get(r.row - 1);
      if (editor && pic && !errors.length) {
        try { editor.imageId = (await saveQuestionImage(repo, actor, pic, null, now)).id; }
        catch (e) { errors.push(`The picture on this row cannot be used: ${(e as Error).message}`); }
      }
      if (editor && !errors.length) errors.push(...checkInput(idx, editor, { allowNoStandard: true, allowUnlinkedStandard: true }));
      // an open-response question (a long model answer) cannot be marked automatically: say so plainly
      for (let k = 0; k < errors.length; k++) if (/^Accepted answer must be \d+ characters or fewer/.test(errors[k])) errors[k] = "Open-response question: its answer is a model answer, and the platform marks only short answers automatically (up to 200 characters each). Put the model answer in Explanation and one or more short accepted answers in Correct Answer (separated by |), or leave this question out.";
      // the same words about ANOTHER passage are another question (e.g. “What is the main idea of the text?”)
      const myPassage = passageKey(r.cells.passage);
      const h = editor && !errors.length ? importHash(editor, rr.question?.passage ?? null, editor.imageId ?? null) : null;
      const bankHit = h ? sameFamily(editor?.imageId ? (await bankHashHits(repo, [h])).get(h) : existing.get(h), editor?.skillId, keyOf) : null;
      let dup: { id: string; exact: boolean; score: number } | null = bankHit ? { id: bankHit.id, exact: true, score: 1 } : null;
      let fileDup = editor && editor.stem ? inFile.find(editor.stem, optionTexts(editor), myPassage) : null;
      // the same wording with other answer choices is another question: a note only, imported by default
      if (fileDup?.stemOnly) { warnings.push(`Same wording as row ${rowOfStem.get(fileDup.id)} in this file, but with different answer choices.`); fileDup = null; }
      if (dup) warnings.push(dup.exact ? "This question already exists in the question bank." : `A similar question already exists in the question bank (${Math.round(dup.score * 100)}% similar).`);
      if (fileDup) warnings.push(`${fileDup.exact ? "Same question as" : "Very similar to"} row ${rowOfStem.get(fileDup.id)} in this file.`);
      if (editor?.stem) {
        inFile.add(`r${i}`, editor.stem, optionTexts(editor), myPassage);
        rowOfStem.set(`r${i}`, r.row);
      }
      if (!dup && fileDup) dup = { ...fileDup, id: "" };
      const status: RowStatus = errors.length ? "INVALID" : dup ? "DUPLICATE" : "VALID";
      if (status === "VALID") valid++;
      else if (status === "INVALID") invalid++;
      else dups++;
      const detected: DetectedRow = {
        input: editor,
        meta: {
          row: r.row, grade: rr.grade, gradeText: r.cells.grade ?? "", skillText: r.cells.skill ?? "", standardText: r.cells.standard ?? "",
          levelText: r.cells.level ?? "", cognitiveText: r.cells.cognitive ?? "", skillName: cm.skill?.name ?? null, standardCode: standardCode ? shortStandard(standardCode) : null,
          passage: rr.question?.passage ?? null, duplicateExact: Boolean(dup?.exact),
          mapPath: place?.node?.path ?? null, uses: uses.uses,
        },
      };
      logs.push({
        id: newId(), jobId, rowIndex: i, status, decision: status === "DUPLICATE" ? "SKIP" : "IMPORT", selected: status !== "INVALID",
        source: Object.values(r.cells).filter(Boolean).join(" | ").slice(0, 4000), detected,
        errors, warnings, // empty lists, never null: Prisma refuses a plain null in a JSON column
        duplicateOfId: dup?.id || null, similarity: dup ? Math.round(dup.score * 100) / 100 : null, createdAt: now, updatedAt: now,
      });
      if (logs.length >= ANALYZE_CHUNK) await flush();
    }
    await flush();
  } catch (e) {
    const msg = `Database error while saving the preview: ${shortDbMessage(e)}`;
    await repo.updateMany("ImportJob", { id: jobId }, { status: "FAILED", errors: [{ message: msg }], options: { kind, stage: "save", target }, completedAt: now }).catch(() => null);
    throw new ImportFileError(msg, [msg], jobId);
  }
  read.length = 0;

  const notes = [
    `${rowsIn.length} row(s) read from the ${kind === "xlsx" ? "Excel" : "CSV"} file`,
    "wrong-answer feedback is not part of the template: a standard message is used for wrong choices",
    ...(emptyPlaces ? [`${emptyPlaces} empty row(s) of the Curriculum template were skipped`] : []),
    ...(parsed.ignoredColumns.length ? [`column(s) not in the template were ignored: ${parsed.ignoredColumns.join(", ")}`] : []),
  ];
  await repo.updateMany("ImportJob", { id: jobId }, { status: "AWAITING_CONFIRMATION", validRows: valid, errorRows: invalid, duplicateRows: dups, options: { kind, notes, target } });
  await audit(repo, { actorId: actor.userId, action: "question.import.analyze", entityType: "ImportJob", entityId: jobId, after: { fileName, kind, total: logs.length, valid, invalid, duplicates: dups }, at: now });
  return jobId;
}

/**
 * ✨ A Question Bank row with empty (or unknown) Grade, Skill or Standard is completed here by rules — the grade from
 * the standard / the skill / the file; the skill from the standard's linked skills, else the closest skill of the
 * row's MAP area; the standard from the skill, else read from the wording — and what the rules cannot decide
 * surely is left for the platform's AI after the import (aiNeeds). The cells are filled in place.
 */
async function completeRow(idx: CurriculumIndex, cells: Partial<Record<string, string>>, rr: ReturnType<typeof readRow>, fileGrade: number | null, unclassifiedOf: (g: number) => Promise<string | undefined>): Promise<{ warnings: string[]; aiNeeds: string[] }> {
  const warnings: string[] = [], aiNeeds: string[] = [];
  if (!rr.question) return { warnings, aiNeeds };
  const get = (k: string) => String(cells[k] ?? "").trim();
  // grade
  if (rr.grade === null && !get("grade")) {
    const g = gradeFromRow(idx, cells) ?? fileGrade;
    if (g) {
      cells.grade = String(g); rr.grade = g;
      const fromStd = parseCcss(get("standard"))?.grade === g;
      warnings.push(`Grade was empty: Grade ${g} (${fromStd ? "from the standard" : "the grade of the other questions in the file"}).`);
      if (!fromStd) aiNeeds.push("grade");
    }
  }
  const grade = rr.grade;
  if (grade === null || !idx.grades.has(grade)) return { warnings, aiNeeds };
  const skills = idx.grades.get(grade)!;
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
  const skillText = get("skill");
  const known = skillText ? skills.filter((k) => norm(k.code) === norm(skillText) || norm(k.code).replace(/^g\d+\./, "") === norm(skillText) || norm(k.name) === norm(skillText)) : [];
  const options = [cells.optA, cells.optB, cells.optC, cells.optD].map((x) => String(x ?? "")).filter(Boolean);
  // skill
  if (known.length !== 1) {
    const pick = pickSkill(idx, grade, { skill: skillText, standard: get("standard"), stem: rr.question.stem, domain: get("domain"), mapArea: get("mapArea"), options, passage: rr.question.passage });
    if (pick) {
      cells.skill = pick.skill.code;
      warnings.push(`${skillText ? `Skill “${skillText}” was not found` : "Skill was empty"}: ${pick.skill.name} (${pick.how}).`);
      if (!pick.sure) aiNeeds.push("skill");
    } else {
      const id = await unclassifiedOf(grade);
      const sk = id ? skills.find((k) => k.id === id) ?? [...idx.grades.values()].flat().find((k) => k.id === id) : undefined;
      if (sk) { cells.skill = sk.code; warnings.push(`${skillText ? `Skill “${skillText}” was not found` : "Skill was empty"}: kept as Unclassified until the AI chooses the skill.`); aiNeeds.push("skill"); }
    }
  }
  // standard
  if (!get("standard")) {
    const sk = skills.find((k) => k.code === cells.skill) ?? known[0];
    const primary = sk?.standards.find((x) => x.isPrimary) ?? sk?.standards[0];
    const text = areaFromText({ stem: rr.question.stem, options, passage: rr.question.passage, grade });
    const area = areaFromName(get("mapArea")) ?? text?.area ?? null;
    const guess = primary ? shortStandard(primary.code) : text && (!area || text.area === area) ? text.standard : area ? defaultStandard(area, grade) : null;
    if (guess && (primary || idx.standards.has(shortStandard(guess)))) {
      cells.standard = guess;
      warnings.push(`Standard was empty: ${guess} (${primary ? "the skill's standard" : "read from the question"}).`);
      if (!primary) aiNeeds.push("standard");
    } else aiNeeds.push("standard");
  }
  return { warnings, aiNeeds };
}

/** A database error in one line, without stack or SQL (for teachers and the import history). */
export function shortDbMessage(e: unknown): string {
  const m = String((e as Error)?.message ?? e ?? "unknown error").replace(/\s+/g, " ").trim();
  if (/doesn't exist|does not exist|no such table|P2021/i.test(m)) return "a table is missing in the database (run `npx prisma db push` after updating).";
  if (/Unknown (column|argument)|P2022/i.test(m)) return "a column is missing in the database (run `npx prisma db push` after updating).";
  if (/Can't reach database|ECONNREFUSED|P1001|ETIMEDOUT/i.test(m)) return "the database server could not be reached. Try again in a minute.";
  if (/Transaction already closed|expired transaction|P2028/i.test(m)) return "the database took too long. Try again; large files are imported in parts.";
  return m.length > 200 ? `${m.slice(0, 200)}…` : m;
}

// ------------------------------------------------------------------- preview

export interface PreviewRow {
  id: string; rowIndex: number; rowNumber: number; status: RowStatus; decision: ImportDecision; selected: boolean; source: string;
  detected: DetectedRow; errors: string[]; warnings: string[];
  duplicate: { id: string; stem: string; status: string; similarity: number; exact: boolean } | null; inFileDuplicate: boolean; questionId: string | null;
}
export interface ImportJobView {
  id: string; fileName: string; status: string; kind: string; createdAt: string; uploadedBy: string;
  totals: { total: number; valid: number; invalid: number; duplicates: number };
  summary: { imported: number; replaced: number; skipped: number; failed: number; duplicatesSkipped?: number } | null;
  options: { notes?: string[]; stage?: string; publish?: boolean };
  /** reasons a FAILED job could not be imported, or the rows that failed while importing */
  errors: string[];
  rows: PreviewRow[];
}

async function jobInSchool(repo: Repo, actor: Actor, jobId: string): Promise<Row> {
  const job = await repo.findUnique("ImportJob", { id: jobId });
  if (!job || job.kind !== "QUESTIONS") throw new ForbiddenError("Import not found.");
  const uploader = await repo.findUnique("User", { id: job.uploadedById });
  if (!uploader || uploader.schoolId !== schoolOf(actor)) throw new ForbiddenError("Import not found.");
  return job;
}

const jobErrors = (job: Row) => (parseJ<{ message?: string; row?: number }[] | null>(job.errors) ?? []).map((e) => (e.row ? `Row ${e.row}: ${e.message}` : String(e.message ?? "")));

function viewOf(job: Row, uploadedBy: string): Omit<ImportJobView, "rows"> {
  return {
    id: String(job.id), fileName: String(job.fileName), status: String(job.status), kind: String(parseJ<{ kind?: string }>(job.options)?.kind ?? ""),
    createdAt: new Date(String(job.createdAt)).toISOString(), uploadedBy,
    totals: { total: Number(job.totalRows), valid: Number(job.validRows), invalid: Number(job.errorRows), duplicates: Number(job.duplicateRows) },
    summary: job.summary ? parseJ(job.summary) : null, options: parseJ(job.options) ?? {}, errors: jobErrors(job),
  };
}

function previewRow(l: Row, dupQs: Map<string, Row>): PreviewRow {
  const d = l.duplicateOfId ? dupQs.get(String(l.duplicateOfId)) : undefined;
  const detected = parseJ<DetectedRow>(l.detected);
  return {
    id: String(l.id), rowIndex: Number(l.rowIndex), rowNumber: Number(detected.meta?.row ?? Number(l.rowIndex) + 2), status: l.status as RowStatus, decision: l.decision as ImportDecision,
    selected: Boolean(l.selected), source: String(l.source), detected, errors: parseJ<string[] | null>(l.errors) ?? [], warnings: parseJ<string[] | null>(l.warnings) ?? [],
    duplicate: d ? { id: String(d.id), stem: String(d.stem), status: String(d.status), similarity: Number(l.similarity ?? 0), exact: Boolean(detected.meta?.duplicateExact) } : null,
    inFileDuplicate: l.status === "DUPLICATE" && !l.duplicateOfId, questionId: l.questionId ? String(l.questionId) : null,
  };
}

/**
 * 🛟 A file still “being checked” by a server process that no longer runs (it stopped half-way, e.g. out of memory)
 * can never finish: it is marked FAILED with a clear message instead of waiting forever (Update 42A).
 */
async function failDeadChecks(repo: Repo, jobs: Row[], now = new Date()): Promise<void> {
  for (const job of jobs) {
    if (job.status !== "VALIDATING") continue;
    const o = parseJ<{ guard?: GuardState; kind?: string; target?: string } | null>(job.options) ?? {};
    if (!leftByDeadProcess(o.guard)) continue;
    const message = `The server stopped while checking this file, so nothing was added. Upload it again; if it happens again, split it into smaller files (up to ${MAX_IMPORT_ROWS.toLocaleString("en")} questions each).`;
    await repo.updateMany("ImportJob", { id: job.id, status: "VALIDATING" }, { status: "FAILED", completedAt: now, errors: [{ message }], options: { kind: o.kind ?? null, target: o.target ?? null, stage: "crash" } });
    Object.assign(job, { status: "FAILED", completedAt: now, errors: [{ message }], options: { kind: o.kind ?? null, target: o.target ?? null, stage: "crash" } });
  }
}

/** Preview rows sent to the browser: no copy of the spreadsheet row, and the passage only as a short start (Update 42A). */
export function clientRows(rows: PreviewRow[]): PreviewRow[] {
  return rows.map((r) => {
    const p = r.detected.meta?.passage;
    return { ...r, source: "", detected: { ...r.detected, meta: { ...r.detected.meta, passage: p ? p.slice(0, 160) : null, ...(p ? { passageWords: p.split(/\s+/).filter(Boolean).length } : {}) } } };
  });
}

export async function getImportJob(repo: Repo, actor: Actor, jobId: string): Promise<ImportJobView> {
  assertCan(actor, "questions:edit");
  const job = await jobInSchool(repo, actor, jobId);
  await failDeadChecks(repo, [job]);
  const logs = await repo.findMany("ImportedQuestionLog", { jobId }, { orderBy: [{ field: "rowIndex", dir: "asc" }] });
  const dupIds = [...new Set(logs.map((l) => l.duplicateOfId).filter(Boolean))] as string[];
  const dupQs = new Map((dupIds.length ? await repo.findMany("Question", { id: { in: dupIds } }) : []).map((q) => [String(q.id), q]));
  const uploader = await repo.findUnique("User", { id: job.uploadedById });
  return { ...viewOf(job, String(uploader?.displayName ?? "")), rows: logs.map((l) => previewRow(l, dupQs)) };
}

export async function listImportJobs(repo: Repo, actor: Actor, limit = 30): Promise<Omit<ImportJobView, "rows">[]> {
  assertCan(actor, "questions:edit");
  const users = await repo.findMany("User", { schoolId: schoolOf(actor) }, { select: ["id", "displayName"] });
  // the newest `limit` jobs only, read by the database (Update 42A: never every job with its error lists)
  const jobs = await repo.findMany("ImportJob", { kind: "QUESTIONS", uploadedById: { in: users.map((u) => u.id) } }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: limit });
  await failDeadChecks(repo, jobs);
  return jobs.map((job) => viewOf(job, String(users.find((u) => u.id === job.uploadedById)?.displayName ?? "")));
}

async function editableJob(repo: Repo, actor: Actor, jobId: string) {
  assertCan(actor, "questions:edit");
  const job = await jobInSchool(repo, actor, jobId);
  if (job.status !== "AWAITING_CONFIRMATION") throw new ValidationError("This import has already started or finished; it can no longer be changed.");
  return job;
}

/** Edit one detected question, select or unselect it, or choose what to do with a duplicate. */
export async function updateImportRow(repo: Repo, actor: Actor, jobId: string, rowId: string, patch: { input?: EditorInput; selected?: boolean; decision?: ImportDecision }, now = new Date()): Promise<PreviewRow> {
  const job = await editableJob(repo, actor, jobId);
  const row = await repo.findUnique("ImportedQuestionLog", { id: rowId });
  if (!row || row.jobId !== jobId) throw new ForbiddenError("Question not found in this import.");
  const data: Row = { updatedAt: now };
  if (patch.decision) {
    if (!["IMPORT", "SKIP", "REPLACE", "FORCE"].includes(patch.decision)) throw new ValidationError("Unknown decision.");
    if (patch.decision === "REPLACE" && !row.duplicateOfId) throw new ValidationError("Only a question that matches an existing one can replace it.");
    data.decision = patch.decision;
  }
  if (patch.selected !== undefined) {
    if (patch.selected && row.status === "INVALID" && !patch.input) throw new ValidationError("Fix the errors in this question before selecting it.");
    data.selected = Boolean(patch.selected);
  }
  if (patch.input) {
    const prev = parseJ<DetectedRow>(row.detected);
    const curriculum = parseJ<{ target?: string }>(job.options)?.target === "CURRICULUM";
    const merged: EditorInput = { mapNodeCode: prev.input?.mapNodeCode, uses: prev.input?.uses, ...patch.input, imported: true, batch: jobId };
    // an answer chosen in the preview replaces the AI's job (the AI must not overwrite it)
    const left = hasAnswerKey(merged) ? merged.aiNeeds?.filter((n) => n !== "answer") : merged.aiNeeds;
    const input: EditorInput = { ...merged, aiNeeds: left?.length ? left : undefined };
    if (!input.aiNeeds) delete input.aiNeeds;
    const idx = await loadCurriculumIndex(repo, actor, { includeUnclassified: curriculum });
    const errors = checkInput(idx, input, { allowNoStandard: curriculum, allowUnlinkedStandard: curriculum });
    const skill = skillById(idx, input.skillId);
    const h = errors.length ? null : importHash(input, prev.meta?.passage ?? null, input.imageId ?? null);
    const found = h ? sameFamily((await bankHashHits(repo, [h])).get(h), input.skillId, (await schoolSkillIndex(repo, schoolOf(actor))).keyOf) : null;
    const dup = found ? { id: found.id, exact: true, score: 1 } : null;
    const std = input.standardCode ? idx.standards.get(shortStandard(input.standardCode)) : undefined;
    Object.assign(data, {
      detected: { input, meta: { ...prev.meta, grade: skill?.grade ?? prev.meta.grade, skillName: skill?.name ?? null, standardCode: std ? shortStandard(std.code) : null, duplicateExact: Boolean(dup?.exact) } } satisfies DetectedRow,
      errors,
      warnings: dup ? ["This question already exists in the question bank."] : [],
      duplicateOfId: dup?.id ?? null, similarity: dup ? Math.round(dup.score * 100) / 100 : null,
      status: errors.length ? "INVALID" : dup ? "DUPLICATE" : "VALID",
      ...(errors.length ? { selected: false } : patch.selected === undefined && row.status === "INVALID" ? { selected: true } : {}),
      ...(dup && !patch.decision && row.status !== "DUPLICATE" ? { decision: "SKIP" } : {}),
      ...(!dup && (row.decision === "REPLACE" || row.decision === "SKIP") && !patch.decision ? { decision: "IMPORT" } : {}),
    });
  }
  await repo.updateMany("ImportedQuestionLog", { id: rowId }, data);
  await recount(repo, jobId);
  const after = (await repo.findUnique("ImportedQuestionLog", { id: rowId }))!;
  const dq = after.duplicateOfId ? await repo.findUnique("Question", { id: after.duplicateOfId }) : null;
  return previewRow(after, new Map(dq ? [[String(dq.id), dq]] : []));
}

export async function selectAll(repo: Repo, actor: Actor, jobId: string, selected: boolean): Promise<void> {
  await editableJob(repo, actor, jobId);
  if (selected) await repo.updateMany("ImportedQuestionLog", { jobId, status: { in: ["VALID", "DUPLICATE"] } }, { selected: true });
  else await repo.updateMany("ImportedQuestionLog", { jobId }, { selected: false });
}

async function recount(repo: Repo, jobId: string) {
  const [v, e, d] = await Promise.all([
    repo.count("ImportedQuestionLog", { jobId, status: "VALID" }), repo.count("ImportedQuestionLog", { jobId, status: "INVALID" }), repo.count("ImportedQuestionLog", { jobId, status: "DUPLICATE" }),
  ]);
  await repo.updateMany("ImportJob", { id: jobId }, { validRows: v, errorRows: e, duplicateRows: d });
}

export async function cancelImport(repo: Repo, actor: Actor, jobId: string, now = new Date()): Promise<void> {
  await editableJob(repo, actor, jobId);
  await repo.updateMany("ImportJob", { id: jobId }, { status: "CANCELLED", completedAt: now });
  await audit(repo, { actorId: actor.userId, action: "question.import.cancel", entityType: "ImportJob", entityId: jobId, at: now });
}

// -------------------------------------------------------------------- commit

export interface CommitProgress { processed: number; total: number; done: boolean; counts: { imported: number; replaced: number; skipped: number; failed: number; duplicates: number; /** 👯 duplicate questions skipped (“Skipped N duplicate questions”) */ duplicatesSkipped: number } }

interface Planned { log: Row; input: EditorInput; item: BankItem; skill: SkillRef; standardId: string | null; passage: string | null; replaceId: string | null; /** the standard is not linked to the skill: kept, but the question waits for a review */ unlinkedStandard: boolean }

import { passageRef } from "./passages";
import { cleanLexile } from "./questions";
import { attachmentNodes, resolveMapLocation, unclassifiedSkillId, usesFrom } from "../curriculum-map/questions";
import { lexileBands, levelForLexile } from "../curriculum-map/lexile";

/** Writes planned questions with batch inserts, in one transaction. Returns log id → question id. */
async function writeBatch(repo: Repo, actor: Actor, plans: Planned[], publish: boolean, jobId: string, now: Date): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  await repo.transaction(async (tx) => {
    // reading passages: one per distinct text, reused across imports
    const texts = [...new Set(plans.map((p) => p.passage).filter((p): p is string => Boolean(p)))];
    const passageIds = new Map<string, string>();
    if (texts.length) {
      const refs = texts.map(passageRef);
      for (const p of await tx.findMany("ReadingPassage", { externalRef: { in: refs } })) passageIds.set(String(p.externalRef), String(p.id));
      const fresh: Row[] = [];
      for (const t of texts) {
        const ref = passageRef(t);
        if (passageIds.has(ref)) continue;
        const st = analyzeText(t);
        const id = newId();
        const grade = plans.find((p) => p.passage === t)!.skill.grade;
        fresh.push({
          id, externalRef: ref, title: (plans.find((p) => p.passage === t && p.input.passageTitle)?.input.passageTitle ?? `Imported passage: ${t.replace(/\s+/g, " ").split(" ").slice(0, 8).join(" ")}…`).slice(0, 190), body: t, genre: null, gradeLevel: grade, gradeBand: String(grade),
          wordCount: st.wordCount, sentenceCount: st.sentenceCount, avgSentenceLength: st.avgSentenceLength, avgWordLength: st.avgWordLength,
          platformReadingLevel: platformReadingLevelFor(t, ""), status: "UNDER_REVIEW", origin: "IMPORTED", createdById: actor.userId, createdAt: now, updatedAt: now,
        });
        passageIds.set(ref, id);
      }
      await tx.createMany("ReadingPassage", fresh);
    }
    // question types
    const codes = [...new Set(plans.map((p) => p.item.type))];
    const types = new Map((await tx.findMany("QuestionType", { code: { in: codes } })).map((t) => [String(t.code), String(t.id)]));
    for (const c of codes) if (!types.has(c)) types.set(c, String((await tx.create("QuestionType", { code: c, name: c.replace(/_/g, " ").toLowerCase(), isAutoScored: c !== "SHORT_ANSWER" })).id));

    const questions: Row[] = [], options: Row[] = [], answers: Row[] = [], explanations: Row[] = [], audits: Row[] = [];
    for (const p of plans) {
      const id = newId();
      ids.set(String(p.log.id), id);
      // teacher-scored Short Answers are published too: the adaptive engine and the Curriculum Map sets never serve them
      // an answer the AI still has to choose: a draft until someone checks it
      const noKey = waitsForAnswer(p.input);
      const published = publish && !noKey && !p.input.aiNeeds?.includes("answer") && !p.unlinkedStandard;
      const fileArea = p.input.mapArea ? areaFromName(p.input.mapArea) : null;
      const answerList = storedAnswers(p.item, p.input);
      questions.push({
        contentHash: hashOfItem(p.item, p.passage, p.input.imageId ?? null, answerList),
        id, externalRef: p.item.ref, skillId: p.skill.id, standardId: p.standardId, passageId: p.passage ? passageIds.get(passageRef(p.passage)) ?? null : null,
        typeId: types.get(p.item.type)!, stem: p.item.stem, content: contentPayload(p.item), hint: null, difficultyLevel: p.item.level,
        irtA: 1, irtB: LEVEL_TO_B[p.item.level] ?? 0, irtC: 0, estimatedSeconds: p.item.estimatedSeconds,
        // teachers' imports wait for an admin straight away (no need to send each one for review)
        status: published ? "PUBLISHED" : can(actor, "questions:publish") || noKey || p.input.aiNeeds?.includes("answer") || p.unlinkedStandard ? "DRAFT" : "UNDER_REVIEW", origin: "IMPORTED", aiStatus: null, lessonId: null,
        ...(fileArea ? { mapTest: areaByKey(fileArea).test, mapInstructionalArea: areaByKey(fileArea).name, mapAreaSource: "IMPORT" } : {}),
        lexile: p.input.lexile ?? null,
        imageId: p.input.imageId ?? null,   // the picture placed on the question's row in the Excel file
        tags: { ...(p.input.cognitiveLevel ? { cognitiveLevel: p.input.cognitiveLevel } : {}), importJob: jobId, ...(p.input.dok ? { dok: String(p.input.dok).slice(0, 20) } : {}), ...(p.input.domain ? { domain: String(p.input.domain).slice(0, 80) } : {}), ...(p.input.passageTitle ? { passageTitle: String(p.input.passageTitle).slice(0, 190) } : {}), ...(p.input.aiNeeds?.length ? { aiNeeds: p.input.aiNeeds } : {}), ...(p.unlinkedStandard ? { review: ["standard-not-linked"] } : {}) },
        createdById: actor.userId, ...(published ? { publishedAt: now, reviewedById: actor.userId } : {}), createdAt: now, updatedAt: now,
      });
      for (const [i, o] of (p.item.options ?? []).entries()) options.push({ id: newId(), questionId: id, label: o.label, text: o.text, isCorrect: o.correct, rationale: o.rationale, order: i });
      const nKey = answerValues(p.item).filter((x) => x !== undefined && x !== null).length;
      for (const [i, v] of answerList.entries()) answers.push({ id: newId(), questionId: id, value: v as object, isPrimary: i === 0 || i >= nKey });
      explanations.push({ id: newId(), questionId: id, kind: "WHY_CORRECT", body: [{ type: "text", text: p.item.explanation.whyCorrect }], order: 0 });
      audits.push({ actorId: actor.userId, action: "question.create", entityType: "Question", entityId: id, after: { ref: p.item.ref, skillId: p.skill.id, type: p.item.type, level: p.item.level, importJob: jobId, status: published ? "PUBLISHED" : "DRAFT" }, createdAt: now });
    }
    await tx.createMany("Question", questions);
    await tx.createMany("QuestionOption", options);
    await tx.createMany("QuestionAnswer", answers);
    await tx.createMany("QuestionExplanation", explanations);
    // Curriculum import: the place on the map; any import: Placement / MAP test uses
    const mapCodes = [...new Set(plans.map((p) => p.input.mapNodeCode).filter(Boolean).map(String))];
    if (mapCodes.length) {
      const nodeOf = new Map((await attachmentNodes(tx, schoolOf(actor))).map((n) => [n.code, n.id]));
      const links = plans.filter((p) => p.input.mapNodeCode && nodeOf.has(String(p.input.mapNodeCode))).map((p) => ({ questionId: ids.get(String(p.log.id))!, nodeId: nodeOf.get(String(p.input.mapNodeCode))!, createdById: actor.userId, createdAt: now }));
      if (links.length) await tx.createMany("QuestionMapLink", links);
    }
    const useRows = plans.flatMap((p) => [...new Set(p.input.uses ?? [])].map((use) => ({ questionId: ids.get(String(p.log.id))!, use, createdAt: now })));
    if (useRows.length) await tx.createMany("QuestionUse", useRows);
    for (const p of plans.filter((x) => x.replaceId)) {
      const old = await tx.findUnique("Question", { id: p.replaceId! });
      if (old && old.status !== "ARCHIVED") {
        await tx.updateMany("Question", { id: old.id }, { status: "ARCHIVED", updatedAt: now });
        audits.push({ actorId: actor.userId, action: "question.import.replace", entityType: "Question", entityId: String(old.id), before: { status: old.status }, after: { status: "ARCHIVED", replacedBy: ids.get(String(p.log.id)) }, createdAt: now });
      }
    }
    await tx.createMany("AuditLog", audits);
    for (const p of plans) await tx.updateMany("ImportedQuestionLog", { id: p.log.id }, { status: p.replaceId ? "REPLACED" : "IMPORTED", questionId: ids.get(String(p.log.id)), updatedAt: now });
  });
  return ids;
}

/**
 * Imports the next chunk of the job (call repeatedly until done; the page shows a progress bar).
 * publish=true approves questions on import (needs questions:publish; short answers stay drafts).
 * A database error in a chunk is retried question by question, so one bad row cannot stop the rest;
 * each failure is recorded on its row and in the job's error list.
 */
export async function commitImportChunk(repo: Repo, actor: Actor, jobId: string, opts: { publish?: boolean } = {}, now = new Date()): Promise<CommitProgress> {
  assertCan(actor, "questions:edit");
  if (opts.publish) assertCan(actor, "questions:publish");
  const job = await jobInSchool(repo, actor, jobId);
  if (job.status === "FAILED") throw new ValidationError(parseJ<{ stage?: string }>(job.options)?.stage === "crash" ? jobErrors(job)[0] ?? CRASH_MESSAGE : "This file could not be read. Fix the file and upload it again.");
  if (job.status === "CANCELLED" || job.status === "COMPLETED") throw new ValidationError("This import is already finished.");
  if (job.status === "VALIDATING") throw new ValidationError("This file is still being checked. Open the import again in a minute.");
  // 🛟 a chunk that stopped the server twice is not tried a third time (the page resumes the import after a restart)
  const options0 = parseJ<Record<string, unknown>>(job.options) ?? {};
  const guard = beginStep(options0.guard as GuardState | undefined, now);
  if (guard.stop) {
    const message = `${CRASH_MESSAGE} Questions already imported are kept. Split the rest of the file into smaller files (up to 200 questions each) and import them.`;
    await repo.updateMany("ImportJob", { id: jobId }, { status: "FAILED", completedAt: now, errors: [...(parseJ<{ message?: string; row?: number }[] | null>(job.errors) ?? []), { message }], options: { ...options0, stage: "crash", guard: endStep() } });
    log("error", "question_import.crash_loop_stopped", { jobId, crashes: guard.crashes });
    throw new ValidationError(message);
  }
  await repo.updateMany("ImportJob", { id: jobId }, {
    ...(job.status === "AWAITING_CONFIRMATION" ? { status: "IMPORTING" } : {}),
    options: { ...options0, ...(job.status === "AWAITING_CONFIRMATION" ? { publish: Boolean(opts.publish) } : {}), guard: guard.next },
  });
  if (job.status === "AWAITING_CONFIRMATION") await audit(repo, { actorId: actor.userId, action: "question.import.start", entityType: "ImportJob", entityId: jobId, after: { publish: Boolean(opts.publish) }, at: now });
  const publish = Boolean(opts.publish ?? parseJ<{ publish?: boolean }>(job.options)?.publish) && can(actor, "questions:publish");
  // only the next chunk is read (ordered and limited by the database), never every open row of a large file
  const open = await repo.findMany("ImportedQuestionLog", { jobId, status: { in: OPEN } }, { orderBy: [{ field: "rowIndex", dir: "asc" }], take: COMMIT_CHUNK });

  const skip: string[] = [];
  let dupSkipped = 0;
  const failed: { id: string; errors: string[] }[] = [];
  const plans: Planned[] = [];
  const target: ImportTarget = parseJ<{ target?: string }>(job.options)?.target === "CURRICULUM" ? "CURRICULUM" : "BANK";
  const idx = open.length ? await loadCurriculumIndex(repo, actor, { includeUnclassified: target === "CURRICULUM" }) : null;
  for (const l of open) {
    const det = parseJ<DetectedRow>(l.detected);
    // rows with errors are reported as failed (with their reasons), never silently as skipped
    if (l.status === "INVALID" || !det.input) { failed.push({ id: String(l.id), errors: parseJ<string[] | null>(l.errors) ?? ["the question has errors"] }); continue; }
    if (!l.selected || l.decision === "SKIP") { skip.push(String(l.id)); if (l.status === "DUPLICATE") dupSkipped++; continue; }
    const input = det.input;
    const problems = checkInput(idx!, input, { allowNoStandard: true, allowUnlinkedStandard: true }); // the curriculum may have changed since the preview
    if (problems.length) { failed.push({ id: String(l.id), errors: problems }); continue; }
    const skill = skillById(idx!, input.skillId)!;
    const std = input.standardCode ? idx!.standards.get(shortStandard(input.standardCode)) ?? null : null;
    const item0 = buildBankItem(withStandInKey(input), { ref: `T${skill.grade}-${randomBytes(4).toString("hex")}`, grade: skill.grade, skillCode: skill.code, standardCode: std ? std.code : null, passageRef: null, allowNoStandard: true });
    // no correct answer given: saved WITHOUT a key (the stand-in key was only for the check above)
    const item = withoutKey(item0, input);
    const unlinkedStandard = Boolean(std && skill.standards.length && !skill.standards.some((x) => shortStandard(x.code) === shortStandard(std.code)));
    plans.push({ log: l, input, item, skill, standardId: std ? std.id : null, passage: det.meta?.passage ?? null, replaceId: l.decision === "REPLACE" && l.duplicateOfId ? String(l.duplicateOfId) : null, unlinkedStandard });
  }
  // 👯 a question that is already in the bank (or earlier in this file) is skipped: one indexed lookup for the chunk.
  // “Import anyway” (FORCE) and “Replace” are the admin's decision and are kept.
  if (plans.length) {
    const keyOf = (await schoolSkillIndex(repo, schoolOf(actor))).keyOf;
    const hashes = plans.map((p) => (p.log.decision === "IMPORT" ? hashOfItem(p.item, p.passage, p.input.imageId ?? null, storedAnswers(p.item, p.input)) : null));
    const hits = await bankHashHits(repo, hashes);
    const seen = new Map<string, string>();
    const keep: Planned[] = [];
    for (const [i, p] of plans.entries()) {
      const h = hashes[i];
      const fam = keyOf.get(p.skill.id) ?? `solo:${p.skill.id}`;
      const inBank = h ? sameFamily(hits.get(h), p.skill.id, keyOf) : null;
      const inChunk = h ? seen.get(`${h}|${fam}`) : undefined;
      if (inBank || inChunk) {
        dupSkipped++;
        await repo.updateMany("ImportedQuestionLog", { id: p.log.id }, { status: "SKIPPED", duplicateOfId: inBank?.id ?? null, warnings: ["This question already exists in the question bank."], updatedAt: now });
        continue;
      }
      if (h) seen.set(`${h}|${fam}`, String(p.log.id));
      keep.push(p);
    }
    plans.length = 0;
    plans.push(...keep);
  }
  if (dupSkipped) {
    const fresh = parseJ<Record<string, unknown>>((await repo.findUnique("ImportJob", { id: jobId }))?.options) ?? {};
    await repo.updateMany("ImportJob", { id: jobId }, { options: { ...fresh, dupSkipped: Number(fresh.dupSkipped ?? 0) + dupSkipped } });
  }
  if (skip.length) await repo.updateMany("ImportedQuestionLog", { id: { in: skip } }, { status: "SKIPPED", updatedAt: now });
  for (const f of failed) await repo.updateMany("ImportedQuestionLog", { id: f.id }, { status: "FAILED", errors: f.errors, updatedAt: now });
  if (plans.length) {
    try {
      await writeBatch(repo, actor, plans, publish, jobId, now);
    } catch {
      // isolate the failing question(s): retry one by one
      for (const p of plans) {
        try {
          await writeBatch(repo, actor, [p], publish, jobId, now);
        } catch (e) {
          await repo.updateMany("ImportedQuestionLog", { id: p.log.id }, { status: "FAILED", errors: [`Database error: ${shortDbMessage(e)}`], updatedAt: now });
        }
      }
    }
  }

  // 🧭 the MAP test and area of every new question (an area the file gave is kept), then ✨ the AI completes the gaps
  const postErrors: { message: string }[] = [];
  if (plans.length) {
    const newIds = (await repo.findMany("ImportedQuestionLog", { id: { in: plans.map((p) => String(p.log.id)) } }, { select: ["questionId"] })).map((l) => String(l.questionId ?? "")).filter(Boolean);
    // each step may fail without losing the import: the failure is logged and listed on the job (never swallowed)
    const step = async (name: string, run: () => Promise<unknown>) => {
      try { await run(); } catch (e) {
        log("error", "question_import.post_process_failed", { jobId, step: name, error: e as Error });
        postErrors.push({ message: `After the import, “${name}” did not finish for ${newIds.length} question(s): ${shortDbMessage(e)}` });
      }
    };
    await step("MAP area", async () => { const { autoClassify } = await import("../map/question-areas"); await autoClassify(repo, schoolOf(actor), newIds, now); });
    // 🧭 map questions imported without a skill: their real skill from the map place / standard / wording (Update 39C)
    await step("skill from the map place", async () => { const { remapNewQuestions } = await import("../curriculum-map/remap-skills"); await remapNewQuestions(repo, schoolOf(actor), newIds, actor.userId, now); });
    // 🧠 question intelligence (it also tags each wrong option's misconception: tagOptions runs inside it, once)
    await step("question analysis", async () => { const { analyzeQuestions } = await import("../questions/intelligence"); await analyzeQuestions(repo, schoolOf(actor), { questionIds: newIds }, now); });
    const needing = plans.filter((p) => p.input.aiNeeds?.length).length;
    if (needing) await step("AI completion", async () => { const { queueCompletion } = await import("../ai/complete"); await queueCompletion(repo, actor, jobId, now); });
    if (postErrors.length) {
      const fresh = parseJ<Record<string, unknown>>((await repo.findUnique("ImportJob", { id: jobId }))?.options) ?? {};
      const prev = Array.isArray(fresh.postErrors) ? (fresh.postErrors as { message: string }[]) : [];
      await repo.updateMany("ImportJob", { id: jobId }, { options: { ...fresh, postErrors: [...prev, ...postErrors].slice(-50) } });
    }
  }
  // the chunk finished: no crash mark (the next chunk starts with a clean count)
  {
    const fresh = parseJ<Record<string, unknown>>((await repo.findUnique("ImportJob", { id: jobId }))?.options) ?? {};
    await repo.updateMany("ImportJob", { id: jobId }, { options: { ...fresh, guard: endStep() } });
  }
  const count = (status: RowStatus) => repo.count("ImportedQuestionLog", { jobId, status });
  const [imported, replaced, skipped, failedN, remaining, total, duplicates] = await Promise.all([
    count("IMPORTED"), count("REPLACED"), count("SKIPPED"), count("FAILED"), repo.count("ImportedQuestionLog", { jobId, status: { in: OPEN } }),
    repo.count("ImportedQuestionLog", { jobId }), Promise.resolve(Number(job.duplicateRows ?? 0)),
  ]);
  const duplicatesSkipped = Number(parseJ<{ dupSkipped?: number }>((await repo.findUnique("ImportJob", { id: jobId }))?.options)?.dupSkipped ?? 0);
  const counts = { imported, replaced, skipped, failed: failedN, duplicates, duplicatesSkipped };
  const done = remaining === 0;
  if (done) {
    const failedLogs = failedN ? (await repo.findMany("ImportedQuestionLog", { jobId, status: "FAILED" })).sort((a, b) => Number(a.rowIndex) - Number(b.rowIndex)) : [];
    const post = parseJ<{ postErrors?: { message: string }[] }>((await repo.findUnique("ImportJob", { id: jobId }))?.options)?.postErrors ?? [];
    const errors = [...failedLogs.slice(0, 500).map((l) => ({ row: Number(parseJ<DetectedRow>(l.detected)?.meta?.row ?? Number(l.rowIndex) + 2), message: (parseJ<string[] | null>(l.errors) ?? []).join(" ") })), ...post.map((e) => ({ message: e.message }))];
    await repo.updateMany("ImportJob", { id: jobId }, { status: "COMPLETED", completedAt: now, summary: { imported, replaced, skipped, failed: failedN, duplicatesSkipped }, errors });
    await audit(repo, { actorId: actor.userId, action: "question.import.complete", entityType: "ImportJob", entityId: jobId, after: counts, at: now });
  }
  return { processed: total - remaining, total, done, counts };
}

/** Every row that has a problem (or a warning), with its spreadsheet row number, as CSV rows. */
export async function importProblemRows(repo: Repo, actor: Actor, jobId: string): Promise<string[][]> {
  const job = await getImportJob(repo, actor, jobId);
  const out: string[][] = [["Row", "Status", "Question Text", "Problems", "Warnings"]];
  if (job.status === "FAILED") for (const e of job.errors) out.push(["", "File not imported", "", e, ""]);
  for (const r of job.rows) {
    if (!r.errors.length && !r.warnings.length && r.status !== "FAILED") continue;
    out.push([String(r.rowNumber), r.status, r.detected.input?.stem ?? "", r.errors.join(" | "), r.warnings.join(" | ")]);
  }
  return out;
}

/**
 * 🗄 Archives every question an import created (e.g. to replace an older version of a file). Archived questions
 * leave the bank, the Curriculum Map sets and adaptive practice; students' past answers are kept.
 */
export async function archiveImportQuestions(repo: Repo, actor: Actor, jobId: string, now = new Date()): Promise<number> {
  assertCan(actor, "questions:publish");
  await jobInSchool(repo, actor, jobId);
  // the questions this import created (its rows name them), not every question of the bank (Update 42A)
  const ids = (await repo.findMany("ImportedQuestionLog", { jobId, status: { in: ["IMPORTED", "REPLACED"] } }, { select: ["questionId"] })).map((l) => String(l.questionId ?? "")).filter(Boolean);
  const qs: Row[] = [];
  for (let i = 0; i < ids.length; i += 500) qs.push(...(await repo.findMany("Question", { id: { in: ids.slice(i, i + 500) }, status: { in: ["PUBLISHED", "DRAFT", "UNDER_REVIEW"] } }, { select: ["id", "tags"] })).filter((q) => parseJ<Record<string, unknown> | null>(q.tags)?.importJob === jobId));
  if (!qs.length) return 0;
  for (let i = 0; i < qs.length; i += 500) await repo.updateMany("Question", { id: { in: qs.slice(i, i + 500).map((q) => q.id) } }, { status: "ARCHIVED", updatedAt: now });
  await repo.create("AuditLog", { actorId: actor.userId, action: "import.archive", entityType: "ImportJob", entityId: jobId, after: { archived: qs.length }, createdAt: now });
  return qs.length;
}
