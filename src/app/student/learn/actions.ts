"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { openLesson, submitLessonChecks, type CheckResult } from "@/server/learn/student";
import { submitWordPractice } from "@/server/learn/words";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}

/** The student opened a lesson (their progress row; an assigned lesson turns "In progress"). */
export async function openLessonAction(code: string): Promise<Result<null>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(async () => { await openLesson(repo, actor, String(code)); return null; });
}

/** The 3 checks, marked on the server. */
export async function submitChecksAction(code: string, picks: number[], again: boolean, seconds: number): Promise<Result<CheckResult>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(() => submitLessonChecks(repo, actor, String(code), Array.isArray(picks) ? picks.slice(0, 3).map(Number) : [], { again: Boolean(again), seconds: Number(seconds) || 0 }));
}

/** "Practise these words" (5 questions), marked on the server. */
export async function submitWordsAction(sel: string, picks: { word: string; choice: number }[]): Promise<Result<{ score: number; total: number; answers: { word: string; answer: number; correct: boolean }[] }>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(() => submitWordPractice(repo, actor, String(sel), Array.isArray(picks) ? picks.slice(0, 10).map((p) => ({ word: String(p?.word ?? "").slice(0, 64), choice: Number(p?.choice) })) : []));
}
