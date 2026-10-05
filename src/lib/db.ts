/**
 * Prisma client singleton (prevents connection storms during Next.js hot reload).
 * All queries go through Prisma's parameterised API — no string-built SQL — which
 * is the primary SQL-injection defence. Raw SQL (analytics) must use Prisma.sql``.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
