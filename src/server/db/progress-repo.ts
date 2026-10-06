/**
 * Wraps any Repo and reports progress every `every` writes, so long-running seeds never look
 * frozen. Reads pass straight through. Used by the seed runner (scripts) and tested with SQLite.
 */
import type { Repo, Row, Where } from "../seeding/repo";

export function withProgress(repo: Repo, report: (writes: number, elapsedMs: number) => void, every = 250, now = () => Date.now()): Repo & { writes(): number } {
  let writes = 0;
  const started = now();
  const tick = () => {
    writes++;
    if (writes % every === 0) report(writes, now() - started);
  };
  const self: Repo & { writes(): number } = {
    writes: () => writes,
    async upsert(model: string, where: Record<string, unknown>, create: Row, update?: Row) { const r = await repo.upsert(model, where, create, update); tick(); return r; },
    async create(model: string, data: Row) { const r = await repo.create(model, data); tick(); return r; },
    async updateMany(model: string, where: Where, data: Row) { const r = await repo.updateMany(model, where, data); tick(); return r; },
    async deleteMany(model: string, where: Where) { const r = await repo.deleteMany(model, where); tick(); return r; },
    findUnique: (model: string, where: Record<string, unknown>) => repo.findUnique(model, where),
    findMany: (model: string, where?: Where) => repo.findMany(model, where),
    count: (model: string, where?: Where) => repo.count(model, where),
    transaction: <T>(fn: (tx: Repo) => Promise<T>) => repo.transaction((tx) => fn(tx === repo ? self : withProgress(tx, report, every, now))),
  };
  return self;
}
