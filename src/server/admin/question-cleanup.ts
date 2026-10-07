/**
 * ONE-TIME cleanup of the whole question bank (run from the command line, never from the web app).
 *
 *   report   counts everything that would change, and everything that must NOT change
 *   backup   every question with all its parts (JSON, complete) + an Excel copy in the import template
 *   execute  deletes all questions; needs the confirmation code DELETE-<count> from the report, and
 *            --include-practice-history if any student has practised (that data would be orphaned)
 *   verify   after execute: 0 questions left; curriculum, users, classes, passages unchanged
 *   restore  puts every question back from the JSON backup
 */
import type { Repo, Row } from "../seeding/repo";
import { purgeQuestionRows } from "./question-delete";

const s = (v: unknown) => String(v ?? "");
const CHUNK = 200;
const chunks = <T,>(xs: T[], n = CHUNK) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Rows that are deleted with the questions. */
export const QUESTION_TABLES = ["Question", "QuestionOption", "QuestionAnswer", "QuestionExplanation", "QuestionStats", "AssessmentQuestion", "QuestionImage"] as const;
/** Columns that only point at a question: cleared (set empty), the row itself stays. */
export const CLEARED_REFERENCES: [string, string][] = [["PracticeSession", "currentQuestionId"], ["AdaptiveDecisionLog", "questionId"], ["AdaptiveDecisionLog", "nextQuestionId"], ["ImportedQuestionLog", "questionId"], ["ImportedQuestionLog", "duplicateOfId"]];
/** Student practice history; deleted ONLY with --include-practice-history (dependents first). */
export const PRACTICE_TABLES = ["InterventionAlert", "Recommendation", "StudentBadge", "XpEvent", "StudentDailyActivity", "ClassSkillDaily", "AbilitySnapshot", "StudentAbility", "StudentSkillMastery", "DiagnosticResult", "QuestionAttempt", "AdaptiveDecisionLog", "PracticeSession"] as const;
/** Must be exactly the same before and after. */
export const KEPT_TABLES = ["School", "Grade", "Curriculum", "Book", "Unit", "Lesson", "Skill", "SkillFamily", "SkillStandard", "Standard", "UnitSkill", "LessonSkill", "SkillPrerequisite", "User", "Teacher", "Student", "Parent", "Class", "ClassMembership", "ClassTeacher", "ReadingPassage", "Assignment", "AssignmentStudent", "Notification", "Assessment", "ImportJob", "ImportedQuestionLog"] as const;

export interface CleanupReport {
  questions: number;
  byStatus: Record<string, number>;
  deleted: Record<string, number>;
  cleared: Record<string, number>;
  practice: Record<string, number>;
  kept: Record<string, number>;
  confirmCode: string;
  needsPracticeFlag: boolean;
}

export async function cleanupReport(repo: Repo): Promise<CleanupReport> {
  const count = async (t: string, w: Record<string, unknown> = {}) => repo.count(t, w);
  const [deleted, cleared, practice, kept] = await Promise.all([
    Promise.all(QUESTION_TABLES.map(async (t) => [t, await count(t)] as const)),
    Promise.all(CLEARED_REFERENCES.map(async ([t, c]) => [`${t}.${c}`, await count(t, { [c]: { not: null } })] as const)),
    Promise.all(PRACTICE_TABLES.map(async (t) => [t, await count(t)] as const)),
    Promise.all(KEPT_TABLES.map(async (t) => [t, await count(t)] as const)),
  ]);
  const statuses = ["DRAFT", "UNDER_REVIEW", "PUBLISHED", "ARCHIVED"];
  const byStatus = Object.fromEntries(await Promise.all(statuses.map(async (st) => [st, await count("Question", { status: st })] as const)));
  const questions = deleted.find(([t]) => t === "Question")![1];
  const practiceMap = Object.fromEntries(practice);
  return {
    questions, byStatus, deleted: Object.fromEntries(deleted), cleared: Object.fromEntries(cleared), practice: practiceMap, kept: Object.fromEntries(kept),
    confirmCode: `DELETE-${questions}`, needsPracticeFlag: Number(practiceMap.QuestionAttempt ?? 0) > 0 || Number(practiceMap.PracticeSession ?? 0) > 0,
  };
}

// ------------------------------------------------------------------ backup

export interface QuestionBackup { format: "alanjal-question-backup"; version: 1; createdAt: string; counts: Record<string, number>; tables: Record<string, Row[]> }

/** Every question and its parts, ready to restore. Images are included (base64). */
export async function backupQuestions(repo: Repo, now = new Date()): Promise<QuestionBackup> {
  const questions = await repo.findMany("Question", {});
  const ids = questions.map((q) => s(q.id));
  const by = async (t: string) => (await Promise.all(chunks(ids).map((part) => repo.findMany(t, { questionId: { in: part } })))).flat();
  const imageIds = [...new Set(questions.map((q) => q.imageId).filter(Boolean).map(s))];
  const [options, answers, explanations, stats, assessment, images] = await Promise.all([
    by("QuestionOption"), by("QuestionAnswer"), by("QuestionExplanation"), by("QuestionStats"), by("AssessmentQuestion"),
    imageIds.length ? repo.findMany("QuestionImage", { id: { in: imageIds } }) : Promise.resolve([] as Row[]),
  ]);
  const tables: Record<string, Row[]> = {
    QuestionImage: images.map((i) => ({ ...i, bytes: Buffer.from(i.bytes as Uint8Array).toString("base64") })),
    Question: questions, QuestionOption: options, QuestionAnswer: answers, QuestionExplanation: explanations, QuestionStats: stats, AssessmentQuestion: assessment,
  };
  return { format: "alanjal-question-backup", version: 1, createdAt: now.toISOString(), counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), tables };
}

/** The import-template rows for the backup (types the template supports); the JSON backup has everything. */
export async function backupTemplateRows(repo: Repo, b: QuestionBackup): Promise<{ rows: string[][]; skipped: number }> {
  const headers = ["Question Text", "Question Type", "Option A", "Option B", "Option C", "Option D", "Correct Answer", "Explanation", "Grade", "Skill", "Standard", "Difficulty Level", "Cognitive Level", "Passage/Text"];
  const qs = b.tables.Question;
  const [types, skills, stds, passages] = await Promise.all([
    repo.findMany("QuestionType", {}, { select: ["id", "code"] }),
    repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => q.skillId))] } }, { select: ["id", "name", "curriculumId"] }),
    repo.findMany("Standard", {}, { select: ["id", "code"] }),
    (async () => { const ids = [...new Set(qs.map((q) => q.passageId).filter(Boolean))]; return ids.length ? repo.findMany("ReadingPassage", { id: { in: ids } }, { select: ["id", "body"] }) : []; })(),
  ]);
  const curs = skills.length ? await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => k.curriculumId))] } }, { select: ["id", "gradeId"] }) : [];
  const grades = curs.length ? await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => c.gradeId))] } }, { select: ["id", "level"] }) : [];
  const typeCode = new Map(types.map((t) => [s(t.id), s(t.code)]));
  const NAMES: Record<string, string> = { MULTIPLE_CHOICE: "Multiple Choice", MULTI_SELECT: "Multi Select", TRUE_FALSE: "True/False", FILL_BLANK: "Fill in the Blank" };
  const opt = (id: string) => b.tables.QuestionOption.filter((o) => o.questionId === id).sort((x, y) => Number(x.order) - Number(y.order));
  const rows = [headers];
  let skipped = 0;
  for (const q of qs) {
    const code = typeCode.get(s(q.typeId)) ?? "";
    const name = NAMES[code];
    const options = opt(s(q.id));
    if (!name || options.length > 4) { skipped++; continue; }
    const sk = skills.find((k) => k.id === q.skillId);
    const grade = grades.find((g) => g.id === curs.find((c) => c.id === sk?.curriculumId)?.gradeId);
    const answers = b.tables.QuestionAnswer.filter((a) => a.questionId === q.id);
    const why = b.tables.QuestionExplanation.find((e) => e.questionId === q.id && e.kind === "WHY_CORRECT");
    const correct = code === "TRUE_FALSE" ? (s(answers[0]?.value).toLowerCase().includes("true") ? "True" : "False")
      : code === "FILL_BLANK" ? answers.map((a) => s(a.value).replace(/^"|"$/g, "")).join(" | ")
      : options.map((o, i) => (o.isCorrect ? "ABCD"[i] : "")).filter(Boolean).join(", ");
    const tags = (typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags) as { cognitiveLevel?: string } | null;
    rows.push([s(q.stem), name, ...[0, 1, 2, 3].map((i) => s(options[i]?.text)), correct, s(why?.body), s(grade?.level), s(sk?.name),
      s(stds.find((x) => x.id === q.standardId)?.code).replace(/^CCSS\.ELA-LITERACY\./, ""), s(q.difficultyLevel), s(tags?.cognitiveLevel), s(passages.find((p) => p.id === q.passageId)?.body)]);
  }
  return { rows, skipped };
}

// ------------------------------------------------------------------ execute + verify

export interface CleanupResult { deletedQuestions: number; practiceDeleted: Record<string, number>; verify: { questionsLeft: number; keptUnchanged: boolean; changedKept: string[] } }

export async function executeCleanup(repo: Repo, opts: { confirm: string; includePracticeHistory?: boolean; actorId?: string | null }, now = new Date()): Promise<CleanupResult> {
  const before = await cleanupReport(repo);
  if (opts.confirm !== before.confirmCode) throw new Error(`Confirmation code does not match. The bank now has ${before.questions} questions; run the report again and use ${before.confirmCode}.`);
  if (before.needsPracticeFlag && !opts.includePracticeHistory) {
    throw new Error(`Students have practised (${before.practice.QuestionAttempt} answers, ${before.practice.PracticeSession} sessions). Deleting the questions would leave that history pointing at nothing. Run again with --include-practice-history to clear practice history too, or stop here.`);
  }
  const practiceDeleted: Record<string, number> = {};
  if (opts.includePracticeHistory) {
    for (const t of PRACTICE_TABLES) practiceDeleted[t] = await repo.deleteMany(t, {});
    await repo.updateMany("AssignmentStudent", {}, { status: "NOT_STARTED", progress: 0, completedAt: null });
  }
  const all = await repo.findMany("Question", {}, { select: ["id", "imageId"] });
  for (const part of chunks(all)) await repo.transaction((tx) => purgeQuestionRows(tx, part));
  await repo.deleteMany("QuestionImage", {}); // any image left without a question
  await repo.create("AuditLog", { actorId: opts.actorId ?? null, action: "question.bank_cleanup", entityType: "Question", entityId: "ALL", before: { questions: before.questions, byStatus: before.byStatus }, after: { practiceCleared: Boolean(opts.includePracticeHistory) }, createdAt: now });
  const after = await cleanupReport(repo);
  // assignments' student rows are reset (not removed) when practice is cleared; counts must match exactly
  const changedKept = KEPT_TABLES.filter((t) => before.kept[t] !== after.kept[t]);
  return { deletedQuestions: before.questions, practiceDeleted, verify: { questionsLeft: after.questions, keptUnchanged: changedKept.length === 0, changedKept } };
}

// ------------------------------------------------------------------ restore

/** Puts the questions back. Questions that already exist (same id) are left alone. */
export async function restoreQuestions(repo: Repo, b: QuestionBackup): Promise<Record<string, number>> {
  if (b?.format !== "alanjal-question-backup" || b.version !== 1) throw new Error("This is not a question backup file.");
  const clean = (r: Row) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined));
  const existing = new Set((await repo.findMany("Question", {}, { select: ["id"] })).map((q) => s(q.id)));
  const restoreIds = new Set(b.tables.Question.map((q) => s(q.id)).filter((id) => !existing.has(id)));
  const out: Record<string, number> = {};
  const existingImages = new Set((await repo.findMany("QuestionImage", {}, { select: ["id"] })).map((i) => s(i.id)));
  const images = b.tables.QuestionImage.filter((i) => !existingImages.has(s(i.id))).map((i) => ({ ...clean(i), bytes: Buffer.from(s(i.bytes), "base64") }));
  for (const part of chunks(images, 20)) await repo.createMany("QuestionImage", part);
  out.QuestionImage = images.length;
  for (const t of ["Question", "QuestionOption", "QuestionAnswer", "QuestionExplanation", "QuestionStats", "AssessmentQuestion"]) {
    const rows = b.tables[t].filter((r) => restoreIds.has(s(t === "Question" ? r.id : r.questionId))).map(clean);
    for (const part of chunks(rows)) await repo.createMany(t, part);
    out[t] = rows.length;
  }
  return out;
}
