/**
 * `npm run db:seed:demo` — DEMO school for development only (refuses production, and any
 * non-local database unless ALLOW_REMOTE_SEED=1).
 * Seeds the demo school's own copy of the curriculum and bank, then classes,
 * teachers, students and parents. Passwords come from DEMO_PASSWORD.
 */
import { join } from "node:path";
import { hashPassword } from "../../src/server/auth/password";
import { seedCurriculum } from "../../src/server/seeding/curriculum";
import { DEMO_SCHOOL_CODE, seedDemoSchool } from "../../src/server/seeding/demo";
import { loadBank, loadCurriculumInput } from "../../src/server/seeding/load-files";
import { seedQuestions } from "../../src/server/seeding/questions";
import { runSeed } from "./run";

/** Hosts that are this computer or a local docker database; anything else may be a real school's database. */
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "db", "mysql"]);

function assertSafeTarget(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  let host = "";
  try { host = new URL(String(env.DATABASE_URL ?? "")).hostname.toLowerCase(); } catch { /* unparsable: refused below */ }
  if (!LOCAL_DB_HOSTS.has(host) && env.ALLOW_REMOTE_SEED !== "1") {
    throw new Error(`Refusing to seed demo data into a non-local database (${host || "unknown host"}). Set ALLOW_REMOTE_SEED=1 if this really is a test database.`);
  }
}

async function main() {
  assertSafeTarget(process.env);
  if (!process.env.DEMO_PASSWORD) throw new Error("Set DEMO_PASSWORD in .env first.");
  const root = join(__dirname, "..", "..");
  const passwordHash = await hashPassword(process.env.DEMO_PASSWORD);
  await runSeed("Demo seed", 10300, async (repo) => {
    await seedCurriculum(repo, loadCurriculumInput(root, DEMO_SCHOOL_CODE, "Demo International School"));
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(root) });
    return seedDemoSchool(repo, { passwordHash, classesPerGrade: 1, studentsPerClass: 6 });
  });
}
main().catch((e) => { console.error((e as Error).message); process.exit(1); });
