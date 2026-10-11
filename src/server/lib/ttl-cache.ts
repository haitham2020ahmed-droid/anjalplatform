/**
 * A small in-memory cache with a time limit and a size bound (least recently used entries go first) — Update 42B,
 * for numbers asked on every page (navigation badges, the bell). Per server process; never holds more than `max`.
 */
export class TtlCache<V> {
  private readonly map = new Map<string, { at: number; v: V }>();
  constructor(private readonly ttlMs: number, private readonly max: number) {}

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (now - hit.at >= this.ttlMs || now < hit.at) { this.map.delete(key); return undefined; }
    // recently used → to the end (Map keeps insertion order)
    this.map.delete(key); this.map.set(key, hit);
    return hit.v;
  }

  set(key: string, v: V, now = Date.now()): void {
    this.map.delete(key);
    this.map.set(key, { at: now, v });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }

  delete(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
  get size(): number { return this.map.size; }

  /** The cached value, else `load()` (concurrent misses for the same key share one load). */
  async getOrLoad(key: string, load: () => Promise<V>, now = Date.now()): Promise<V> {
    const v = this.get(key, now);
    if (v !== undefined) return v;
    const busy = this.loading.get(key);
    if (busy) return busy;
    const p = load().then((x) => { this.set(key, x, now); return x; }).finally(() => this.loading.delete(key));
    this.loading.set(key, p);
    return p;
  }
  private readonly loading = new Map<string, Promise<V>>();
}
