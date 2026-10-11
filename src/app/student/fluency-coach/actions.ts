"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { answerComprehension, startComprehension, type ClientQuiz, type ComprehensionResult } from "@/server/fluency/comprehension";
import { aiEnv } from "@/server/ai/env";

/** 🧠 The 2–3 questions after a reading (the answers stay on the server). */
export async function startComprehensionAction(practiceId: string): Promise<{ ok: true; quiz: ClientQuiz } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: true, quiz: await startComprehension(repo, actor, String(practiceId), aiEnv()) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}

/** Scores the answers and stores the comprehension % on the reading (and the day's official check). */
export async function answerComprehensionAction(practiceId: string, answers: number[]): Promise<{ ok: true; result: ComprehensionResult } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: true, result: await answerComprehension(repo, actor, String(practiceId), (Array.isArray(answers) ? answers : []).map(Number)) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}
