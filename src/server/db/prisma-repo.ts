/**
 * Prisma implementation of Repo. Unique lookups go through prismaUniqueWhere, which
 * finds the model's unique key by its SET of fields (any order) and builds Prisma's
 * compound name in schema order, e.g. { level, schoolId } -> where.schoolId_level.
 * A lookup on fields that are not a unique key fails with a clear message.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { FindOptions, Repo, Row, Where } from "../seeding/repo";
import { prismaUniqueWhere } from "./unique-keys";
import { bankVersion, bumpBankVersion, noteWrite } from "../cache/bank-version";
import { isMissingPrivateColumn, sharedBankWhere } from "../questions/private-copies";

type Delegate = {
  upsert(args: unknown): Promise<Row>;
  create(args: unknown): Promise<Row>;
  createMany(args: unknown): Promise<{ count: number }>;
  findUnique(args: unknown): Promise<Row | null>;
  findMany(args: unknown): Promise<Row[]>;
  count(args: unknown): Promise<number>;
  groupBy(args: unknown): Promise<Row[]>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
};

let noPrivateColumn = false;

/**
 * r68: errors of a busy or briefly unreachable database (Aiven/Render under a class rush) — the pool had no free
 * connection in time, the connection was dropped, a deadlock/write conflict rolled the transaction back. A READ is
 * retried once after a short pause (always safe); a transaction is retried once only when it never committed (pool
 * timeout, deadlock / write conflict) — the practice answer's own guard (the session row moves once) makes even that
 * replay harmless. Anything else is thrown as before.
 */
const TRANSIENT_READ = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028", "P2034"]);
const TRANSIENT_TX = new Set(["P2024", "P2028", "P2034"]);
const codeOf = (e: unknown): string => String((e as { code?: unknown })?.code ?? "");
const looksTransient = (e: unknown): boolean => /Timed out fetching a new connection|Server has closed the connection|Can't reach database server|Connection reset|ECONNRESET|deadlock|write conflict/i.test(String((e as { message?: unknown })?.message ?? ""));
export const isTransientDbError = (e: unknown, tx = false): boolean => (tx ? TRANSIENT_TX : TRANSIENT_READ).has(codeOf(e)) || (!tx && looksTransient(e));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function retryTransient<T>(run: () => Promise<T>, tx = false, waitMs = 150 + (Date.now() % 250)): Promise<T> {
  try { return await run(); }
  catch (e) {
    if (!isTransientDbError(e, tx)) throw e;
    await pause(waitMs);
    return run();
  }
}
/** "Unique constraint failed" (two writers created the same row at the same moment). */
export const isUniqueError = (e: unknown): boolean => codeOf(e) === "P2002" || /Unique constraint failed/i.test(String((e as { message?: unknown })?.message ?? ""));
const lcfirst = (s: string) => s[0].toLowerCase() + s.slice(1);

export interface PrismaRepoOptions {
  /**
   * "interactive" (default, used by the app): repo.transaction() runs inside one Prisma
   * interactive transaction, all or nothing.
   * "none" (used by seed scripts): repo.transaction() just runs the work. Seeds only use
   * idempotent upserts, so a stopped seed is completed by running it again, and thousands of
   * writes to a remote database never hit an interactive-transaction time limit.
   */
  transactions?: "interactive" | "none";
}

export class PrismaRepo implements Repo {
  constructor(
    private readonly client: PrismaClient | Prisma.TransactionClient,
    private readonly options: PrismaRepoOptions = {},
  ) {}

  private d(model: string): Delegate {
    const delegate = (this.client as unknown as Record<string, Delegate>)[lcfirst(model)];
    if (!delegate) throw new Error(`Unknown Prisma model ${model}`);
    return delegate;
  }

  async upsert(model: string, where: Record<string, unknown>, create: Row, update: Row = {}) {
    noteWrite(model);
    const unique = prismaUniqueWhere(model, where);
    try {
      return await this.d(model).upsert({ where: unique, create: { ...where, ...create }, update });
    } catch (e) {
      // r68: two upserts of the same key at the same moment (two servers, a class signing in, two jobs): both saw no
      // row and both inserted — the loser updates the row the winner created instead of failing
      if (!isUniqueError(e)) throw e;
      if (Object.keys(update).length) await this.d(model).updateMany({ where, data: update });
      const row = await this.d(model).findUnique({ where: unique });
      if (!row) throw e;
      return row;
    }
  }
  create(model: string, data: Row) {
    noteWrite(model);
    return this.d(model).create({ data });
  }
  async createMany(model: string, rows: Row[]) {
    noteWrite(model);
    if (!rows.length) return 0;
    let n = 0;
    // one INSERT per 500 rows keeps each statement well under MySQL's packet limit
    for (let i = 0; i < rows.length; i += 500) n += (await this.d(model).createMany({ data: rows.slice(i, i + 500) })).count;
    return n;
  }
  /**
   * ✏️ Reads of the Question table see the shared bank only, unless they read by id or name privateToId (teachers'
   * private copies: src/server/questions/private-copies.ts). A database without the column yet (the update's
   * `prisma db push` has not run) is read as before.
   */
  private shared<T>(model: string, where: Where | undefined, run: (w: Where | undefined) => Promise<T>): Promise<T> {
    const w = noPrivateColumn ? where : sharedBankWhere(model, where);
    if (w === where) return run(where);
    return run(w).catch((e) => { if (!isMissingPrivateColumn(e)) throw e; noPrivateColumn = true; return run(where); });
  }
  findUnique(model: string, where: Record<string, unknown>) {
    return retryTransient(() => this.d(model).findUnique({ where: prismaUniqueWhere(model, where) }));
  }
  findMany(model: string, where?: Where, opts: FindOptions = {}) {
    return this.shared(model, where, (w) => retryTransient(() => this.d(model).findMany({
      where: w,
      ...(opts.select ? { select: Object.fromEntries(opts.select.map((k) => [k, true])) } : {}),
      ...(opts.orderBy?.length ? { orderBy: opts.orderBy.map((o) => ({ [o.field]: o.dir ?? "asc" })) } : {}),
      ...(opts.take !== undefined ? { take: opts.take } : {}),
      ...(opts.skip ? { skip: opts.skip } : {}),
    })));
  }
  count(model: string, where?: Where) {
    return this.shared(model, where, (w) => retryTransient(() => this.d(model).count({ where: w })));
  }
  async groupCount(model: string, by: string, where?: Where) {
    const rows = await this.shared(model, where, (w) => retryTransient(() => this.d(model).groupBy({ by: [by], where: w, _count: { _all: true } })));
    return new Map(rows.map((r) => [String(r[by] ?? ""), Number((r._count as { _all: number })._all)]));
  }
  async updateMany(model: string, where: Where, data: Row) {
    noteWrite(model);
    return (await this.d(model).updateMany({ where: where, data })).count;
  }
  async deleteMany(model: string, where: Where) {
    noteWrite(model);
    return (await this.d(model).deleteMany({ where: where })).count;
  }
  async transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    if (this.options.transactions === "none") return fn(this);
    const c = this.client as PrismaClient;
    if (typeof c.$transaction !== "function") return fn(this); // already inside a transaction
    const before = bankVersion();
    try {
      // a pool timeout / deadlock rolled everything back: tried once more (never after a commit)
      return await retryTransient(() => c.$transaction((tx) => fn(new PrismaRepo(tx)), { timeout: 120_000, maxWait: 10_000 }), true);
    } finally {
      // bank data written inside the transaction became visible only now: drop anything cached meanwhile
      if (bankVersion() !== before) bumpBankVersion();
    }
  }
}

