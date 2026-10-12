"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { answerSecondChance, type ChanceResult } from "@/server/second-chance/service";

/** ⭐ One Second Chance answer (students only; graded on the server; practice only — never changes levels or mastery). */
export async function answerSecondChanceAction(key: string, response: unknown): Promise<{ ok: true; value: ChanceResult } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: true, value: await answerSecondChance(repo, actor, String(key), response) }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}
