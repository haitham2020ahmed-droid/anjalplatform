"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { answerScreen, startScreen, type ScreenQuestion, type ScreenResult } from "@/server/word-study/screener";

type Res<T> = { ok: true; value: T } | { ok: false; error: string };

/** Starts (or resumes) the student's word check and returns the first word. */
export async function startScreenAction(): Promise<Res<ScreenQuestion>> {
  const actor = await requireActor({ roles: ["STUDENT"], permission: "practice:take" });
  try { return { ok: true, value: await startScreen(repo, actor) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}

/** Records the spelling the student picked for the current word. */
export async function answerScreenAction(input: { screenId: string; strand: number; index: number; picked: string }): Promise<Res<{ correct: boolean; next: ScreenQuestion | null; result: ScreenResult | null }>> {
  const actor = await requireActor({ roles: ["STUDENT"], permission: "practice:take" });
  try {
    const clean = { screenId: String(input?.screenId ?? "").slice(0, 191), strand: Number(input?.strand), index: Number(input?.index), picked: String(input?.picked ?? "").slice(0, 60) };
    return { ok: true, value: await answerScreen(repo, actor, clean) };
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}
