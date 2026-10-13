"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { getT } from "@/i18n/server";
import { saveBooklet } from "@/server/nafs/student";

/** The student's NAFS simulation: keep the answers so far, or hand the test in (graded on the server). */
export async function saveBookletAction(input: { id: string; answers: (number | null)[]; texts?: Record<string, string>; submit: boolean }): Promise<{ ok?: { done: boolean; blanks: number }; error?: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: await saveBooklet(repo, actor, { id: String(input?.id ?? ""), answers: input?.answers, texts: input?.texts && typeof input.texts === "object" ? input.texts : {}, submit: Boolean(input?.submit) }) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) { const { t } = await getT(); return { error: t(e.message) }; } throw e; }
}
