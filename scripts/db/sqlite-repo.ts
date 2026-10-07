/**
 * SQLite implementation of Repo (node:sqlite), driven by the parsed Prisma schema
 * so it behaves like Prisma Client: cuid-style ids, @updatedAt, JSON/boolean/date
 * conversion, upsert on unique keys. Verification only — never used in production.
 */
import { matchUniqueKey, UNIQUE_KEYS } from "../../src/server/db/unique-keys";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { FindOptions, Repo, Row, Where } from "../../src/server/seeding/repo";
import { columns, type Model, type Schema } from "./schema-ddl";
import { bankVersion, bumpBankVersion, noteWrite } from "../../src/server/cache/bank-version";

export function cuidLike(): string {
  return "c" + Date.now().toString(36) + randomBytes(8).toString("hex");
}

export class SqliteRepo implements Repo {
  private depth = 0;
  constructor(readonly db: DatabaseSync, private readonly schema: Schema) {}

  private model(name: string): Model {
    const m = this.schema.models.get(name);
    if (!m) throw new Error(`Unknown model ${name}`);
    return m;
  }

  private toDb(m: Model, data: Row): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const c of columns(m, this.schema)) {
      if (!(c.name in data)) continue;
      const v = data[c.name];
      if (v === undefined) continue;
      if (v === null) out[c.name] = null;
      else if (c.type === "Json") out[c.name] = JSON.stringify(v);
      else if (c.type === "Boolean") out[c.name] = v ? 1 : 0;
      else if (c.type === "DateTime") out[c.name] = v instanceof Date ? (c.dbType === "Date" ? v.toISOString().slice(0, 10) : v.toISOString()) : v;
      else out[c.name] = v;
    }
    return out;
  }

  private fromDb(m: Model, row: Record<string, unknown> | undefined): Row | null {
    if (!row) return null;
    const out: Row = { ...row };
    for (const c of columns(m, this.schema)) {
      const v = row[c.name];
      if (v === null || v === undefined) continue;
      if (c.type === "Json") out[c.name] = JSON.parse(String(v));
      else if (c.type === "Boolean") out[c.name] = v === 1;
    }
    return out;
  }

  private whereSql(m: Model, where: Where = {}): { sql: string; params: unknown[] } {
    const parts: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(where)) {
      if (v && typeof v === "object" && "in" in (v as object)) {
        const arr = (v as { in: unknown[] }).in;
        if (arr.length === 0) { parts.push("0"); continue; }
        parts.push(`"${k}" IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr.map((x) => this.toDb(m, { [k]: x })[k]));
      } else if (v && typeof v === "object" && "notIn" in (v as object)) {
        // same as Prisma: an empty list excludes nothing
        const arr = (v as { notIn: unknown[] }).notIn;
        if (arr.length === 0) continue;
        parts.push(`"${k}" NOT IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr.map((x) => this.toDb(m, { [k]: x })[k]));
      } else if (v && typeof v === "object" && !(v instanceof Date) && "not" in (v as object)) {
        const n = (v as { not: unknown }).not;
        if (n === null) parts.push(`"${k}" IS NOT NULL`);
        else { parts.push(`("${k}" IS NULL OR "${k}" != ?)`); params.push(this.toDb(m, { [k]: n })[k]); }
      } else if (v && typeof v === "object" && !(v instanceof Date) && "contains" in (v as object)) {
        // case-insensitive substring, like MySQL's default collation
        const needle = String((v as { contains: string }).contains).replace(/[!%_]/g, (c) => `!${c}`);
        parts.push(`"${k}" LIKE ? ESCAPE '!'`);
        params.push(`%${needle}%`);
      } else if (v && typeof v === "object" && !(v instanceof Date) && ("lt" in (v as object) || "lte" in (v as object) || "gt" in (v as object) || "gte" in (v as object))) {
        const o = v as { lt?: unknown; lte?: unknown; gt?: unknown; gte?: unknown };
        if (o.lt !== undefined) { parts.push(`"${k}" < ?`); params.push(this.toDb(m, { [k]: o.lt })[k]); }
        if (o.lte !== undefined) { parts.push(`"${k}" <= ?`); params.push(this.toDb(m, { [k]: o.lte })[k]); }
        if (o.gt !== undefined) { parts.push(`"${k}" > ?`); params.push(this.toDb(m, { [k]: o.gt })[k]); }
        if (o.gte !== undefined) { parts.push(`"${k}" >= ?`); params.push(this.toDb(m, { [k]: o.gte })[k]); }
      } else if (v === null) {
        parts.push(`"${k}" IS NULL`);
      } else {
        parts.push(`"${k}" = ?`);
        params.push(this.toDb(m, { [k]: v })[k]);
      }
    }
    return { sql: parts.length ? " WHERE " + parts.join(" AND ") : "", params };
  }

  async create(model: string, data: Row): Promise<Row> {
    noteWrite(model);
    const m = this.model(model);
    const d: Row = { ...data };
    for (const c of columns(m, this.schema)) {
      if (d[c.name] === undefined && c.default?.kind === "cuid") d[c.name] = cuidLike();
      if (c.isUpdatedAt) d[c.name] = new Date();
    }
    const row = this.toDb(m, d);
    const keys = Object.keys(row);
    const res = this.db
      .prepare(`INSERT INTO "${model}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
      .run(...(keys.map((k) => row[k]) as never[]));
    const idCol = m.id.length === 1 ? m.id[0] : null;
    if (idCol && d[idCol] === undefined) d[idCol] = Number(res.lastInsertRowid);
    const where = Object.fromEntries(m.id.map((k) => [k, d[k]]));
    return (await this.findUnique(model, where))!;
  }

  async createMany(model: string, rows: Row[]): Promise<number> {
    noteWrite(model);
    const m = this.model(model);
    let n = 0;
    for (const data of rows) {
      const d: Row = { ...data };
      for (const c of columns(m, this.schema)) {
        if (d[c.name] === undefined && c.default?.kind === "cuid") d[c.name] = cuidLike();
        if (c.isUpdatedAt) d[c.name] = new Date();
      }
      const row = this.toDb(m, d);
      const keys = Object.keys(row);
      this.db.prepare(`INSERT INTO "${model}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...(keys.map((k) => row[k]) as never[]));
      n++;
    }
    return n;
  }

  async findUnique(model: string, where: Record<string, unknown>): Promise<Row | null> {
    const m = this.model(model);
    matchUniqueKey(UNIQUE_KEYS, model, Object.keys(where)); // same contract as PrismaRepo (Phase 12)
    const w = this.whereSql(m, where);
    return this.fromDb(m, this.db.prepare(`SELECT * FROM "${model}"${w.sql} LIMIT 2`).get(...(w.params as never[])) as Record<string, unknown>);
  }

  async findMany(model: string, where?: Where, opts: FindOptions = {}): Promise<Row[]> {
    const m = this.model(model);
    const w = this.whereSql(m, where);
    const known = new Set(columns(m, this.schema).map((c) => c.name));
    for (const f of [...(opts.select ?? []), ...(opts.orderBy ?? []).map((o) => o.field)]) if (!known.has(f)) throw new Error(`Unknown field ${model}.${f}`);
    const cols = opts.select?.length ? opts.select.map((c) => `"${c}"`).join(", ") : "*";
    const order = opts.orderBy?.length ? ` ORDER BY ${opts.orderBy.map((o) => `"${o.field}" ${o.dir === "desc" ? "DESC" : "ASC"}`).join(", ")}` : "";
    const limit = opts.take !== undefined ? ` LIMIT ${Math.max(0, Math.floor(opts.take))}${opts.skip ? ` OFFSET ${Math.max(0, Math.floor(opts.skip))}` : ""}` : opts.skip ? ` LIMIT -1 OFFSET ${Math.max(0, Math.floor(opts.skip))}` : "";
    return (this.db.prepare(`SELECT ${cols} FROM "${model}"${w.sql}${order}${limit}`).all(...(w.params as never[])) as Record<string, unknown>[]).map((r) => this.fromDb(m, r)!);
  }

  async count(model: string, where?: Where): Promise<number> {
    const m = this.model(model);
    const w = this.whereSql(m, where);
    return Number((this.db.prepare(`SELECT COUNT(*) AS n FROM "${model}"${w.sql}`).get(...(w.params as never[])) as { n: number }).n);
  }

  async upsert(model: string, where: Record<string, unknown>, create: Row, update: Row = {}): Promise<Row> {
    noteWrite(model);
    const m = this.model(model);
    const existing = await this.findUnique(model, where);
    if (!existing) return this.create(model, { ...where, ...create });
    if (Object.keys(update).length === 0) return existing;
    const d: Row = { ...update };
    for (const c of columns(m, this.schema)) if (c.isUpdatedAt) d[c.name] = new Date();
    const row = this.toDb(m, d);
    const keys = Object.keys(row);
    const w = this.whereSql(m, where);
    this.db.prepare(`UPDATE "${model}" SET ${keys.map((k) => `"${k}" = ?`).join(", ")}${w.sql}`).run(...([...keys.map((k) => row[k]), ...w.params] as never[]));
    return (await this.findUnique(model, where))!;
  }

  async updateMany(model: string, where: Where, data: Row): Promise<number> {
    noteWrite(model);
    const m = this.model(model);
    const d: Row = { ...data };
    for (const c of columns(m, this.schema)) if (c.isUpdatedAt) d[c.name] = new Date();
    const row = this.toDb(m, d);
    const keys = Object.keys(row);
    const w = this.whereSql(m, where);
    const r = this.db.prepare(`UPDATE "${model}" SET ${keys.map((k) => `"${k}" = ?`).join(", ")}${w.sql}`).run(...([...keys.map((k) => row[k]), ...w.params] as never[]));
    return Number(r.changes);
  }

  async deleteMany(model: string, where: Where): Promise<number> {
    noteWrite(model);
    const m = this.model(model);
    const w = this.whereSql(m, where);
    return Number(this.db.prepare(`DELETE FROM "${model}"${w.sql}`).run(...(w.params as never[])).changes);
  }

  async transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    // nested calls join the outer transaction (like Prisma interactive tx)
    if (this.depth > 0) return fn(this);
    this.db.exec("BEGIN");
    this.depth++;
    const before = bankVersion();
    try {
      const r = await fn(this);
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      this.depth--;
      if (bankVersion() !== before) bumpBankVersion();
    }
  }
}
