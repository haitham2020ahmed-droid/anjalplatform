"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { submitDiagnosticAnswer } from "@/server/assessment/diagnostic";
import { ValidationError } from "@/server/curriculum-admin";
import { parseAnswerInput } from "@/server/practice/answer-input";

export async function submitPlacementAction(raw: unknown) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try {
    return { view: await submitDiagnosticAnswer(repo, actor, parseAnswerInput(raw)) };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
}
