/**
 * 🧠 r84 memory measurements (run in a child process with a REAL --expose-gc by tests/r84-memory.test.ts through
 * runWithGc; `npx tsx --expose-gc tests/helpers/r84-memory-child.ts nafs|map` prints the numbers too). Fictional demo
 * school, in-memory SQLite only.
 *   nafs   the NAFS fixture (tests/helpers/nafs-school.ts): heap held by the school's NAFS index (MB, entries), then the
 *          peak heap of opening the NAFS center (bank tab) on a fresh process (empty caches)
 *   map    the MAP fixture (tests/helpers/map-school.ts): heap held by the MAP pools of Grades 4–6 and the Learning
 *          Continuum index of every grade × subject, then the peak heap of opening the MAP results page (empty caches)
 */
import { join } from "node:path";
import { clearCaches } from "../../src/server/cache/idle";
import { forceGc, peakHeap } from "./peak-heap";
import { renderPage } from "./page-render";
import { ROOT } from "./db";

const MB = 1048576;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** A full GC after the current job (WeakRef targets are kept alive until the job ends), twice. */
async function settleGc(gc: () => void): Promise<number> {
  for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 5)); gc(); }
  return process.memoryUsage().heapUsed;
}

/** Debug: heap given back by emptying each registered cache in turn (MB, largest first). */
async function perCache(gc: () => void): Promise<string> {
  const regs = (globalThis as unknown as { __cacheRegistry?: { caches: Map<string, { clear(): void; size(): number }[]> } }).__cacheRegistry;
  const out: [string, number, number][] = [];
  for (const [name, list] of regs?.caches ?? []) {
    const n = list.reduce((a, c) => a + c.size(), 0);
    if (!n) continue;
    const before = await settleGc(gc);
    for (const c of list) c.clear();
    out.push([name, n, r1((before - (await settleGc(gc))) / MB)]);
  }
  return out.sort((a, b) => b[2] - a[2]).map(([k, n, mb]) => `${k}(${n}) ${mb}`).join(", ");
}

/** One page opened on a "fresh" process (every cache empty): its peak heap and what it leaves held (MB). */
async function openPage(gc: () => void, file: string, path: string, cookies: Record<string, string>, sp: Record<string, string>): Promise<{ peakMb: number; heldMb: number; outcome: string }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = () => require(join(ROOT, file)) as Record<string, unknown>;
  load();
  clearCaches();
  await settleGc(gc);
  const page = await peakHeap(async () => {
    const r = await renderPage(load, { path, cookies, searchParams: sp });
    for (const f of r.after) await Promise.resolve(f()).catch(() => null);
    return r.outcome;
  });
  if (process.env.R84_DEBUG) console.error(`caches after ${path} ${JSON.stringify(sp)}:`, await perCache(gc));
  return { peakMb: page.peakMb, heldMb: page.heldMb, outcome: page.value };
}

/** Heap held by what `fn` builds and keeps (the caches): full GC → heap → build → full GC → heap. */
async function held(gc: () => void, fn: () => Promise<unknown>): Promise<{ mb: number; keep: unknown }> {
  const base = await settleGc(gc);
  const keep: unknown = await fn();
  const withIt = await settleGc(gc);
  if (process.env.R84_DEBUG) console.error("held", base, withIt);
  return { mb: r1((withIt - base) / MB), keep: Array.isArray(keep) ? keep.length : 0 };
}

async function nafs() {
  const { nafsSchool } = await import("./nafs-school");
  const { nafsIndex } = await import("../../src/server/nafs/bank");
  const N = await nafsSchool();
  N.b.S.m.latency = 0;
  const repo = N.b.S.repo, schoolId = N.g6.schoolId!;
  const gc = forceGc();
  clearCaches();
  await nafsIndex(repo, schoolId); // warm the code paths and the framework once (not counted)
  clearCaches();
  const idx = await held(gc, () => nafsIndex(repo, schoolId));
  const entries = idx.keep as number;
  const bank = await openPage(gc, "src/app/teacher/nafs/page.tsx", "/teacher/nafs", N.cookie, { tab: "bank" });
  const booklets = await openPage(gc, "src/app/teacher/nafs/page.tsx", "/teacher/nafs", N.cookie, { tab: "booklets" });
  return { indexMb: idx.mb, entries, bank, booklets };
}

async function map() {
  const { mapSchool } = await import("./map-school");
  const { groupPools } = await import("../../src/server/map/map-plan");
  const { continuumIndex } = await import("../../src/server/map/continuum");
  const M = await mapSchool();
  M.b.S.m.latency = 0;
  const repo = M.b.S.repo, schoolId = M.teacher.schoolId!;
  const gc = forceGc();
  const build = async () => { const out: unknown[] = []; for (const g of [4, 5, 6]) { out.push(await groupPools(repo, schoolId, g)); for (const sub of ["READING", "LANGUAGE"] as const) out.push(await continuumIndex(repo, schoolId, g, sub)); } return out; };
  clearCaches();
  await build();
  clearCaches();
  const pools = await held(gc, async () => { const o: unknown[] = []; for (const g of [4, 5, 6]) o.push(await groupPools(repo, schoolId, g)); return o; });
  const cont = await held(gc, async () => { const o: unknown[] = []; for (const g of [4, 5, 6]) for (const sub of ["READING", "LANGUAGE"] as const) o.push(await continuumIndex(repo, schoolId, g, sub)); return o; });
  const results = await openPage(gc, "src/app/teacher/map-center/page.tsx", "/teacher/map-center", M.cookie, { tab: "results" });
  const plan = await openPage(gc, "src/app/teacher/map-center/page.tsx", "/teacher/map-center", M.cookie, { tab: "plan", classId: M.classIds[0] });
  return { poolsMb: pools.mb, continuumMb: cont.mb, results, plan };
}

(async () => {
  const which = process.argv[2];
  const result = which === "map" ? await map() : await nafs();
  console.log(JSON.stringify({ result }));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
