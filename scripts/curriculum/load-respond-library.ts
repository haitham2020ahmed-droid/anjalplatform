/**
 * ✍️ Loads the school's Grades 4–5 Respond to Reading tasks (data/curriculum-map/respond-to-reading-g4-g5.json) into
 * every school's Respond to Reading activities (Below / On / Above, with the teacher's model answers).
 * Safe to run again: existing activities (and an admin's edits) are never overwritten. Teachers and students see
 * them at once (Curriculum Map → Respond to Reading). The platform also loads them by itself the first time the
 * page is opened; this script just does it now.
 *
 *   npx tsx scripts/curriculum/load-respond-library.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { runRespondLibraryLoad, respondLibrary, validateRespondLibrary } from "../../src/server/curriculum-map/respond-library";

async function main() {
  const problems = validateRespondLibrary(await respondLibrary());
  if (problems.length) console.warn(`⚠️ ${problems.length} note(s) on the file:\n  ${problems.slice(0, 20).join("\n  ")}`);
  const prisma = new PrismaClient();
  try {
    const repo = new PrismaRepo(prisma);
    for (const school of await repo.findMany("School", {}, { select: ["id", "name"] })) {
      const r = await runRespondLibraryLoad(repo, String(school.id));
      console.log(`${school.name}: grades ${r.grades.join(", ") || "none"} · ${r.tasks} text sets · ${r.created} activities added · ${r.filled} model answers filled · ${r.skipped} kept as they were`);
    }
  } finally { await prisma.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
