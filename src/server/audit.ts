/**
 * Audit logging. Every security-relevant or data-changing admin action is recorded:
 * logins (success/failure/lockout), password changes and resets, role/class changes,
 * question publishing, settings changes, imports.
 * Never store secrets: password fields are stripped from before/after snapshots.
 */
import type { Repo } from "./seeding/repo";

export interface AuditEntry {
  actorId: string | null;
  action: string; // e.g. "auth.login.success", "user.password.reset"
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  at?: Date;
}

const SECRET_KEYS = /password|token|secret|hash/i;

export function redact(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!obj) return null;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : v]));
}

export async function audit(repo: Repo, e: AuditEntry): Promise<void> {
  await repo.create("AuditLog", {
    actorId: e.actorId,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    before: redact(e.before ?? null),
    after: redact(e.after ?? null),
    ip: e.ip ?? null,
    createdAt: e.at ?? new Date(),
  });
}
