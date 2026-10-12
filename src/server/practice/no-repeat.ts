/**
 * 🔁 No repeated questions in skill practice (per student, across sessions) — the school's rule (questions/fresh.ts):
 *
 *   1. A question the student already attempted (ANY attempt history: practice, sets, tests, the Diagnostic, lessons,
 *      ReadMaster, the Question of the Day) is never shown again in practice — nor a COPY of it (the same fingerprint,
 *      or the same normalized stem + correct answer: copies stored under another skill, grade or map place).
 *   2. Inside one session: never the same question or content twice (selection; the resumed question is checked again
 *      at delivery).
 *   3. A missed question does NOT come back in practice: it waits in the student's ⭐ Second Chance list, the only
 *      place a missed question is shown again (by design).
 *   4. When nothing new is left, the skill is finished ("You finished this skill! 🎉") and the work is Done.
 *   5. With Assignment.questionIds (the teacher's picks) the same rules apply inside the picked questions.
 *
 * Only WHICH question comes next changes: the adaptive engine (ability, levels, mastery) is untouched — the engine
 * still scores every answer against the whole pool, it is only offered the allowed questions to choose from.
 *
 * Reads: the pool's fingerprint copies + the student's attempts on those ids (seenIndex: batched, two columns).
 */
import { itemContentKeys, seenIndex } from "../questions/fresh";
import type { Repo } from "../seeding/repo";
import type { PracticeItem } from "./items";

export interface AnswerState {
  /** every question the student attempted */
  answered: Set<string>;
  /** the content keys of those questions (copies count as attempted) */
  keys: Set<string>;
}

export interface KeyedQuestion { questionId: string; b: number; keys: readonly string[] }

/** The pool with its content keys (in memory). */
export const keyed = (items: readonly PracticeItem[]): KeyedQuestion[] => items.map((i) => ({ questionId: i.questionId, b: i.irt.b, keys: itemContentKeys(i) }));

/** What the student has attempted among these questions and their copies (one batched read, see fresh.ts). */
export async function answerState(repo: Repo, studentId: string, pool: readonly KeyedQuestion[]): Promise<AnswerState> {
  const seen = await seenIndex(repo, studentId, pool.map((q) => ({ id: q.questionId, keys: q.keys })));
  const state: AnswerState = { answered: new Set(), keys: new Set() };
  for (const q of pool) if (seen.lastSeen(q.questionId, q.keys)) { state.answered.add(q.questionId); for (const k of q.keys) state.keys.add(k); }
  return state;
}

/** The state after one more answer (the answer being saved is not read back from the database). */
export function withAnswer(state: AnswerState, q: { questionId: string; keys?: readonly string[] }): AnswerState {
  const answered = new Set(state.answered), keys = new Set(state.keys);
  answered.add(q.questionId);
  for (const k of q.keys ?? []) keys.add(k);
  return { answered, keys };
}

export const isAnswered = (state: AnswerState, q: { questionId: string; keys?: readonly string[] }) => state.answered.has(q.questionId) || (q.keys ?? []).some((k) => state.keys.has(k));

export type AllowedPhase = "NEW" | "DONE";
export interface Allowed {
  /** NEW: questions never attempted (nor a copy of them) · DONE: nothing left, the skill is finished */
  phase: AllowedPhase;
  ids: string[];
}

/**
 * Pure: which questions of the pool may be served next — the never-attempted ones (the engine picks among them; when
 * none is within reach of the level the engine treats it as a content gap, as before); none left → DONE.
 */
export function allowedQuestions(pool: readonly KeyedQuestion[], state: AnswerState): Allowed {
  const fresh = pool.filter((q) => !isAnswered(state, q));
  if (!fresh.length) return { phase: "DONE", ids: [] };
  return { phase: "NEW", ids: fresh.map((q) => q.questionId) };
}
