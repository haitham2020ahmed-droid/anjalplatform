"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { answerPlacement, startPlacement, type PlacementAnswer } from "@/server/readrise/placement";
import {
  finishReading, practiceActivity, readRiseAccess, saveReading, saveWritingDraft, startRun, submitActivity, submitPostPoll, submitPrePoll, submitWriting,
  type ReadingProgress, type Review, type RunView,
} from "@/server/readrise/student";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; }
}

export async function startRunAction(articleId: string, stretch: boolean): Promise<Result<RunView>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(async () => {
    // 🔒 no articles before the placement test (readRiseAccess): the default start level is not a real level
    if ((await readRiseAccess(repo, actor.studentId!)).locked) throw new ValidationError("Take the placement test first.");
    return startRun(repo, actor, String(articleId), { stretch: Boolean(stretch) });
  });
}

export async function prePollAction(runId: string, value: number): Promise<Result<RunView>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(() => submitPrePoll(repo, actor, String(runId), Number(value)));
}

export async function saveReadingAction(runId: string, p: ReadingProgress): Promise<Result<{ ok: true }>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(() => saveReading(repo, actor, String(runId), p ?? {}));
}

export async function finishReadingAction(runId: string, p: ReadingProgress): Promise<Result<RunView>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(() => finishReading(repo, actor, String(runId), p ?? {}));
}

export async function submitActivityAction(runId: string, answers: Record<string, string>, at?: Record<string, number>): Promise<Result<RunView>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  // the answer times (ms after the questions opened) — only numbers are kept (accuracy.ts checks them)
  const times = at && typeof at === "object" ? Object.fromEntries(Object.entries(at).slice(0, 20).map(([k, v]) => [String(k).slice(0, 3), Number(v)])) : null;
  return guard(() => submitActivity(repo, actor, String(runId), answers ?? {}, new Date(), { at: times }));
}

export async function practiceAction(runId: string, answers: Record<string, string>): Promise<Result<{ correct: number; total: number; review: Review[] }>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(() => practiceActivity(repo, actor, String(runId), answers ?? {}));
}

export async function saveWritingAction(runId: string, text: string): Promise<Result<{ ok: true }>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(() => saveWritingDraft(repo, actor, String(runId), String(text ?? "")));
}

export async function submitWritingAction(runId: string, text: string): Promise<Result<RunView>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(() => submitWriting(repo, actor, String(runId), String(text ?? "")));
}

export async function postPollAction(runId: string, value: number): Promise<Result<RunView>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(() => submitPostPoll(repo, actor, String(runId), Number(value)));
}

export async function startPlacementAction(): Promise<Result<string>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(() => startPlacement(repo, actor));
}

export async function answerPlacementAction(placementId: string, passageId: string, answers: string[]): Promise<Result<PlacementAnswer>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  return guard(() => answerPlacement(repo, actor, String(placementId), String(passageId), Array.isArray(answers) ? answers.map(String) : []));
}
