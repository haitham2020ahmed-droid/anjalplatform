"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { answerQuestionOfTheDay } from "@/server/teacher/extras";
import type { Graded } from "@/server/teacher/worksheet";

export async function answerQotdAction(questionId: string, response: unknown): Promise<{ ok: true; value: Graded } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { const r = await answerQuestionOfTheDay(repo, actor, String(questionId), response); return { ok: true, value: r.review[0] }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}
