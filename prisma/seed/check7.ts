import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const lessons = await p.lesson.findMany({ where: { title: "Mother to Son" }, include: { unit: true } });
  console.log("Total 'Mother to Son' Lesson rows:", lessons.length);
  for (const l of lessons) {
    const skillCount = await p.lessonSkill.count({ where: { lessonId: l.id } });
    console.log("lessonId:", l.id, "| unitId:", l.unitId, "| unit.number:", l.unit.number, "| lesson.number:", l.number, "| LessonSkill rows:", skillCount);
  }
  await p.$disconnect();
})();
