/**
 * Removes questions that need a reading passage but have none.
 *
 *   npx tsx scripts/cleanup-missing-passages.ts report    → lists what would happen; changes nothing
 *   npx tsx scripts/cleanup-missing-passages.ts execute   → backup, then delete/archive, then verify
 *
 * Files (in backups/missing-passages-<date>/, not committed to git):
 *   backup.json        the deleted questions with options, answers, explanations, images (restorable:
 *                      npx tsx scripts/cleanup-questions.ts restore backups/missing-passages-<date>/backup.json)
 *   deletion-log.csv   Question ID, Question Text, Skill, Grade, Standard, Deletion reason, Action (opens in Excel)
 * Rules: src/server/admin/passage-cleanup.ts. Grades, units, skills, standards, curriculum and users are never changed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../src/server/db/prisma-repo";
import { backupSubset, executePassageCleanup, findMissingPassageQuestions, type FlaggedQuestion } from "../src/server/admin/passage-cleanup";

const ACTION_TEXT: Record<FlaggedQuestion["action"], string> = {
  DELETE: "Deleted",
  ARCHIVE: "Archived (students answered it before; their history is kept)",
  KEEP_IN_ASSIGNMENT: "Kept (part of a set a teacher assigned) - review manually",
};
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
function writeLog(dir: string, flagged: FlaggedQuestion[]): string {
  const lines = [["Question ID", "Question Text", "Skill", "Grade", "Standard", "Deletion reason", "Action"].map(csvCell).join(",")];
  for (const f of flagged) lines.push([f.id, f.text, f.skill, f.grade ?? "", f.standard, f.reason, ACTION_TEXT[f.action]].map(csvCell).join(","));
  const file = join(dir, "deletion-log.csv");
  writeFileSync(file, "\ufeff" + lines.join("\r\n"), "utf8"); // BOM: Excel shows Arabic/quotes correctly
  return file;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd !== "report" && cmd !== "execute") {
    console.log("Usage: npx tsx scripts/cleanup-missing-passages.ts report | execute");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const repo = new PrismaRepo(prisma);
    console.log("Scanning the question bank…");
    const flagged = await findMissingPassageQuestions(repo);
    const n = (a: FlaggedQuestion["action"]) => flagged.filter((f) => f.action === a).length;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dir = join(process.cwd(), "backups", `missing-passages-${stamp}${cmd === "report" ? "-preview" : ""}`);
    mkdirSync(dir, { recursive: true });
    const log = writeLog(dir, flagged);
    console.log(`\nQuestions that need a passage but have none: ${flagged.length}`);
    console.log(`  will be deleted:   ${n("DELETE")}`);
    console.log(`  will be archived:  ${n("ARCHIVE")}   (answered by students before: hidden, history kept)`);
    console.log(`  kept for review:   ${n("KEEP_IN_ASSIGNMENT")}   (part of a set a teacher assigned)`);
    const bySkill = new Map<string, number>();
    for (const f of flagged) bySkill.set(`G${f.grade ?? "?"} · ${f.skill}`, (bySkill.get(`G${f.grade ?? "?"} · ${f.skill}`) ?? 0) + 1);
    if (bySkill.size) { console.log("\nBy skill:"); for (const [k, v] of [...bySkill].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(v).padStart(4)}  ${k}`); }
    if (flagged.length) { console.log("\nExamples:"); for (const f of flagged.slice(0, 5)) console.log(`  - ${f.text.slice(0, 100)}`); }
    console.log(`\nList: ${log}`);
    if (cmd === "report") { console.log("\nNothing was changed. Run with execute to clean up."); return; }
    if (!flagged.length) { console.log("\nNothing to clean up."); return; }

    console.log("\n1/3 Backing up the questions that will be deleted…");
    const del = flagged.filter((f) => f.action === "DELETE").map((f) => f.id);
    const backup = await backupSubset(repo, del);
    const backupFile = join(dir, "backup.json");
    writeFileSync(backupFile, JSON.stringify(backup));
    if (backup.tables.Question.length !== del.length) throw new Error(`Backup incomplete (${backup.tables.Question.length} of ${del.length}); nothing was deleted.`);
    console.log(`    ${backup.tables.Question.length} questions backed up.`);
    console.log("2/3 Deleting and archiving…");
    const r = await executePassageCleanup(repo, flagged);
    console.log("3/3 Verifying the question bank…");
    console.log("\n==================================================");
    console.log(`Deleted questions:    ${r.deleted}`);
    console.log(`Archived questions:   ${r.archived}`);
    console.log(`Kept for review:      ${r.kept}`);
    console.log(`Remaining questions:  ${r.remaining}`);
    console.log(`Backup file:          ${backupFile}`);
    console.log(`Deletion log:         ${log}`);
    console.log(`Integrity:            ${r.integrity.ok ? "OK - no broken relationships; grades, units, skills, standards, curriculum and users unchanged" : "PROBLEMS:"}`);
    for (const p of r.integrity.problems) console.log(`  - ${p}`);
    console.log("==================================================");
    console.log(`To undo the deletion: npx tsx scripts/cleanup-questions.ts restore "${backupFile}"`);
    if (!r.integrity.ok) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
