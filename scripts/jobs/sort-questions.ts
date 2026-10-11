/**
 * Nightly: `npm run jobs:sort` — new unclassified questions are sorted under their skills, for every school
 * (src/server/questions/link-bank-run.ts). Sure links only; the rest is listed under “Skill links: needs review”.
 * Once per day per school (the day is claimed first). Never deletes or publishes a question. Batches of 200.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { nightlySort } from "../../src/server/questions/link-bank-run";

const prisma = new PrismaClient();
const repo = new PrismaRepo(prisma);
(async () => {
  const now = new Date();
  for (const school of await repo.findMany("School", { deletedAt: null }, { select: ["id"] })) {
    const r = await nightlySort(repo, String(school.id), now);
    console.log(`school ${school.id}:`, r.ran ? `${r.processed} checked, ${r.linked} linked, ${r.review} to review` : "already ran today");
  }
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
