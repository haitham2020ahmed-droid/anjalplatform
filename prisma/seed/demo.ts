/**
 * `npm run db:seed:demo` — DEMO school for development only (refuses production).
 * Seeds the demo school's own copy of the curriculum and bank, then classes,
 * teachers, students and parents. Passwords come from DEMO_PASSWORD.
 */
import { PrismaClient } from "@prisma/client";
import { join } from "node:path";
import { hashPassword } from "../../src/server/auth/password";
import { seedCurriculum } from "../../src/server/seeding/curriculum";
import { DEMO_SCHOOL_CODE, seedDemoSchool } from "../../src/server/seeding/demo";
import { loadBank, loadCurriculumInput } from "../../src/server/seeding/load-files";
import { seedQuestions } from "../../src/server/seeding/questions";
import { PrismaRepo } from "../../src/server/db/prisma-repo";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  if (!process.env.DEMO_PASSWORD) throw new Error("Set DEMO_PASSWORD in .env first.");
  const prisma = new PrismaClient();
  const repo = new PrismaRepo(prisma);
  const root = join(__dirname, "..", "..");
  try {
    await seedCurriculum(repo, loadCurriculumInput(root, DEMO_SCHOOL_CODE, "Demo International School"));
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(root) });
    const r = await seedDemoSchool(repo, { passwordHash: await hashPassword(process.env.DEMO_PASSWORD), classesPerGrade: 1, studentsPerClass: 6 });
    console.log("Demo school seeded:", r);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
