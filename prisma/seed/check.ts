import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const schools = await p.school.findMany({ where: { code: "ALANJAL" } });
  console.log("Schools matching ALANJAL:", schools.map((s) => ({ id: s.id, code: s.code })));
  const lessons = await p.lesson.findMany({
    where: { OR: [{ title: { contains: "Mother to Son" } }, { title: { contains: "Shakespeare in Harlem" } }] },
    include: { unit: { include: { curriculum: { include: { grade: true } } } } },
  });
  console.log("Lessons found:", lessons.map((l) => ({ title: l.title, unitNumber: l.unit.number, curriculumId: l.unit.curriculumId, isActive: l.unit.curriculum.isActive, gradeLevel: l.unit.curriculum.grade.level, schoolId: l.unit.curriculum.grade.schoolId })));
  await p.$disconnect();
})();
