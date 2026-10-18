/**
 * 🚩 Flags of removed questions (owner, r68): a question an admin deleted, hid or archived leaves Flagged Questions
 * “To check” — its open reports are resolved as REMOVED (kept, with the date: the tab “Removed” lists them).
 *
 *   resolveFlagsOfRemoved  at the moment of the delete / hide / archive (question-delete.ts, purgeQuestionRows)
 *   sweepRemovedFlags      for reports already open on a removed question (the flag list, Fix stuck questions):
 *                          the school's open reports only, read in small batches
 */
import type { Repo } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
export const REMOVED = "REMOVED";
const BATCH = 300;

/** Open reports of these questions → REMOVED. Returns how many. */
export async function resolveFlagsOfRemoved(repo: Repo, questionIds: string[], now = new Date(), actorId: string | null = null): Promise<number> {
  let n = 0;
  const ids = [...new Set(questionIds.map(s).filter(Boolean))];
  for (let i = 0; i < ids.length; i += BATCH) n += await repo.updateMany("QuestionFlag", { questionId: { in: ids.slice(i, i + BATCH) }, status: "OPEN" }, { status: REMOVED, resolvedAt: now, resolvedById: actorId });
  return n;
}

/** A question that left the platform: gone, deleted / hidden (deletedAt) or archived. */
export const isRemovedQuestion = (q: Record<string, unknown> | null | undefined): boolean => !q || Boolean(q.deletedAt) || s(q.status) === "ARCHIVED";

/** The school's open reports whose question was removed → REMOVED. Returns how many. */
export async function sweepRemovedFlags(repo: Repo, schoolId: string, now = new Date()): Promise<number> {
  const open = await repo.findMany("QuestionFlag", { schoolId, status: "OPEN" }, { select: ["questionId"] });
  const qids = [...new Set(open.map((f) => s(f.questionId)))];
  const removed: string[] = [];
  for (let i = 0; i < qids.length; i += BATCH) {
    const part = qids.slice(i, i + BATCH);
    const qs = new Map((await repo.findMany("Question", { id: { in: part } }, { select: ["id", "deletedAt", "status"] })).map((q) => [s(q.id), q]));
    for (const id of part) if (isRemovedQuestion(qs.get(id))) removed.push(id);
  }
  return removed.length ? resolveFlagsOfRemoved(repo, removed, now) : 0;
}
