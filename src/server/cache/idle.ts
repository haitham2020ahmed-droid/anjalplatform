/**
 * 🧹 Memory that is given back (r68 stability, 512 MB server).
 *
 * Before: every in-memory cache only checked its age when it was READ again, so an entry nobody asked for again (a
 * skill pool after the lesson, a student's index after the class, a parsed content file after an admin visit) stayed
 * in memory for the life of the server — the server sat at 75–80 % memory even when nobody was online.
 *
 *   registerCache(name, ops)  a module-level cache registers how to sweep its expired entries and how to empty itself.
 *   sweptMap(name, ttlMs, max) a Map whose entries carry `at` (ms): expired ones are removed by the sweeper, and it
 *                              never holds more than `max` entries (the oldest go first).
 *   IdleBox                   a parsed content file kept while it is used: released after `idleMs` without a read.
 *   startCacheSweeper()       one timer for the whole process (unref: never keeps it alive), every 60 s.
 *
 * The registry is kept on globalThis: Next.js builds pages, route handlers and the instrumentation hook as separate
 * bundles, and each copy of a module registers its own caches into the same list.
 */
export interface CacheOps {
  /** removes the expired entries; returns how many were removed */
  sweep(now: number): number;
  /** empties the cache */
  clear(): void;
  /** entries kept now */
  size(): number;
  /** "content" = parsed files (released when idle) · "data" = database-derived values */
  kind?: "content" | "data";
}

interface Registry { caches: Map<string, CacheOps[]>; timer?: ReturnType<typeof setInterval>; lastSweep: number }
const G = globalThis as unknown as { __cacheRegistry?: Registry };
const reg = (): Registry => (G.__cacheRegistry ??= { caches: new Map(), lastSweep: 0 });

/** A cache registers itself (several bundles may register the same name: each is swept). */
export function registerCache(name: string, ops: CacheOps): void {
  const list = reg().caches.get(name) ?? [];
  list.push(ops);
  reg().caches.set(name, list);
}

/** Removes every expired entry of every registered cache (the sweeper calls it every minute). */
export function sweepCaches(now = Date.now()): number {
  let n = 0;
  for (const list of reg().caches.values()) for (const c of list) { try { n += c.sweep(now); } catch { /* never breaks the sweep */ } }
  reg().lastSweep = now;
  return n;
}

/** Entries per cache (tests and the memory log). */
export function cacheSizes(): { name: string; size: number }[] {
  return [...reg().caches.entries()].map(([name, list]) => ({ name, size: list.reduce((a, c) => a + c.size(), 0) })).sort((a, b) => b.size - a.size);
}

/** Empties every registered cache (tests; an admin "free memory" would use it too). */
export function clearCaches(kind?: "content" | "data"): void {
  for (const list of reg().caches.values()) for (const c of list) if (!kind || (c.kind ?? "data") === kind) c.clear();
}

/** Parsed content files idle for longer than `idleMs` are released now (0 = all of them). */
export function releaseIdleContent(idleMs = CONTENT_IDLE_MS, now = Date.now()): number {
  let n = 0;
  for (const list of reg().caches.values()) for (const c of list) {
    const r = (c as Partial<IdleBoxOps>).release;
    if (c.kind === "content" && typeof r === "function") n += r.call(c, idleMs, now);
  }
  return n;
}

/** How long a parsed content file stays in memory after its last use. */
export const CONTENT_IDLE_MS = 5 * 60_000;

/** Starts the sweeper (once per process). */
export function startCacheSweeper(everyMs = 60_000): void {
  const r = reg();
  if (r.timer) return;
  r.timer = setInterval(() => { sweepCaches(); }, everyMs);
  (r.timer as { unref?: () => void }).unref?.();
}

/**
 * A Map with a time-to-live and a size bound, swept by the sweeper. `atOf` reads an entry's time (default `.at`).
 * Writes through `set` evict the oldest entries above `max` (a Map keeps insertion order; re-setting a key moves it).
 */
export function sweptMap<K, V>(name: string, ttlMs: number, max: number, atOf: (v: V) => number = (v) => Number((v as { at?: number }).at ?? 0)): Map<K, V> {
  const m = new BoundedMap<K, V>(max);
  registerCache(name, {
    sweep(now) { let n = 0; for (const [k, v] of m) if (now - atOf(v) > ttlMs || atOf(v) > now + 60_000) { m.delete(k); n++; } return n; },
    clear() { m.clear(); },
    size() { return m.size; },
  });
  return m;
}

class BoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly max: number) { super(); }
  override set(key: K, value: V): this {
    if (this.max === undefined) return super.set(key, value); // Map's constructor may call set before max is assigned
    super.delete(key);
    super.set(key, value);
    while (this.size > this.max) { const k = this.keys().next(); if (k.done) break; super.delete(k.value); }
    return this;
  }
}

/**
 * The per-data-source caches (`WeakMap<repo, Map<key, { at … }>>`): the same WeakMap, but every inner Map it is given
 * is swept — an entry older than `ttlMs` is removed. Drop-in: only the declaration changes.
 */
export function sweptWeakMap<V>(name: string, ttlMs: number, atOf: (v: V) => number = (v) => Number((v as { at?: number }).at ?? 0)): WeakMap<object, Map<string, V>> {
  const maps = new Set<WeakRef<Map<string, V>>>();
  registerCache(name, {
    sweep(now) {
      let n = 0;
      for (const ref of maps) {
        const m = ref.deref();
        if (!m) { maps.delete(ref); continue; }
        for (const [k, v] of m) if (now - atOf(v) > ttlMs) { m.delete(k); n++; }
      }
      return n;
    },
    clear() { for (const ref of maps) ref.deref()?.clear(); },
    size() { let n = 0; for (const ref of maps) n += ref.deref()?.size ?? 0; return n; },
  });
  class Swept extends WeakMap<object, Map<string, V>> {
    override set(key: object, value: Map<string, V>): this { maps.add(new WeakRef(value)); return super.set(key, value); }
  }
  return new Swept();
}

/** A `WeakMap<repo, { at … }>` (one value per data source) whose value is dropped once older than `ttlMs`. */
export function sweptWeakValue<V>(name: string, ttlMs: number, atOf: (v: V) => number = (v) => Number((v as { at?: number }).at ?? 0)): WeakMap<object, V> {
  const keys = new Set<WeakRef<object>>();
  let self: WeakMap<object, V>;
  registerCache(name, {
    sweep(now) {
      let n = 0;
      for (const ref of keys) {
        const k = ref.deref();
        if (!k || !self.has(k)) { keys.delete(ref); continue; }
        if (now - atOf(self.get(k) as V) > ttlMs) { self.delete(k); keys.delete(ref); n++; }
      }
      return n;
    },
    clear() { for (const ref of keys) { const k = ref.deref(); if (k) self.delete(k); } keys.clear(); },
    size() { let n = 0; for (const ref of keys) { const k = ref.deref(); if (k && self.has(k)) n++; } return n; },
  });
  class Swept extends WeakMap<object, V> {
    override set(key: object, value: V): this { if (![...keys].some((r) => r.deref() === key)) keys.add(new WeakRef(key)); return super.set(key, value); }
  }
  self = new Swept();
  return self;
}

class IdleBoxOps implements CacheOps {
  kind = "content" as const;
  constructor(private readonly box: IdleBox<unknown>) {}
  sweep(now: number): number { return this.box.releaseIfIdle(now) ? 1 : 0; }
  release(idleMs: number, now: number): number { return this.box.releaseIfIdle(now, idleMs) ? 1 : 0; }
  clear(): void { this.box.clear(); }
  size(): number { return this.box.peek() === null ? 0 : 1; }
}

/** One parsed content value (a folder of lesson files, the NAFS booklets …): kept while used, released when idle. */
export class IdleBox<T> {
  private value: T | null = null;
  private used = 0;
  constructor(name: string, private readonly idleMs = CONTENT_IDLE_MS) { registerCache(name, new IdleBoxOps(this as IdleBox<unknown>)); }
  /** the value (marks it used), or null when released */
  get(now = Date.now()): T | null { if (this.value !== null) this.used = now; return this.value; }
  peek(): T | null { return this.value; }
  set(v: T, now = Date.now()): T { this.value = v; this.used = now; return v; }
  clear(): void { this.value = null; }
  releaseIfIdle(now = Date.now(), idleMs = this.idleMs): boolean {
    if (this.value === null || now - this.used < idleMs) return false;
    this.value = null;
    return true;
  }
}
