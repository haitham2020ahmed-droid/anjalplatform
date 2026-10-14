/**
 * A Repo wrapper for the offline performance scripts: counts every database call and the rows it returns (per model)
 * and adds `latency` ms per call (parallel calls overlap, as on the real server). Never used by the app.
 */
import type { FindOptions, Repo, Row, Where } from "../../src/server/seeding/repo";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Stats { calls: number; rows: number; byModel: Map<string, { calls: number; rows: number }> }
export const freshStats = (): Stats => ({ calls: 0, rows: 0, byModel: new Map() });

export class MeasuringRepo implements Repo {
  stats = freshStats();
  latency = 0;
  constructor(private readonly inner: Repo, private readonly root?: MeasuringRepo) {}
  private get st(): Stats { return (this.root ?? this).stats; }
  private get l(): number { return (this.root ?? this).latency; }
  private async run<T>(model: string, p: Promise<T>): Promise<T> {
    Promise.resolve(p).catch(() => undefined); // a failing call is awaited below (after the delay): never an unhandled rejection meanwhile
    if (this.l) await sleep(this.l);
    const r = await p;
    const rows = Array.isArray(r) ? r.length : r && typeof r === "object" ? 1 : 0;
    const x = this.st;
    x.calls++; x.rows += rows;
    const m = x.byModel.get(model) ?? { calls: 0, rows: 0 };
    m.calls++; m.rows += rows; x.byModel.set(model, m);
    return r;
  }
  upsert(m: string, w: Record<string, unknown>, c: Row, u?: Row) { return this.run(m, this.inner.upsert(m, w, c, u)); }
  create(m: string, d: Row) { return this.run(m, this.inner.create(m, d)); }
  createMany(m: string, rows: Row[]) { return this.run(m, this.inner.createMany(m, rows)); }
  findUnique(m: string, w: Record<string, unknown>) { return this.run(m, this.inner.findUnique(m, w)); }
  findMany(m: string, w?: Where, o?: FindOptions) { return this.run(m, this.inner.findMany(m, w, o)); }
  count(m: string, w?: Where) { return this.run(m, this.inner.count(m, w)); }
  groupCount(m: string, by: string, w?: Where): Promise<Map<string, number>> {
    const inner = this.inner;
    if (typeof inner.groupCount !== "function") return this.findMany(m, w, { select: [by] }).then((rows) => { const o = new Map<string, number>(); for (const r of rows) { const k = String(r[by] ?? ""); o.set(k, (o.get(k) ?? 0) + 1); } return o; });
    return this.run(m, inner.groupCount(m, by, w).then((x) => [...x.entries()])).then((e) => new Map(e));
  }
  updateMany(m: string, w: Where, d: Row) { return this.run(m, this.inner.updateMany(m, w, d)); }
  deleteMany(m: string, w: Where) { return this.run(m, this.inner.deleteMany(m, w)); }
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> { return this.inner.transaction((tx) => fn(new MeasuringRepo(tx, this.root ?? this))); }
}
