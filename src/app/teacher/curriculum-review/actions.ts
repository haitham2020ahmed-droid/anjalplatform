"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { changeReview, draftReviewQuestion, editReviewQuestion, reviewBankSearch, reviewQuestionDetail, reviewSkillChoices, writeReviewQuestion, type ReviewChange, type ReviewControlView, type ReviewSkillUnit, type WrittenQuestion } from "@/server/curriculum-map/review-control";
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
