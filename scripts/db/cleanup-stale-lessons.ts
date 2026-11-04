/**
 * One-time cleanup: hides (soft-deletes) Lesson rows left over from an older, longer version of a StudySync
 * curriculum file (data/curriculum/grade-X.json) that the CURRENT file no longer lists — e.g. Grade 6 Unit 1 used
 * to have 7 selections; the current file has 4 ("Amigo Brothers" · "Never Too Young to Change the World" ·
 * "Cocoon" · "The Lost Island"). `seedCurriculum()` is deliberately idempotent and NEVER deletes
 * (src/server/seeding/curriculum.ts), so the old selections ("Scout's Honor", "The Good Samaritan",
 * "Jabberwocky / Gathering Blue / A Wrinkle in Time"…) were still sitting in the database and showing on the admin
 * "Skill plan" tab (r95 follow-up: the Grade 6 Unit 1 selection-4 name mismatch).
 *
 * SAFE BY DESIGN:
 *  - Only ever sets Lesson.deletedAt (the same soft-delete column every other admin edit uses) — never touches
 *    Skill, LessonSkill, UnitSkill, Question, or any student data (mastery, attempts, assignments). Those all key
 *    off Skill.id, not Lesson.id, and are left completely untouched; a hidden lesson just stops being its own
 *    row/section on the Skill plan and printable map — its skills, if also linked elsewhere, keep showing there.
 *  - Fully reversible: clear deletedAt on the same rows (by id, printed below) to bring a lesson back.
 *  - Two-step by default: run with no flags first to see the report; nothing is changed until you pass --apply.
 *
 *   DATABASE_URL="…" npx tsx scripts/db/cleanup-stale-lessons.ts            (report only, read-only)
 *   DATABASE_URL="…" npx tsx scripts/db/cleanup-stale-lessons.ts --apply    (soft-deletes the stale lessons)
 */
import { PrismaClient } from "@prisma/client";
import { join } from "node:path";
import { loadCurriculumInput } from "../../src/server/seeding/load-files";

const ROOT = join(__dirname, "..", "..");
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const input = loadCurriculumInput(ROOT, "ALANJAL", "Al-Anjal Private Schools");
  const validCodes = new Set<string>();
  for (const g of input.grades) for (const u of g.units) for (const l of u.lessons) validCodes.add(l.code);

  const lessons = await prisma.lesson.findMany({
    where: { unit: { curriculum: { grade: { school: { code: "ALANJAL" } } } }, deletedAt: null },
    select: {
      id: true, code: true, number: true, title: true,
      unit: { select: { number: true, curriculum: { select: { grade: { select: { level: true } } } } } },
    },
  });
  const stale = lessons.filter((l) => !validCodes.has(l.code));

  if (!stale.length) {
    console.log("No stale lessons found — every lesson in the database matches the current curriculum files. Nothing to do.");
    return;
  }

  console.log(`Found ${stale.length} lesson(s) in the database that are NOT in the current curriculum files (data/curriculum/grade-*.json):\n`);
  for (const l of stale) {
    console.log(`  • Grade ${l.unit.curriculum.grade.level} · Unit ${l.unit.number} · Selection ${l.number} (${l.code}) — "${l.title}"  [id: ${l.id}]`);
  }

  // Informational-only safety check (soft-delete never touches these tables — this is just to show you nothing
  // real is riding on these old rows before you decide to hide them).
  const staleIds = stale.map((l) => l.id);
  const [questionsUnderThem, lessonSkillRows] = await Promise.all([
    prisma.question.count({ where: { lessonId: { in: staleIds } } }),
    prisma.lessonSkill.findMany({ where: { lessonId: { in: staleIds } }, select: { skillId: true } }),
  ]);
  const skillIds = [...new Set(lessonSkillRows.map((r) => r.skillId))];
  const [assignmentsByskillId, attempts, mastery, abilities] = skillIds.length
    ? await Promise.all([
        prisma.assignment.count({ where: { skillId: { in: skillIds } } }),
        prisma.questionAttempt.count({ where: { skillId: { in: skillIds } } }),
        prisma.studentSkillMastery.count({ where: { skillId: { in: skillIds } } }),
        prisma.studentAbility.count({ where: { skillId: { in: skillIds } } }),
      ])
    : [0, 0, 0, 0];
  const assignmentsWithSkillIds = skillIds.length
    ? (await prisma.assignment.findMany({ where: { skillIds: { not: null } }, select: { skillIds: true } }))
        .filter((a) => Array.isArray(a.skillIds) && (a.skillIds as string[]).some((id) => skillIds.includes(id))).length
    : 0;

  console.log(`\nSafety check (for information only — a hidden lesson never removes a skill, a question, or any student data):`);
  console.log(`  Questions directly filed under these lessons: ${questionsUnderThem}`);
  console.log(`  Sent assignments referencing their skills: ${assignmentsByskillId + assignmentsWithSkillIds}`);
  console.log(`  Student answers / mastery / ability rows on their skills: ${attempts + mastery + abilities}`);
  console.log(`  (Even where these are non-zero, nothing is deleted or hidden for them — only the old lesson "card" itself.)`);

  if (!APPLY) {
    console.log(`\nDry run — nothing changed. Re-run with --apply to hide the ${stale.length} lesson(s) above (reversible).`);
    return;
  }

  const result = await prisma.lesson.updateMany({ where: { id: { in: staleIds } }, data: { deletedAt: new Date() } });
  console.log(`\nDone — ${result.count} lesson(s) hidden (Lesson.deletedAt set). To undo, clear deletedAt on these ids:\n  ${staleIds.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
