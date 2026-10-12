/**
 * 📚 Loads the ReadMaster library (Grades 4–5, data/readmaster/library-g4-g5.json) into a school: the missing
 * articles are created with their three versions and questions (also in the Question Bank) and published. Articles
 * already there are skipped, so it is safe to run more than once.
 *
 *   npx tsx scripts/readmaster/load-library.ts                    # every school
 *   npx tsx scripts/readmaster/load-library.ts --school <schoolId> # one school
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { runLibraryLoad } from "../../src/server/readmaster/library";

async function main() {
  const prisma = new PrismaClient();
  try {
    const repo = new PrismaRepo(prisma);
    const at = process.argv.indexOf("--school");
    const schools = at > 0 && process.argv[at + 1] ? [process.argv[at + 1]] : (await repo.findMany("School", {}, { select: ["id"] })).map((s) => String(s.id));
    if (!schools.length) { console.log("No school found."); return; }
    for (const schoolId of schools) {
      try {
        const r = await runLibraryLoad(repo, schoolId);
        console.log(`School ${schoolId}: ${r.created} created, ${r.completed} completed, ${r.skipped} already there · ${r.versions} versions, ${r.questions} questions · ${r.published} published.`);
        for (const e of r.errors) console.log(`  problem: ${e}`);
      } catch (e) { console.log(`School ${schoolId}: not loaded — ${(e as Error).message}`); process.exitCode = 1; }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
