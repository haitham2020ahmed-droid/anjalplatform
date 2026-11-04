/**
 * 🩹 One-off run (Oct 2026): runs the platform's existing "Fix stuck questions" pipeline (passages → classify →
 * repair/publish) for ALANJAL, the same thing Admin → Questions → "Fix stuck questions" does from the UI — run here
 * directly so Haitham doesn't have to click through the admin UI. No schema changes; this only writes LessonSkill
 * links, Question classification fields, etc. that the existing tool already writes.
 */
import { PrismaClient } from "@prisma/client";
import { fixStuckQuestions } from "../../src/server/admin/stuck-questions";
import { runSeed } from "./run";

runSeed("fix-stuck-classify", 0, async (repo) => {
  const prisma = new PrismaClient();
  const school = await prisma.school.findFirst({ where: { code: "ALANJAL" } });
  if (!school) throw new Error("ALANJAL school not found");
  const admin = await prisma.user.findFirst({ where: { schoolId: school.id, role: { in: ["SUPER_ADMIN", "SCHOOL_ADMIN"] } } });
  if (!admin) throw new Error("No SUPER_ADMIN/SCHOOL_ADMIN user found for ALANJAL");
  await prisma.$disconnect();

  const actor = { userId: admin.id, role: admin.role as "SUPER_ADMIN" | "SCHOOL_ADMIN", schoolId: school.id };
  const report = await fixStuckQuestions(repo, actor, { by: "admin" });
  return report;
});
