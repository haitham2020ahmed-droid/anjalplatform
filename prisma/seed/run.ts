/**
 * Shared runner for seed scripts.
 *  1. Checks the database connection first and prints the round-trip time, with an estimate of
 *     how long the seed will take (a cloud database can need several minutes).
 *  2. Writes without one giant transaction (seeds are idempotent upserts: re-running completes
 *     a stopped seed), so remote databases never hit a transaction time limit.
 *  3. Prints progress while it works, then a summary; on failure, a plain-language hint.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { withProgress } from "../../src/server/db/progress-repo";
import type { Repo } from "../../src/server/seeding/repo";

const HINTS: Record<string, string> = {
  P1001: "The database server cannot be reached. Check the host and port in DATABASE_URL, that the database is running, and that your network or firewall allows the connection.",
  P1000: "The database rejected the username or password in DATABASE_URL.",
  P1003: "The database named in DATABASE_URL does not exist. Create it, then run `npx prisma db push` (test/demo) or `npx prisma migrate deploy` (production).",
  P2021: "A table is missing: the schema has not been applied. Run `npx prisma db push` (test/demo) or `npx prisma migrate deploy`.",
  P2024: "Timed out waiting for a database connection. Close Prisma Studio and any other running seed, then try again.",
};

function where(url = process.env.DATABASE_URL ?? ""): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "3306"}${u.pathname}`;
  } catch {
    return "(DATABASE_URL is missing or not a valid URL)";
  }
}

export async function runSeed<T>(name: string, estimatedWrites: number, work: (repo: Repo) => Promise<T>): Promise<void> {
  const prisma = new PrismaClient();
  const started = Date.now();
  try {
    process.stdout.write(`${name}: connecting to ${where()} … `);
    const pings: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      pings.push(Date.now() - t);
    }
    const ms = Math.max(1, Math.min(...pings.slice(1)));
    const minutes = (estimatedWrites * 2 * ms) / 60_000;
    console.log(`connected (${ms} ms per round trip).`);
    console.log(
      minutes < 1
        ? `${name}: about ${estimatedWrites.toLocaleString()} rows to write; this should take under a minute.`
        : `${name}: about ${estimatedWrites.toLocaleString()} rows to write; with this connection it may take about ${Math.ceil(minutes)} minutes. Progress is shown below; please wait.`,
    );
    const repo = withProgress(new PrismaRepo(prisma, { transactions: "none" }), (n, el) =>
      console.log(`  … ${n.toLocaleString()} rows written (${Math.round(el / 1000)} s)`),
    );
    const result = await work(repo);
    console.log(`${name}: done in ${Math.round((Date.now() - started) / 1000)} s.`, result);
  } catch (e) {
    const code = (e as { code?: string }).code ?? (e as { errorCode?: string }).errorCode;
    console.error(`\n${name}: FAILED${code ? ` (${code})` : ""}: ${(e as Error).message.split("\n").slice(-3).join(" ").trim()}`);
    if (code && HINTS[code]) console.error(`Hint: ${HINTS[code]}`);
    console.error("Seeds are safe to run again: rows already written are updated, not duplicated.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
