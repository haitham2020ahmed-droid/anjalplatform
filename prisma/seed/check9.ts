import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const schools = await p.school.findMany({ select: { id: true, code: true, name: true } });
  console.log("All schools:", schools);

  const lesson = await p.lesson.findUnique({
    where: { id: "cmuvb8d2t01dnx4tzwxpr8npk" },
    include: { unit: { include: { curriculum: { include: { grade: true } } } } },
  });
  console.log("\nMother to Son's chain -> schoolId:", lesson?.unit.curriculum.grade.schoolId, "| grade level:", lesson?.unit.curriculum.grade.level);

  const me = await p.user.findFirst({ where: { email: "haitham2020ahmed@gmail.com" }, select: { id: true, email: true, role: true, schoolId: true } });
  console.log("\nLogged-in user record:", me);
  await p.$disconnect();
})();
