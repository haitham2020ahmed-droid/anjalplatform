/**
 * One-off repair (readiness C-2): answers saved by "Review my mistakes" before Update 39A stored the raw answer instead
 * of { value }. This wraps them in the practice shape. Safe to run more than once (rows already wrapped are skipped).
 *
 *   npx tsx scripts/db/fix-review-responses.ts           # dry run: counts only
 *   npx tsx scripts/db/fix-review-responses.ts --apply   # writes
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { wrapReviewResponses } from "../../src/server/teacher/review-repair";

const prisma = new PrismaClient();
wrapReviewResponses(new PrismaRepo(prisma), process.argv.includes("--apply"))
  .then((r) => console.log(JSON.stringify(r)))
  .catch((e) => { console.error((e as Error).message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
