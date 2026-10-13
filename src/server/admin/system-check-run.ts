/**
 * Runs the System check against the app's own database (MySQL): two read-only information_schema queries.
 * Never throws: a failure is returned as text for the admin page.
 */
import "server-only";
import { db } from "@/lib/db";
import { compareSchema, expectedSchema, liveMysql, type SystemCheck } from "./system-check";

export async function systemCheckNow(): Promise<{ check: SystemCheck | null; error: string | null; ms: number }> {
  const t0 = Date.now();
  try {
    const expected = expectedSchema();
    if (!expected) return { check: null, error: "The Prisma schema file was not found next to the app (prisma/schema.prisma).", ms: Date.now() - t0 };
    const client = db as unknown as { $queryRaw(q: TemplateStringsArray): Promise<Record<string, unknown>[]> };
    const live = await liveMysql((q) => client.$queryRaw(q));
    return { check: compareSchema(expected, live), error: null, ms: Date.now() - t0 };
  } catch (e) {
    return { check: null, error: String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 400), ms: Date.now() - t0 };
  }
}
