/** `npm run db:seed:questions -- --school=ALANJAL` — original question bank (imports as UNDER_REVIEW). */
import { PrismaClient } from "@prisma/client";
import { join } from "node:path";
import { loadBank } from "../../src/server/seeding/load-files";
import { seedQuestions } from "../../src/server/seeding/questions";
import { PrismaRepo } from "../../src/server/db/prisma-repo";

const prisma = new PrismaClient();
const school = process.argv.find((a) => a.startsWith("--school="))?.split("=")[1] ?? "ALANJAL";

seedQuestions(new PrismaRepo(prisma), { schoolCode: school, bank: loadBank(join(__dirname, "..", "..")) })
  .then((r) => console.log("Questions seeded:", r))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
