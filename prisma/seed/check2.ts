import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const curricula = await p.curriculum.findMany({
    where: { grade: { level: 6, school: { code: "ALANJAL" } } },
    include: { grade: true, book: true, units: { where: { number: 2 }, include: { lessons: { select: { number: true, title: true } } } } },
  });
  console.log(JSON.stringify(curricula.map((c) => ({ curriculumId: c.id, bookCode: c.book.code, isActive: c.isActive, deletedAt: c.deletedAt, unit2Lessons: c.units[0]?.lessons })), null, 2));
  await p.$disconnect();
})();
