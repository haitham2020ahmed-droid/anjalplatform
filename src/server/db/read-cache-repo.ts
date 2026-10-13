/**
 * ⚡ A short-lived read cache for bulk work (Admin → Questions → Load new questions): the same reference rows
 * (the school's grades, curricula, skills, standards, families, MAP / NAFS areas, question types …) are read again
 * for every question a chunk adds. Through this wrapper each distinct read of those models hits the database once
 * per chunk; any write to a model (through the wrapper) drops that model's cached reads, so a read never returns
 * something older than the wrapper's own writes. A failed transaction drops everything it may have seen.
 *
 * Callers get copies (sorting or changing a returned row never changes the cache). Only the models listed are
 * cached; question rows and everything students write are always read from the database.
 */
import type { FindOptions, Repo, Row, Where } from "../seeding/repo";
import { countGroups } from "./group-count";

export const CACHED_MODELS: ReadonlySet<string> = new Set([
  "Grade", "Curriculum", "Skill", "SkillFamily", "SkillStandard", "Standard", "MapGoalArea", "NafsArea", "NafsSkillLink",
  "QuestionType", "CurriculumMapNode", "User", "School", "RolePermission",
]);

type Store = Map<string, Map<string, Promise<unknown>>>;

const copy = <T>(v: T): T => (v === null || v === undefined ? v : structuredClone(v));

export class ReadCacheRepo implements Repo {
  constructor(private readonly inner: Repo, private readonly store: Store = new Map()) {}

  /** Forget every cached read (start / end of a chunk). */
  clear(): void { this.store.clear(); }

  private drop(model: string): void { this.store.delete(model); }

  /** `keyOf` runs for a cached model only (other models' filters may hold values JSON cannot write, e.g. BigInt) */
  private async cached<T>(model: string, keyOf: () => string, load: () => Promise<T>): Promise<T> {
    if (!CACHED_MODELS.has(model)) return load();
    const key = keyOf();
    let m = this.store.get(model);
    if (!m) this.store.set(model, (m = new Map()));
    let p = m.get(key) as Promise<T> | undefined;
    if (!p) {
      p = load();
      m.set(key, p);
      p.catch(() => this.store.get(model)?.delete(key));
    }
    return copy(await p);
  }

  findUnique(model: string, where: Record<string, unknown>): Promise<Row | null> {
    return this.cached(model, () => `u:${JSON.stringify(where)}`, () => this.inner.findUnique(model, where));
  }
  findMany(model: string, where?: Where, opts?: FindOptions): Promise<Row[]> {
    return this.cached(model, () => `m:${JSON.stringify(where ?? {})}|${JSON.stringify(opts ?? {})}`, () => this.inner.findMany(model, where, opts));
  }
  count(model: string, where?: Where): Promise<number> {
    return this.cached(model, () => `c:${JSON.stringify(where ?? {})}`, () => this.inner.count(model, where));
  }
  groupCount(model: string, by: string, where?: Where): Promise<Map<string, number>> {
    return this.cached(model, () => `g:${by}|${JSON.stringify(where ?? {})}`, () => countGroups(this.inner, model, by, where));
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
    try {
      return await this.inner.transaction((tx) => fn(new ReadCacheRepo(tx, this.store)));
    } catch (e) {
      this.clear(); // rows read inside the failed transaction may not exist
      throw e;
    }
  }
}

const wrappers = new WeakMap<object, ReadCacheRepo>();
/**
 * The one read-cache wrapper of a repo (kept, so the process caches keyed by repo — skill index, counts — are reused
 * from one chunk to the next). Cleared by the caller at the start of each chunk.
 */
export function readCacheFor(repo: Repo): ReadCacheRepo {
  if (repo instanceof ReadCacheRepo) return repo;
  let w = wrappers.get(repo);
  if (!w) wrappers.set(repo, (w = new ReadCacheRepo(repo)));
  return w;
}
