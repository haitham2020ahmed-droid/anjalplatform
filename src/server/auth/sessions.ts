/**
 * Server-side sessions.
 *  - The cookie holds a random token; the DB stores only sha256(token).
 *  - A session is valid only if: it exists, it is not past its absolute expiry,
 *    it has been used within the idle window, its version equals the user's
 *    current sessionVersion ("log out everywhere"), and the user is active.
 */
import type { Repo, Row } from "../seeding/repo";
import { generateToken, hashToken, type AuthConfig } from "./config";

export interface SessionMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export type InvalidReason = "NOT_FOUND" | "EXPIRED" | "IDLE" | "REVOKED" | "USER_INACTIVE";

export interface ValidSession {
  ok: true;
  user: Row;
  sessionId: string;
  expiresAt: Date;
}

export async function createSession(repo: Repo, user: Row, cfg: AuthConfig, meta: SessionMeta = {}, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + cfg.sessionTtlMinutes * 60_000);
  await repo.create("Session", {
    id: hashToken(token),
    userId: user.id,
    version: Number(user.sessionVersion ?? 0),
    expiresAt,
    lastSeenAt: now,
    createdAt: now,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 255) : null,
  });
  return { token, expiresAt };
}

const toDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

/** sessionId → userId, per database connection (never changes for a session; bounded size). */
const owners = new WeakMap<object, Map<string, string>>();
function sessionOwner(repo: Repo): Map<string, string> {
  let m = owners.get(repo as object);
  if (!m) { m = new Map(); owners.set(repo as object, m); }
  return m;
}
function rememberOwner(repo: Repo, id: string, userId: string): void {
  const m = sessionOwner(repo);
  if (m.size > 5000) m.clear();
  m.set(id, userId);
}

export async function validateSession(repo: Repo, token: string | undefined | null, cfg: AuthConfig, now = new Date()): Promise<ValidSession | { ok: false; reason: InvalidReason }> {
  if (!token || token.length < 20 || token.length > 100) return { ok: false, reason: "NOT_FOUND" };
  const id = hashToken(token);
  // a session always belongs to the same user: once known, fetch both rows together (1 round trip, not 2).
  // Every check below still runs on fresh rows from the database.
  const known = sessionOwner(repo).get(id);
  const [s, early] = await Promise.all([repo.findUnique("Session", { id }), known ? repo.findUnique("User", { id: known }) : Promise.resolve(null)]);
  if (!s) { sessionOwner(repo).delete(id); return { ok: false, reason: "NOT_FOUND" }; }
  const expiresAt = toDate(s.expiresAt);
  const lastSeen = toDate(s.lastSeenAt);
  if (now >= expiresAt) {
    await repo.deleteMany("Session", { id });
    return { ok: false, reason: "EXPIRED" };
  }
  if (now.getTime() - lastSeen.getTime() > cfg.idleMinutes * 60_000) {
    await repo.deleteMany("Session", { id });
    return { ok: false, reason: "IDLE" };
  }
  const user = early && early.id === s.userId ? early : await repo.findUnique("User", { id: s.userId });
  rememberOwner(repo, id, String(s.userId));
  if (!user || !user.isActive || user.deletedAt) {
    await repo.deleteMany("Session", { id });
    return { ok: false, reason: "USER_INACTIVE" };
  }
  if (Number(user.sessionVersion) !== Number(s.version)) {
    await repo.deleteMany("Session", { id });
    return { ok: false, reason: "REVOKED" };
  }
  if (now.getTime() - lastSeen.getTime() > cfg.touchEveryMinutes * 60_000) {
    await repo.updateMany("Session", { id }, { lastSeenAt: now });
  }
  return { ok: true, user, sessionId: id, expiresAt };
}

/** Log out this device. */
export async function revokeSession(repo: Repo, token: string): Promise<void> {
  await repo.deleteMany("Session", { id: hashToken(token) });
}

/** Log out everywhere (password change, admin reset, lost device). */
export async function revokeAllSessions(repo: Repo, userId: string): Promise<void> {
  const user = await repo.findUnique("User", { id: userId });
  if (!user) return;
  await repo.updateMany("User", { id: userId }, { sessionVersion: Number(user.sessionVersion) + 1 });
  await repo.deleteMany("Session", { userId });
}

/** Nightly cleanup of expired sessions. */
export async function purgeExpiredSessions(repo: Repo, now = new Date()): Promise<number> {
  return repo.deleteMany("Session", { expiresAt: { lt: now } });
}
