"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { getT } from "@/i18n/server";
import { answerNafsPractice, type PracticeFeedback } from "@/server/nafs/practice";

/** The student's answer in adaptive NAFS practice (checked and stored on the server, NAFS tables only). */
export async function answerPracticeAction(input: { id: string; questionId: string; choice: number }): Promise<{ ok?: PracticeFeedback; error?: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: await answerNafsPractice(repo, actor, { id: String(input?.id ?? ""), questionId: String(input?.questionId ?? ""), choice: input?.choice }) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) { const { t } = await getT(); return { error: t(e.message) }; } throw e; }
}
