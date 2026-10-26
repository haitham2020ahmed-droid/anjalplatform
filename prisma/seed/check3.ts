import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const curricula = await p.curriculum.findMany({
    where: { grade: { level: 6, school: { code: "ALANJAL" } } },
    include: { book: true, units: { where: { number: 2 }, include: { lessons: { select: { number: true, title: true } } } } },
  });
  for (const c of curricula) {
    console.log("---");
    console.log("curriculumId:", c.id, "| book:", c.book.code, "| isActive:", c.isActive, "| deletedAt:", c.deletedAt);
    console.log("Unit 2 lesson count:", c.units[0]?.lessons.length ?? 0, "| titles:", c.units[0]?.lessons.map((l) => l.title).join(" | "));
  }
  console.log("---");
  console.log("Total curricula found:", curricula.length);
  await p.$disconnect();
})();
