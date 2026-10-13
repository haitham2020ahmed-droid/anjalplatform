/**
 * 🚀 ReadRise — platform library seed: data/readrise/articles/*.json → RRArticle (schoolId null, PUBLISHED).
 *
 *   seedReadRiseLibrary(...)        the FULL seed (prisma/seed/readrise.ts, prisma/seed/questions.ts): every file is
 *                                   imported; idempotent by code (re-running updates the same rows); a broken file
 *                                   is skipped and reported, never half-written.
 *   ensureReadRiseLibrary(...)      on a live site (the daily job, tests): imports ONLY the files whose article code
 *                                   is not in the database yet (new files shipped with an update). Existing articles
 *                                   are never re-imported here.
 *   startReadRiseLibraryLoad(...)   for pages: starts that check in the BACKGROUND and returns at once — a page never
 *                                   waits for a load (the page shows the articles that are already there).
 *   readRiseLibraryStatus(...)      what the admin page shows: loading?, how many new articles, files that failed.
 *
 * Never called by the demo / test school seed.
 */
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";
import type { Repo } from "../seeding/repo";
import { log } from "../monitoring/log";
import { importArticleJson } from "./import";
import { estimateLevel } from "./level";

export interface LibrarySeedReport { files: number; created: number; updated: number; skipped: { file: string; problems: string[] }[] }

const articleDir = (root: string) => join(root, "data", "readrise", "articles");
const articleFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).sort() : []);

/** Imports one file (null → imported; else the problems). */
async function importFile(repo: Repo, dir: string, f: string, rep: LibrarySeedReport, log: (m: string) => void): Promise<void> {
  let json: unknown;
  try { json = JSON.parse(readFileSync(join(dir, f), "utf8")); }
  catch (e) { rep.skipped.push({ file: f, problems: [`not valid JSON: ${(e as Error).message}`] }); log(`  ReadRise: skipped ${f} (not valid JSON)`); return; }
  const r = await importArticleJson(repo, null, json, { schoolId: null, publish: true });
  if (!r.ok) {
    rep.skipped.push({ file: f, problems: r.errors.map((e) => `${e.where}: ${e.message}`) });
    log(`  ReadRise: skipped ${f} (${r.errors.length} problem${r.errors.length === 1 ? "" : "s"}: ${r.errors.slice(0, 2).map((e) => `${e.where}: ${e.message}`).join("; ")})`);
    return;
  }
  if (r.created) rep.created++; else rep.updated++;
}

/** The full seed: every article file (unchanged behaviour of `npx tsx prisma/seed/readrise.ts`). */
export async function seedReadRiseLibrary(repo: Repo, root: string, log: (m: string) => void = console.log): Promise<LibrarySeedReport> {
  const dir = articleDir(root);
  const rep: LibrarySeedReport = { files: 0, created: 0, updated: 0, skipped: [] };
  if (!existsSync(dir)) return rep;
  for (const f of articleFiles(dir)) {
    rep.files++;
    await importFile(repo, dir, f, rep, log);
  }
  const measured = await cacheMeasuredLevels(repo);
  if (measured) log(`  ReadRise: measured ${measured} version${measured === 1 ? "" : "s"} without a cached level.`);
  log(`  ReadRise library: ${rep.created} new, ${rep.updated} updated, ${rep.skipped.length} skipped (${rep.files} files).`);
  return rep;
}

/**
 * The article code of a file, read cheaply: the first few KB (the code is the first field of the format), else the
 * whole file. null = no code could be read (the import reports why).
 */
export function articleCodeOf(path: string): string | null {
  try {
    const fd = openSync(path, "r");
    try {
      const buf = Buffer.alloc(4096);
      const n = readSync(fd, buf, 0, buf.length, 0);
      const m = /^\s*\{\s*"code"\s*:\s*"([^"\\]{1,60})"/.exec(buf.subarray(0, n).toString("utf8"));
      if (m) return m[1].trim();
    } finally { closeSync(fd); }
    const json = JSON.parse(readFileSync(path, "utf8")) as { code?: unknown };
    return typeof json?.code === "string" && json.code.trim() ? json.code.trim() : null;
  } catch { return null; }
}

/** Per data source: the files of the article folder whose import failed in this process (never retried until a deploy). */
const failedFiles = new WeakMap<object, Map<string, string[]>>();
const failedOf = (repo: Repo) => { let m = failedFiles.get(repo); if (!m) failedFiles.set(repo, (m = new Map())); return m; };

/**
 * Imports ONLY the article files whose code is missing from the platform library: one query for the existing codes,
 * a file is read in full only when its code is missing. A file that fails is remembered for this process and never
 * makes the other files load again.
 */
export async function seedMissingReadRiseArticles(repo: Repo, root: string, onPending: (n: number) => void = () => undefined): Promise<LibrarySeedReport> {
  const dir = articleDir(root);
  const files = articleFiles(dir);
  const rep: LibrarySeedReport = { files: files.length, created: 0, updated: 0, skipped: [] };
  if (!files.length) return rep;
  const have = new Set((await repo.findMany("RRArticle", { schoolId: null, deletedAt: null }, { select: ["code"] })).map((a) => String(a.code ?? "").toUpperCase()));
  const failed = failedOf(repo);
  const missing: string[] = [];
  for (const f of files) {
    const key = `${root}|${f}`;
    const known = failed.get(key);
    if (known) { rep.skipped.push({ file: f, problems: known }); continue; }
    const code = articleCodeOf(join(dir, f));
    if (code && have.has(code.toUpperCase())) continue;
    missing.push(f);
  }
  onPending(missing.length);
  for (const f of missing) {
    const before = rep.skipped.length;
    await importFile(repo, dir, f, rep, () => undefined);
    if (rep.skipped.length > before) failed.set(`${root}|${f}`, rep.skipped[rep.skipped.length - 1].problems);
  }
  if (rep.created) await cacheMeasuredLevels(repo);
  return rep;
}

export interface LibraryLoadStatus {
  /** a load is running in the background */
  loading: boolean;
  /** new article files being loaded (null = not known yet) */
  pending: number | null;
  /** the last finished load (null = none in this process) */
  last: LibrarySeedReport | null;
  /** the last load failed with this error */
  error: string | null;
}

/**
 * The library check on a live site: at most ONCE PER DAY per server process (and data source) — article files only
 * change with a deploy, which starts a new process — so a page view costs nothing. Single-flight: concurrent calls
 * share one load. A broken file is reported and remembered; an error (database down) is retried after RETRY_MS.
 * Pages call startReadRiseLibraryLoad (never waits); the daily job and tests may await this.
 */
const checkedOn = new WeakMap<object, string>();
const retryAt = new WeakMap<object, number>();
const inflight = new WeakMap<object, Promise<LibrarySeedReport | null>>();
const status = new WeakMap<object, LibraryLoadStatus>();
const RETRY_MS = 10 * 60_000;

export function ensureReadRiseLibrary(repo: Repo, root: string = process.cwd(), now: Date = new Date()): Promise<LibrarySeedReport | null> {
  const running = inflight.get(repo);
  if (running) return running;
  const stamp = `${now.toISOString().slice(0, 10)}|${root}`;
  if (checkedOn.get(repo) === stamp) return Promise.resolve(null);
  if ((retryAt.get(repo) ?? 0) > Date.now()) return Promise.resolve(null);
  const st: LibraryLoadStatus = { ...(status.get(repo) ?? { last: null, error: null }), loading: true, pending: null };
  status.set(repo, st);
  const p = (async (): Promise<LibrarySeedReport | null> => {
    try {
      const rep = await seedMissingReadRiseArticles(repo, root, (n) => { st.pending = n; });
      checkedOn.set(repo, stamp);
      st.last = rep; st.error = null;
      if (rep.created) log("info", "readrise.library.loaded", { created: rep.created, skipped: rep.skipped.length, files: rep.files });
      return rep.created || rep.updated || rep.skipped.length ? rep : null;
    } catch (e) {
      retryAt.set(repo, Date.now() + RETRY_MS);
      st.error = String((e as Error)?.message ?? e).slice(0, 400);
      throw e;
    } finally {
      st.loading = false;
      inflight.delete(repo);
    }
  })();
  inflight.set(repo, p);
  return p;
}

/** Starts the library check in the background (pages): returns at once; a failure is logged, never thrown. */
export function startReadRiseLibraryLoad(repo: Repo, root: string = process.cwd(), now: Date = new Date()): void {
  ensureReadRiseLibrary(repo, root, now).catch((e) => log("error", "readrise.library.ensure_failed", { error: e }));
}

/** The background load's state for this data source (the admin page). */
export function readRiseLibraryStatus(repo: Repo): LibraryLoadStatus {
  const st = status.get(repo);
  return st ? { ...st, last: st.last ? { ...st.last, skipped: [...st.last.skipped] } : null } : { loading: false, pending: null, last: null, error: null };
}

/** Forgets the daily check and the remembered failed files (tests). */
export function resetReadRiseLibraryCheck(repo: Repo): void { checkedOn.delete(repo); retryAt.delete(repo); failedFiles.delete(repo); status.delete(repo); }

/**
 * Caches the measured level of every version that has none yet (RRVersion.estLevel ≤ 0, e.g. rows written before
 * the estimate existed): estimateLevel(body) is stored, so picking a version never re-analyses a text on a page view.
 * Bounded: only the rows missing a value are read, a page at a time. Returns how many were measured.
 */
export async function cacheMeasuredLevels(repo: Repo, pageSize = 200): Promise<number> {
  let done = 0;
  for (;;) {
    const rows = await repo.findMany("RRVersion", { estLevel: { lte: 0 } }, { select: ["id", "body"], take: pageSize });
    if (!rows.length) return done;
    for (const r of rows) await repo.updateMany("RRVersion", { id: r.id }, { estLevel: Math.max(1, estimateLevel(String(r.body ?? ""))) });
    done += rows.length;
    if (rows.length < pageSize) return done;
  }
}
