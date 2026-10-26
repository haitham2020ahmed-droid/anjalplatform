import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const ls = await p.lessonSkill.findMany({
    where: { lessonId: "cmuvb8d2t01dnx4tzwxpr8npk" },
    include: { skill: true },
  });
  console.log("LessonSkill -> Skill details:");
  for (const x of ls) {
    console.log("skillId:", x.skillId, "| title:", x.skill?.title, "| isActive:", x.skill?.isActive, "| deletedAt:", x.skill?.deletedAt);
  }

  const node = await p.curriculumMapNode.findFirst({ where: { code: "G6.U2.SEL4" } });
  console.log("\nG6.U2.SEL4 bare node exists:", Boolean(node), "| title:", node?.title, "| isActive:", node?.isActive, "| deletedAt:", node?.deletedAt);
  await p.$disconnect();
})();
