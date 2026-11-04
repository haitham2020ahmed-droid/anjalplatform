import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const unit = await p.unit.findFirst({ where: { number: 3, curriculum: { grade: { school: { code: "ALANJAL" }, level: 6 } } } });
  const lessons = await p.lesson.findMany({ where: { unitId: unit!.id }, select: { number: true, title: true, deletedAt: true }, orderBy: { number: "asc" } });
  console.log("Unit 3 lessons:", lessons);
  await p.$disconnect();
})();
