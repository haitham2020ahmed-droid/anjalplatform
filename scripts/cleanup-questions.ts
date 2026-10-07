/**
 * ONE-TIME question bank cleanup. Run from your computer, with DATABASE_URL pointing at the database.
 *
 *   npx tsx scripts/cleanup-questions.ts report
 *       Changes NOTHING. Prints what would be deleted and what must stay the same, and writes a full
 *       backup to backups/ (JSON: everything, for restore; Excel: the import template format).
 *
 *   npx tsx scripts/cleanup-questions.ts execute --confirm DELETE-<count> [--include-practice-history]
 *       Deletes every question. Refuses if the code does not match the current count, if there is no
 *       backup from the last 24 hours with the same count, or if students have practised and the
 *       practice flag is missing. Verifies the result.
 *
 *   npx tsx scripts/cleanup-questions.ts restore backups/question-backup-….json
 *       Puts the questions back from a backup.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../src/server/db/prisma-repo";
import { backupQuestions, backupTemplateRows, cleanupReport, executeCleanup, restoreQuestions, type QuestionBackup } from "../src/server/admin/question-cleanup";
import { workbookXlsx } from "../src/imports/questions/template-files";

const DIR = join(process.cwd(), "backups");
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const line = (label: string, n: number) => console.log(`  ${label.padEnd(34, ".")} ${String(n).padStart(7)}`);

async function main() {
  const cmd = process.argv[2];
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Run this from the project folder where .env has the database address.");
  const prisma = new PrismaClient();
  const repo = new PrismaRepo(prisma);
  try {
    if (cmd === "report") {
      const r = await cleanupReport(repo);
      console.log(`\nQUESTION BANK: ${r.questions} questions  (${Object.entries(r.byStatus).map(([k, v]) => `${k} ${v}`).join(", ")})\n`);
      console.log("WILL BE DELETED:"); for (const [t, n] of Object.entries(r.deleted)) line(t, n);
      console.log("\nWILL BE CLEARED (the row stays, only the link to a question is emptied):"); for (const [t, n] of Object.entries(r.cleared)) line(t, n);
      console.log("\nSTUDENT PRACTICE HISTORY (deleted ONLY with --include-practice-history):"); for (const [t, n] of Object.entries(r.practice)) line(t, n);
      console.log("\nWILL NOT CHANGE (checked again after the cleanup):"); for (const [t, n] of Object.entries(r.kept)) line(t, n);
      mkdirSync(DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const backup = await backupQuestions(repo);
      const jsonPath = join(DIR, `question-backup-${stamp}.json`);
      writeFileSync(jsonPath, JSON.stringify(backup));
      const { rows, skipped } = await backupTemplateRows(repo, backup);
      const xlsxPath = join(DIR, `question-backup-${stamp}.xlsx`);
      writeFileSync(xlsxPath, workbookXlsx([{ name: "Questions", rows, widths: rows[0].map((h) => (h === "Question Text" || h === "Passage/Text" ? 50 : 16)), headerStyle: true, freeze: true }]));
      console.log(`\nBACKUP WRITTEN:\n  ${jsonPath}  (all ${backup.counts.Question} questions; use this to restore)\n  ${xlsxPath}  (${rows.length - 1} questions in the import template${skipped ? `; ${skipped} of other types are only in the JSON` : ""})`);
      console.log(`\nNothing was changed. To delete, the confirmation code is:  ${r.confirmCode}${r.needsPracticeFlag ? "\n⚠ Students have practised: execute also needs --include-practice-history (it clears practice history)." : ""}\n`);
    } else if (cmd === "execute") {
      const r = await cleanupReport(repo);
      const latest = readdirSync(DIR).filter((f) => /^question-backup-.*\.json$/.test(f)).map((f) => join(DIR, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
      if (!latest || Date.now() - statSync(latest).mtimeMs > 24 * 3600_000) throw new Error("No backup from the last 24 hours. Run the report first (it writes the backup).");
      const b = JSON.parse(readFileSync(latest, "utf8")) as QuestionBackup;
      if (b.counts.Question !== r.questions) throw new Error(`The latest backup has ${b.counts.Question} questions but the bank now has ${r.questions}. Run the report again.`);
      console.log(`Backup found: ${latest}\nDeleting ${r.questions} questions…`);
      const res = await executeCleanup(repo, { confirm: String(arg("--confirm") ?? ""), includePracticeHistory: process.argv.includes("--include-practice-history") });
      console.log(`\nDeleted ${res.deletedQuestions} questions.${Object.keys(res.practiceDeleted).length ? ` Practice history cleared: ${JSON.stringify(res.practiceDeleted)}` : ""}`);
      console.log(`VERIFY: questions left = ${res.verify.questionsLeft} ${res.verify.questionsLeft === 0 ? "✓" : "✗"}`);
      console.log(`VERIFY: curriculum, users, classes, passages unchanged = ${res.verify.keptUnchanged ? "✓" : `✗ (${res.verify.changedKept.join(", ")})`}`);
      console.log("The platform refreshes its practice cache within 60 seconds.");
      if (res.verify.questionsLeft !== 0 || !res.verify.keptUnchanged) process.exitCode = 1;
    } else if (cmd === "restore") {
      const file = process.argv[3];
      if (!file) throw new Error("Give the backup file: npx tsx scripts/cleanup-questions.ts restore backups/question-backup-….json");
      const out = await restoreQuestions(repo, JSON.parse(readFileSync(file, "utf8")) as QuestionBackup);
      console.log("Restored:", out);
    } else {
      console.log("Use: report | execute --confirm DELETE-<count> [--include-practice-history] | restore <backup.json>");
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(`\n✗ ${(e as Error).message}\n`); process.exitCode = 1; });
