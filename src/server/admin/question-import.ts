/**
 * Question-bank importer (admins and teachers), integrated with the existing question bank.
 *
 *   upload → extract (CSV, Excel, Word, PDF, JSON, TXT) → parse (rules; AI for unreadable files)
 *          → map to grade / skill / standard / lesson (file columns, AI, or the chosen defaults)
 *          → validate with the bank validator → duplicate check (bank and file)
 *          → ImportJob (kind QUESTIONS) + one ImportedQuestionLog per question  [preview]
 *   preview: edit any question, select which to import, choose Skip / Replace / Import anyway
 *   commit (in chunks, for a progress bar): questions are created through createDraft, the same
 *   path as the editor, so every rule of the bank applies; origin IMPORTED, status DRAFT
 *   (or PUBLISHED when an admin chooses to approve on import).
 *
 * Privacy: text sent to the AI is redacted first (the school's student names, usernames and
 * student numbers are replaced), and the AI modules never see the database.
 */
import { createHash } from "node:crypto";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import type { AiProvider } from "../ai/question-generator";
import { classifyWithAi, extractWithAi, redact, type CurriculumSkill } from "../ai/question-understanding";
import { ExtractError, extract, type FileKind } from "../../imports/questions/extract";
import { buildQuestion, parseJson, parseLines, parseTable, type DetectedQuestion } from "../../imports/questions/parse";
import { checkQuestion, createDraft, type EditorInput } from "./questions";
import { schoolOf } from "./users";

export type ImportDecision = "IMPORT" | "SKIP" | "REPLACE" | "FORCE";
export type RowStatus = "VALID" | "INVALID" | "DUPLICATE" | "IMPORTED" | "REPLACED" | "SKIPPED" | "FAILED";

export interface ImportDefaults { gradeLevel: number; skillId?: string | null; standardId?: string | null; level?: number | null }

/** What the preview shows for one question (stored as ImportedQuestionLog.detected). */
export interface DetectedRow {
  input: EditorInput | null;
  meta: { grade: number | null; subject: string | null; unit: string | null; lesson: string | null; skillText: string | null; standardText: string | null; aiSuggestedAnswer: boolean };
}

export const DUPLICATE_THRESHOLD = 0.75;
/** the question text alone this similar = the same question (even with different options) */
export const SAME_STEM_THRESHOLD = 0.9;
const CHUNK = 20;

// ------------------------------------------------------------------- helpers

const norm = (s: string) => s.toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => new Set(norm(s).split(" ").filter(Boolean));
export function similarity(a: string, b: string): number {
  if (norm(a) === norm(b)) return 1;
  const x = tokens(a), y = tokens(b);
  let i = 0;
  for (const w of x) if (y.has(w)) i++;
  return i / (x.size + y.size - i || 1);
}
const fingerprint = (stem: string, options: string[] = []) => [stem, ...options].join(" ");
const shortStd = (c: string) => c.replace(/^CCSS\.ELA-LITERACY\./i, "").trim().toUpperCase();

async function jobInSchool(repo: Repo, actor: Actor, jobId: string): Promise<Row> {
  const job = await repo.findUnique("ImportJob", { id: jobId });
  if (!job || job.kind !== "QUESTIONS") throw new ForbiddenError("Import not found.");
  const uploader = await repo.findUnique("User", { id: job.uploadedById });
  if (!uploader || uploader.schoolId !== schoolOf(actor)) throw new ForbiddenError("Import not found.");
  return job;
}

interface Curriculum {
  grade: number;
  skills: (CurriculumSkill & { id: string; standardRows: { id: string; code: string; isPrimary: boolean }[]; lessonIds: string[] })[];
  lessons: { id: string; code: string; title: string }[];
}

async function curriculumFor(repo: Repo, actor: Actor, gradeLevel: number): Promise<Curriculum> {
  const grade = (await repo.findMany("Grade", { schoolId: schoolOf(actor), level: gradeLevel }))[0];
  if (!grade) throw new ValidationError(`Grade ${gradeLevel} is not set up for this school.`);
  const curricula = await repo.findMany("Curriculum", { gradeId: grade.id });
  const skills = curricula.length ? (await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) } })).filter((s) => !s.deletedAt) : [];
  const links = skills.length ? await repo.findMany("SkillStandard", { skillId: { in: skills.map((s) => s.id) } }) : [];
  const stds = links.length ? await repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => l.standardId))] } }) : [];
  const ls = skills.length ? await repo.findMany("LessonSkill", { skillId: { in: skills.map((s) => s.id) } }) : [];
  const units = curricula.length ? await repo.findMany("Unit", { curriculumId: { in: curricula.map((c) => c.id) } }) : [];
  const lessons = units.length ? (await repo.findMany("Lesson", { unitId: { in: units.map((u) => u.id) } })).filter((l) => !l.deletedAt) : [];
  return {
    grade: gradeLevel,
    lessons: lessons.map((l) => ({ id: String(l.id), code: String(l.code), title: String(l.title) })),
    skills: skills.map((s) => {
      const rows = links.filter((l) => l.skillId === s.id).map((l) => ({ id: String(l.standardId), code: String(stds.find((d) => d.id === l.standardId)?.code ?? ""), isPrimary: Boolean(l.isPrimary) })).filter((r) => r.code);
      return { id: String(s.id), code: String(s.code), name: String(s.name), standards: rows.map((r) => shortStd(r.code)), standardRows: rows, lessonIds: ls.filter((x) => x.skillId === s.id).map((x) => String(x.lessonId)) };
    }),
  };
}

function findSkill(cur: Curriculum, text: string | null | undefined) {
  if (!text) return undefined;
  const t = text.trim().toLowerCase();
  return cur.skills.find((s) => s.code.toLowerCase() === t) ?? cur.skills.find((s) => s.code.toLowerCase().endsWith(`.${t}`)) ?? cur.skills.find((s) => s.name.toLowerCase() === t)
    ?? cur.skills.find((s) => t.length >= 4 && (s.name.toLowerCase().includes(t) || t.includes(s.name.toLowerCase())));
}

/** Personal data of the school's students, to redact from anything sent to the AI. */
async function personalStrings(repo: Repo, actor: Actor): Promise<string[]> {
  const users = await repo.findMany("User", { schoolId: schoolOf(actor) });
  const students = await repo.findMany("Student", { userId: { in: users.map((u) => u.id) } });
  const out = new Set<string>();
  for (const u of users) {
    if (u.role !== "STUDENT" && u.role !== "PARENT") continue;
    out.add(String(u.username));
    const name = String(u.displayName ?? "");
    out.add(name);
    for (const part of name.split(/\s+/)) if (part.length >= 4) out.add(part);
  }
  for (const s of students) out.add(String(s.studentNumber ?? ""));
  return [...out].filter((x) => x.length >= 3);
}

// --------------------------------------------------------------- conversion

function toInput(q: DetectedQuestion, skillId: string, standardCode: string | null, lessonId: string | null, warnings: string[]): EditorInput {
  const level = q.level ?? 4;
  if (q.level === undefined) warnings.push("no difficulty in the file: set to level 4 (medium)");
  const correctText = q.options?.filter((o) => o.correct).map((o) => o.text).join(", ") ?? (q.answer !== undefined ? String(q.answer) : q.answers?.[0] ?? "");
  let whyCorrect = q.explanation?.trim() ?? "";
  if (!whyCorrect) {
    whyCorrect = correctText ? `The correct answer is “${correctText}”.` : "See the correct answer.";
    warnings.push("no explanation in the file: a generic one was added — improve it before approving");
  }
  let generic = false;
  const options = q.options?.map((o) => {
    const rationale = o.correct ? null : (o as { rationale?: string | null }).rationale ?? null;
    if (!o.correct && !rationale) generic = true;
    return { label: o.label, text: o.text, correct: o.correct, rationale: o.correct ? null : rationale ?? "This is not the correct answer." };
  });
  if (generic) warnings.push("generic feedback added for wrong answers — improve it before approving");
  return {
    skillId, type: q.type, stem: q.stem, level, standardCode, lessonId, whyCorrect, tip: q.tip ?? null, cognitiveLevel: q.cognitiveLevel ?? null,
    options, answer: q.answer, answers: q.answers, sequence: q.sequence, segments: q.segments, errorIndex: q.errorIndex, correction: q.correction, pairs: q.pairs, imported: true,
  };
}

interface Existing { id: string; stem: string; text: string }
async function existingQuestions(repo: Repo, actor: Actor, cur: Curriculum): Promise<Existing[]> {
  const qs = cur.skills.length ? (await repo.findMany("Question", { skillId: { in: cur.skills.map((s) => s.id) } })).filter((q) => !q.deletedAt && q.status !== "ARCHIVED") : [];
  const opts = qs.length ? await repo.findMany("QuestionOption", { questionId: { in: qs.map((q) => q.id) } }) : [];
  void actor;
  return qs.map((q) => ({ id: String(q.id), stem: String(q.stem), text: fingerprint(String(q.stem), opts.filter((o) => o.questionId === q.id).map((o) => String(o.text))) }));
}

function bestDuplicate(stem: string, text: string, existing: Existing[]): { id: string; score: number } | null {
  let best: { id: string; score: number } | null = null;
  for (const e of existing) {
    const whole = similarity(text, e.text);
    const stemOnly = similarity(stem, e.stem);
    const s = Math.max(whole, stemOnly >= SAME_STEM_THRESHOLD ? stemOnly : 0);
    if ((whole >= DUPLICATE_THRESHOLD || stemOnly >= SAME_STEM_THRESHOLD) && (!best || s > best.score)) best = { id: e.id, score: s };
  }
  return best;
}

// ------------------------------------------------------------------- analyze

export interface AnalyzeInput { fileName: string; bytes: Uint8Array; defaults: ImportDefaults; useAi: boolean }

export async function analyzeImport(repo: Repo, actor: Actor, input: AnalyzeInput, provider: AiProvider | null, now = new Date()): Promise<string> {
  assertCan(actor, "questions:edit");
  const fileName = input.fileName.replace(/[\\/]/g, "_").slice(0, 200) || "upload";
  let ex;
  try {
    ex = await extract(fileName, input.bytes);
  } catch (e) {
    if (e instanceof ExtractError) throw new ValidationError(e.message);
    throw new ValidationError(`The file could not be read: ${(e as Error).message}`);
  }
  const notes = [...ex.notes];
  let parsed = ex.table ? parseTable(ex.table) : ex.json !== undefined ? parseJson(ex.json) : parseLines(ex.lines ?? []);
  const personal = await personalStrings(repo, actor);
  let redactions = 0;
  const ai = input.useAi && provider ? provider : null;
  let aiUsed = false;

  // files the rules cannot read (nothing found, or everything found is broken): let the AI read them
  const rulesFailed = !parsed.questions.length || parsed.questions.every((q) => q.problems.length > 0);
  if (rulesFailed && ai) {
    const raw = ex.lines?.join("\n") ?? ex.table?.map((r) => r.join(" | ")).join("\n") ?? JSON.stringify(ex.json ?? "");
    const r = redact(raw, personal);
    redactions += r.count;
    const found = await extractWithAi(ai, r.text);
    aiUsed = true;
    if (found.length || !parsed.questions.length) parsed = {
      problems: found.length ? [] : ["the AI found no questions in this file"],
      questions: found.map((f) => buildQuestion({
        source: String(f.stem ?? "").slice(0, 2000), stem: String(f.stem ?? ""), options: Array.isArray((f as { options?: unknown }).options) ? ((f as { options: unknown[] }).options).map(String) : [],
        answer: String((f as { answer?: unknown }).answer ?? ""), explanation: f.explanation, typeHint: f.type, level: String((f as { difficulty?: unknown }).difficulty ?? ""),
        grade: String(f.grade ?? ""), unit: f.unit, skill: f.skill, standard: f.standard, pairs: f.pairs,
      })),
    };
    notes.push("questions found by AI (the file had no recognizable layout)");
  }
  if (!parsed.questions.length) throw new ValidationError(`No questions were found. ${parsed.problems.join("; ")}${!ai ? " Turn on “Use AI to read the file” for unusual layouts." : ""}`);
  if (parsed.questions.length > 500) throw new ValidationError("This file has more than 500 questions. Split it into smaller files.");

  // curriculum for each grade that appears (detected per question, else the default)
  const gradeOf = (q: DetectedQuestion) => (q.grade && [4, 5, 6].includes(q.grade) ? q.grade : input.defaults.gradeLevel);
  const curricula = new Map<number, Curriculum>();
  for (const g of new Set(parsed.questions.map(gradeOf))) curricula.set(g, await curriculumFor(repo, actor, g));
  const defaultSkill = input.defaults.skillId ? curricula.get(input.defaults.gradeLevel)?.skills.find((s) => s.id === input.defaults.skillId) : undefined;
  if (input.defaults.skillId && !defaultSkill) throw new ValidationError("The default skill is not in the chosen grade.");

  // AI: map to skills/standards, difficulty, feedback (only where the file does not say)
  if (ai) {
    for (const [g, cur] of curricula) {
      const need = parsed.questions.map((q, index) => ({ index, q })).filter(({ q }) => gradeOf(q) === g && (!findSkill(cur, q.skill) || q.level === undefined || !q.explanation || q.options?.some((o) => !o.correct) || !q.options?.some((o) => o.correct)));
      for (let i = 0; i < need.length; i += 20) {
        const batch = need.slice(i, i + 20).map(({ index, q }) => {
          const r1 = redact(q.stem, personal);
          redactions += r1.count;
          return { index, q: { ...q, stem: r1.text, options: q.options?.map((o) => ({ ...o, text: redact(o.text, personal).text })) } };
        });
        const results = await classifyWithAi(ai, g, cur.skills, batch);
        aiUsed = true;
        for (const r of results) {
          const q = parsed.questions[r.index];
          if (!q) continue;
          if (!findSkill(cur, q.skill) && r.skillCode && findSkill(cur, r.skillCode)) q.skill = r.skillCode;
          if (!q.standard && r.standardCode) q.standard = r.standardCode;
          if (q.level === undefined && r.level) q.level = r.level;
          if (!q.cognitiveLevel && r.cognitiveLevel) q.cognitiveLevel = r.cognitiveLevel;
          if (!q.explanation && r.explanation) q.explanation = r.explanation;
          if (q.options && r.rationales) q.options = q.options.map((o) => (o.correct ? o : { ...o, rationale: (o as { rationale?: string }).rationale ?? r.rationales?.[o.label] ?? undefined }));
          if (q.options && !q.options.some((o) => o.correct) && r.suggestedAnswer) {
            const idx = "ABCDEFGH".indexOf(r.suggestedAnswer.trim().toUpperCase().charAt(0));
            if (idx >= 0 && idx < q.options.length) {
              q.options = q.options.map((o, k) => ({ ...o, correct: k === idx }));
              q.problems = q.problems.filter((p) => !/no correct answer/.test(p));
              (q as DetectedQuestion & { aiAnswer?: boolean }).aiAnswer = true;
            }
          }
        }
      }
    }
  }

  // convert, validate, check duplicates
  const existingByGrade = new Map<number, Existing[]>();
  for (const [g, cur] of curricula) existingByGrade.set(g, await existingQuestions(repo, actor, cur));
  const seen: { row: number; stem: string; text: string }[] = [];
  const rows: Row[] = [];
  let valid = 0, invalid = 0, dups = 0;
  for (let i = 0; i < parsed.questions.length; i++) {
    const q = parsed.questions[i];
    const g = gradeOf(q);
    const cur = curricula.get(g)!;
    const errors = [...q.problems];
    const warnings: string[] = [];
    if (q.grade && ![4, 5, 6].includes(q.grade)) warnings.push(`grade ${q.grade} in the file is not taught on this platform: grade ${g} used`);
    if (q.subject && !/english|ela|language|reading|literacy|writing|grammar/i.test(q.subject)) warnings.push(`subject “${q.subject}” is not English Language Arts`);
    if ((q as DetectedQuestion & { aiAnswer?: boolean }).aiAnswer) warnings.push("the file had no correct answer: the AI suggested one — check it");
    if (q.type === "SHORT_ANSWER") warnings.push("short-answer questions are teacher-scored and are not used in adaptive practice");
    const skill = findSkill(cur, q.skill) ?? (g === input.defaults.gradeLevel ? defaultSkill : undefined);
    if (q.skill && !findSkill(cur, q.skill)) warnings.push(`skill “${q.skill}” not found in grade ${g}${skill ? `: default skill “${skill.name}” used` : ""}`);
    let standardCode: string | null = null;
    let input2: EditorInput | null = null;
    if (!skill) errors.push(`choose a skill (grade ${g})`);
    else {
      const wanted = q.standard ? shortStd(q.standard) : null;
      const linked = wanted ? skill.standardRows.find((s) => shortStd(s.code) === wanted) : undefined;
      if (wanted && !linked) warnings.push(`standard ${wanted} is not linked to “${skill.name}”: the skill’s main standard was used`);
      const def = input.defaults.standardId ? skill.standardRows.find((s) => s.id === input.defaults.standardId) : undefined;
      standardCode = (linked ?? def ?? skill.standardRows.find((s) => s.isPrimary) ?? skill.standardRows[0])?.code ?? null;
      const lesson = q.lesson ? cur.lessons.find((l) => skill.lessonIds.includes(l.id) && (l.code.toLowerCase() === q.lesson!.toLowerCase() || l.title.toLowerCase() === q.lesson!.toLowerCase())) : undefined;
      if (q.level === undefined && input.defaults.level) q.level = input.defaults.level;
      input2 = toInput(q, skill.id, standardCode, lesson?.id ?? null, warnings);
      if (!errors.length) errors.push(...(await checkQuestion(repo, actor, input2)));
    }
    const text = fingerprint(q.stem, q.options?.map((o) => o.text));
    const dup = bestDuplicate(q.stem, text, existingByGrade.get(g)!);
    const inFile = seen.find((s) => similarity(s.text, text) >= DUPLICATE_THRESHOLD || similarity(s.stem, q.stem) >= SAME_STEM_THRESHOLD);
    if (inFile) warnings.push(`same as question ${inFile.row + 1} in this file`);
    seen.push({ row: i, stem: q.stem, text });
    const status: RowStatus = errors.length ? "INVALID" : dup || inFile ? "DUPLICATE" : "VALID";
    if (status === "VALID") valid++;
    else if (status === "INVALID") invalid++;
    else dups++;
    const detected: DetectedRow = {
      input: input2,
      meta: { grade: g, subject: q.subject ?? null, unit: q.unit ?? null, lesson: q.lesson ?? null, skillText: q.skill ?? null, standardText: q.standard ?? null, aiSuggestedAnswer: Boolean((q as { aiAnswer?: boolean }).aiAnswer) },
    };
    rows.push({
      rowIndex: i, status, decision: status === "DUPLICATE" ? "SKIP" : "IMPORT", selected: status !== "INVALID", source: q.source, detected,
      errors: errors.length ? errors : null, warnings: warnings.length ? warnings : null, duplicateOfId: dup?.id ?? null, similarity: dup ? Math.round(dup.score * 100) / 100 : inFile ? 1 : null,
    });
  }
  const job = await repo.create("ImportJob", {
    kind: "QUESTIONS", status: "AWAITING_CONFIRMATION", fileName, uploadedById: actor.userId,
    totalRows: rows.length, validRows: valid, errorRows: invalid, duplicateRows: dups,
    fileSha256: createHash("sha256").update(input.bytes).digest("hex"),
    options: { kind: ex.kind as FileKind, defaults: input.defaults, useAi: input.useAi, aiUsed, redactions, notes }, createdAt: now,
  });
  for (const r of rows) await repo.create("ImportedQuestionLog", { ...r, jobId: job.id, createdAt: now, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "question.import.analyze", entityType: "ImportJob", entityId: String(job.id), after: { fileName, kind: ex.kind, total: rows.length, valid, invalid, duplicates: dups, aiUsed, redactions }, at: now });
  return String(job.id);
}

// ------------------------------------------------------------------- preview

export interface PreviewRow {
  id: string; rowIndex: number; status: RowStatus; decision: ImportDecision; selected: boolean; source: string;
  detected: DetectedRow; errors: string[]; warnings: string[]; duplicate: { id: string; stem: string; status: string; similarity: number } | null; questionId: string | null;
}
export interface ImportJobView {
  id: string; fileName: string; status: string; kind: string; createdAt: string; uploadedBy: string;
  totals: { total: number; valid: number; invalid: number; duplicates: number };
  summary: { imported: number; replaced: number; skipped: number; failed: number } | null;
  options: { aiUsed?: boolean; redactions?: number; notes?: string[]; defaults?: ImportDefaults };
  rows: PreviewRow[];
}

const parseJ = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

export async function getImportJob(repo: Repo, actor: Actor, jobId: string): Promise<ImportJobView> {
  assertCan(actor, "questions:edit");
  const job = await jobInSchool(repo, actor, jobId);
  const logs = (await repo.findMany("ImportedQuestionLog", { jobId })).sort((a, b) => Number(a.rowIndex) - Number(b.rowIndex));
  const dupIds = [...new Set(logs.map((l) => l.duplicateOfId).filter(Boolean))] as string[];
  const dupQs = dupIds.length ? await repo.findMany("Question", { id: { in: dupIds } }) : [];
  const uploader = await repo.findUnique("User", { id: job.uploadedById });
  return {
    id: String(job.id), fileName: String(job.fileName), status: String(job.status), kind: String(parseJ<{ kind?: string }>(job.options)?.kind ?? ""),
    createdAt: new Date(String(job.createdAt)).toISOString(), uploadedBy: String(uploader?.displayName ?? ""),
    totals: { total: Number(job.totalRows), valid: Number(job.validRows), invalid: Number(job.errorRows), duplicates: Number(job.duplicateRows) },
    summary: job.summary ? parseJ(job.summary) : null, options: parseJ(job.options) ?? {},
    rows: logs.map((l) => {
      const d = l.duplicateOfId ? dupQs.find((q) => q.id === l.duplicateOfId) : undefined;
      return {
        id: String(l.id), rowIndex: Number(l.rowIndex), status: l.status as RowStatus, decision: l.decision as ImportDecision, selected: Boolean(l.selected), source: String(l.source),
        detected: parseJ<DetectedRow>(l.detected), errors: parseJ<string[] | null>(l.errors) ?? [], warnings: parseJ<string[] | null>(l.warnings) ?? [],
        duplicate: d ? { id: String(d.id), stem: String(d.stem), status: String(d.status), similarity: Number(l.similarity ?? 0) } : null,
        questionId: l.questionId ? String(l.questionId) : null,
      };
    }),
  };
}

export async function listImportJobs(repo: Repo, actor: Actor, limit = 30): Promise<Omit<ImportJobView, "rows">[]> {
  assertCan(actor, "questions:edit");
  const users = await repo.findMany("User", { schoolId: schoolOf(actor) });
  const jobs = (await repo.findMany("ImportJob", { kind: "QUESTIONS", uploadedById: { in: users.map((u) => u.id) } }))
    .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime()).slice(0, limit);
  return jobs.map((job) => ({
    id: String(job.id), fileName: String(job.fileName), status: String(job.status), kind: String(parseJ<{ kind?: string }>(job.options)?.kind ?? ""),
    createdAt: new Date(String(job.createdAt)).toISOString(), uploadedBy: String(users.find((u) => u.id === job.uploadedById)?.displayName ?? ""),
    totals: { total: Number(job.totalRows), valid: Number(job.validRows), invalid: Number(job.errorRows), duplicates: Number(job.duplicateRows) },
    summary: job.summary ? parseJ(job.summary) : null, options: parseJ(job.options) ?? {},
  }));
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
  if (patch.selected !== undefined) data.selected = Boolean(patch.selected);
  if (patch.input) {
    const input: EditorInput = { ...patch.input, imported: true };
    const errors = await checkQuestion(repo, actor, input);
    const prev = parseJ<DetectedRow>(row.detected);
    const skill = await repo.findUnique("Skill", { id: input.skillId });
    const cur = skill ? await repo.findUnique("Curriculum", { id: skill.curriculumId }) : null;
    const grade = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
    const existing = grade ? await existingQuestions(repo, actor, await curriculumFor(repo, actor, Number(grade.level))) : [];
    const dup = bestDuplicate(input.stem, fingerprint(input.stem, input.options?.map((o) => o.text)), existing);
    Object.assign(data, {
      detected: { ...prev, input }, errors: errors.length ? errors : null, duplicateOfId: dup?.id ?? null, similarity: dup ? Math.round(dup.score * 100) / 100 : null,
      status: errors.length ? "INVALID" : dup ? "DUPLICATE" : "VALID",
      ...(errors.length ? { selected: false } : patch.selected === undefined && row.status === "INVALID" ? { selected: true } : {}),
      ...(!dup && (row.decision === "REPLACE" || row.decision === "SKIP") && !patch.decision ? { decision: "IMPORT" } : {}),
    });
  }
  await repo.updateMany("ImportedQuestionLog", { id: rowId }, data);
  await recount(repo, jobId);
  return (await getImportJob(repo, actor, jobId)).rows.find((r) => r.id === rowId)!;
}

export async function selectAll(repo: Repo, actor: Actor, jobId: string, selected: boolean): Promise<void> {
  await editableJob(repo, actor, jobId);
  const logs = await repo.findMany("ImportedQuestionLog", { jobId });
  for (const l of logs) if (l.status !== "INVALID" || !selected) await repo.updateMany("ImportedQuestionLog", { id: l.id }, { selected });
}

async function recount(repo: Repo, jobId: string) {
  const logs = await repo.findMany("ImportedQuestionLog", { jobId });
  await repo.updateMany("ImportJob", { id: jobId }, {
    validRows: logs.filter((l) => l.status === "VALID").length, errorRows: logs.filter((l) => l.status === "INVALID").length, duplicateRows: logs.filter((l) => l.status === "DUPLICATE").length,
  });
}

export async function cancelImport(repo: Repo, actor: Actor, jobId: string, now = new Date()): Promise<void> {
  await editableJob(repo, actor, jobId);
  await repo.updateMany("ImportJob", { id: jobId }, { status: "CANCELLED", completedAt: now });
  await audit(repo, { actorId: actor.userId, action: "question.import.cancel", entityType: "ImportJob", entityId: jobId, at: now });
}

// -------------------------------------------------------------------- commit

export interface CommitProgress { processed: number; total: number; done: boolean; counts: { imported: number; replaced: number; skipped: number; failed: number; duplicates: number } }

/**
 * Imports the next chunk of the job (call repeatedly until done; the page shows a progress bar).
 * publish=true approves questions on import (needs questions:publish; teacher-scored types stay drafts).
 */
export async function commitImportChunk(repo: Repo, actor: Actor, jobId: string, opts: { publish?: boolean } = {}, now = new Date()): Promise<CommitProgress> {
  assertCan(actor, "questions:edit");
  if (opts.publish) assertCan(actor, "questions:publish");
  const job = await jobInSchool(repo, actor, jobId);
  if (job.status === "CANCELLED" || job.status === "COMPLETED") throw new ValidationError("This import is already finished.");
  if (job.status === "AWAITING_CONFIRMATION") {
    await repo.updateMany("ImportJob", { id: jobId }, { status: "IMPORTING", options: { ...(parseJ<Record<string, unknown>>(job.options) ?? {}), publish: Boolean(opts.publish) } });
    await audit(repo, { actorId: actor.userId, action: "question.import.start", entityType: "ImportJob", entityId: jobId, after: { publish: Boolean(opts.publish) }, at: now });
  }
  const publish = Boolean(opts.publish ?? parseJ<{ publish?: boolean }>(job.options)?.publish);
  const logs = (await repo.findMany("ImportedQuestionLog", { jobId })).sort((a, b) => Number(a.rowIndex) - Number(b.rowIndex));
  const open = logs.filter((l) => ["VALID", "INVALID", "DUPLICATE"].includes(String(l.status)));
  for (const l of open.slice(0, CHUNK)) {
    const det = parseJ<DetectedRow>(l.detected);
    const errs = parseJ<string[] | null>(l.errors) ?? [];
    if (!l.selected || (l.status === "DUPLICATE" && l.decision === "SKIP") || l.decision === "SKIP") {
      await repo.updateMany("ImportedQuestionLog", { id: l.id }, { status: "SKIPPED", updatedAt: now });
      continue;
    }
    if (l.status === "INVALID" || !det.input) {
      await repo.updateMany("ImportedQuestionLog", { id: l.id }, { status: "FAILED", errors: errs.length ? errs : ["the question has errors"], updatedAt: now });
      continue;
    }
    try {
      const qid = await createDraft(repo, actor, { ...det.input, imported: true, batch: jobId }, now);
      let status: RowStatus = "IMPORTED";
      if (l.decision === "REPLACE" && l.duplicateOfId) {
        const old = await repo.findUnique("Question", { id: l.duplicateOfId });
        if (old && old.status !== "ARCHIVED") {
          await repo.updateMany("Question", { id: old.id }, { status: "ARCHIVED", updatedAt: now });
          await audit(repo, { actorId: actor.userId, action: "question.import.replace", entityType: "Question", entityId: String(old.id), before: { status: old.status }, after: { status: "ARCHIVED", replacedBy: qid }, at: now });
        }
        status = "REPLACED";
      }
      if (publish && det.input.type !== "SHORT_ANSWER") {
        await repo.updateMany("Question", { id: qid }, { status: "PUBLISHED", publishedAt: now, reviewedById: actor.userId, updatedAt: now });
        await audit(repo, { actorId: actor.userId, action: "question.import.publish", entityType: "Question", entityId: qid, after: { status: "PUBLISHED", job: jobId }, at: now });
      }
      await repo.updateMany("ImportedQuestionLog", { id: l.id }, { status, questionId: qid, updatedAt: now });
    } catch (e) {
      if (!(e instanceof ValidationError) && !(e instanceof ForbiddenError)) throw e;
      await repo.updateMany("ImportedQuestionLog", { id: l.id }, { status: "FAILED", errors: [(e as Error).message], updatedAt: now });
    }
  }
  const after = await repo.findMany("ImportedQuestionLog", { jobId });
  const counts = {
    imported: after.filter((l) => l.status === "IMPORTED").length, replaced: after.filter((l) => l.status === "REPLACED").length,
    skipped: after.filter((l) => l.status === "SKIPPED").length, failed: after.filter((l) => l.status === "FAILED").length,
    duplicates: after.filter((l) => l.duplicateOfId || Number(l.similarity) === 1).length,
  };
  const processed = after.filter((l) => !["VALID", "INVALID", "DUPLICATE"].includes(String(l.status))).length;
  const done = processed === after.length;
  if (done) {
    await repo.updateMany("ImportJob", { id: jobId }, { status: "COMPLETED", completedAt: now, summary: { imported: counts.imported, replaced: counts.replaced, skipped: counts.skipped, failed: counts.failed } });
    await audit(repo, { actorId: actor.userId, action: "question.import.complete", entityType: "ImportJob", entityId: jobId, after: counts, at: now });
  }
  return { processed, total: after.length, done, counts };
}



/** Grades and skills for the upload form's defaults (curriculum only). */
export async function importChoices(repo: Repo, actor: Actor): Promise<{ level: number; skills: { id: string; code: string; name: string }[] }[]> {
  assertCan(actor, "questions:edit");
  const out = [];
  for (const g of (await repo.findMany("Grade", { schoolId: schoolOf(actor) })).sort((a, b) => Number(a.level) - Number(b.level))) {
    const cur = await curriculumFor(repo, actor, Number(g.level));
    out.push({ level: cur.grade, skills: cur.skills.map((s) => ({ id: s.id, code: s.code, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)) });
  }
  return out;
}
