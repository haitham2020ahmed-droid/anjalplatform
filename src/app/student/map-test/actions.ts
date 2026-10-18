"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { answerTest, mapTestTime, type TestScreen } from "@/server/map/sim";

/** One answer of the MAP practice test → the next screen (never right / wrong). */
export async function answerTestAction(sessionId: string, questionId: string, response: unknown): Promise<{ ok: true; screen: TestScreen } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: true, screen: await answerTest(repo, actor, String(sessionId), String(questionId), response) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}

/** ⏱ r69 live time: has the teacher changed the time? (`up`: my clock reached 0 → finish when the time is really up) */
export async function mapTestTimeAction(input: { sessionId: string; windowId?: string | null; stamp?: number; up?: boolean }): Promise<{ same: true } | { same: false; screen: TestScreen } | { error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return await mapTestTime(repo, actor, { sessionId: String(input?.sessionId ?? ""), windowId: input?.windowId ? String(input.windowId) : null, stamp: Number(input?.stamp) || 0, up: Boolean(input?.up) }); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message }; throw e; }
}
