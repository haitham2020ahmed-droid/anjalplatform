import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const exact = await p.curriculumMapNode.findFirst({ where: { code: "G6.U2.SEL4" } });
  console.log("G6.U2.SEL4 exists:", Boolean(exact), exact?.title ?? "");
  const all = await p.curriculumMapNode.findMany({ where: { code: { contains: "SEL4" }, grade: { level: 6, school: { code: "ALANJAL" } } }, select: { code: true, title: true } });
  console.log("All SEL4 nodes:", all);
  await p.$disconnect();
})();
