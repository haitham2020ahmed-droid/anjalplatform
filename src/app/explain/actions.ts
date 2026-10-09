"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { explainAnswer, type Explanation } from "@/server/ai/explain";
import { aiEnv } from "@/server/ai/env";

/** 🤖 Explain the student's last answer to this question. */
export async function explainAction(questionId: string): Promise<{ ok: true; value: Explanation } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"], permission: "practice:take" });
  if (typeof questionId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(questionId)) return { ok: false, error: "Unknown question." };
  try { return { ok: true, value: await explainAnswer(repo, actor, questionId, aiEnv()) }; }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}
