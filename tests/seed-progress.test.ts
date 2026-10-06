/** Seed runner pieces that run without MySQL: progress reporting and write counts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { generateDDL, parseSchema } from "../scripts/db/schema-ddl";
import { SqliteRepo } from "../scripts/db/sqlite-repo";
import { withProgress } from "../src/server/db/progress-repo";
import { hashPassword } from "../src/server/auth/password";
import { seedCurriculum } from "../src/server/seeding/curriculum";
import { seedQuestions } from "../src/server/seeding/questions";
import { DEMO_SCHOOL_CODE, seedDemoSchool } from "../src/server/seeding/demo";
import { loadBank, loadCurriculumInput } from "../src/server/seeding/load-files";
import { ROOT } from "./helpers/db";

function emptyRepo() {
  const db = new DatabaseSync(":memory:");
  const schema = parseSchema(join(ROOT, "prisma/schema.prisma"));
  db.exec(generateDDL(schema, "sqlite"));
  return new SqliteRepo(db, schema);
}

test("seeds report progress while writing and produce the same data", async () => {
  const reports: number[] = [];
  const repo = withProgress(emptyRepo(), (n) => reports.push(n), 250);
  const r = await seedCurriculum(repo, loadCurriculumInput(ROOT, "ALANJAL", "Al-Anjal Private Schools"));
  assert.equal(r.skills, 191);
  assert.ok(reports.length > 5 && reports.every((n, i) => n === (i + 1) * 250), "progress every 250 writes");
  console.log(`curriculum writes: ${repo.writes()}`);
  const q = withProgress(repo, () => undefined);
  await seedQuestions(q, { schoolCode: "ALANJAL", bank: loadBank(ROOT) });
  console.log(`question bank writes: ${q.writes()}`);
  const d = withProgress(emptyRepo(), () => undefined);
  await seedCurriculum(d, loadCurriculumInput(ROOT, DEMO_SCHOOL_CODE, "Demo"));
  await seedQuestions(d, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  await seedDemoSchool(d, { passwordHash: await hashPassword("x-demo-pass-123"), classesPerGrade: 1, studentsPerClass: 6 });
  console.log(`demo writes: ${d.writes()}`);
});

test("re-running a seed is safe (idempotent upserts): no duplicates", async () => {
  const repo = emptyRepo();
  const input = loadCurriculumInput(ROOT, "ALANJAL", "Al-Anjal Private Schools");
  await seedCurriculum(repo, input);
  const before = await repo.count("Skill", {});
  await seedCurriculum(repo, input);
  assert.equal(await repo.count("Skill", {}), before);
});
