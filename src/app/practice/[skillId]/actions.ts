"use server";
/** Submit an answer. Ownership, current-question, timing and scoring are enforced in submitAnswer(). */
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { endPractice, practiceHint, submitAnswer } from "@/server/practice/session";
import { parseAnswerInput } from "@/server/practice/answer-input";

export async function submitAnswerAction(raw: unknown) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try {
    const input = parseAnswerInput(raw);
    // hint use is read from the session on the server (set by hintAction), never from the browser
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

/** 💡 Shows the next hint (ladder of 3) for the current question; the answer to it then counts half toward mastery. */
export async function hintAction(sessionId: string, questionId: string): Promise<{ hint?: string; level?: number; maxLevel?: number; error?: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try {
    return await practiceHint(repo, actor, z.string().min(1).max(191).parse(sessionId), z.string().min(1).max(191).parse(questionId));
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}
