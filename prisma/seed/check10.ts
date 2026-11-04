import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const g = await p.grade.findFirst({ where: { school: { code: "ALANJAL" }, level: 6 } });
  console.log("Grade:", g?.id, g?.level);

  const curs = await p.curriculum.findMany({ where: { gradeId: g!.id }, select: { id: true, bookId: true, isActive: true, deletedAt: true } });
  const cur = curs.find((c) => c.isActive !== false && !c.deletedAt);
  console.log("Active curriculum:", cur);

  const units = (await p.unit.findMany({ where: { curriculumId: cur!.id }, select: { id: true, number: true, title: true, isActive: true, deletedAt: true } }))
    .filter((u) => u.isActive !== false && !u.deletedAt)
    .sort((a, b) => Number(a.number) - Number(b.number));
  console.log("\nActive units (in order):", units.map((u) => ({ number: u.number, title: u.title })));

  const lessons = await p.lesson.findMany({ where: { unitId: { in: units.map((u) => u.id) } }, select: { id: true, unitId: true, number: true, title: true, deletedAt: true } });
  const u2 = units.find((u) => Number(u.number) === 2);
  const u2Lessons = lessons.filter((l) => l.unitId === u2?.id);
  console.log("\nUnit 2 ALL lessons (incl. deleted):", u2Lessons.map((l) => ({ number: l.number, title: l.title, deletedAt: l.deletedAt })));
  console.log("\nUnit 2 lessons AFTER !deletedAt filter (what the real builder keeps):", u2Lessons.filter((l) => !l.deletedAt).map((l) => ({ number: l.number, title: l.title })));

  await p.$disconnect();
})();
