/**
 * 🖥 Server status (Admin → Server status): a read-only glance at the one thing a non-technical admin cannot see —
 * is the server itself healthy right now? Memory, uptime, Node version, a cheap database ping, and the "black box"
 * memory-sample system's own live view of this process (src/server/monitoring/memory.ts — it already keeps the last
 * few page loads and their RSS; this just surfaces that, instead of re-building it). Nothing here is written to the
 * database and nothing is ever mutated: cheap enough to load on every visit.
 *
 * The database client is INJECTED (never imported here) so this module stays testable without a generated Prisma
 * client or a real database: the page passes the real `db` from "@/lib/db"; tests pass a tiny fake.
 */
import { memorySnapshot, MEMORY_BUSY_MB, recentPaths, buildsWaiting } from "@/server/monitoring/memory";

export interface RawDb { $queryRaw(query: TemplateStringsArray): Promise<unknown> }
export interface DbPing { ok: boolean; ms: number; error: string | null }

/** One `SELECT 1`: cheap, read-only, never throws (a failure is reported, not raised). */
export async function dbPing(client: RawDb): Promise<DbPing> {
  const t0 = Date.now();
  try {
    await client.$queryRaw`SELECT 1`;
    return { ok: true, ms: Date.now() - t0, error: null };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 300) };
  }
}

export interface ServerStatus {
  now: string;
  uptimeSeconds: number;
  nodeVersion: string;
  memory: ReturnType<typeof memorySnapshot>;
  memoryBusyMb: number;
  memoryBusyNow: boolean;
  buildsWaitingNow: number;
  recentPages: string;
  db: DbPing;
}

/** Everything the page shows, in one call. Read-only: a memory snapshot, a DB ping, and the black box's own in-memory
 *  recent-pages list (nothing is queried from a log store — the structured log lines themselves only ever go to
 *  stdout/stderr, which Render's own log viewer keeps; the page links to docs/BACKUP-AND-RESTORE.md for that). */
export async function serverStatus(client: RawDb): Promise<ServerStatus> {
  const memory = memorySnapshot();
  const ping = await dbPing(client);
  return {
    now: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version,
    memory,
    memoryBusyMb: MEMORY_BUSY_MB,
    memoryBusyNow: memory.rssMB > MEMORY_BUSY_MB,
    buildsWaitingNow: buildsWaiting(),
    recentPages: recentPaths(),
    db: ping,
  };
}
