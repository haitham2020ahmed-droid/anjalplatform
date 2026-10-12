/**
 * 🔁 No repeated questions in skill practice (per student, per skill family, across sessions).
 *
 *   1. A question the student already answered is never shown again (any session, any grade's copy of the skill:
 *      pooled family questions record attempts on the skill id the student opened, so the whole family is read).
 *   2. When every question within reach of the student's level is answered, ONLY the questions answered wrong and
 *      never answered correctly come back (never one of the last RETRY_GAP answers: no immediate repeat).
 *   3. A question answered correctly never comes back.
 *   4. When nothing is left, the skill is finished ("You finished this skill! 🎉") and the work is Done.
 *   5. With Assignment.questionIds (the teacher's picks) the same rules apply inside the picked questions.
 *
 * Only WHICH question comes next changes: the adaptive engine (ability, levels, mastery) is untouched — the engine
 * still scores every answer against the whole pool, it is only offered the allowed questions to choose from.
 * Games, Second Chance and the Diagnostic are excluded: they never call this, and Diagnostic answers do not count
 * as "answered" here (games and Second Chance never write QuestionAttempt rows).
 *
 * Reads: ONE bounded, indexed query on QuestionAttempt (studentId, skillId IN family → @@index([studentId, skillId,
 * createdAt])), plus the student's few Diagnostic sessions in the same round trip.
 */
import { MAX_ABOVE_THETA } from "../../adaptive/selector";
import { modelVersion } from "../cache/bank-version";
import { skillFamilyIds } from "../questions/skill-questions";
import type { Repo } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");

/** A missed question comes back only when it is not one of the student's last RETRY_GAP answers in this session. */
export const RETRY_GAP = 3;

/** The questions a missed one must not repeat right after: the last RETRY_GAP answers of the session (oldest first). */
export const recentOf = (sessionQuestionIds: readonly string[]): Set<string> => new Set(sessionQuestionIds.slice(-RETRY_GAP));

/** At most this many past answers are read for one skill family (newest first). */
export const NO_REPEAT_HISTORY_CAP = 5000;

export interface AnswerState {
  /** every question the student answered (outside the Diagnostic) */
  answered: Set<string>;
  /** questions answered correctly at least once */
  correct: Set<string>;
}

let diagCache: { v: string; at: number; ids: Set<string> } | null = null;
/** Ids of the Diagnostic assessments (few rows; cached while no Assessment write happened, at most 10 minutes). */
async function diagnosticAssessmentIds(repo: Repo): Promise<Set<string>> {
  const v = modelVersion("Assessment");
  if (diagCache && diagCache.v === v && Date.now() - diagCache.at < 600_000) return diagCache.ids;
  const rows = await repo.findMany("Assessment", { type: "DIAGNOSTIC" }, { select: ["id"], take: 2000 });
  diagCache = { v, at: Date.now(), ids: new Set(rows.map((r) => s(r.id))) };
  return diagCache.ids;
}

/** What the student has answered in this skill's family (one bounded indexed read). */
export async function answerState(repo: Repo, studentId: string, skillId: string): Promise<AnswerState> {
  const family = await skillFamilyIds(repo, skillId);
  const ids = family.length ? family : [skillId];
  const [rows, sessions, diag] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId, skillId: { in: ids } }, { select: ["questionId", "isCorrect", "sessionId"], orderBy: [{ field: "createdAt", dir: "desc" }], take: NO_REPEAT_HISTORY_CAP }),
    // the Diagnostic's sessions (its own mode, or a set of a DIAGNOSTIC assessment): their answers do not count here
    repo.findMany("PracticeSession", { studentId, mode: { in: ["DIAGNOSTIC", "TEACHER_QUIZ"] } }, { select: ["id", "mode", "assessmentId"], take: 2000 }),
    diagnosticAssessmentIds(repo),
  ]);
  const skip = new Set(sessions.filter((x) => x.mode === "DIAGNOSTIC" || diag.has(s(x.assessmentId))).map((x) => s(x.id)));
  const state: AnswerState = { answered: new Set(), correct: new Set() };
  for (const r of rows) {
    if (skip.has(s(r.sessionId))) continue;
    state.answered.add(s(r.questionId));
    if (r.isCorrect) state.correct.add(s(r.questionId));
  }
  return state;
}

/** The state after one more answer (the answer being saved is not read back from the database). */
export function withAnswer(state: AnswerState, questionId: string, correct: boolean): AnswerState {
  const answered = new Set(state.answered), right = new Set(state.correct);
  answered.add(questionId);
  if (correct) right.add(questionId);
  return { answered, correct: right };
}

export type AllowedPhase = "NEW" | "RETRY" | "LATER" | "DONE";
export interface Allowed {
  /** NEW: unanswered questions · RETRY: missed ones only · LATER: the missed ones were all just answered · DONE: nothing left */
  phase: AllowedPhase;
  ids: string[];
}

/**
 * Pure: which questions of the pool may be served next.
 *   NEW   → the unanswered ones (when at least one is within reach of the student's level; the engine picks among them)
 *   RETRY → else the ones answered wrong and never answered correctly, except the `recent` ones (just answered)
 *   NEW   → else unanswered ones out of reach (the engine treats them as a content gap, as before)
 *   LATER → else missed ones remain, but each was just answered (they come back later)
 *   DONE  → nothing left: the skill is finished
 */
export function allowedQuestions(pool: { questionId: string; b: number }[], state: AnswerState, recent: ReadonlySet<string>, theta: number): Allowed {
  const unanswered = pool.filter((q) => !state.answered.has(q.questionId) && !recent.has(q.questionId));
  if (unanswered.some((q) => q.b <= theta + MAX_ABOVE_THETA)) return { phase: "NEW", ids: unanswered.map((q) => q.questionId) };
  const missed = pool.filter((q) => state.answered.has(q.questionId) && !state.correct.has(q.questionId));
  const retry = missed.filter((q) => !recent.has(q.questionId));
  if (retry.length) return { phase: "RETRY", ids: retry.map((q) => q.questionId) };
  if (unanswered.length) return { phase: "NEW", ids: unanswered.map((q) => q.questionId) };
  if (missed.length) return { phase: "LATER", ids: [] };
  return { phase: "DONE", ids: [] };
}
