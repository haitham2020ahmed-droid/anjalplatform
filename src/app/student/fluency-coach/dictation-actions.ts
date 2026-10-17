"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { dictationHome, submitDictation, type DictationAttemptView, type DictationHome } from "@/server/dictation/service";

/** Today's Daily Dictation item (or today's finished attempt) plus a short history. */
export async function dictationHomeAction(): Promise<{ ok: true; home: DictationHome } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: true, home: await dictationHome(repo, actor) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}

/** Grades what the student typed against today's item and moves tomorrow's tier. */
export async function submitDictationAction(typed: string): Promise<{ ok: true; result: DictationAttemptView } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: true, result: await submitDictation(repo, actor, String(typed ?? "")) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}
