/**
 * ⚡ Shared reads (Update 55, performance): the same heavy read asked several times while one page is built (e.g. the
 * Curriculum Map works out every student's level four times, once per section kind) is done ONCE — callers share
 * the promise for a few seconds. The key includes the write counters of the tables read, so any write in this
 * process gives fresh data at once. Bounded: a few entries per database.
 */
import { modelVersion } from "../cache/bank-version";
import { sweptWeakMap } from "../cache/idle";

const store = sweptWeakMap<{ at: number; p: Promise<unknown> }>("lib.shared-read.store", 15 * 60_000);
const MAX = 48;

/** A short, stable fingerprint of a list of ids (order-free). */
export function idsKey(ids: readonly string[]): string {
  let h = 2166136261;
  for (const id of [...ids].sort()) for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${ids.length}:${(h >>> 0).toString(36)}`;
}

export function sharedRead<T>(scope: object, key: string, models: string[], ttlMs: number, load: () => Promise<T>): Promise<T> {
  let m = store.get(scope);
  if (!m) store.set(scope, (m = new Map()));
  const k = `${key}|${modelVersion(...models)}`, hit = m.get(k);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = load().catch((e) => { m!.delete(k); throw e; });
  m.set(k, { at: Date.now(), p });
  while (m.size > MAX) m.delete(m.keys().next().value as string);
  return p;
}
