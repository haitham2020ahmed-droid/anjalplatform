/**
 * UI reorg Phase 1: link every question of the bank to its skill, MAP area and NAFS area (src/server/questions/link-bank.ts).
 * Deterministic rules first; anything under the confidence threshold is listed under Admin → Skills → “Links that need
 * review” — never guessed silently. Never deletes a question. Safe to run more than once (a second run changes nothing).
 * Reads the bank 300 questions at a time (fits the 512 MB server).
 *
 *   npx tsx scripts/db/link-bank-skills.ts             # dry run: what would change, per school (no writes)
 *   npx tsx scripts/db/link-bank-skills.ts --apply     # writes (take a backup first); an audit row per change
 *   … --school <schoolId>                              # one school only
 *   … --list                                           # also print every decision (linked and needs review)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { linkBank } from "../../src/server/questions/link-bank";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply"), list = args.includes("--list");
  const at = args.indexOf("--school");
  const prisma = new PrismaClient();
  try {
    const repo = new PrismaRepo(prisma);
    const schools = at >= 0 && args[at + 1] ? [args[at + 1]] : (await repo.findMany("School", { deletedAt: null }, { select: ["id"] })).map((x) => String(x.id));
    for (const schoolId of schools) {
      const r = await linkBank(repo, schoolId, { apply, actorId: null, listCap: list ? 100000 : 0 });
      const m = r.summary;
      console.log(`School ${schoolId}: ${m.questions} question(s); ${m.onHiddenBefore} without a real skill → ${m.linked} linked ${JSON.stringify(m.byVia)}; ${m.needsReview} need review ${JSON.stringify(m.reviewByKind)}.`);
      console.log(`  skill families: MAP ${m.familiesMapLinked} linked from their standard, ${m.familiesMapReview} to review; NAFS ${m.familiesNafsLinked} linked, ${m.familiesNafsReview} to review (${r.nafs.alreadyLinked} already linked).`);
      console.log(`  imported with an unsure skill: ${m.importUnsure}; on a switched-off skill: ${m.switchedOffSkill}; ReadRise questions: ${m.readRise.questions} ${JSON.stringify(Object.fromEntries(Object.entries(m.readRise.byKind).map(([k, v]) => [k, `${v.n}→${v.family ?? "?"}`])))}.`);
      if (apply) console.log(`  answers moved: ${m.attemptsMoved}; mastery recomputed: ${m.recomputed}.`);
      if (list) {
        for (const d of r.linked) console.log(`  LINK  G${d.grade} ${d.questionId} → ${d.toSkill} · ${d.via} · ${Math.round(d.confidence * 100)}% · ${d.detail}`);
        for (const d of r.review) console.log(`  REVIEW G${d.grade} ${d.questionId} “${d.excerpt.slice(0, 70)}” → guess ${d.toSkill ?? "-"} · ${Math.round(d.confidence * 100)}% · ${d.detail}`);
        for (const f of r.nafs.review) console.log(`  REVIEW NAFS ${f.family} → guess ${f.guess ?? "-"} · ${f.reason}`);
        for (const f of r.mapFamilies.filter((x) => !x.area)) console.log(`  REVIEW MAP ${f.family} · ${f.how}`);
      }
    }
    if (!apply) console.log("Dry run: nothing was written. Run again with --apply to write.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
