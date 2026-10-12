/**
 * 👯 Removes EXACT duplicate questions (same normalized stem, choices, key, type and passage; same skill family).
 * One copy is kept per group (published first, then the most answers, then the oldest); every reference (student
 * answers, assessments, assignments' chosen questions, flags …) moves to the kept copy first. See
 * src/server/questions/dedupe.ts. Memory stays small: questions are read 500 at a time, needed columns only.
 *
 *   npx tsx scripts/db/dedupe-questions.ts               # dry run (default): what would be removed, per school
 *   npx tsx scripts/db/dedupe-questions.ts --apply       # removes them (TAKE A DATABASE BACKUP FIRST)
 *   … --school <schoolId>                                # one school only
 *   … --csv <file>                                       # with --apply: write the report of removed questions
 *   … --list                                             # also print every group
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { removedCsv, runDedupe } from "../../src/server/questions/dedupe";

async function main() {
  const prisma = new PrismaClient();
  try {
    const r = await runDedupe(new PrismaRepo(prisma), process.argv.slice(2));
    const at = process.argv.indexOf("--csv");
    if (at > 0 && process.argv[at + 1] && r.rows.length) { writeFileSync(process.argv[at + 1], removedCsv(r.rows)); console.log(`Report: ${process.argv[at + 1]}`); }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("dedupe-questions.ts")) main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
