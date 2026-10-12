/**
 * Prisma client singleton (prevents connection storms during Next.js hot reload).
 * All queries go through Prisma's parameterised API — no string-built SQL — which
 * is the primary SQL-injection defence. Raw SQL (analytics) must use Prisma.sql``.
 */
import { PrismaClient } from "@prisma/client";
import { withPoolLimit } from "./db-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = withPoolLimit(process.env.DATABASE_URL);

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });

// kept on globalThis in production too: Next.js builds the instrumentation hook, route handlers and pages as separate
// bundles, and each would otherwise start its own client (its own query engine and pool) in the same process
globalForPrisma.prisma = db;
