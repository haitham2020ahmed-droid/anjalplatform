/**
 * 🧠 Idle memory of the web server, measured: imports the server modules the app loads at boot and on the hot pages,
 * runs the content readers a student / teacher visit triggers, and prints the heap each one keeps (heapUsed after a
 * full garbage collection, before → after). Then it waits past the idle time and prints what is still kept.
 *
 *   NODE_OPTIONS=--expose-gc npx tsx scripts/perf/idle-memory.ts
 *
 * Never touches a database (content files and modules only).
 */
const MB = 1048576;
const gcFn = (globalThis as { gc?: () => void }).gc;
export const heapMb = (): number => { if (gcFn) { gcFn(); gcFn(); } return process.memoryUsage().heapUsed / MB; };

export interface Holder { name: string; mb: number }

/** Each step: the heap kept after it ran (its result is NOT held by this script: only what the app keeps counts). */
export async function measureHolders(log = (_: string) => undefined as void): Promise<{ boot: number; afterBoot: number; afterHot: number; holders: Holder[] }> {
  const holders: Holder[] = [];
  const boot = heapMb();
  const step = async (name: string, fn: () => unknown | Promise<unknown>) => {
    const a = heapMb();
    await fn();
    const b = heapMb();
    holders.push({ name, mb: Math.round((b - a) * 10) / 10 });
    log(`${name.padEnd(42)} +${(b - a).toFixed(1)} MB  (heap ${b.toFixed(1)} MB)`);
  };
  // modules of boot + every student / teacher page
  await step("module: i18n (en + ar dictionaries)", () => import("../../src/i18n/index"));
  await step("module: practice session", () => import("../../src/server/practice/session"));
  await step("module: skills status (taxonomy)", () => import("../../src/server/skills/status"));
  await step("module: curriculum-map lesson details", () => import("../../src/server/curriculum-map/lesson-details"));
  const afterBoot = heapMb();
  // content read by the hot pages (Learn, NAFS, ReadRise)
  const L = await import("../../src/server/learn/files");
  await step("Learn: one lesson (student opens it)", () => L.lessonFile("LN-001"));
  await step("Learn: lesson catalog (teacher list)", () => L.lessonCatalog());
  await step("Learn: continuum", () => L.readContinuum());
  await step("Learn: words", () => L.readWordFiles());
  const B = await import("../../src/server/nafs/booklets");
  await step("NAFS: booklets", () => B.readBooklets());
  const P = await import("../../src/server/nafs/practice-sets");
  await step("NAFS: practice sets", () => P.readPracticeSets());
  const RR = await import("../../src/server/readrise/content-loader");
  await step("ReadRise: placement", () => RR.loadPlacementPassages());
  // admin: Load new questions (its counts read every question pack)
  const LP = await import("../../src/server/questions/load-packs");
  await step("Admin: question packs (Load new questions)", async () => { for (const p of LP.PACKS) await LP.loadPack(p).catch(() => null); });
  const afterHot = heapMb();
  return { boot, afterBoot, afterHot, holders };
}

if (process.argv[1] && /idle-memory\.ts$/.test(process.argv[1])) {
  void (async () => {
    if (!gcFn) console.log("(run with NODE_OPTIONS=--expose-gc for exact numbers)");
    const r = await measureHolders((l) => console.log(l));
    console.log(`\nheap at start ${r.boot.toFixed(1)} MB · after boot modules ${r.afterBoot.toFixed(1)} MB · after hot pages ${r.afterHot.toFixed(1)} MB`);
    try {
      const { releaseIdleContent } = await import("../../src/server/cache/idle");
      releaseIdleContent(0);
      console.log(`after the idle release: ${heapMb().toFixed(1)} MB`);
    } catch { console.log("(no idle release in this version)"); }
    console.log("\ntop holders:");
    for (const h of [...r.holders].sort((a, b) => b.mb - a.mb).slice(0, 8)) console.log(`  ${h.mb.toFixed(1).padStart(6)} MB  ${h.name}`);
  })();
}
