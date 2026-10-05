/**
 * Nightly job (MySQL): analytics rollups + purge of expired sessions and old rate-limit rows.
 * Analytics part: Recomputes the summary tables for the last N days
 * (default 2, so late-arriving answers are included). Safe to re-run.
 * Schedule: cron `15 2 * * *  cd /app && npm run jobs:rollups`
 */
import { PrismaClient } from "@prisma/client";
import { classSkillDailyRollupSql, studentDailyRollupSql } from "../../src/analytics/rollups";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { purgeRateLimits } from "../../src/server/auth/rate-limit";
import { purgeExpiredSessions } from "../../src/server/auth/sessions";
import { scanInterventions } from "../../src/server/teacher/interventions";
import { buildSnapshots } from "../../src/server/analytics/snapshots";

const days = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 2);
const prisma = new PrismaClient();

async function main() {
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  to.setUTCDate(to.getUTCDate() + 1);
  const from = new Date(to.getTime() - days * 86_400_000);
  const t = Date.now();
  const a = await prisma.$executeRawUnsafe(studentDailyRollupSql("mysql"), from, to);
  const b = await prisma.$executeRawUnsafe(classSkillDailyRollupSql("mysql"), from, to);
  const repo = new PrismaRepo(prisma);
  const sessions = await purgeExpiredSessions(repo);
  const buckets = await purgeRateLimits(repo, new Date(Date.now() - 86_400_000));
  const students = (await repo.findMany("Student", { deletedAt: null })).map((st) => String(st.id));
  const alerts = await scanInterventions(repo, students);
  const snaps = await buildSnapshots(repo, students, from, to);
  console.log(`growth snapshots written: ${snaps}`);
  console.log(`intervention scan: ${alerts} new alerts across ${students.length} students`);
  console.log(`purged ${sessions} expired sessions, ${buckets} old rate-limit buckets`);
  console.log(`rollups ${from.toISOString().slice(0, 10)}..${to.toISOString().slice(0, 10)}: student-day ${a}, class-skill-day ${b} (${Date.now() - t} ms)`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
