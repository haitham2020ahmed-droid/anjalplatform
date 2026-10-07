/**
 * Minimal persistence interface used by the seeders.
 *
 * Why: the same seeding code must run against Prisma/MySQL in production and
 * against an in-process SQLite database in offline verification, so the
 * verification actually exercises production logic. Adapters:
 *   - PrismaRepo  (src/server/db/prisma-repo.ts)
 *   - SqliteRepo  (scripts/db/sqlite-repo.ts)
 *
 * Semantics follow Prisma: `where` on upsert must be a unique key (single field
 * or compound); ids and @updatedAt are filled automatically.
 */
export type Row = Record<string, unknown> & { id?: string };
/**
 * Equality, `{ in: [...] }`, range `{ lt, lte, gt, gte }`, or `{ contains: "text" }` (case-insensitive
 * substring) — a Prisma-compatible subset.
 */
export type Where = Record<string, unknown | { in: unknown[] } | { lt?: unknown; lte?: unknown; gt?: unknown; gte?: unknown } | { contains: string } | { not: unknown }>;

/**
 * Optional query shaping, done by the database instead of in JavaScript (performance):
 *   select  only these columns (the rows contain nothing else)
 *   orderBy sort order (applied before take/skip)
 *   take / skip  a page of rows
 */
export interface FindOptions {
  select?: readonly string[];
  orderBy?: readonly { field: string; dir?: "asc" | "desc" }[];
  take?: number;
  skip?: number;
}

export interface Repo {
  /** Insert or update by a unique key. Returns the stored row. */
  upsert(model: string, where: Record<string, unknown>, create: Row, update?: Row): Promise<Row>;
  create(model: string, data: Row): Promise<Row>;
  /**
   * Insert many rows in as few statements as possible (bulk import). Returns the number of rows
   * inserted. Rows are NOT read back: give each row its own id when the caller needs it.
   */
  createMany(model: string, rows: Row[]): Promise<number>;
  findUnique(model: string, where: Record<string, unknown>): Promise<Row | null>;
  findMany(model: string, where?: Where, opts?: FindOptions): Promise<Row[]>;
  count(model: string, where?: Where): Promise<number>;
  /** Update rows matching `where` (equality / in). Returns the number of rows changed. */
  updateMany(model: string, where: Where, data: Row): Promise<number>;
  /** Delete rows matching `where`. Returns the number of rows deleted. */
  deleteMany(model: string, where: Where): Promise<number>;
  /** Run fn atomically. */
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T>;
}
