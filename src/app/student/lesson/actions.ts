"use server";
/** 🧩 Lesson actions. Ownership, the current question, scoring, hints and phase changes are enforced in src/server/lessons/run.ts. */
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { answerLesson, answerModel, beginGuided, lessonHint, saveOrganizer } from "@/server/lessons/run";

const id = z.string().min(1).max(191);
const safe = async <T>(fn: () => Promise<T>): Promise<T | { error: string }> => {
  try { return await fn(); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError || e instanceof z.ZodError) return { error: e instanceof z.ZodError ? "That could not be read. Please try again." : e.message }; throw e; }
};

export async function modelAnswerAction(runId: string, pick: number) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return safe(async () => ({ view: await answerModel(repo, actor, id.parse(runId), z.number().int().min(0).max(200).parse(pick)) }));
}

export async function beginGuidedAction(runId: string) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return safe(async () => ({ view: await beginGuided(repo, actor, id.parse(runId)) }));
}

export async function lessonHintAction(runId: string, questionId: string) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return safe(() => lessonHint(repo, actor, id.parse(runId), id.parse(questionId)));
}

export async function lessonAnswerAction(raw: { runId: string; questionId: string; response: unknown }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return safe(async () => {
    if (!raw || typeof raw !== "object" || raw.response === undefined) throw new ValidationError("Choose an answer before checking.");
    return answerLesson(repo, actor, { runId: id.parse(raw.runId), questionId: id.parse(raw.questionId), response: raw.response });
  });
}

export async function organizerAction(runId: string, value: { head: string; rows: string[][]; foot: string }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return safe(() => saveOrganizer(repo, actor, id.parse(runId), value));
}
