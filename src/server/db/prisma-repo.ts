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

type Delegate = {
  upsert(args: unknown): Promise<Row>;
  create(args: unknown): Promise<Row>;
  createMany(args: unknown): Promise<{ count: number }>;
  findUnique(args: unknown): Promise<Row | null>;
  findMany(args: unknown): Promise<Row[]>;
  count(args: unknown): Promise<number>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
};

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

  upsert(model: string, where: Record<string, unknown>, create: Row, update: Row = {}) {
    noteWrite(model);
    return this.d(model).upsert({ where: prismaUniqueWhere(model, where), create: { ...where, ...create }, update });
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
  findUnique(model: string, where: Record<string, unknown>) {
    return this.d(model).findUnique({ where: prismaUniqueWhere(model, where) });
  }
  findMany(model: string, where?: Where, opts: FindOptions = {}) {
    return this.d(model).findMany({
      where: where,
      ...(opts.select ? { select: Object.fromEntries(opts.select.map((k) => [k, true])) } : {}),
      ...(opts.orderBy?.length ? { orderBy: opts.orderBy.map((o) => ({ [o.field]: o.dir ?? "asc" })) } : {}),
      ...(opts.take !== undefined ? { take: opts.take } : {}),
      ...(opts.skip ? { skip: opts.skip } : {}),
    });
  }
  count(model: string, where?: Where) {
    return this.d(model).count({ where: where });
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
      return await c.$transaction((tx) => fn(new PrismaRepo(tx)), { timeout: 120_000 });
    } finally {
      // bank data written inside the transaction became visible only now: drop anything cached meanwhile
      if (bankVersion() !== before) bumpBankVersion();
    }
  }
}

