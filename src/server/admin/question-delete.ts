/**
 * Deleting and archiving questions (admins).
 *
 *   deleteQuestions  permanent delete of one or many questions, in batches. A question that a student
 *                    has already answered is NOT deleted (its answers are student history): it is
 *                    reported back with “Archive it instead”.
 *   archiveQuestions bulk archive: archived questions never appear in practice, stay visible to admins,
 *                    and keep all student history. The safe choice once students use the bank.
 *
 * What a delete touches: the question's own parts (options, answers, explanations, statistics,
 * assessment links, image) are deleted; references that only point at it (practice-session
 * “current question”, decision-log entries, import records) are cleared. Nothing in the curriculum,
 * no users, classes or other questions are touched.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";

export const BULK_MAX = 500;
const CHUNK = 200;
const s = (v: unknown) => String(v ?? "");
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
const chunks = <T,>(xs: T[], n = CHUNK) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** The questions, checked to belong to the actor's school (via skill → curriculum → grade). */
async function questionsInSchool(repo: Repo, actor: Actor, ids: string[]): Promise<Row[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) throw new ValidationError("Choose at least one question.");
  if (unique.length > BULK_MAX) throw new ValidationError(`Choose at most ${BULK_MAX} questions at a time.`);
  const qs = await repo.findMany("Question", { id: { in: unique } }, { select: ["id", "skillId", "stem", "status", "imageId", "passageId"] });
  if (qs.length !== unique.length) throw new ValidationError("Some questions no longer exist. Reload the page.");
  if (actor.role === "SUPER_ADMIN") return qs;
  const skills = await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => q.skillId))] } }, { select: ["id", "curriculumId"] });
  const curs = await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => k.curriculumId))] } }, { select: ["id", "gradeId"] });
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => c.gradeId))] } }, { select: ["id", "schoolId"] });
  const ok = grades.every((g) => g.schoolId === actor.schoolId) && skills.length === new Set(qs.map((q) => q.skillId)).size;
  if (!ok) throw new ForbiddenError("Some of these questions belong to another school.");
  return qs;
}

/**
 * Removes questions and everything that belongs only to them, inside the caller's transaction.
 * Shared by single/bulk delete and the one-time bank cleanup. `rows` need id and imageId.
 */
export async function purgeQuestionRows(tx: Repo, rows: Row[]): Promise<void> {
  const pid = rows.map((q) => s(q.id));
  if (!pid.length) return;
  await tx.deleteMany("QuestionOption", { questionId: { in: pid } });
  await tx.deleteMany("QuestionAnswer", { questionId: { in: pid } });
  await tx.deleteMany("QuestionExplanation", { questionId: { in: pid } });
  await tx.deleteMany("QuestionStats", { questionId: { in: pid } });
  await tx.deleteMany("AssessmentQuestion", { questionId: { in: pid } });
  await tx.deleteMany("QuestionMapLink", { questionId: { in: pid } });   // its place on the Curriculum Map
  await tx.deleteMany("ReadMasterQuestion", { questionId: { in: pid } });   // its ReadMaster version
  await tx.deleteMany("QuestionUse", { questionId: { in: pid } });       // Placement / MAP test uses
  await tx.updateMany("PracticeSession", { currentQuestionId: { in: pid } }, { currentQuestionId: null, currentServedAt: null });
  await tx.updateMany("AdaptiveDecisionLog", { questionId: { in: pid } }, { questionId: null });
  await tx.updateMany("AdaptiveDecisionLog", { nextQuestionId: { in: pid } }, { nextQuestionId: null });
  await tx.updateMany("ImportedQuestionLog", { questionId: { in: pid } }, { questionId: null });
  await tx.updateMany("ImportedQuestionLog", { duplicateOfId: { in: pid } }, { duplicateOfId: null });
  await tx.deleteMany("Question", { id: { in: pid } });
  // images used by nobody else are removed with their question
  const imageIds = [...new Set(rows.map((q) => q.imageId).filter(Boolean).map(s))];
  if (imageIds.length) {
    const stillUsed = new Set((await tx.findMany("Question", { imageId: { in: imageIds } }, { select: ["imageId"] })).map((q) => s(q.imageId)));
    const orphan = imageIds.filter((i) => !stillUsed.has(i));
    if (orphan.length) await tx.deleteMany("QuestionImage", { id: { in: orphan } });
  }
}

export interface DeleteResult { deleted: number; skipped: { id: string; stem: string; reason: string }[] }

export async function deleteQuestions(repo: Repo, actor: Actor, ids: string[], now = new Date()): Promise<DeleteResult> {
  assertCan(actor, "questions:publish");
  if (!isAdmin(actor)) throw new ForbiddenError("Only admins can delete questions.");
  const qs = await questionsInSchool(repo, actor, ids);
  const answered = new Set<string>();
  for (const part of chunks(qs.map((q) => s(q.id)))) {
    for (const a of await repo.findMany("QuestionAttempt", { questionId: { in: part } }, { select: ["questionId"] })) answered.add(s(a.questionId));
  }
  const skipped = qs.filter((q) => answered.has(s(q.id))).map((q) => ({ id: s(q.id), stem: s(q.stem).slice(0, 120), reason: "Students have answered this question, so it was not deleted. Archive it instead." }));
  const del = qs.filter((q) => !answered.has(s(q.id)));
  for (const part of chunks(del)) {
    await repo.transaction(async (tx) => {
      await purgeQuestionRows(tx, part);
      await tx.createMany("AuditLog", part.map((q) => ({ actorId: actor.userId, action: "question.delete", entityType: "Question", entityId: s(q.id), before: { stem: s(q.stem).slice(0, 300), status: q.status, skillId: q.skillId }, createdAt: now })));
    });
  }
  return { deleted: del.length, skipped };
}

export interface ArchiveResult { archived: number; alreadyArchived: number }

export async function archiveQuestions(repo: Repo, actor: Actor, ids: string[], reason: string, now = new Date()): Promise<ArchiveResult> {
  assertCan(actor, "questions:publish");
  const why = s(reason).replace(/\s+/g, " ").trim();
  if (!why) throw new ValidationError("Give a reason for archiving.");
  if (why.length > 500) throw new ValidationError("Keep the reason under 500 characters.");
  const qs = await questionsInSchool(repo, actor, ids);
  const todo = qs.filter((q) => q.status !== "ARCHIVED");
  for (const part of chunks(todo)) {
    await repo.transaction(async (tx) => {
      await tx.updateMany("Question", { id: { in: part.map((q) => q.id) } }, { status: "ARCHIVED", updatedAt: now });
      await tx.createMany("AuditLog", part.map((q) => ({ actorId: actor.userId, action: "question.archive", entityType: "Question", entityId: s(q.id), before: { status: q.status }, after: { status: "ARCHIVED", reason: why }, createdAt: now })));
    });
  }
  return { archived: todo.length, alreadyArchived: qs.length - todo.length };
}
