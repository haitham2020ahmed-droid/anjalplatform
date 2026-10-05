/**
 * Username/password login.
 *
 * Security properties (each covered by tests/auth-integration.test.ts):
 *  - One generic error for unknown user, wrong password and inactive account,
 *    so the response never reveals which usernames exist.
 *  - Unknown usernames still run a full scrypt verification (timing equalization).
 *  - Rate limits per username+IP and per IP; account lockout after N failures.
 *  - Successful login resets the failure counter, upgrades weak hashes, records
 *    lastLoginAt and writes an audit entry; failures and lockouts are audited too.
 */
import type { Repo, Row } from "../seeding/repo";
import { audit } from "../audit";
import type { AuthConfig } from "./config";
import { hashPassword, needsRehash, verifyPassword } from "./password";
import { consumeRateLimit } from "./rate-limit";
import { createSession, type SessionMeta } from "./sessions";

export type LoginFailure = "INVALID_CREDENTIALS" | "LOCKED" | "RATE_LIMITED";
export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; user: Row; mustChangePassword: boolean }
  | { ok: false; error: LoginFailure; retryAfterMs?: number; message: string };

const MESSAGES: Record<LoginFailure, string> = {
  INVALID_CREDENTIALS: "The username or password is incorrect.",
  LOCKED: "Too many failed attempts. Please wait and try again, or ask your teacher.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
};

let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("timing-equalization-placeholder-1"));

export function normalizeUsername(u: string): string {
  return u.normalize("NFKC").trim().toLowerCase();
}

export async function login(
  repo: Repo,
  input: { username: string; password: string } & SessionMeta,
  cfg: AuthConfig,
  now = new Date(),
): Promise<LoginResult> {
  const username = normalizeUsername(input.username ?? "");
  const password = input.password ?? "";
  const ip = input.ip ?? "unknown";
  const windowMs = cfg.rateLimitWindowMinutes * 60_000;
  const fail = (error: LoginFailure, retryAfterMs?: number): LoginResult => ({ ok: false, error, retryAfterMs, message: MESSAGES[error] });

  if (!username || !password || username.length > 100 || password.length > 128) return fail("INVALID_CREDENTIALS");

  const perIp = await consumeRateLimit(repo, `login:ip:${ip}`, cfg.rateLimitPerIp, windowMs, now);
  const perAcct = await consumeRateLimit(repo, `login:acct:${username}:${ip}`, cfg.rateLimitPerAccount, windowMs, now);
  if (!perIp.allowed || !perAcct.allowed) {
    await audit(repo, { actorId: null, action: "auth.login.rate_limited", entityType: "User", entityId: null, after: { username, ip }, ip, at: now });
    return fail("RATE_LIMITED", Math.max(perIp.retryAfterMs, perAcct.retryAfterMs));
  }

  const user = await repo.findUnique("User", { username });
  if (!user || !user.passwordHash || !user.isActive || user.deletedAt) {
    await verifyPassword(password, await getDummyHash()); // equalize timing
    await audit(repo, { actorId: null, action: "auth.login.failure", entityType: "User", entityId: user ? String(user.id) : null, after: { username, reason: user ? "inactive" : "unknown" }, ip, at: now });
    return fail("INVALID_CREDENTIALS");
  }

  const lockedUntil = user.lockedUntil ? new Date(String(user.lockedUntil instanceof Date ? user.lockedUntil.toISOString() : user.lockedUntil)) : null;
  if (lockedUntil && lockedUntil > now) {
    await verifyPassword(password, await getDummyHash());
    return fail("LOCKED", lockedUntil.getTime() - now.getTime());
  }

  const ok = await verifyPassword(password, String(user.passwordHash));
  if (!ok) {
    const failures = Number(user.failedLogins ?? 0) + 1;
    const lock = failures >= cfg.maxFailedLogins;
    await repo.updateMany("User", { id: user.id }, {
      failedLogins: lock ? 0 : failures,
      lockedUntil: lock ? new Date(now.getTime() + cfg.lockoutMinutes * 60_000) : null,
    });
    await audit(repo, { actorId: String(user.id), action: lock ? "auth.login.locked" : "auth.login.failure", entityType: "User", entityId: String(user.id), after: { failures }, ip, at: now });
    return lock ? fail("LOCKED", cfg.lockoutMinutes * 60_000) : fail("INVALID_CREDENTIALS");
  }

  const update: Row = { failedLogins: 0, lockedUntil: null, lastLoginAt: now };
  if (needsRehash(String(user.passwordHash))) update.passwordHash = await hashPassword(password);
  await repo.updateMany("User", { id: user.id }, update);
  const fresh = (await repo.findUnique("User", { id: user.id }))!;
  const { token, expiresAt } = await createSession(repo, fresh, cfg, { ip, userAgent: input.userAgent }, now);
  await audit(repo, { actorId: String(user.id), action: "auth.login.success", entityType: "User", entityId: String(user.id), ip, at: now });
  return { ok: true, token, expiresAt, user: fresh, mustChangePassword: Boolean(fresh.mustChangePassword) };
}
