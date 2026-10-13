"use server";
/**
 * 👁 Server action for the question drawer (Assessments → New test → View): one question in full, read when it is
 * opened. Signed-in staff only; questionDetail checks the role and the school again.
 */
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { questionDetail, type QuestionDetail } from "@/server/tests/question-detail";

export async function questionDetailAction(questionId: string): Promise<{ detail?: QuestionDetail; error?: string }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  try { return { detail: await questionDetail(repo, actor, String(questionId ?? "").slice(0, 191)) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message }; throw e; }
}
