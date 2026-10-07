/**
 * TEST environment (a separate “Test School”: 1 admin, 6 teachers, 200 students, real assignments and practice).
 *
 *   TEST_ACCOUNT_PASSWORD='choose-a-password' npx tsx scripts/seed-test-env.ts seed [--no-practice]
 *   npx tsx scripts/seed-test-env.ts report
 *   npx tsx scripts/seed-test-env.ts reset
 *
 * Usernames: test.admin, test.teacher.1…6, test.student.001…200. All use TEST_ACCOUNT_PASSWORD
 * (at least 10 characters). The password is never printed or stored in the code.
 * To recreate from scratch: reset, then seed.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../src/server/db/prisma-repo";
import { hashPassword } from "../src/server/auth/password";
import { resetTestEnvironment, seedTestEnvironment, testEnvironmentReport } from "../src/server/seeding/test-env";

async function main() {
  const cmd = process.argv[2];
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Run this from the project folder where .env has the database address.");
  const prisma = new PrismaClient();
  // like the other seed scripts: no long interactive transaction against the remote database
  const repo = new PrismaRepo(prisma, { transactions: "none" });
  const t0 = Date.now();
  try {
    if (cmd === "seed") {
      const pw = process.env.TEST_ACCOUNT_PASSWORD ?? "";
      if (pw.length < 10) throw new Error("Set TEST_ACCOUNT_PASSWORD (at least 10 characters) in the command, e.g. TEST_ACCOUNT_PASSWORD='…' npx tsx scripts/seed-test-env.ts seed");
      const r = await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: await hashPassword(pw), practice: process.argv.includes("--no-practice") ? "none" : "light", log: (m) => console.log(m) });
      console.log("\nTest School ready:", JSON.stringify(r, null, 2));
      console.log("\nSign in as test.admin, test.teacher.1 … test.teacher.6, test.student.001 … test.student.200 (password: TEST_ACCOUNT_PASSWORD).");
    } else if (cmd === "report") {
      console.log(JSON.stringify(await testEnvironmentReport(repo), null, 2));
    } else if (cmd === "reset") {
      const out = await resetTestEnvironment(repo);
      console.log(Object.keys(out).length ? `Test School removed: ${JSON.stringify(out)}` : "There is no Test School.");
    } else {
      console.log("Use: seed [--no-practice] | report | reset");
      process.exitCode = 2;
    }
    console.log(`(${Math.round((Date.now() - t0) / 1000)} s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(`\n✗ ${(e as Error).message}\n`); process.exitCode = 1; });
