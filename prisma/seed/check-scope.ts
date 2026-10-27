import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const ts = new Date("2026-10-24T17:38:29.833Z");
  const lessons = await p.lesson.findMany({
    where: { deletedAt: ts },
    select: {
      number: true,
      title: true,
      unit: { select: { number: true, curriculum: { select: { grade: { select: { level: true, schoolId: true } } } } } },
    },
  });
  console.log("Total lessons deleted at this exact timestamp:", lessons.length);
  console.log(lessons.map((l) => ({ grade: l.unit.curriculum.grade.level, unit: l.unit.number, lessonNumber: l.number, title: l.title })));
  await p.$disconnect();
})();
