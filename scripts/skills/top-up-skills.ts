/**
 * 📏 Loads the question packs (data/questions/sets) into every school — the same chunks as Admin → Questions →
 * Load new questions (src/server/questions/load-packs.ts, src/server/admin/load-questions.ts), in a loop:
 *
 *   npx tsx scripts/skills/top-up-skills.ts
 *
 *  1. Gap skills (gap-skill-sets.json: 71 skills, Below / On / Above), created when missing;
 *  2. Top-up to 25 (topup-skill-sets.json): only the number each skill is missing, Below / On / Above in turn;
 *  3. All-grades bank, 30 MAP-style questions per skill (span-skill-sets.json, skills the school has);
 *  4. Curriculum Map: the "Review" places (map seed), then Concept Vocabulary / Review questions (map-vocab-review-sets.json);
 *  5. Grammar extras (grammar-extra-sets.json, when the file is there; skills the school has);
 *  6. Question Check: hides from students every published question with a definite error (never deleted).
 * Original questions only. Safe to run again (questions already there are skipped; a full skill gets nothing).
 * The admin page shows this run's progress too (it is kept per school in the same place).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { resolveActor } from "../../src/server/auth/actor";
import { PACKS, packSignature, runPackChunk } from "../../src/server/questions/load-packs";
import { checkChunk, finishLoad, loadChunk, startLoad } from "../../src/server/admin/load-questions";

async function main() {
  const prisma = new PrismaClient();
  try {
    const repo = new PrismaRepo(prisma);
    const packs = PACKS.filter((p) => packSignature(p) || (console.log(`  (skipped: ${p.file} is not there)`), false));
    for (const school of await repo.findMany("School", {}, { select: ["id", "name"] })) {
      const schoolId = String(school.id);
      const admin = (await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN", deletedAt: null }, { take: 1 }))[0];
      if (!admin) {
        // no admin to keep the progress / run the check: the same chunks, straight
        for (const def of packs) {
          let next = 0, added = 0;
          for (;;) { const w = await runPackChunk(repo, schoolId, def, next); added += w.added; next = w.next; if (next >= w.total) break; }
          console.log(`  ${def.title}: ${added} questions`);
        }
        console.log(`${String(school.name)}: no school admin — Question Check not run.`);
        continue;
      }
      const actor = await resolveActor(repo, admin);
      const { token } = await startLoad(repo, actor);
      for (const def of packs) {
        let r = await loadChunk(repo, actor, { token, pack: def.key, restart: true });
        while (!r.finished) {
          for (const e of r.errors.slice(0, 3)) console.log(`  ${e}`);
          r = await loadChunk(repo, actor, { token, pack: def.key });
        }
        console.log(`  ${def.title}: ${r.added} questions${r.created ? `, ${r.created} skills created` : ""}`);
      }
      let c = await checkChunk(repo, actor, token);
      while (!c.finished) c = await checkChunk(repo, actor, token);
      const sum = await finishLoad(repo, actor, { token, packs: packs.map((p) => p.key) });
      console.log(`${String(school.name)}: ${sum.added} questions added (${sum.created} skills created); Question Check: ${sum.hidden} broken question(s) hidden of ${sum.checked}; skills still under 25: ${sum.stillUnder25}.`);
    }
  } finally { await prisma.$disconnect(); }
}
main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
