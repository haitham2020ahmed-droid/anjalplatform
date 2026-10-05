/**
 * Post-setup verification against the REAL MySQL database (run after Phase 2 setup).
 *   npm run db:verify:mysql
 * Checks expected row counts from the data files, idempotency (re-runs the seeders
 * and compares counts), standard wording, and times every dashboard query.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { seedCurriculum } from "../../src/server/seeding/curriculum";
import { loadBank, loadCurriculumInput } from "../../src/server/seeding/load-files";
import { seedQuestions } from "../../src/server/seeding/questions";

const ROOT = join(__dirname, "..", "..");
const prisma = new PrismaClient();
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

async function counts() {
  return {
    units: await prisma.unit.count({ where: { curriculum: { grade: { school: { code: "ALANJAL" } } } } }),
    lessons: await prisma.lesson.count({ where: { unit: { curriculum: { grade: { school: { code: "ALANJAL" } } } } } }),
    skills: await prisma.skill.count({ where: { curriculum: { grade: { school: { code: "ALANJAL" } } } } }),
    standards: await prisma.standard.count({ where: { framework: "CCSS_ELA" } }),
    questions: await prisma.question.count({ where: { skill: { curriculum: { grade: { school: { code: "ALANJAL" } } } } } }),
    lessonSkills: await prisma.lessonSkill.count(),
    prerequisites: await prisma.skillPrerequisite.count(),
  };
}

async function main() {
  const input = loadCurriculumInput(ROOT, "ALANJAL", "Al-Anjal Private Schools");
  const bank = loadBank(ROOT);
  const before = await counts();
  check("18 units and 78 lessons", before.units === 18 && before.lessons === 78, `${before.units} units, ${before.lessons} lessons`);
  check("all official standards present", before.standards >= Object.keys(input.officialStandards).length, `${before.standards}`);
  check("question bank imported", before.questions >= bank.items.length, `${before.questions} questions`);
  const missing = await prisma.standard.count({ where: { framework: "CCSS_ELA", OR: [{ description: null }, { description: "" }] } });
  check("every standard has official wording", missing === 0);

  const repo = new PrismaRepo(prisma);
  await seedCurriculum(repo, input);
  const q = await seedQuestions(repo, { schoolCode: "ALANJAL", bank });
  const after = await counts();
  check("re-running the seeders changes nothing", JSON.stringify(before) === JSON.stringify(after) && q.created === 0);

  const dir = join(ROOT, "database/sql/analytics");
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, f), "utf8");
    const n = (sql.match(/\?/g) ?? []).length;
    const t = Date.now();
    try {
      await prisma.$queryRawUnsafe(sql, ...Array.from({ length: n }, () => "2026-09-01"));
      check(`query ${f}`, true, `${Date.now() - t} ms`);
    } catch (e) {
      check(`query ${f}`, false, (e as Error).message.split("\n")[0]);
    }
  }
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nALL CHECKS PASSED");
  if (failed) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
