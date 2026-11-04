import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const unit = await p.unit.findFirst({ where: { number: 2, curriculum: { grade: { school: { code: "ALANJAL" }, level: 6 } } } });
  const result = await p.lesson.updateMany({
    where: { unitId: unit!.id, number: { in: [4, 5, 6, 7] }, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  console.log("Restored lessons count:", result.count);
  const check = await p.lesson.findMany({ where: { unitId: unit!.id }, select: { number: true, title: true, deletedAt: true }, orderBy: { number: "asc" } });
  console.log(check);
  await p.$disconnect();
})();
