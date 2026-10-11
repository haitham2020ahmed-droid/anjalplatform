"use server";
import { z } from "zod";
import { getActor, repo } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { FEEDBACK_MAX, saveFeedback } from "@/server/admin/feedback";

/** Saves one feedback note of the signed-in user (any role). */
export async function sendFeedbackAction(message: string, path: string | null): Promise<{ ok?: boolean; error?: string }> {
  const s = await getActor();
  if (!s) return { error: "Please sign in again." };
  try {
    await saveFeedback(repo, s.actor, { message: z.string().max(FEEDBACK_MAX + 100).parse(String(message ?? "")), path: path ? String(path).slice(0, 500) : null });
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: `Keep it under ${FEEDBACK_MAX} characters.` };
    throw e;
  }
}
