/**
 * Update 39C: Curriculum-Map questions on the hidden “Unclassified (Curriculum Map)” skill → their real literacy skill
 * (map place skill text, standard, Respond-to-Reading category, question wording). Moves their past answers to that
 * skill and recomputes the affected students' mastery. Never deletes a question; what cannot be mapped stays hidden.
 * Safe to run more than once (a second run finds nothing to do).
 *
 *   npx tsx scripts/db/remap-unclassified.ts            # dry run: what would change, per school (no writes)
 *   npx tsx scripts/db/remap-unclassified.ts --apply    # writes (take a backup first)
 *   … --school <schoolId>                               # one school only
 *   … --list                                            # also print every question's decision
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { applyRemap, planRemap, schoolsWithUnclassified } from "../../src/server/curriculum-map/remap-skills";

async function main() {
  const prisma = new PrismaClient();
  try {
    const repo = new PrismaRepo(prisma);
    const apply = process.argv.includes("--apply"), list = process.argv.includes("--list");
    const at = process.argv.indexOf("--school");
    const schools = at > 0 && process.argv[at + 1] ? [process.argv[at + 1]] : await schoolsWithUnclassified(repo);
    if (!schools.length) { console.log("No Unclassified (Curriculum Map) questions: nothing to do."); return; }
    for (const schoolId of schools) {
      const plan = await planRemap(repo, schoolId);
      const via: Record<string, number> = {};
      for (const it of plan.items) if (it.via) via[it.via] = (via[it.via] ?? 0) + 1;
      console.log(`School ${schoolId}: ${plan.items.length} question(s) on the hidden skill → ${plan.mapped} mapped ${JSON.stringify(via)}, ${plan.left} left hidden; ${plan.attemptsToMove} answer(s) to move.`);
      if (list) for (const it of plan.items) console.log(`  G${it.grade} ${it.place ?? "(no place)"} ${it.questionId} → ${it.toSkill ?? "(stays hidden)"} · ${it.via ?? "-"} · ${it.detail}`);
      if (apply) console.log(`  applied: ${JSON.stringify(await applyRemap(repo, schoolId, { actorId: null }))}`);
    }
    if (!apply) console.log("Dry run: nothing was written. Run again with --apply to write.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
