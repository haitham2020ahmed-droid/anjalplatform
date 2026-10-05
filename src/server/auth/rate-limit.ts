/**
 * Fixed-window rate limiter stored in RateLimitBucket (works across app servers).
 * Small race windows between read and write only ever allow a handful of extra
 * attempts, which is acceptable for login throttling (lockout is the hard stop).
 */
import type { Repo } from "../seeding/repo";

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export async function consumeRateLimit(repo: Repo, key: string, max: number, windowMs: number, now = new Date()): Promise<RateResult> {
  const b = await repo.findUnique("RateLimitBucket", { key });
  const start = b ? new Date(String(b.windowStart instanceof Date ? b.windowStart.toISOString() : b.windowStart)) : null;
  if (!b || !start || now.getTime() - start.getTime() >= windowMs) {
    await repo.upsert("RateLimitBucket", { key }, { count: 1, windowStart: now }, { count: 1, windowStart: now });
    return { allowed: true, remaining: max - 1, retryAfterMs: 0 };
  }
  const count = Number(b.count);
  const retryAfterMs = windowMs - (now.getTime() - start.getTime());
  if (count >= max) return { allowed: false, remaining: 0, retryAfterMs };
  await repo.updateMany("RateLimitBucket", { key }, { count: count + 1 });
  return { allowed: true, remaining: max - count - 1, retryAfterMs: 0 };
}

export async function resetRateLimit(repo: Repo, key: string): Promise<void> {
  await repo.deleteMany("RateLimitBucket", { key });
}

/** Nightly cleanup. */
export async function purgeRateLimits(repo: Repo, olderThan: Date): Promise<number> {
  return repo.deleteMany("RateLimitBucket", { windowStart: { lt: olderThan } });
}
