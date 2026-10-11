/** Nightly: `npm run jobs:learning` — the daily learning job for every school (src/server/insights/daily.ts). */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { runDaily, riyadhDay } from "../../src/server/insights/daily";

const prisma = new PrismaClient();
const repo = new PrismaRepo(prisma);
(async () => {
  const now = new Date();
  for (const school of await repo.findMany("School", {}, { select: ["id"] })) {
    const key = `daily.run.${riyadhDay(now)}`;
    const claimed = await repo.create("SchoolSetting", { schoolId: school.id, key, value: { startedAt: now.toISOString() }, updatedBy: null }).then(() => true, () => false);
    if (!claimed) { console.log(`school ${school.id}: already ran today`); continue; }
    const r = await runDaily(repo, String(school.id), now);
    await repo.upsert("SchoolSetting", { schoolId: school.id, key }, { value: r }, { value: r });
    console.log(`school ${school.id}:`, r);
  }
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
