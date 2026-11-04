import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const ts = new Date("2026-10-24T17:38:29.833Z");

  // 1) Restore Shakespeare in Harlem (Unit 3, lesson 3) only
  const sih = await p.lesson.updateMany({
    where: { title: "Shakespeare in Harlem", deletedAt: ts },
    data: { deletedAt: null },
  });
  console.log("Shakespeare in Harlem restored:", sih.count);

  // 2) Re-delete Unit 2 lessons 5, 6, 7 (undo the earlier bulk restore for these — keep only Mother to Son, #4)
  const unit2 = await p.unit.findFirst({ where: { number: 2, curriculum: { grade: { school: { code: "ALANJAL" }, level: 6 } } } });
  const redel = await p.lesson.updateMany({
    where: { unitId: unit2!.id, number: { in: [5, 6, 7] } },
    data: { deletedAt: ts },
  });
  console.log("Unit 2 lessons 5/6/7 re-deleted:", redel.count);

  const check = await p.lesson.findMany({ where: { unitId: unit2!.id }, select: { number: true, title: true, deletedAt: true }, orderBy: { number: "asc" } });
  console.log("\nUnit 2 final state:", check);

  const sihCheck = await p.lesson.findFirst({ where: { title: "Shakespeare in Harlem" }, select: { number: true, title: true, deletedAt: true } });
  console.log("\nShakespeare final state:", sihCheck);

  await p.$disconnect();
})();
