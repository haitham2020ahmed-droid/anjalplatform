"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { answerQuestionOfTheDay } from "@/server/teacher/extras";
import type { Graded } from "@/server/teacher/worksheet";

/** ☀️ One attempt at today's question (students only; graded on the server; never changes levels or mastery). */
export async function answerQotdAction(questionId: string, response: unknown): Promise<{ ok: true; value: Graded; coins: number } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { const r = await answerQuestionOfTheDay(repo, actor, String(questionId), response); return { ok: true, value: r.review[0], coins: r.coins }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}
