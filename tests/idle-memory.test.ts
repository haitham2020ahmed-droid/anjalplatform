/**
 * r68 stability: the IDLE memory of the 512 MB server. Production (Render metrics) sat at 75–80 % memory even when nobody
 * was online: every in-memory cache only checked its age when read again, so whatever a school day put there stayed for
 * the life of the server (practice pools ×500, bank-wide admin figures, parsed content files, per-student indexes).
 * Now expired entries are REMOVED by a sweeper, content files are released when idle, and every cache is bounded.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { IdleBox, cacheSizes, clearCaches, registerCache, releaseIdleContent, sweepCaches, sweptMap, sweptWeakMap, sweptWeakValue } from "../src/server/cache/idle";
import { ROOT } from "./helpers/db";
import { runWithGc } from "./helpers/peak-heap";
import type { DayMemory } from "./helpers/idle-scenario";

describe("r68: caches give their memory back", () => {
  test("sweptMap: bounded (oldest out) and expired entries removed by the sweeper, not only when read again", () => {
    const m = sweptMap<string, { at: number; v: number }>("test.swept", 1000, 3);
    const t = Date.now();
    for (let i = 0; i < 5; i++) m.set(`k${i}`, { at: t, v: i });
    assert.deepEqual([...m.keys()], ["k2", "k3", "k4"], "never more than its bound");
    m.set("k5", { at: t - 5000, v: 5 });
    assert.equal(sweepCaches(t) >= 1, true);
    assert.equal(m.has("k5"), false, "expired: removed");
    assert.equal(m.size, 2, "the rest kept");
    assert.ok(cacheSizes().some((c) => c.name === "test.swept"));
  });

  test("per-data-source caches (WeakMap<repo, Map>) and single values are swept too", () => {
    const w = sweptWeakMap<{ at: number }>("test.weak", 1000);
    const v = sweptWeakValue<{ at: number; x: number }>("test.value", 1000);
    const repo = {};
    const inner = new Map<string, { at: number }>();
    w.set(repo, inner);
    inner.set("old", { at: Date.now() - 10_000 });
    inner.set("new", { at: Date.now() });
    v.set(repo, { at: Date.now() - 10_000, x: 1 });
    sweepCaches();
    assert.deepEqual([...inner.keys()], ["new"]);
    assert.equal(v.has(repo), false);
  });

  test("a parsed content file is kept while used and released when idle", () => {
    const box = new IdleBox<number[]>("test.box", 50);
    box.set([1, 2, 3], 1_000);
    assert.deepEqual(box.get(1_020), [1, 2, 3]);
    sweepCaches(1_060); // 40 ms after the last use: kept
    assert.ok(box.peek());
    sweepCaches(1_100);
    assert.equal(box.peek(), null, "released after its idle time");
    box.set([4], Date.now());
    assert.equal(releaseIdleContent(0), 1);
    assert.equal(box.peek(), null);
  });

  test("a student opening ONE Learn lesson reads that one file, not every lesson", async () => {
    const L = await import("../src/server/learn/files");
    clearCaches("content");
    const files = L.lessonFiles();
    assert.ok(files.length > 50, "the lesson files are there");
    const code = files[0].replace(/\.json$/, "");
    const one = L.lessonFile(code);
    assert.equal(one?.code, code);
    const content = cacheSizes().find((c) => c.name === "learn.lessons");
    assert.equal(content?.size ?? 0, 0, "the whole folder was not parsed for one lesson");
    assert.equal(L.lessonFile(code), one, "the same file again: kept (a few, swept)");
    // the teacher's list parses the folder; it is released after its idle time
    assert.ok(L.readLessons().valid.size > 50);
    assert.equal(cacheSizes().find((c) => c.name === "learn.lessons")?.size, 1);
    releaseIdleContent(0);
    assert.equal(cacheSizes().find((c) => c.name === "learn.lessons")?.size, 0);
  });

  test("every module-level cache of the hot paths is registered (bounded and swept)", async () => {
    await Promise.all([
      import("../src/server/practice/items"), import("../src/server/practice/session"), import("../src/server/practice/guessing"), import("../src/server/questions/fresh"),
      import("../src/server/questions/skill-questions"), import("../src/server/cache/kept"), import("../src/server/auth/actor"), import("../src/server/nafs/booklets"),
      import("../src/server/questions/load-packs"), import("../src/server/search/everything"), import("../src/server/lessons/run"),
    ]);
    const names = new Set(cacheSizes().map((c) => c.name));
    for (const n of ["practice.pools", "practice.questions", "practice.ref", "practice.item-times", "fresh.seen", "fresh.keys", "skills.family", "kept.bank-figures", "auth.actor.actorCache", "nafs.booklets", "packs.files", "search.everything.stemCache", "lessons.ref", "learn.lessons"]) assert.ok(names.has(n), `${n} is registered`);
  });

  test("a school day, then the evening: the idle server keeps almost nothing of it", { timeout: 600_000 }, async () => {
    // in a child process with a real --expose-gc: exact heap numbers
    const r = runWithGc<DayMemory>(join(ROOT, "tests/helpers/day-child.ts"), ["8000", "120"]);
    console.log(`heap before the day ${r.before} MB · after the day ${r.afterDay} MB · after the idle clean-up ${r.afterIdle} MB`);
    for (const s of [...r.steps].sort((a, b) => b.mb - a.mb)) console.log(`  ${String(s.mb).padStart(6)} MB  ${s.name}`);
    assert.ok(r.cleanup);
    assert.ok(r.afterDay - r.before >= 10, "the day did fill the caches (the test measures something)");
    assert.ok(r.afterIdle - r.before <= 6, `idle keeps at most 6 MB of the day (kept ${r.afterIdle - r.before} MB)`);
  });

  test("the measurement script lists the top memory holders of boot + the hot pages", async () => {
    const m = await import(pathToFileURL(join(ROOT, "scripts/perf/idle-memory.ts")).href) as typeof import("../scripts/perf/idle-memory");
    const r = await m.measureHolders();
    assert.ok(r.holders.length >= 8);
    assert.ok(r.afterHot >= r.afterBoot - 1);
    releaseIdleContent(0);
  });

  test("the start script sizes V8 for the container: heap = memory − 210 MB (302 MB on 512 MB), semi-space 8 MB", async () => {
    const m = (await import(pathToFileURL(join(ROOT, "scripts/start.mjs")).href)) as { heapLimitMb: (o: object) => number; nodeFlags: (o: object, n?: string) => string[] };
    assert.deepEqual(m.nodeFlags({}), ["--max-old-space-size=302", "--max-semi-space-size=8"]);
    assert.deepEqual(m.nodeFlags({ webMemoryMb: "2048" }), ["--max-old-space-size=1434"], "a bigger plan: 70 %, default young generation");
    assert.deepEqual(m.nodeFlags({}, "--max-old-space-size=280 --max-semi-space-size=4"), [], "NODE_OPTIONS wins");
    registerCache("test.noop", { sweep: () => 0, clear: () => undefined, size: () => 0 });
  });
});

// r81: idle full GC (the live server sat at ~400 MB all night after a busy evening)
import { test as r81test } from "node:test";
import r81assert from "node:assert/strict";
r81test("r81: idle GC runs only with --expose-gc, above 300 MB, at most every 3 minutes", async () => {
  const { idleGc, IDLE_GC_EVERY_MS } = await import("../src/server/cache/idle");
  const g = globalThis as { gc?: () => void };
  const had = g.gc; let n = 0;
  g.gc = () => { n++; };
  try {
    const t0 = 10_000_000_000;
    r81assert.equal(idleGc(t0, 200), false, "under 300 MB: nothing");
    r81assert.equal(idleGc(t0, 400), true);
    r81assert.equal(idleGc(t0 + 1000, 400), false, "not twice in 3 minutes");
    r81assert.equal(idleGc(t0 + IDLE_GC_EVERY_MS + 1, 400), true);
    r81assert.equal(n, 2);
  } finally { g.gc = had; }
  const src = (await import("node:fs")).readFileSync("scripts/start.mjs", "utf8");
  r81assert.match(src, /--expose-gc/);
});
