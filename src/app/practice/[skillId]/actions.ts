"use server";
/** Submit an answer. Ownership, current-question, timing and scoring are enforced in submitAnswer(). */
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { endPractice, submitAnswer } from "@/server/practice/session";
import { parseAnswerInput } from "@/server/practice/answer-input";

export async function submitAnswerAction(raw: unknown) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try {
    const input = parseAnswerInput(raw);
    return await submitAnswer(repo, actor, { ...input, usedHint: false });
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}

export async function leavePracticeAction(sessionId: string) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  await endPractice(repo, actor, z.string().min(1).max(191).parse(sessionId));
}
