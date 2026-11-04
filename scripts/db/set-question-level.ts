/**
 * Moves specific questions (by id) to a chosen difficulty level (1-7), exactly like editing the "Difficulty"
 * field on a question's own Admin → Questions page — same effect, just for several questions at once.
 *
 * SAFE BY DESIGN:
 *  - Only ever changes Question.difficultyLevel (and difficultySource → "MANUAL", so the nightly auto-reclassify
 *    job never changes it back based on student answers — the same thing the admin editor does by hand).
 *  - Never touches stem, options, skill, lesson, or any student data.
 *  - Two-step: run with no --apply first to see exactly what would change; nothing is written until you add --apply.
 *
 *   DATABASE_URL="…" npx tsx scripts/db/set-question-level.ts <questionId>=<level> [<questionId>=<level> ...]
 *   DATABASE_URL="…" npx tsx scripts/db/set-question-level.ts <questionId>=<level> [...] --apply
 *
 * Levels: 1-3 = Approaching, 4 = Meeting (On), 5-7 = Exceeding.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const LEVEL_NAME: Record<number, string> = { 1: "Approaching", 2: "Approaching", 3: "Approaching", 4: "Meeting", 5: "Exceeding", 6: "Exceeding", 7: "Exceeding" };

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--apply");
  const APPLY = process.argv.includes("--apply");
  if (!args.length) {
    console.log("Usage: npx tsx scripts/db/set-question-level.ts <questionId>=<level 1-7> [<questionId>=<level> ...] [--apply]");
    process.exit(1);
  }

  const changes: { id: string; to: number }[] = [];
  for (const a of args) {
    const [id, lvlRaw] = a.split("=");
    const to = Number(lvlRaw);
    if (!id || !(to >= 1 && to <= 7)) { console.log(`Skipping bad entry "${a}" — expected questionId=1..7.`); continue; }
    changes.push({ id, to });
  }
  if (!changes.length) { console.log("Nothing valid to do."); return; }

  const questions = await prisma.question.findMany({ where: { id: { in: changes.map((c) => c.id) }, deletedAt: null } });
  const byId = new Map(questions.map((q) => [q.id, q]));

  console.log(`${APPLY ? "Applying" : "Dry run — would apply"} ${changes.length} change(s):\n`);
  for (const c of changes) {
    const q = byId.get(c.id);
    if (!q) { console.log(`  • ${c.id} — NOT FOUND, skipped.`); continue; }
    console.log(`  • ${c.id}  "${String(q.stem).slice(0, 70)}${String(q.stem).length > 70 ? "…" : ""}"`);
    console.log(`      ${q.difficultyLevel} (${LEVEL_NAME[q.difficultyLevel]})  →  ${c.to} (${LEVEL_NAME[c.to]})`);
    if (APPLY) await prisma.question.update({ where: { id: c.id }, data: { difficultyLevel: c.to, difficultySource: "MANUAL" } });
  }
  console.log(APPLY ? "\nDone — saved." : "\nDry run — nothing changed. Re-run with --apply at the end to actually save these.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
