/** `npm run db:seed:curriculum -- --school=ALANJAL` — real school curriculum (idempotent). */
import { PrismaClient } from "@prisma/client";
import { join } from "node:path";
import { seedCurriculum } from "../../src/server/seeding/curriculum";
import { loadCurriculumInput } from "../../src/server/seeding/load-files";
import { PrismaRepo } from "../../src/server/db/prisma-repo";

const prisma = new PrismaClient();
const school = process.argv.find((a) => a.startsWith("--school="))?.split("=")[1] ?? "ALANJAL";

seedCurriculum(new PrismaRepo(prisma), loadCurriculumInput(join(__dirname, "..", ".."), school, "Al-Anjal Private Schools"))
  .then((r) => console.log("Curriculum seeded:", r))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
