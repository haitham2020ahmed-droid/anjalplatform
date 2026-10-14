/** One-time notices a user dismisses (UserNotice), e.g. the "New: skill stars" card on the teacher home. */
import type { Repo } from "../seeding/repo";

export const STARS_NOTICE = "skill-stars";

/** Has the user dismissed this notice? (one read; a missing table counts as dismissed — nothing to show) */
export async function noticeSeen(repo: Repo, userId: string, key: string): Promise<boolean> {
  try { return (await repo.findMany("UserNotice", { userId, key }, { select: ["key"] })).length > 0; } catch { return true; }
}

export async function dismissNotice(repo: Repo, userId: string, key: string, now = new Date()): Promise<void> {
  if (await noticeSeen(repo, userId, key)) return;
  try { await repo.create("UserNotice", { userId, key, seenAt: now }); } catch { /* already there */ }
}
