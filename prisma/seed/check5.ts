import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const lesson = await p.lesson.findFirst({ where: { title: "Mother to Son" } });
  const skillCount = lesson ? await p.lessonSkill.count({ where: { lessonId: lesson.id } }) : -1;
  console.log("Mother to Son LessonSkill rows (platform skill links):", skillCount);
  const node = await p.curriculumMapNode.findFirst({
    where: { code: { contains: "SEL4" }, grade: { level: 6, school: { code: "ALANJAL" } } },
    select: { code: true },
  });
  console.log("Matching CurriculumMapNode code found:", node?.code ?? "NONE FOUND");
  await p.$disconnect();
})();
