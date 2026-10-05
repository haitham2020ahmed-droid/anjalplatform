/**
 * Daily security digest job: summarises the last 24 hours of the audit log and sends
 * any alerts to ALERT_WEBHOOK_URL (and always to the log). Schedule: scripts/jobs/schedule.ts.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { log } from "../../src/server/monitoring/log";
import { securityDigest } from "../../src/server/monitoring/security-digest";

const prisma = new PrismaClient();

async function main() {
  const d = await securityDigest(new PrismaRepo(prisma));
  log(d.alerts.length ? "warn" : "info", "security.digest", { ...d.totals, alerts: d.alerts });
  const url = process.env.ALERT_WEBHOOK_URL;
  if (url && d.alerts.length) {
    const text = [`Al-Anjal ELA security digest (${d.from.slice(0, 10)}):`, ...d.alerts.map((a) => `• [${a.severity}] ${a.message}`)].join("\n");
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(10_000) });
  }
}

main()
  .catch((e) => {
    log("error", "security.digest.failed", { error: e });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
