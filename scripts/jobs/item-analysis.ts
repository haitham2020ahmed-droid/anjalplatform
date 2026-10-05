/** Nightly: `npm run jobs:items` — item statistics, quality flags and calibration (MySQL). */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { runItemAnalysis } from "../../src/server/jobs/item-analysis";

const prisma = new PrismaClient();
runItemAnalysis(new PrismaRepo(prisma))
  .then((r) => console.log("item analysis:", r))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
