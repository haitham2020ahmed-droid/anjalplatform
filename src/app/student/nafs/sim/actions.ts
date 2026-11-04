"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { getT } from "@/i18n/server";
import { bookletTime, saveBooklet } from "@/server/nafs/student";

/** The student's NAFS simulation: keep the answers so far, or hand the test in (graded on the server). */
export async function saveBookletAction(input: { id: string; answers: (number | null)[]; texts?: Record<string, string>; submit: boolean }): Promise<{ ok?: { done: boolean; blanks: number }; error?: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: await saveBooklet(repo, actor, { id: String(input?.id ?? ""), answers: input?.answers, texts: input?.texts && typeof input.texts === "object" ? input.texts : {}, submit: Boolean(input?.submit) }) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) { const { t } = await getT(); return { error: t(e.message) }; } throw e; }
}

/** ⏱ r69 live time: has the teacher changed this test's time? ("same" costs no database read) */
export async function bookletTimeAction(input: { id: string; stamp: number }): Promise<{ same: true } | { same: false; endsAt: string | null; stamp: number; done: boolean } | { error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return await bookletTime(repo, actor, String(input?.id ?? ""), Number(input?.stamp) || 0); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message }; throw e; }
}
