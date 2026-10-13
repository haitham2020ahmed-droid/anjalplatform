/**
 * 🧱 "The database is behind the code": a table or column of a recent update is missing because the update's
 * `npx prisma db push` did not run (or failed). Prisma reports it as P2021 (table) / P2022 (column); MySQL and SQLite
 * have their own wording. Pages use this to say what to do instead of failing with a bare reference number.
 */
import { log } from "../monitoring/log";

const s = (v: unknown) => String(v ?? "");

export const SCHEMA_FIX = "The database is missing a new table or column ({what}). Run npx prisma db push on the server, then open this page again.";

export interface SchemaGap { what: string }

/** The missing table / column when `e` is such an error (else null). */
export function schemaGap(e: unknown): SchemaGap | null {
  const err = e as { code?: string; message?: string; meta?: { table?: unknown; column?: unknown } } | null;
  const msg = s(err?.message ?? e).replace(/\s+/g, " ").trim();
  const hit = err?.code === "P2021" || err?.code === "P2022" || /does not exist in the current database|Unknown column|no such (?:column|table)|Table '[^']*' doesn't exist|has no column named/i.test(msg);
  if (!hit) return null;
  const named = s(err?.meta?.column ?? err?.meta?.table ?? "");
  const fromMsg = msg.match(/(?:column|table)[\s:]+[`'"]?([\w.]+)/i)?.[1] ?? msg.match(/Table '([\w.]+)'/)?.[1] ?? "";
  return { what: (named || fromMsg || "?").replace(/[`'"]/g, "").slice(0, 80) };
}

/** One line for an admin: the fix for a schema gap, else the error's own message (shortened). */
export function adminErrorText(e: unknown): string {
  const g = schemaGap(e);
  if (g) return SCHEMA_FIX.replace("{what}", g.what);
  return s((e as { message?: string } | null)?.message ?? e).replace(/\s+/g, " ").trim().slice(0, 300);
}

// ------------------------------------------------------------------ 🛟 common pages open anyway

/** The gaps seen by this server process (admin banner): what is missing → where it was read, and when last. */
const seen = new Map<string, { where: string; at: number }>();

/** Notes a gap (one log line per missing table/column, not one per page view). */
export function noteSchemaGap(where: string, gap: SchemaGap, now = Date.now()): void {
  const had = seen.get(gap.what);
  if (had) { had.at = now; return; }
  if (seen.size < 200) seen.set(gap.what, { where, at: now });
  log("warn", "db.schema_behind", { where, missing: gap.what, fix: "npx prisma db push" });
}

/** Missing tables/columns noticed in the last `withinMs` (empty while the database is up to date). */
export function schemaGapsSeen(withinMs = 15 * 60_000, now = Date.now()): { what: string; where: string }[] {
  return [...seen.entries()].filter(([, v]) => now - v.at < withinMs).map(([what, v]) => ({ what, where: v.where }));
}
/** Tests / after a fix: forget the gaps seen. */
export function resetSchemaGaps(): void { seen.clear(); }

/**
 * Common pages (menus, home tiles and badges, lists) when the database is behind the code: `work` failing ONLY
 * because a recent table/column is missing gives `empty` (logged once) instead of an error page. Any other error is
 * thrown exactly as before, and nothing changes while the database is up to date.
 */
export async function safeIfBehind<T>(where: string, work: Promise<T> | (() => Promise<T>), empty: T): Promise<T> {
  try {
    return await (typeof work === "function" ? work() : work);
  } catch (e) {
    const g = schemaGap(e);
    if (!g) throw e;
    noteSchemaGap(where, g);
    return empty;
  }
}

/** What a page of a NEW feature says when its tables are missing (instead of an error page). */
export const DB_UPDATE_NEEDED = "The database needs an update: run npx prisma db push";
