/**
 * Daily security digest (Phase 13): reads the last 24 hours of the audit log and raises
 * alerts for patterns worth a human look. Thresholds are deliberately simple and
 * explainable; tune them in SECURITY_THRESHOLDS.
 */
import type { Repo } from "../seeding/repo";

export const SECURITY_THRESHOLDS = {
  loginFailuresPerIp: 30, // possible password guessing from one address
  lockouts: 10, // many accounts locked in one day
  deniedActions: 5, // someone repeatedly tried something they may not do
  exportsPerUser: 150, // possible bulk download of student data
  newAdmins: 1, // every new school admin account is worth a look
};

export interface DigestAlert {
  rule: "login_failures_ip" | "lockouts" | "denied_actions" | "bulk_exports" | "new_admin" | "rate_limited";
  severity: "warning" | "critical";
  message: string;
  count: number;
}

export interface Digest {
  from: string;
  to: string;
  totals: { logins: number; loginFailures: number; lockouts: number; denied: number; exports: number; adminChanges: number };
  alerts: DigestAlert[];
}

type AuditRow = { action: string; actorId: string | null; ip: string | null; after: unknown; createdAt: Date };

const asObj = (v: unknown) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : v ?? {}) as Record<string, unknown>;

export function computeDigest(rows: AuditRow[], from: Date, to: Date, t = SECURITY_THRESHOLDS): Digest {
  const inWindow = rows.filter((r) => r.createdAt >= from && r.createdAt < to);
  const count = (pred: (r: AuditRow) => boolean) => inWindow.filter(pred).length;
  const alerts: DigestAlert[] = [];

  const failuresByIp = new Map<string, number>();
  for (const r of inWindow) if (r.action === "auth.login.failure" || r.action === "auth.login.locked") failuresByIp.set(r.ip ?? "unknown", (failuresByIp.get(r.ip ?? "unknown") ?? 0) + 1);
  for (const [ip, n] of failuresByIp) if (n >= t.loginFailuresPerIp) alerts.push({ rule: "login_failures_ip", severity: n >= 3 * t.loginFailuresPerIp ? "critical" : "warning", message: `${n} failed sign-ins from ${ip}`, count: n });

  const lockouts = count((r) => r.action === "auth.login.locked");
  if (lockouts >= t.lockouts) alerts.push({ rule: "lockouts", severity: "warning", message: `${lockouts} accounts locked after failed sign-ins`, count: lockouts });

  const rateLimited = count((r) => r.action === "auth.login.rate_limited");
  if (rateLimited >= t.loginFailuresPerIp) alerts.push({ rule: "rate_limited", severity: "warning", message: `${rateLimited} sign-in attempts were rate limited`, count: rateLimited });

  const deniedBy = new Map<string, number>();
  for (const r of inWindow) if (r.action.endsWith(".denied")) deniedBy.set(r.actorId ?? "unknown", (deniedBy.get(r.actorId ?? "unknown") ?? 0) + 1);
  for (const [actor, n] of deniedBy) if (n >= t.deniedActions) alerts.push({ rule: "denied_actions", severity: "warning", message: `user ${actor} was refused ${n} times`, count: n });

  const exportsBy = new Map<string, number>();
  for (const r of inWindow) if (r.action === "report.export") exportsBy.set(r.actorId ?? "unknown", (exportsBy.get(r.actorId ?? "unknown") ?? 0) + 1);
  for (const [actor, n] of exportsBy) if (n >= t.exportsPerUser) alerts.push({ rule: "bulk_exports", severity: "warning", message: `user ${actor} downloaded ${n} reports`, count: n });

  const newAdmins = inWindow.filter((r) => (r.action === "user.create" || r.action === "user.bootstrap") && asObj(r.after).role === "SCHOOL_ADMIN").length;
  if (newAdmins >= t.newAdmins) alerts.push({ rule: "new_admin", severity: "warning", message: `${newAdmins} new school admin account(s) created`, count: newAdmins });

  return {
    from: from.toISOString(), to: to.toISOString(),
    totals: {
      logins: count((r) => r.action === "auth.login.success"),
      loginFailures: count((r) => r.action === "auth.login.failure" || r.action === "auth.login.locked"),
      lockouts, denied: count((r) => r.action.endsWith(".denied")), exports: count((r) => r.action === "report.export"),
      adminChanges: count((r) => /^(user|settings|school|class|teacher|student|parent|roster)\./.test(r.action)),
    },
    alerts,
  };
}

export async function securityDigest(repo: Repo, now = new Date()): Promise<Digest> {
  const from = new Date(now.getTime() - 86_400_000);
  const rows = (await repo.findMany("AuditLog", { createdAt: { gte: from } })) as unknown as AuditRow[];
  return computeDigest(rows.map((r) => ({ ...r, createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(String(r.createdAt)) })), from, now);
}
