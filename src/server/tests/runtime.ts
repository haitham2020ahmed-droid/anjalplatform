/**
 * Teacher-built tests in the quiz player (UI reorg Phase 5): the server-side clock (time limit) and the
 * deterministic per-student shuffle of question order and answer choices. Used by practice/session.ts; this file
 * never imports the session module (no cycle).
 */
import type { Repo, Row } from "../seeding/repo";
import { seededShuffle, type ClientQuestion, type PracticeItem } from "../practice/items";

/** Marks test assignments: kept out of My Work and the assignment lists (they live in My Tests). */
export const TEST_MARK = "TEST";
/** Seconds after the time limit during which a last answer is still accepted (network delay). */
export const TIME_GRACE_MS = 30_000;

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));

export const isTestAssignment = (a: Row | null | undefined): boolean => Boolean(a && a.testId);

/** The student's question order: the teacher's order, or (shuffle) a fixed order of their own. */
export function testOrder(a: Row, order: string[], studentId: string): string[] {
  if (!a.shuffle || order.length < 2) return [...order];
  return seededShuffle(order, `test-order:${s(a.id)}:${studentId}`);
}

const SHUFFLED = new Set(["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN"]);
/** The permutation shown to this student: position i shows original option perm[i]. */
function perm(n: number, seed: string): number[] {
  return seededShuffle([...Array(n).keys()], `test-choices:${seed}`);
}
export const choiceSeed = (a: Row, studentId: string, questionId: string) => `${s(a.id)}:${studentId}:${questionId}`;

/** Answer choices in this student's order, relabelled A, B, C… so the letters still read in order. */
export function shuffleChoices(q: ClientQuestion, seed: string): ClientQuestion {
  if (!SHUFFLED.has(String(q.type)) || !q.options || q.options.length < 2) return q;
  const labels = q.options.map((o) => o.label);
  const p = perm(q.options.length, seed);
  return { ...q, options: p.map((k, i) => ({ label: labels[i], text: q.options![k].text })) };
}

/** Maps the labels the student chose (shown order) back to the question's own labels before scoring. */
export function unshuffleResponse(item: PracticeItem, response: unknown, seed: string): unknown {
  const opts = item.options;
  if (!SHUFFLED.has(String(item.type)) || !opts || opts.length < 2) return response;
  const labels = opts.map((o) => o.label);
  const p = perm(opts.length, seed);
  const back = (v: unknown) => { const i = labels.indexOf(s(v)); return i < 0 ? v : labels[p[i]]; };
  if (Array.isArray(response)) return response.map(back);
  if (typeof response === "string") return back(response);
  return response;
}

/** When the student's time ends (null: no limit). Counted from the first opening of the test. */
export function testEndsAt(set: Row | null, session: Row | null): Date | null {
  const min = Number(set?.timeLimitMin ?? 0);
  const started = d(session?.startedAt);
  if (!min || min <= 0 || !started) return null;
  return new Date(started.getTime() + min * 60_000);
}
export function timeIsUp(set: Row | null, session: Row | null, now: Date): boolean {
  const end = testEndsAt(set, session);
  return Boolean(end && now.getTime() > end.getTime() + TIME_GRACE_MS);
}

/**
 * Time is up: the test ends with the answers given (unanswered questions count as wrong) and moves to Completed.
 * Returns the session as it is now.
 */
export async function finishTimedOut(repo: Repo, a: Row, session: Row, total: number, now: Date): Promise<Row> {
  if (session.endedAt) return session;
  await repo.updateMany("PracticeSession", { id: session.id, endedAt: null }, { endedAt: now, endReason: "TIMEOUT", currentServedAt: null });
  const answered = Number(session.questionCount ?? 0);
  await repo.updateMany("AssignmentStudent", { assignmentId: a.id, studentId: session.studentId }, { status: "COMPLETED", progress: total ? Math.min(1, Math.round((1000 * answered) / total) / 1000) : 1, completedAt: now });
  return { ...session, endedAt: now, endReason: "TIMEOUT", currentServedAt: null };
}
