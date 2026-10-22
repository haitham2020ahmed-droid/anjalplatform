"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import {
  changeCustomReview, customDraftQuestion, customEditQuestion, customQuestionDetail, customQuestionOptionsBulk, customReviewView, customSetChoices, customSkillChoices, customWriteQuestion, deleteCustomReviewArchive, MAX_REVIEW, reviewBankSearch, schoolTeachers, setQuestionPreview, shareCustomReview, skillQuestionPreview,
  type CustomReviewChange, type CustomReviewView, type ReviewSetUnit, type ReviewSkillUnit, type SchoolTeacher, type WrittenQuestion,
} from "@/server/curriculum-map/review-control";
import type { BankFilter, BankResults, CopyEdit } from "@/server/tests/review";
import { assignQuestions, convertReviewToAdaptive, sentReviewAssignmentsForClass, updateSentReview, type ConvertReviewToAdaptiveResult, type SentReviewSummary, type UpdateSentReviewResult } from "@/server/teacher/assign";

type Out<T> = { ok: true; value: T } | { ok: false; message: string };
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;
async function run<T>(fn: () => Promise<T>): Promise<Out<T>> {
  try { return { ok: true, value: await fn() }; } catch (e) { if (known(e)) return { ok: false, message: (e as Error).message }; throw e; }
}
const TEACHER = { roles: ["TEACHER" as const], permission: "assignments:create" as const };

/** 🔁 The teacher's whole-grade Review Builder, as they have it so far. `rev`: omit for the live one; pass an
 * archived id (from "My Reviews") to open that saved snapshot instead. */
export async function customReviewAction(grade: number, rev?: string): Promise<Out<CustomReviewView>> {
  const actor = await requireActor(TEACHER);
  return run(() => customReviewView(repo, actor, Number(grade), rev || undefined));
}
/** 🔁 Remove · reorder · how many · add from the bank · 🗂️ add Text Sets · 🗣️ add Skills · 💾 archive. */
export async function customReviewChangeAction(grade: number, change: CustomReviewChange, rev?: string): Promise<Out<CustomReviewView>> {
  const actor = await requireActor(TEACHER);
  return run(() => changeCustomReview(repo, actor, Number(grade), change, new Date(), rev || undefined));
}
/** 🗂️ "Text Sets" tab: every Text Set/Selection of this grade, grouped by unit, with its tickable categories. */
export async function customSetChoicesAction(grade: number): Promise<Out<ReviewSetUnit[]>> {
  const actor = await requireActor(TEACHER);
  return run(() => customSetChoices(repo, actor, Number(grade)));
}
/** 🗣️ "Language" tab: every Skill of the whole grade plan, grouped by unit. */
export async function customSkillChoicesAction(grade: number): Promise<Out<ReviewSkillUnit[]>> {
  const actor = await requireActor(TEACHER);
  return run(() => customSkillChoices(repo, actor, Number(grade)));
}
/** 👁 Preview: the first few question stems of one skill (optionally one level), before ticking it. */
export async function skillPreviewAction(skillId: string, level?: "ABOVE" | "ON" | "BELOW" | "ANY"): Promise<Out<string[]>> {
  const actor = await requireActor(TEACHER);
  return run(() => skillQuestionPreview(repo, actor, String(skillId ?? ""), level ?? "ANY"));
}
/** 👁 r91 "Text Sets" tab preview: the first few question stems of one Text Set's category, before ticking it. */
export async function setPreviewAction(grade: number, unit: number, setNumber: number, category: "CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "REVIEW", level?: "ABOVE" | "ON" | "BELOW" | "ANY"): Promise<Out<string[]>> {
  const actor = await requireActor(TEACHER);
  return run(() => setQuestionPreview(repo, actor, Number(grade), Number(unit), Number(setNumber), category, level ?? "ANY"));
}
/** ✏️ Edit = my private copy. */
export async function customEditAction(grade: number, edit: CopyEdit, rev?: string): Promise<Out<CustomReviewView>> {
  const actor = await requireActor(TEACHER);
  return run(() => customEditQuestion(repo, actor, Number(grade), edit, new Date(), rev || undefined));
}
/** ➕ Write a question (private). */
export async function customWriteAction(grade: number, w: WrittenQuestion, rev?: string): Promise<Out<CustomReviewView>> {
  const actor = await requireActor(TEACHER);
  return run(() => customWriteQuestion(repo, actor, Number(grade), w, new Date(), rev || undefined));
}
/** ✨ An AI draft to check (not saved). */
export async function customDraftAction(grade: number): Promise<Out<WrittenQuestion>> {
  const actor = await requireActor(TEACHER);
  return run(() => customDraftQuestion(repo, actor, Number(grade)));
}
/** 🔎 The bank (school-wide, by skill or words). */
export async function customBankAction(f: BankFilter): Promise<Out<BankResults>> {
  const actor = await requireActor(TEACHER);
  return run(() => reviewBankSearch(repo, actor, f ?? {}));
}
/** The question's choices, for the Edit form. */
export async function customDetailAction(grade: number, questionId: string, rev?: string): Promise<Out<Awaited<ReturnType<typeof customQuestionDetail>>>> {
  const actor = await requireActor(TEACHER);
  return run(() => customQuestionDetail(repo, actor, Number(grade), String(questionId ?? ""), rev || undefined));
}
/** 📋 The choices of many questions at once, keyed by id (for the "All selected questions" flat view). */
export async function customOptionsBulkAction(grade: number, questionIds: string[], rev?: string): Promise<Out<Awaited<ReturnType<typeof customQuestionOptionsBulk>>>> {
  const actor = await requireActor(TEACHER);
  return run(() => customQuestionOptionsBulk(repo, actor, Number(grade), Array.isArray(questionIds) ? questionIds.map(String) : [], rev || undefined));
}
/** 🗑 Delete ONE archived whole-grade Review (never the live one). */
export async function customDeleteArchiveAction(grade: number, rev: string): Promise<Out<null>> {
  const actor = await requireActor(TEACHER);
  return run(async () => { await deleteCustomReviewArchive(repo, actor, Number(grade), String(rev ?? "")); return null; });
}
/** 🔗 The other teachers of my school, for the "Share" picker. */
export async function schoolTeachersAction(): Promise<Out<SchoolTeacher[]>> {
  const actor = await requireActor(TEACHER);
  return run(() => schoolTeachers(repo, actor));
}
/** 🔗 Share a copy of this whole-grade Review with another teacher — lands in THEIR "My Reviews", ready to use. */
export async function customShareAction(grade: number, toTeacherUserId: string, rev?: string): Promise<Out<null>> {
  const actor = await requireActor(TEACHER);
  return run(async () => { await shareCustomReview(repo, actor, Number(grade), String(toTeacherUserId ?? ""), rev || undefined); return null; });
}
/** ⭐ Assign the built Review to a class — Fixed (every chosen question, same order, for every student) or
 * Adaptive (students answer toward a target-correct goal, drawing from as many as were collected). */
export async function customReviewAssignAction(input: {
  grade: number; classId: string; studentIds?: string[]; title?: string; source: string; rev?: string;
  adaptive?: { maxQuestions: number; targetCorrect?: number | null } | null;
  /** Fixed only: a different question order for each student (same question set, same every time they open it). */
  shuffle?: boolean;
}): Promise<Out<{ assignmentId: string; students: number; questions: number }>> {
  const actor = await requireActor(TEACHER);
  return run(async () => {
    const v = await customReviewView(repo, actor, Number(input.grade), input.rev || undefined);
    const ids = v.questions.map((q) => q.id).slice(0, v.count || v.questions.length);
    if (!ids.length) throw new ValidationError("Collect some questions first.");
    return assignQuestions(repo, actor, {
      classId: input.classId, studentIds: input.studentIds, questionIds: ids, title: input.title || "Review", source: input.source,
      // 🔓 fix (Oct 2026): use the teacher's title exactly — never append "(N questions)" for students to see.
      exactTitle: true,
      // 🔓 fix (Oct 2026): Fixed no longer stops at 60 — see review-control.ts reviewAssign for the same fix.
      ...(input.adaptive ? { adaptive: input.adaptive } : { test: true, testCap: MAX_REVIEW, shuffle: Boolean(input.shuffle) }),
    });
  });
}
/** 🆕 Reviews already sent to a class (so "⭐ Assign" can offer "update this sent Review" instead of a new one). */
export async function sentReviewsForClassAction(classId: string): Promise<Out<SentReviewSummary[]>> {
  const actor = await requireActor(TEACHER);
  return run(() => sentReviewAssignmentsForClass(repo, actor, String(classId ?? "")));
}
/**
 * 🆕 Save changes to an already-sent whole-grade Review Builder assignment IN PLACE (Fixed only — Adaptive has no
 * fixed per-student set to edit this way). Reads the SAME current draft `customReviewAssignAction` above would
 * send as a brand-new Assignment, and hands it to updateSentReview (assign.ts), which is what actually enforces
 * the "a question anyone already answered is never removed or changed" safety rule — see its own comment.
 */
export async function customReviewUpdateAction(input: { grade: number; assignmentId: string; title?: string; rev?: string }): Promise<Out<UpdateSentReviewResult>> {
  const actor = await requireActor(TEACHER);
  return run(async () => {
    const v = await customReviewView(repo, actor, Number(input.grade), input.rev || undefined);
    const ids = v.questions.map((q) => q.id).slice(0, v.count || v.questions.length);
    if (!ids.length) throw new ValidationError("Collect some questions first.");
    return updateSentReview(repo, actor, { assignmentId: String(input.assignmentId ?? ""), questionIds: ids, title: input.title }, new Date());
  });
}
/**
 * 🆕 Flip an already-sent Fixed Review to Adaptive IN PLACE — only allowed while ZERO students have answered
 * anything on it yet (see convertReviewToAdaptive's own comment in assign.ts for exactly why).
 */
export async function convertReviewToAdaptiveAction(assignmentId: string, input?: { maxQuestions?: number; targetCorrect?: number }): Promise<Out<ConvertReviewToAdaptiveResult>> {
  const actor = await requireActor(TEACHER);
  return run(() => convertReviewToAdaptive(repo, actor, { assignmentId: String(assignmentId ?? ""), maxQuestions: input?.maxQuestions, targetCorrect: input?.targetCorrect }, new Date()));
}
