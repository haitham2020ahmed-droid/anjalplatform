"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { lookupWord, type WordView } from "@/server/student/words";
import { flagQuestion, submitExitTicket, submitReview } from "@/server/teacher/classroom";
import type { Graded } from "@/server/teacher/worksheet";

type R<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message }; throw e; };

/** 📖 Meaning of a word (any signed-in user; students also get it in their notebook). */
export async function lookupWordAction(word: string): Promise<R<WordView>> {
  const actor = await requireActor();
  try { return { ok: true, value: await lookupWord(repo, actor, String(word ?? "")) }; } catch (e) { return fail(e); }
}

/** 🚩 “This question is not clear”. */
export async function flagQuestionAction(questionId: string, reason: string, note: string): Promise<R<true>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { await flagQuestion(repo, actor, String(questionId), String(reason), String(note ?? "")); return { ok: true, value: true }; } catch (e) { return fail(e); }
}

export async function submitExitTicketAction(ticketId: string, responses: Record<string, unknown>): Promise<R<{ correct: number; total: number; review: Graded[] }>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: true, value: await submitExitTicket(repo, actor, String(ticketId), responses ?? {}) }; } catch (e) { return fail(e); }
}

export async function submitReviewAction(_id: string, responses: Record<string, unknown>): Promise<R<{ correct: number; total: number; review: Graded[] }>> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { return { ok: true, value: await submitReview(repo, actor, responses ?? {}) }; } catch (e) { return fail(e); }
}
