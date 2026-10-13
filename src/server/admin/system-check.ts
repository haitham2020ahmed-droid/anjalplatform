/**
 * 🧱 System check (Admin → System check): the tables, columns, enum values and indexes the CODE expects (the Prisma
 * schema shipped with this version) against the LIVE database — MySQL's information_schema, or SQLite's PRAGMAs in
 * tests. Read-only: it never changes the database. When something is missing the fix is always the same:
 * `npx prisma db push` on the server (the update's step that did not run), then reload.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ExpectedTable { name: string; columns: string[]; enums: Record<string, string[]>; indexes: string[][] }
export interface Expected { tables: ExpectedTable[] }
export interface LiveTable { name: string; columns: Map<string, string>; indexes: string[][] }
export interface Live { kind: "mysql" | "sqlite"; tables: Map<string, LiveTable> }

export interface SystemCheck {
  ok: boolean;
  kind: Live["kind"];
  expectedTables: number; liveTables: number; expectedColumns: number;
  missingTables: string[];
  missingColumns: { table: string; column: string }[];
  missingEnumValues: { table: string; column: string; values: string[] }[];
  missingIndexes: { table: string; columns: string[] }[];
  fix: string;
}

export const DB_PUSH = "npx prisma db push";
const SCALARS = new Set(["String", "Int", "Float", "Boolean", "DateTime", "Json", "BigInt", "Bytes", "Decimal"]);
const lc = (v: string) => v.toLowerCase();

/** The schema's models: scalar/enum columns, enum values per column, @@index / @@unique / @unique column lists. */
export function expectedFromSchema(text: string): Expected {
  const src = text.replace(/\/\/[^\n]*/g, "");
  const enums = new Map<string, string[]>();
  for (const m of src.matchAll(/^\s*enum\s+(\w+)\s*\{([^}]*)\}/gm)) enums.set(m[1], m[2].split(/\s+/).map((x) => x.trim()).filter((x) => /^\w+$/.test(x)));
  const models = [...src.matchAll(/^\s*model\s+(\w+)\s*\{([^}]*)\}/gm)];
  const modelNames = new Set(models.map((m) => m[1]));
  const tables: ExpectedTable[] = [];
  for (const m of models) {
    const t: ExpectedTable = { name: m[1], columns: [], enums: {}, indexes: [] };
    for (const raw of m[2].split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const block = line.match(/^@@(index|unique)\(\s*\[([^\]]+)\]/);
      if (block) { t.indexes.push(block[2].split(",").map((x) => x.trim().replace(/\(.*$/, "")).filter(Boolean)); continue; }
      if (line.startsWith("@@")) continue;
      const f = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/);
      if (!f) continue;
      const [, name, type, list, , rest] = f;
      if (modelNames.has(type) || (list && !SCALARS.has(type) && !enums.has(type))) continue; // relation fields: no column
      if (!SCALARS.has(type) && !enums.has(type)) continue;
      t.columns.push(name);
      if (enums.has(type)) t.enums[name] = enums.get(type)!;
      if (/@unique\b/.test(rest)) t.indexes.push([name]);
    }
    tables.push(t);
  }
  return { tables };
}

/** The schema this version was built with: prisma/schema.prisma, else the copy inside the generated client. */
export function expectedSchema(root = process.cwd()): Expected | null {
  for (const p of [join(root, "prisma", "schema.prisma"), join(root, "node_modules", ".prisma", "client", "schema.prisma")]) {
    try { if (existsSync(p)) return expectedFromSchema(readFileSync(p, "utf8")); } catch { /* next */ }
  }
  return null;
}

/** What is missing in `live` (tables, columns, enum values, indexes by their columns). Names compare case-insensitively. */
export function compareSchema(expected: Expected, live: Live): SystemCheck {
  const out: SystemCheck = {
    ok: true, kind: live.kind, expectedTables: expected.tables.length, liveTables: live.tables.size,
    expectedColumns: expected.tables.reduce((n, t) => n + t.columns.length, 0),
    missingTables: [], missingColumns: [], missingEnumValues: [], missingIndexes: [], fix: DB_PUSH,
  };
  for (const t of expected.tables) {
    const l = live.tables.get(lc(t.name));
    if (!l) { out.missingTables.push(t.name); continue; }
    for (const c of t.columns) {
      const type = l.columns.get(lc(c));
      if (type === undefined) { out.missingColumns.push({ table: t.name, column: c }); continue; }
      const want = t.enums[c];
      const m = type.match(/^enum\((.*)\)$/i);
      if (want && m) {
        const have = new Set([...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'")));
        const miss = want.filter((v) => !have.has(v));
        if (miss.length) out.missingEnumValues.push({ table: t.name, column: c, values: miss });
      }
    }
    const haveIdx = new Set(l.indexes.map((cols) => cols.map(lc).join(",")));
    for (const cols of t.indexes) {
      if (cols.some((c) => !l.columns.has(lc(c)))) continue; // reported as a missing column already
      // an index whose columns START with these columns serves them too (MySQL reuses it for a foreign key)
      const key = cols.map(lc).join(",");
      if (!haveIdx.has(key) && ![...haveIdx].some((h) => h.startsWith(key + ","))) out.missingIndexes.push({ table: t.name, columns: cols });
    }
  }
  out.ok = !out.missingTables.length && !out.missingColumns.length && !out.missingEnumValues.length && !out.missingIndexes.length;
  return out;
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");

/** MySQL: one read of information_schema.COLUMNS and one of STATISTICS for the current database (read-only). */
export async function liveMysql(query: (sql: TemplateStringsArray) => Promise<Raw[]>): Promise<Live> {
  const [cols, idx] = await Promise.all([
    query`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS ty FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`,
    query`SELECT TABLE_NAME AS t, INDEX_NAME AS i, SEQ_IN_INDEX AS n, COLUMN_NAME AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()`,
  ]);
  const tables = new Map<string, LiveTable>();
  const tab = (name: string) => { const k = lc(name); let t = tables.get(k); if (!t) tables.set(k, (t = { name, columns: new Map(), indexes: [] })); return t; };
  for (const r of cols) tab(str(r.t ?? r.TABLE_NAME)).columns.set(lc(str(r.c ?? r.COLUMN_NAME)), str(r.ty ?? r.COLUMN_TYPE));
  const byIndex = new Map<string, { table: string; cols: [number, string][] }>();
  for (const r of idx) {
    const t = str(r.t ?? r.TABLE_NAME), i = str(r.i ?? r.INDEX_NAME);
    const k = `${t}\u0000${i}`;
    const e = byIndex.get(k) ?? { table: t, cols: [] };
    e.cols.push([Number(r.n ?? r.SEQ_IN_INDEX), str(r.c ?? r.COLUMN_NAME)]);
    byIndex.set(k, e);
  }
  for (const e of byIndex.values()) tab(e.table).indexes.push(e.cols.sort((a, b) => a[0] - b[0]).map((x) => x[1]));
  return { kind: "mysql", tables };
}

/** SQLite (tests and offline copies): sqlite_master + PRAGMA table_info / index_list / index_info (read-only). */
export function liveSqlite(db: { prepare(sql: string): { all(...p: unknown[]): unknown[] } }): Live {
  const tables = new Map<string, LiveTable>();
  const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Raw[]).map((r) => str(r.name));
  const q = (n: string) => `"${n.replace(/"/g, '""')}"`;
  for (const name of names) {
    const columns = new Map((db.prepare(`PRAGMA table_info(${q(name)})`).all() as Raw[]).map((r) => [lc(str(r.name)), str(r.type)] as [string, string]));
    const indexes = (db.prepare(`PRAGMA index_list(${q(name)})`).all() as Raw[]).map((i) =>
      (db.prepare(`PRAGMA index_info(${q(str(i.name))})`).all() as Raw[]).sort((a, b) => Number(a.seqno) - Number(b.seqno)).map((c) => str(c.name)));
    tables.set(lc(name), { name, columns, indexes });
  }
  return { kind: "sqlite", tables };
}
