/**
 * ➕ Adds the school's MAP-style skill sets (Persuasive Techniques, Rhetorical Questions) to every school: the skills
 * in Grades 4–6 and their questions, published. Safe to run again (questions already there are skipped).
 *
 *   npx tsx scripts/skills/add-map-skill-sets.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { addSkillSets, loadSkillSetsFile } from "../../src/server/questions/skill-sets";

async function main() {
  const prisma = new PrismaClient();
  try {
    const repo = new PrismaRepo(prisma);
    const sets = await loadSkillSetsFile();
    for (const school of await repo.findMany("School", {}, { select: ["id", "name"] })) {
      for (const r of await addSkillSets(repo, String(school.id), sets)) {
        console.log(`${String(school.name)} · ${r.skill}: ${r.skillsCreated} skill(s) created, ${r.added} question(s) added, ${r.skipped} already there.`);
        for (const e of r.errors.slice(0, 10)) console.log(`  problem: ${e}`);
      }
    }
  } finally { await prisma.$disconnect(); }
}
main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
