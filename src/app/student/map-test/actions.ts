"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { answerTest, type TestScreen } from "@/server/map/sim";

/** One answer of the MAP practice test → the next screen (never right / wrong). */
export async function answerTestAction(sessionId: string, questionId: string, response: unknown): Promise<{ ok: true; screen: TestScreen } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: true, screen: await answerTest(repo, actor, String(sessionId), String(questionId), response) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}
