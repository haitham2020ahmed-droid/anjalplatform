import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const units = await p.unit.findMany({
    where: { number: 2, curriculum: { grade: { level: 6, school: { code: "ALANJAL" } } } },
  });
  console.log("Unit rows with number=2:", units.length);
  for (const u of units) {
    const lessons = await p.lesson.findMany({ where: { unitId: u.id }, select: { number: true, title: true } });
    console.log("unitId:", u.id, "| isActive:", u.isActive, "| deletedAt:", u.deletedAt, "| lessons:", lessons.length, "->", lessons.map((l) => `${l.number}:${l.title}`).join(", "));
  }
  await p.$disconnect();
})();
