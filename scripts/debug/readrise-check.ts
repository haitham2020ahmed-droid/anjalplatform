/**
 * READ-ONLY: `DATABASE_URL="..." npx tsx scripts/debug/readrise-check.ts`
 * Prints the last 10 ReadRise runs (any student) with everything the level engine looks at:
 * score, firstTry, stretch, unreliable, levelBefore/After, and the student's current level + recent level changes.
 * Nothing is written to the database.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

(async () => {
  const runs = await prisma.rRRun.findMany({
    where: { completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    take: 10,
    select: {
      id: true, studentId: true, articleId: true, versionLevel: true, score: true,
      firstTry: true, stretch: true, unreliable: true, rapidCount: true,
      levelBefore: true, levelAfter: true, completedAt: true,
    },
  });
  console.log(`\n=== Last ${runs.length} completed ReadRise runs (newest first) ===`);
  for (const r of runs) {
    console.log(
      `${r.completedAt?.toISOString().slice(0, 16)}  student=${r.studentId.slice(0, 8)}…  score=${r.score}%  ` +
      `firstTry=${r.firstTry}  stretch=${r.stretch}  unreliable=${r.unreliable}(rapid=${r.rapidCount})  ` +
      `level ${r.levelBefore} -> ${r.levelAfter}`
    );
  }

  const studentIds = [...new Set(runs.map((r) => r.studentId))];
  console.log(`\n=== Current level + recent level changes, per student in the list above ===`);
  for (const id of studentIds) {
    const rr = await prisma.rRStudent.findUnique({ where: { studentId: id } });
    const changes = await prisma.rRLevelChange.findMany({ where: { studentId: id }, orderBy: { createdAt: "desc" }, take: 5 });
    console.log(`\nstudent=${id.slice(0, 8)}…  current level=${rr?.level}  (source=${rr?.source})`);
    for (const c of changes) console.log(`  ${c.createdAt.toISOString().slice(0, 16)}  ${c.fromLevel} -> ${c.toLevel}  (${c.reason})`);
    if (!changes.length) console.log("  (no level changes recorded yet)");
  }
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
