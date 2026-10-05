/** Builds an in-memory SQLite database from prisma/schema.prisma and seeds a small demo school. */
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { generateDDL, parseSchema } from "../../scripts/db/schema-ddl";
import { SqliteRepo } from "../../scripts/db/sqlite-repo";
import { hashPassword } from "../../src/server/auth/password";
import { seedCurriculum } from "../../src/server/seeding/curriculum";
import { DEMO_SCHOOL_CODE, seedDemoSchool } from "../../src/server/seeding/demo";
import { loadCurriculumInput } from "../../src/server/seeding/load-files";

export const ROOT = join(__dirname, "..", "..");
export const DEMO_PW = "Demo-Password-2026";

export async function demoDatabase(size: { classesPerGrade: number; studentsPerClass: number } = { classesPerGrade: 2, studentsPerClass: 3 }): Promise<{ db: DatabaseSync; repo: SqliteRepo }> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const schema = parseSchema(join(ROOT, "prisma/schema.prisma"));
  db.exec(generateDDL(schema, "sqlite"));
  const repo = new SqliteRepo(db, schema);
  await seedCurriculum(repo, loadCurriculumInput(ROOT, DEMO_SCHOOL_CODE, "Demo International School"));
  await seedDemoSchool(repo, { passwordHash: await hashPassword(DEMO_PW), ...size });
  return { db, repo };
}

/** Deterministic random numbers so tests never depend on chance (practice picks among top items). */
export function seededRandom(seed = 12345): () => number {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}
