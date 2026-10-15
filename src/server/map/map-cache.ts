/**
 * ⚡ r79 (owner: "the MAP page is VERY slow"): the MAP data that changes slowly — the grade's MAP question pools, the
 * Learning Continuum index, the class's MAP profiles, the school overview, the skills of each goal area — was read
 * again on every click (the pools: the grade's whole bank, ~25 reads; kept 60 s, so nearly every click rebuilt it).
 *
 *   mapCache(name, ms, max)   a small cache per data source: a value is kept while the write counters of the tables it
 *                             is built from are unchanged in this process (any write through ANY path — an import, the
 *                             editor, new scores — builds it again at the next read) and at most `ms` (writes made by
 *                             another process: the jobs worker). Concurrent misses share one build; at most `max`
 *                             entries (the least recently used go first); registered with the idle sweeper
 *                             (cache/idle.ts), so expired entries are given back even when nobody asks again.
 */
import { modelVersion } from "../cache/bank-version";
import { sweptWeakMap } from "../cache/idle";

export interface MapCache<T> {
  /** The kept value for `key`, else `load()` (kept while `models` are unchanged). */
  get(repo: object, key: string, models: readonly string[], load: () => Promise<T>): Promise<T>;
  /** Forget one key (or every key of this data source). */
  drop(repo: object, key?: string): void;
}

export function mapCache<T>(name: string, ms: number, max: number): MapCache<T> {
  const store = sweptWeakMap<{ at: number; v: string; p: Promise<T> }>(name, ms);
  return {
    get(repo, key, models, load) {
      let m = store.get(repo);
      if (!m) store.set(repo, (m = new Map()));
      const now = Date.now(), v = modelVersion(...models), hit = m.get(key);
      if (hit && hit.v === v && now - hit.at < ms && now >= hit.at) { m.delete(key); m.set(key, hit); return hit.p; }
      const p = load();
      const entry = { at: now, v, p };
      m.delete(key);
      m.set(key, entry);
      while (m.size > max) m.delete(m.keys().next().value as string);
      const mm = m;
      p.catch(() => { if (mm.get(key) === entry) mm.delete(key); });
      return p;
    },
    drop(repo, key) {
      const m = store.get(repo);
      if (!m) return;
      if (key === undefined) m.clear(); else m.delete(key);
    },
  };
}

/** How long slowly-changing MAP data is kept at most (other processes' writes). */
export const MAP_KEEP_MS = 5 * 60_000; // r81: 10 → 5 minutes (512 MB plan)
