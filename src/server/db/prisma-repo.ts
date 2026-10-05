/**
 * Prisma implementation of Repo. Unique lookups go through prismaUniqueWhere, which
 * finds the model's unique key by its SET of fields (any order) and builds Prisma's
 * compound name in schema order, e.g. { level, schoolId } -> where.schoolId_level.
 * A lookup on fields that are not a unique key fails with a clear message.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Repo, Row, Where } from "../seeding/repo";
import { prismaUniqueWhere } from "./unique-keys";

type Delegate = {
  upsert(args: unknown): Promise<Row>;
  create(args: unknown): Promise<Row>;
  findUnique(args: unknown): Promise<Row | null>;
  findMany(args: unknown): Promise<Row[]>;
  count(args: unknown): Promise<number>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
};

const lcfirst = (s: string) => s[0].toLowerCase() + s.slice(1);

export class PrismaRepo implements Repo {
  constructor(private readonly client: PrismaClient | Prisma.TransactionClient) {}

  private d(model: string): Delegate {
    const delegate = (this.client as unknown as Record<string, Delegate>)[lcfirst(model)];
    if (!delegate) throw new Error(`Unknown Prisma model ${model}`);
    return delegate;
  }

  async upsert(model: string, where: Record<string, unknown>, create: Row, update: Row = {}) {
    const maxAttempts = 6;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.d(model).upsert({
          where: prismaUniqueWhere(model, where),
          create: { ...where, ...create },
          update,
        });
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code?: unknown }).code)
            : "";

        const retryable = code === "P1001" || code === "P2024" || code === "P1017";

        if (!retryable || attempt === maxAttempts) throw error;

        const delayMs = Math.min(2000 * 2 ** (attempt - 1), 30000);
        console.warn(
          `Database temporarily unavailable (${code}). Retry ${attempt}/${maxAttempts} in ${delayMs / 1000}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error("Unexpected database retry failure");
  }
  create(model: string, data: Row) {
    return this.d(model).create({ data });
  }
  findUnique(model: string, where: Record<string, unknown>) {
    return this.d(model).findUnique({ where: prismaUniqueWhere(model, where) });
  }
  findMany(model: string, where?: Where) {
    return this.d(model).findMany({ where });
  }
  count(model: string, where?: Where) {
    return this.d(model).count({ where });
  }
  async updateMany(model: string, where: Where, data: Row) {
    return (await this.d(model).updateMany({ where, data })).count;
  }
  async deleteMany(model: string, where: Where) {
    return (await this.d(model).deleteMany({ where })).count;
  }
  async transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    const c = this.client as PrismaClient;
    if (typeof c.$transaction !== "function") return fn(this); // already inside a transaction
    return c.$transaction((tx) => fn(new PrismaRepo(tx)), { maxWait: 60_000, timeout: 1_800_000  });
  }
}
