/**
 * ➕ Adds the gap question sets (data/questions/sets/gap-skill-sets.json): 58 skills from the MAP Learning Continuum and
 * the Common Core (Grades 4–12) that had no questions on the platform, 522 original questions, Below / On / Above.
 * Each skill is created in Grades 4–6 (one family, one bank pool) when missing; questions written for Grades 7–12
 * keep their real difficulty on the RIT scale (the bank is classified by skill + level, not grade). Published.
 * Safe to run again (questions already in the bank are skipped).
 *
 *   npx tsx scripts/skills/add-gap-skill-sets.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { addSkillSets, loadSkillSetsFile } from "../../src/server/questions/skill-sets";

async function main() {
  const prisma = new PrismaClient();
  try {
    const repo = new PrismaRepo(prisma);
    const sets = await loadSkillSetsFile("gap-skill-sets.json");
    for (const school of await repo.findMany("School", {}, { select: ["id", "name"] })) {
      let added = 0, skipped = 0, created = 0;
      for (const r of await addSkillSets(repo, String(school.id), sets)) {
        added += r.added; skipped += r.skipped; created += r.skillsCreated;
        for (const e of r.errors.slice(0, 5)) console.log(`  ${r.skill}: ${e}`);
      }
      console.log(`${String(school.name)}: ${created} skill(s) created, ${added} question(s) added, ${skipped} already there.`);
    }
  } finally { await prisma.$disconnect(); }
}
main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
