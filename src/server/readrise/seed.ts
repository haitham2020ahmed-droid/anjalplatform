/**
 * 🚀 ReadRise — platform library seed: data/readrise/articles/*.json → RRArticle (schoolId null, PUBLISHED).
 * Idempotent by code (re-running updates the same rows); a broken file is skipped and reported, never half-written.
 * Called by the platform seeds (prisma/seed/questions.ts and prisma/seed/readrise.ts) — never by the demo / test school seed.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Repo } from "../seeding/repo";
import { importArticleJson } from "./import";
import { estimateLevel } from "./level";

export interface LibrarySeedReport { files: number; created: number; updated: number; skipped: { file: string; problems: string[] }[] }

export async function seedReadRiseLibrary(repo: Repo, root: string, log: (m: string) => void = console.log): Promise<LibrarySeedReport> {
  const dir = join(root, "data", "readrise", "articles");
  const rep: LibrarySeedReport = { files: 0, created: 0, updated: 0, skipped: [] };
  if (!existsSync(dir)) return rep;
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    rep.files++;
    let json: unknown;
    try { json = JSON.parse(readFileSync(join(dir, f), "utf8")); }
    catch (e) { rep.skipped.push({ file: f, problems: [`not valid JSON: ${(e as Error).message}`] }); log(`  ReadRise: skipped ${f} (not valid JSON)`); continue; }
    const r = await importArticleJson(repo, null, json, { schoolId: null, publish: true });
    if (!r.ok) {
      rep.skipped.push({ file: f, problems: r.errors.map((e) => `${e.where}: ${e.message}`) });
      log(`  ReadRise: skipped ${f} (${r.errors.length} problem${r.errors.length === 1 ? "" : "s"}: ${r.errors.slice(0, 2).map((e) => `${e.where}: ${e.message}`).join("; ")})`);
      continue;
    }
    if (r.created) rep.created++; else rep.updated++;
  }
  const measured = await cacheMeasuredLevels(repo);
  if (measured) log(`  ReadRise: measured ${measured} version${measured === 1 ? "" : "s"} without a cached level.`);
  log(`  ReadRise library: ${rep.created} new, ${rep.updated} updated, ${rep.skipped.length} skipped (${rep.files} files).`);
  return rep;
}

/**
 * Loads the platform library on a live site without any manual step: when there are fewer platform articles than
 * article files (first deploy, or new files shipped in an update), the missing/changed files are imported.
 * Safe to call from pages and the daily job. Update 42B: checked at most ONCE PER DAY per server process (and data
 * source) — the article files only change with a deploy, which starts a new process — so a page view costs nothing.
 */
let ensuring: Promise<LibrarySeedReport | null> | null = null;
const checkedOn = new WeakMap<object, string>();
const retryAt = new WeakMap<object, number>();
const RETRY_MS = 10 * 60_000;
export async function ensureReadRiseLibrary(repo: Repo, root: string = process.cwd(), now: Date = new Date()): Promise<LibrarySeedReport | null> {
  const stamp = `${now.toISOString().slice(0, 10)}|${root}`;
  if (checkedOn.get(repo) === stamp) return null;
  if ((retryAt.get(repo) ?? 0) > Date.now()) return null;
  const dir = join(root, "data", "readrise", "articles");
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).length : 0;
  if (!files) { checkedOn.set(repo, stamp); return null; }
  const have = await repo.count("RRArticle", { schoolId: null, deletedAt: null });
  if (have >= files) { checkedOn.set(repo, stamp); return null; }
  ensuring ??= seedReadRiseLibrary(repo, root, () => undefined).finally(() => { ensuring = null; });
  const report = await ensuring;
  // only stop checking for today when every file loaded — a failed or partly skipped load is retried, at most every
  // RETRY_MS (a broken file no longer re-imports the whole library on every page view)
  if (report && report.skipped.length === 0) checkedOn.set(repo, stamp);
  else retryAt.set(repo, Date.now() + RETRY_MS);
  return report;
}

/** Forgets the daily check (tests). */
export function resetReadRiseLibraryCheck(repo: Repo): void { checkedOn.delete(repo); retryAt.delete(repo); }

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
