/**
 * ⚡ One page view = one request: the parts of a page (the frame, the page, its streamed sections, the helpers they
 * share) often ask the database for the very same row or list — the student, their grade, its curriculum, the class
 * members … — each on its own round trip. Inside a page render, identical reads through the app's repo are sent once
 * and shared (a later identical read gets the same answer).
 *
 *   - only while a page is being rendered (a React request scope; Server Actions, route handlers, scripts and the jobs
 *     worker read straight through, as before);
 *   - any write through the repo drops the cached reads of that table (before and after the write); a transaction
 *     drops them all — so a read after a write in the same request always sees it;
 *   - small answers only (≤ MAX_ROWS rows, ≤ MAX_KEYS reads per request) — big scans are never held;
 *   - callers get their own copies of the rows and lists (sorting or changing them never changes another's answer).
 */
import type { FindOptions, Repo, Row, Where } from "../seeding/repo";
import { countGroups } from "./group-count";

export interface ReadScope { reads: Map<string, Promise<unknown>>; byModel: Map<string, Set<string>> }
export const newReadScope = (): ReadScope => ({ reads: new Map(), byModel: new Map() });

const MAX_ROWS = 200;
const MAX_KEYS = 400;
const MAX_KEY_LENGTH = 4000;

const keyOf = (v: unknown): string | null => {
  try {
    const k = JSON.stringify(v ?? null, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
    return k.length > MAX_KEY_LENGTH ? null : k;
  } catch { return null; }
};
const copyRows = (rows: Row[]): Row[] => rows.map((r) => ({ ...r }));

export class RequestReadRepo implements Repo {
  constructor(private readonly inner: Repo, private readonly scope: () => ReadScope | null) {}

  private drop(model?: string): void {
    const sc = this.scope();
    if (!sc) return;
    if (model === undefined) { sc.reads.clear(); sc.byModel.clear(); return; }
    for (const k of sc.byModel.get(model) ?? []) sc.reads.delete(k);
    sc.byModel.delete(model);
  }

  private shared<T>(model: string, kind: string, args: unknown, load: () => Promise<T>, size: (v: T) => number): Promise<T> {
    const sc = this.scope();
    const a = sc ? keyOf(args) : null;
    if (!sc || a === null) return load();
    const key = `${kind}|${model}|${a}`;
    const hit = sc.reads.get(key) as Promise<T> | undefined;
    if (hit) return hit;
    if (sc.reads.size >= MAX_KEYS) return load();
    const p = load();
    sc.reads.set(key, p);
    let keys = sc.byModel.get(model);
    if (!keys) sc.byModel.set(model, (keys = new Set()));
    keys.add(key);
    // failed or big answers are not kept for later reads (the ones already waiting share it)
    p.then((v) => { if (size(v) > MAX_ROWS && sc.reads.get(key) === p) sc.reads.delete(key); }, () => { if (sc.reads.get(key) === p) sc.reads.delete(key); });
    return p;
  }

  async findUnique(model: string, where: Record<string, unknown>): Promise<Row | null> {
    const r = await this.shared(model, "u", where, () => this.inner.findUnique(model, where), () => 1);
    return r ? { ...r } : r;
  }
  async findMany(model: string, where?: Where, opts?: FindOptions): Promise<Row[]> {
    return copyRows(await this.shared(model, "m", [where ?? {}, opts ?? {}], () => this.inner.findMany(model, where, opts), (v) => v.length));
  }
  count(model: string, where?: Where): Promise<number> {
    return this.shared(model, "c", where ?? {}, () => this.inner.count(model, where), () => 1);
  }
  async groupCount(model: string, by: string, where?: Where): Promise<Map<string, number>> {
    return new Map(await this.shared(model, `g:${by}`, where ?? {}, () => countGroups(this.inner, model, by, where), (v) => v.size));
  }

  async upsert(model: string, where: Record<string, unknown>, create: Row, update?: Row): Promise<Row> {
    this.drop(model);
    try { return await this.inner.upsert(model, where, create, update); } finally { this.drop(model); }
  }
  async create(model: string, data: Row): Promise<Row> {
    this.drop(model);
    try { return await this.inner.create(model, data); } finally { this.drop(model); }
  }
  async createMany(model: string, rows: Row[]): Promise<number> {
    this.drop(model);
    try { return await this.inner.createMany(model, rows); } finally { this.drop(model); }
  }
  async updateMany(model: string, where: Where, data: Row): Promise<number> {
    this.drop(model);
    try { return await this.inner.updateMany(model, where, data); } finally { this.drop(model); }
  }
  async deleteMany(model: string, where: Where): Promise<number> {
    this.drop(model);
    try { return await this.inner.deleteMany(model, where); } finally { this.drop(model); }
  }
  async transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    this.drop();
    try { return await this.inner.transaction(fn); } finally { this.drop(); }
  }
}
