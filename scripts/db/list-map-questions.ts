/**
 * Read-only: prints every question placed on one Curriculum Map node (e.g. "G6.U1.SEL4.CV"), with its full text,
 * options/answer and current difficulty — so a human (or Claude, reading the terminal output) can judge each
 * question's real difficulty and decide which ones belong at a different level.
 *
 * Changes NOTHING. Use scripts/db/set-question-level.ts afterwards to actually move specific questions.
 *
 *   DATABASE_URL="…" npx tsx scripts/db/list-map-questions.ts G6.U1.SEL4.CV
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const LEVEL_NAME: Record<string, string> = { 1: "Approaching", 2: "Approaching", 3: "Approaching", 4: "Meeting", 5: "Exceeding", 6: "Exceeding", 7: "Exceeding" };

async function main() {
  const code = String(process.argv[2] ?? "").trim().toUpperCase();
  if (!code) { console.log('Usage: npx tsx scripts/db/list-map-questions.ts G6.U1.SEL4.CV'); process.exit(1); }

  const node = await prisma.curriculumMapNode.findFirst({ where: { code } });
  if (!node) { console.log(`No Curriculum Map node found with code "${code}".`); return; }

  const links = await prisma.questionMapLink.findMany({ where: { nodeId: node.id } });
  if (!links.length) { console.log(`Node "${code}" ("${node.title}") has no questions placed on it.`); return; }

  const questions = await prisma.question.findMany({
    where: { id: { in: links.map((l) => l.questionId) }, deletedAt: null },
    include: { options: { orderBy: { order: "asc" } }, answers: true, type: true },
  });
  questions.sort((a, b) => a.difficultyLevel - b.difficultyLevel || a.id.localeCompare(b.id));

  console.log(`Node: ${node.title}  (${code})`);
  console.log(`${questions.length} question(s) placed here:\n`);
  for (const q of questions) {
    console.log(`──────────────────────────────────────────────────────`);
    console.log(`ID: ${q.id}`);
    console.log(`Difficulty: ${q.difficultyLevel}  →  ${LEVEL_NAME[q.difficultyLevel] ?? "?"}   (type: ${q.type.code})`);
    console.log(`Stem: ${q.stem}`);
    if (q.options.length) {
      for (const o of q.options) console.log(`  ${o.label}. ${o.text}${o.isCorrect ? "   ← CORRECT" : ""}`);
    } else if (q.answers.length) {
      for (const a of q.answers) console.log(`  Accepted answer: ${JSON.stringify(a.value)}`);
    }
    // non-MC payload (pairs, grid, hotText, etc.) — print compactly so nothing is hidden
    if (q.content && Object.keys(q.content as object).length) console.log(`  Content: ${JSON.stringify(q.content)}`);
    console.log("");
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
