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
import { LEVEL_TO_B } from "../../config/engine";
import { ExtractError, extract, type FileKind } from "../../imports/questions/extract";
import {
  DuplicateIndex, GENERIC_WRONG_FEEDBACK, MAX_IMPORT_ROWS, buildCurriculumIndex, matchCurriculum, parseTemplateTable, readRow, shortStandard,
  type CurriculumIndex, type RowQuestion, type SkillRef,
} from "../../imports/questions/template";
import { answerValues, contentPayload, type BankItem } from "../../imports/questions/validate";
import { analyzeText, platformReadingLevelFor } from "../../reading/prl";
import { audit } from "../audit";
import { assertCan, can, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { buildBankItem, type EditorInput } from "./questions";
import { schoolOf } from "./users";

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
    passage: string | null;
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
const LOG_BATCH = 500;
const OPEN: RowStatus[] = ["VALID", "INVALID", "DUPLICATE"];

const parseJ = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));
const newId = () => "c" + Date.now().toString(36) + randomBytes(8).toString("hex");

// --------------------------------------------------------------- curriculum

/** The school's grades, skills (with linked standards) and all standards: a handful of queries. */
export async function loadCurriculumIndex(repo: Repo, actor: Actor): Promise<CurriculumIndex> {
  // inactive grades and skills are hidden: they cannot receive new questions
  const grades = (await repo.findMany("Grade", { schoolId: schoolOf(actor) })).filter((g) => g.isActive !== false);
  const curricula = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }) : [];
  const skills = curricula.length ? (await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) } })).filter((s) => !s.deletedAt && s.isActive !== false) : [];
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
  };
}

/**
 * Checks an editor input against the curriculum and the bank rules without any database access.
 * Returns every problem (empty = valid).
 */
export function checkInput(idx: CurriculumIndex, input: EditorInput): string[] {
  const skill = input.skillId ? skillById(idx, input.skillId) : null;
  if (!skill) return ["Choose a skill that exists on the platform."];
  const errors: string[] = [];
  const std = input.standardCode ? idx.standards.get(shortStandard(input.standardCode)) ?? null : null;
  if (!input.standardCode) errors.push("Choose the standard this question assesses.");
  else if (!std) errors.push(`Standard “${input.standardCode}” does not exist on the platform.`);
  else if (skill.standards.length && !skill.standards.some((s) => shortStandard(s.code) === shortStandard(std.code))) {
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
  [/level .* out of range/, "Difficulty Level must be from 1 to 7."],
];
function friendlyBankErrors(message: string): string[] {
  return [...new Set(message.split(/;\s+/).map((m) => BANK_MESSAGES.find(([re]) => re.test(m))?.[1] ?? (m.charAt(0).toUpperCase() + m.slice(1))))];
}

// ------------------------------------------------------------- duplicates

async function duplicateIndex(repo: Repo, skillIds: string[]): Promise<{ index: DuplicateIndex; stems: Map<string, { stem: string; status: string }> }> {
  const index = new DuplicateIndex();
  const stems = new Map<string, { stem: string; status: string }>();
  if (!skillIds.length) return { index, stems };
  const qs = (await repo.findMany("Question", { skillId: { in: skillIds } })).filter((q) => !q.deletedAt && q.status !== "ARCHIVED");
  const opts = qs.length ? await repo.findMany("QuestionOption", { questionId: { in: qs.map((q) => q.id) } }) : [];
  const byQ = new Map<string, Row[]>();
  for (const o of opts) {
    const k = String(o.questionId);
    if (!byQ.has(k)) byQ.set(k, []);
    byQ.get(k)!.push(o);
  }
  for (const q of qs) {
    const o = (byQ.get(String(q.id)) ?? []).sort((a, b) => Number(a.order) - Number(b.order)).map((x) => String(x.text));
    index.add(String(q.id), String(q.stem), o);
    stems.set(String(q.id), { stem: String(q.stem), status: String(q.status) });
  }
  return { index, stems };
}

const optionTexts = (i: EditorInput | null | undefined) => i?.options?.map((o) => o.text) ?? [];

// ------------------------------------------------------------------- analyze

export interface AnalyzeInput { fileName: string; bytes: Uint8Array }

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

/**
 * Reads and checks the file and stores the preview. Throws ImportFileError (with every reason, and
 * the id of the FAILED job kept in the history) when the file cannot be imported at all.
 */
export async function analyzeImport(repo: Repo, actor: Actor, input: AnalyzeInput, now = new Date()): Promise<string> {
  assertCan(actor, "questions:edit");
  const fileName = input.fileName.replace(/[\\/]/g, "_").slice(0, 200) || "upload";
  const fail = async (kind: string | null, stage: string, message: string, details: string[]) => {
    throw new ImportFileError(message, details, await recordFailure(repo, actor, fileName, input.bytes, kind, stage, details, now));
  };

  let kind: FileKind;
  let table: string[][];
  try {
    ({ kind, table } = extract(fileName, input.bytes));
  } catch (e) {
    const msg = e instanceof ExtractError ? e.message : `The file could not be read: ${(e as Error).message}`;
    return fail(null, "read", msg, [msg]);
  }
  const parsed = parseTemplateTable(table);
  if (!parsed.ok) return fail(kind, "columns", parsed.errors.length === 1 ? parsed.errors[0] : "The file does not match the template.", parsed.errors);
  if (!parsed.rows.length) return fail(kind, "rows", "The file has the header row but no questions.", ["The file has the header row but no questions. Add one question per row under the header."]);
  if (parsed.rows.length > MAX_IMPORT_ROWS) return fail(kind, "rows", `The file has ${parsed.rows.length.toLocaleString("en")} questions; the limit is ${MAX_IMPORT_ROWS.toLocaleString("en")} per file.`, [`The file has ${parsed.rows.length.toLocaleString("en")} questions; the limit is ${MAX_IMPORT_ROWS.toLocaleString("en")} per file. Split it into smaller files.`]);

  const idx = await loadCurriculumIndex(repo, actor);
  if (!idx.grades.size) return fail(kind, "curriculum", "No grades are set up for this school yet.", ["No grades are set up for this school yet. Load the curriculum before importing questions."]);

  // read and match every row (pure, no database work per row)
  const read = parsed.rows.map((r) => {
    const rr = readRow(r.cells);
    const cm = matchCurriculum(idx, rr.grade, r.cells.skill ?? "", r.cells.standard ?? "");
    return { r, rr, cm };
  });
  const gradesInFile = new Set(read.map((x) => x.cm.skill?.grade).filter((g): g is number => g !== undefined));
  const { index: existing } = await duplicateIndex(repo, [...gradesInFile].flatMap((g) => idx.grades.get(g) ?? []).map((s) => s.id));
  const inFile = new DuplicateIndex();
  const rowOfStem = new Map<string, number>();

  const logs: Row[] = [];
  let valid = 0, invalid = 0, dups = 0;
  for (const [i, { r, rr, cm }] of read.entries()) {
    const errors = [...rr.errors, ...cm.errors];
    const warnings = [...rr.warnings, ...cm.warnings];
    const standardCode = cm.standard ? String(cm.standard.code) : null;
    const editor = rr.question ? toInput(rr.question, cm.skill?.id ?? "", standardCode, null) : null;
    if (editor && !errors.length) errors.push(...checkInput(idx, editor));
    let dup = editor && editor.stem ? existing.find(editor.stem, optionTexts(editor)) : null;
    const fileDup = editor && editor.stem ? inFile.find(editor.stem, optionTexts(editor)) : null;
    if (dup) warnings.push(dup.exact ? "This question already exists in the question bank." : `A similar question already exists in the question bank (${Math.round(dup.score * 100)}% similar).`);
    if (fileDup) warnings.push(`${fileDup.exact ? "Same question as" : "Very similar to"} row ${rowOfStem.get(fileDup.id)} in this file.`);
    if (editor?.stem) {
      inFile.add(`r${i}`, editor.stem, optionTexts(editor));
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
      },
    };
    logs.push({
      id: newId(), rowIndex: i, status, decision: status === "DUPLICATE" ? "SKIP" : "IMPORT", selected: status !== "INVALID",
      source: Object.values(r.cells).filter(Boolean).join(" | ").slice(0, 4000), detected,
      errors, warnings, // empty lists, never null: Prisma refuses a plain null in a JSON column
      duplicateOfId: dup?.id || null, similarity: dup ? Math.round(dup.score * 100) / 100 : null, createdAt: now, updatedAt: now,
    });
  }

  const notes = [
    `${parsed.rows.length} row(s) read from the ${kind === "xlsx" ? "Excel" : "CSV"} file`,
    "wrong-answer feedback is not part of the template: a standard message is used for wrong choices",
    ...(parsed.ignoredColumns.length ? [`column(s) not in the template were ignored: ${parsed.ignoredColumns.join(", ")}`] : []),
  ];
  let jobId: string;
  try {
    jobId = await repo.transaction(async (tx) => {
      const job = await tx.create("ImportJob", {
        kind: "QUESTIONS", status: "AWAITING_CONFIRMATION", fileName, uploadedById: actor.userId,
        totalRows: logs.length, validRows: valid, errorRows: invalid, duplicateRows: dups,
        fileSha256: createHash("sha256").update(input.bytes).digest("hex"), options: { kind, notes }, createdAt: now,
      });
      for (const l of logs) {
        l.jobId = job.id;
        const det = l.detected as DetectedRow;
        if (det.input) det.input.batch = String(job.id);
      }
      for (let i = 0; i < logs.length; i += LOG_BATCH) await tx.createMany("ImportedQuestionLog", logs.slice(i, i + LOG_BATCH));
      return String(job.id);
    });
  } catch (e) {
    const msg = `Database error while saving the preview: ${shortDbMessage(e)}`;
    return fail(kind, "save", msg, [msg]);
  }
  await audit(repo, { actorId: actor.userId, action: "question.import.analyze", entityType: "ImportJob", entityId: jobId, after: { fileName, kind, total: logs.length, valid, invalid, duplicates: dups }, at: now });
  return jobId;
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
  summary: { imported: number; replaced: number; skipped: number; failed: number } | null;
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

export async function getImportJob(repo: Repo, actor: Actor, jobId: string): Promise<ImportJobView> {
  assertCan(actor, "questions:edit");
  const job = await jobInSchool(repo, actor, jobId);
  const logs = (await repo.findMany("ImportedQuestionLog", { jobId })).sort((a, b) => Number(a.rowIndex) - Number(b.rowIndex));
  const dupIds = [...new Set(logs.map((l) => l.duplicateOfId).filter(Boolean))] as string[];
  const dupQs = new Map((dupIds.length ? await repo.findMany("Question", { id: { in: dupIds } }) : []).map((q) => [String(q.id), q]));
  const uploader = await repo.findUnique("User", { id: job.uploadedById });
  return { ...viewOf(job, String(uploader?.displayName ?? "")), rows: logs.map((l) => previewRow(l, dupQs)) };
}

export async function listImportJobs(repo: Repo, actor: Actor, limit = 30): Promise<Omit<ImportJobView, "rows">[]> {
  assertCan(actor, "questions:edit");
  const users = await repo.findMany("User", { schoolId: schoolOf(actor) }, { select: ["id", "displayName"] });
  const jobs = (await repo.findMany("ImportJob", { kind: "QUESTIONS", uploadedById: { in: users.map((u) => u.id) } }))
    .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime()).slice(0, limit);
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
  await editableJob(repo, actor, jobId);
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
    const input: EditorInput = { ...patch.input, imported: true, batch: jobId };
    const idx = await loadCurriculumIndex(repo, actor);
    const errors = checkInput(idx, input);
    const skill = skillById(idx, input.skillId);
    const { index } = await duplicateIndex(repo, skill ? (idx.grades.get(skill.grade) ?? []).map((s) => s.id) : []);
    const dup = errors.length ? null : index.find(input.stem, optionTexts(input));
    const std = input.standardCode ? idx.standards.get(shortStandard(input.standardCode)) : undefined;
    Object.assign(data, {
      detected: { input, meta: { ...prev.meta, grade: skill?.grade ?? prev.meta.grade, skillName: skill?.name ?? null, standardCode: std ? shortStandard(std.code) : null, duplicateExact: Boolean(dup?.exact) } } satisfies DetectedRow,
      errors,
      warnings: dup ? [dup.exact ? "This question already exists in the question bank." : `A similar question already exists in the question bank (${Math.round(dup.score * 100)}% similar).`] : [],
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

export interface CommitProgress { processed: number; total: number; done: boolean; counts: { imported: number; replaced: number; skipped: number; failed: number; duplicates: number } }

interface Planned { log: Row; input: EditorInput; item: BankItem; skill: SkillRef; standardId: string; passage: string | null; replaceId: string | null }

import { passageRef } from "./passages";

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
          id, externalRef: ref, title: `Imported passage: ${t.replace(/\s+/g, " ").split(" ").slice(0, 8).join(" ")}…`.slice(0, 190), body: t, genre: null, gradeLevel: grade, gradeBand: String(grade),
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
      const published = publish && p.item.type !== "SHORT_ANSWER";
      questions.push({
        id, externalRef: p.item.ref, skillId: p.skill.id, standardId: p.standardId, passageId: p.passage ? passageIds.get(passageRef(p.passage)) ?? null : null,
        typeId: types.get(p.item.type)!, stem: p.item.stem, content: contentPayload(p.item), hint: null, difficultyLevel: p.item.level,
        irtA: 1, irtB: LEVEL_TO_B[p.item.level] ?? 0, irtC: 0, estimatedSeconds: p.item.estimatedSeconds,
        status: published ? "PUBLISHED" : "DRAFT", origin: "IMPORTED", aiStatus: null, lessonId: null,
        tags: { ...(p.input.cognitiveLevel ? { cognitiveLevel: p.input.cognitiveLevel } : {}), importJob: jobId },
        createdById: actor.userId, ...(published ? { publishedAt: now, reviewedById: actor.userId } : {}), createdAt: now, updatedAt: now,
      });
      for (const [i, o] of (p.item.options ?? []).entries()) options.push({ id: newId(), questionId: id, label: o.label, text: o.text, isCorrect: o.correct, rationale: o.rationale, order: i });
      for (const [i, v] of answerValues(p.item).entries()) answers.push({ id: newId(), questionId: id, value: v as object, isPrimary: i === 0 });
      if (p.input.type === "SHORT_ANSWER" && p.input.answers?.[0]) answers.push({ id: newId(), questionId: id, value: p.input.answers[0], isPrimary: true });
      explanations.push({ id: newId(), questionId: id, kind: "WHY_CORRECT", body: [{ type: "text", text: p.item.explanation.whyCorrect }], order: 0 });
      audits.push({ actorId: actor.userId, action: "question.create", entityType: "Question", entityId: id, after: { ref: p.item.ref, skillId: p.skill.id, type: p.item.type, level: p.item.level, importJob: jobId, status: published ? "PUBLISHED" : "DRAFT" }, createdAt: now });
    }
    await tx.createMany("Question", questions);
    await tx.createMany("QuestionOption", options);
    await tx.createMany("QuestionAnswer", answers);
    await tx.createMany("QuestionExplanation", explanations);
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
  if (job.status === "FAILED") throw new ValidationError("This file could not be read. Fix the file and upload it again.");
  if (job.status === "CANCELLED" || job.status === "COMPLETED") throw new ValidationError("This import is already finished.");
  if (job.status === "AWAITING_CONFIRMATION") {
    await repo.updateMany("ImportJob", { id: jobId }, { status: "IMPORTING", options: { ...(parseJ<Record<string, unknown>>(job.options) ?? {}), publish: Boolean(opts.publish) } });
    await audit(repo, { actorId: actor.userId, action: "question.import.start", entityType: "ImportJob", entityId: jobId, after: { publish: Boolean(opts.publish) }, at: now });
  }
  const publish = Boolean(opts.publish ?? parseJ<{ publish?: boolean }>(job.options)?.publish) && can(actor, "questions:publish");
  const open = (await repo.findMany("ImportedQuestionLog", { jobId, status: { in: OPEN } })).sort((a, b) => Number(a.rowIndex) - Number(b.rowIndex)).slice(0, COMMIT_CHUNK);

  const skip: string[] = [];
  const failed: { id: string; errors: string[] }[] = [];
  const plans: Planned[] = [];
  const idx = open.length ? await loadCurriculumIndex(repo, actor) : null;
  for (const l of open) {
    const det = parseJ<DetectedRow>(l.detected);
    // rows with errors are reported as failed (with their reasons), never silently as skipped
    if (l.status === "INVALID" || !det.input) { failed.push({ id: String(l.id), errors: parseJ<string[] | null>(l.errors) ?? ["the question has errors"] }); continue; }
    if (!l.selected || l.decision === "SKIP") { skip.push(String(l.id)); continue; }
    const input = det.input;
    const problems = checkInput(idx!, input); // the curriculum may have changed since the preview
    if (problems.length) { failed.push({ id: String(l.id), errors: problems }); continue; }
    const skill = skillById(idx!, input.skillId)!;
    const std = idx!.standards.get(shortStandard(input.standardCode!))!;
    const item = buildBankItem(input, { ref: `T${skill.grade}-${randomBytes(4).toString("hex")}`, grade: skill.grade, skillCode: skill.code, standardCode: std.code, passageRef: null });
    plans.push({ log: l, input, item, skill, standardId: std.id, passage: det.meta?.passage ?? null, replaceId: l.decision === "REPLACE" && l.duplicateOfId ? String(l.duplicateOfId) : null });
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

  const count = (status: RowStatus) => repo.count("ImportedQuestionLog", { jobId, status });
  const [imported, replaced, skipped, failedN, remaining, total, duplicates] = await Promise.all([
    count("IMPORTED"), count("REPLACED"), count("SKIPPED"), count("FAILED"), repo.count("ImportedQuestionLog", { jobId, status: { in: OPEN } }),
    repo.count("ImportedQuestionLog", { jobId }), Promise.resolve(Number(job.duplicateRows ?? 0)),
  ]);
  const counts = { imported, replaced, skipped, failed: failedN, duplicates };
  const done = remaining === 0;
  if (done) {
    const failedLogs = failedN ? (await repo.findMany("ImportedQuestionLog", { jobId, status: "FAILED" })).sort((a, b) => Number(a.rowIndex) - Number(b.rowIndex)) : [];
    const errors = failedLogs.slice(0, 500).map((l) => ({ row: Number(parseJ<DetectedRow>(l.detected)?.meta?.row ?? Number(l.rowIndex) + 2), message: (parseJ<string[] | null>(l.errors) ?? []).join(" ") }));
    await repo.updateMany("ImportJob", { id: jobId }, { status: "COMPLETED", completedAt: now, summary: { imported, replaced, skipped, failed: failedN }, errors });
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
