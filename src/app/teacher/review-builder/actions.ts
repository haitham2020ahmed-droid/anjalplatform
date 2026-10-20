"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import {
  changeCustomReview, customDraftQuestion, customEditQuestion, customQuestionDetail, customReviewView, customSetChoices, customSkillChoices, customWriteQuestion, reviewBankSearch, setQuestionPreview, skillQuestionPreview,
  type CustomReviewChange, type CustomReviewView, type ReviewSetUnit, type ReviewSkillUnit, type WrittenQuestion,
} from "@/server/curriculum-map/review-control";
import type { BankFilter, BankResults, CopyEdit } from "@/server/tests/review";
import { assignQuestions } from "@/server/teacher/assign";

type Out<T> = { ok: true; value: T } | { ok: false; message: string };
const known = (e: unknown) => e instanceof ValidationError || e instanceof ForbiddenError;
async function run<T>(fn: () => Promise<T>): Promise<Out<T>> {
  try { return { ok: true, value: await fn() }; } catch (e) { if (known(e)) return { ok: false, message: (e as Error).message }; throw e; }
}
const TEACHER = { roles: ["TEACHER" as const], permission: "assignments:create" as const };

/** 🔁 The teacher's whole-grade Review Builder, as they have it so far. */
export async function customReviewAction(grade: number): Promise<Out<CustomReviewView>> {
  const actor = await requireActor(TEACHER);
  return run(() => customReviewView(repo, actor, Number(grade)));
}
/** 🔁 Remove · reorder · how many · add from the bank · 🗂️ add Text Sets · 🗣️ add Skills · reset. */
export async function customReviewChangeAction(grade: number, change: CustomReviewChange): Promise<Out<CustomReviewView>> {
  const actor = await requireActor(TEACHER);
  return run(() => changeCustomReview(repo, actor, Number(grade), change));
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
export async function customEditAction(grade: number, edit: CopyEdit): Promise<Out<CustomReviewView>> {
  const actor = await requireActor(TEACHER);
  return run(() => customEditQuestion(repo, actor, Number(grade), edit));
}
/** ➕ Write a question (private). */
export async function customWriteAction(grade: number, w: WrittenQuestion): Promise<Out<CustomReviewView>> {
  const actor = await requireActor(TEACHER);
  return run(() => customWriteQuestion(repo, actor, Number(grade), w));
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
export async function customDetailAction(grade: number, questionId: string): Promise<Out<Awaited<ReturnType<typeof customQuestionDetail>>>> {
  const actor = await requireActor(TEACHER);
  return run(() => customQuestionDetail(repo, actor, Number(grade), String(questionId ?? "")));
}
/** ⭐ Assign the built Review to a class — Fixed (a short test, up to 60 questions) or Adaptive (students answer
 * toward a target-correct goal, drawing from as many as were collected). */
export async function customReviewAssignAction(input: {
  grade: number; classId: string; studentIds?: string[]; title?: string; source: string;
  adaptive?: { maxQuestions: number; targetCorrect?: number | null } | null;
}): Promise<Out<{ assignmentId: string; students: number; questions: number }>> {
  const actor = await requireActor(TEACHER);
  return run(async () => {
    const v = await customReviewView(repo, actor, Number(input.grade));
    const ids = v.questions.map((q) => q.id).slice(0, v.count || v.questions.length);
    if (!ids.length) throw new ValidationError("Collect some questions first.");
    return assignQuestions(repo, actor, {
      classId: input.classId, studentIds: input.studentIds, questionIds: ids, title: input.title || "Review", source: input.source,
      ...(input.adaptive ? { adaptive: input.adaptive } : { test: true }),
    });
  });
}
