"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { submitQuizAnswer, type Feedback, type QuizView } from "@/server/practice/session";

export async function submitQuizAnswerAction(input: { assignmentId: string; questionId: string; response: unknown }): Promise<{ feedback?: Feedback; view?: QuizView; error?: string }> {
  const actor = await requireActor({ roles: ["STUDENT"], permission: "practice:take" });
  try {
    return await submitQuizAnswer(repo, actor, { assignmentId: String(input?.assignmentId ?? ""), questionId: String(input?.questionId ?? ""), response: input?.response });
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}
