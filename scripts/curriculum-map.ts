/**
 * Curriculum Map (Grades 4–6), from data/curriculum-map/source.txt.
 *
 *   npx tsx scripts/curriculum-map.ts backup   → backs up all curriculum tables to backups/ (run BEFORE `npx prisma db push`)
 *   npx tsx scripts/curriculum-map.ts seed     → creates the map in every school that has Grades 4–6 (needs a backup from today)
 *   npx tsx scripts/curriculum-map.ts verify   → compares the database with the source and prints the summary
 *
 * Only the CurriculumMapNode table is written. Nothing is deleted. No questions are created.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../src/server/db/prisma-repo";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { backupCurriculum, printSummary, seedCurriculumMap, verifyCurriculumMap } from "../src/server/curriculum-map/seed";

const BACKUPS = join(process.cwd(), "backups");
const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const cmd = process.argv[2];
  if (!["backup", "seed", "verify"].includes(cmd ?? "")) { console.log("Usage: npx tsx scripts/curriculum-map.ts backup | seed | verify"); process.exit(1); }
  const map = parseCurriculumMap(readFileSync(join(process.cwd(), "data/curriculum-map/source.txt"), "utf8"));
  const prisma = new PrismaClient();
  try {
    const repo = new PrismaRepo(prisma);
    if (cmd === "backup") {
      mkdirSync(BACKUPS, { recursive: true });
      const b = await backupCurriculum(repo);
      const file = join(BACKUPS, `curriculum-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
      writeFileSync(file, JSON.stringify(b));
      console.log(`Curriculum tables backed up:\n${Object.entries(b.counts).map(([t, n]) => `  ${t}: ${n}`).join("\n")}\nFile: ${file}`);
      return;
    }
    if (cmd === "seed") {
      let hasBackup = false;
      try { hasBackup = readdirSync(BACKUPS).some((f) => f.startsWith(`curriculum-${today()}`)); } catch { /* no folder */ }
      if (!hasBackup) { console.log("No curriculum backup from today. Run first:  npx tsx scripts/curriculum-map.ts backup"); process.exitCode = 1; return; }
      const r = await seedCurriculumMap(repo, map);
      for (const g of r.grades) console.log(`Grade ${g.level} (school ${g.schoolId}): ${g.created} nodes created, ${g.updated} updated`);
      if (!r.grades.length) console.log("No Grade 4, 5 or 6 found. Create the grades first (Admin → Curriculum).");
      const v = await verifyCurriculumMap(repo, map);
      console.log("\n=== Verification summary ===");
      printSummary(v, r.questionsAfter - r.questionsBefore);
      if (!v.ok) process.exitCode = 2;
      return;
    }
    const v = await verifyCurriculumMap(repo, map);
    console.log("=== Verification summary ===");
    printSummary(v, 0);
    if (!v.ok) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
