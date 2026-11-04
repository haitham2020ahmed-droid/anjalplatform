"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { changeReview, draftReviewQuestion, editReviewQuestion, reviewAssign, reviewBankSearch, reviewQuestionDetail, reviewSkillChoices, reviewUpdateSent, writeReviewQuestion, type ReviewChange, type ReviewControlView, type ReviewSkillUnit, type WrittenQuestion } from "@/server/curriculum-map/review-control";
import { convertReviewToAdaptive, sentReviewAssignmentsForClass, type ConvertReviewToAdaptiveResult, type SentReviewSummary, type UpdateSentReviewResult } from "@/server/teacher/assign";
import type { BankFilter, BankResults, CopyEdit } from "@/server/tests/review";

type Out<T> = { ok: true; value: T } | { ok: false; message: string };
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;
async function run<T>(fn: () => Promise<T>): Promise<Out<T>> {
  try { return { ok: true, value: await fn() }; } catch (e) { if (known(e)) return { ok: false, message: (e as Error).message }; throw e; }
}
const TEACHER = { roles: ["TEACHER" as const], permission: "assignments:create" as const };

/** 🔁 Remove · put back · reorder · how many · add from the bank · reset. */
export async function reviewChangeAction(code: string, change: ReviewChange): Promise<Out<ReviewControlView>> {
  const actor = await requireActor(TEACHER);
  return run(() => changeReview(repo, actor, String(code ?? ""), change));
}
/** ✏️ Edit = my private copy. */
export async function reviewEditAction(code: string, edit: CopyEdit): Promise<Out<ReviewControlView>> {
  const actor = await requireActor(TEACHER);
  return run(() => editReviewQuestion(repo, actor, String(code ?? ""), edit));
}
/** ➕ Write a question (private). */
export async function reviewWriteAction(code: string, w: WrittenQuestion): Promise<Out<ReviewControlView>> {
  const actor = await requireActor(TEACHER);
  return run(() => writeReviewQuestion(repo, actor, String(code ?? ""), w));
}
/** ✨ An AI draft to check (not saved). */
export async function reviewDraftAction(code: string): Promise<Out<WrittenQuestion>> {
  const actor = await requireActor(TEACHER);
  return run(() => draftReviewQuestion(repo, actor, String(code ?? "")));
}
/** 🔎 The bank. */
export async function reviewBankAction(f: BankFilter): Promise<Out<BankResults>> {
  const actor = await requireActor(TEACHER);
  return run(() => reviewBankSearch(repo, actor, f ?? {}));
}
/** The question's choices, for the Edit form. */
export async function reviewDetailAction(code: string, questionId: string): Promise<Out<Awaited<ReturnType<typeof reviewQuestionDetail>>>> {
  const actor = await requireActor(TEACHER);
  return run(() => reviewQuestionDetail(repo, actor, String(code ?? ""), String(questionId ?? "")));
}
/** 🤖 "Language" tab: every Skill of the whole grade plan, grouped by unit, to tick and pull questions from. */
export async function reviewSkillChoicesAction(code: string): Promise<Out<ReviewSkillUnit[]>> {
  const actor = await requireActor(TEACHER);
  return run(() => reviewSkillChoices(repo, actor, String(code ?? "")));
}
/** ⭐ r91 Assign this Review directly — Fixed (as always) or Adaptive (new: a target-correct goal). */
export async function reviewAssignAction(code: string, input: {
  classId: string; studentIds?: string[]; title?: string; source: string;
  adaptive?: { maxQuestions: number; targetCorrect?: number | null } | null;
  shuffle?: boolean;
}): Promise<Out<{ assignmentId: string; students: number; questions: number }>> {
  const actor = await requireActor(TEACHER);
  return run(() => reviewAssign(repo, actor, String(code ?? ""), input));
}
/** 🆕 Reviews already sent to a class (so "⭐ Assign" can offer "update this sent Review" instead of a new one). */
export async function sentReviewsForClassAction(classId: string): Promise<Out<SentReviewSummary[]>> {
  const actor = await requireActor(TEACHER);
  return run(() => sentReviewAssignmentsForClass(repo, actor, String(classId ?? "")));
}
/** 🆕 Save changes to an already-sent Review (Fixed only) IN PLACE — see review-control.ts reviewUpdateSent /
 * assign.ts updateSentReview for the "a question anyone already answered is never touched" safety rule. */
export async function reviewUpdateSentAction(code: string, assignmentId: string, input: { title?: string } = {}): Promise<Out<UpdateSentReviewResult>> {
  const actor = await requireActor(TEACHER);
  return run(() => reviewUpdateSent(repo, actor, String(code ?? ""), String(assignmentId ?? ""), input));
}
/**
 * 🆕 Flip an already-sent Fixed Review to Adaptive IN PLACE — only allowed while ZERO students have answered
 * anything on it yet (see convertReviewToAdaptive's own comment in assign.ts for exactly why).
 */
export async function convertReviewToAdaptiveAction(assignmentId: string, input?: { maxQuestions?: number; targetCorrect?: number }): Promise<Out<ConvertReviewToAdaptiveResult>> {
  const actor = await requireActor(TEACHER);
  return run(() => convertReviewToAdaptive(repo, actor, { assignmentId: String(assignmentId ?? ""), maxQuestions: input?.maxQuestions, targetCorrect: input?.targetCorrect }, new Date()));
}
