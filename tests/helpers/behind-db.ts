/**
 * A database that is BEHIND the code (the update's `npx prisma db push` did not run): the recent tables and columns
 * are dropped from an in-memory demo school, and the repo reads like Prisma does (every column of the model is named
 * in a read without `select`, and a write reads the whole row back), so a missing column fails as it does on MySQL.
 * Tests only — never a real database.
 */
import type { DatabaseSync } from "node:sqlite";
import type { FindOptions, Repo, Row, Where } from "../../src/server/seeding/repo";
import type { SqliteRepo } from "../../scripts/db/sqlite-repo";
import type { Schema } from "../../scripts/db/schema-ddl";

/** Tables added by the recent updates (NAFS section + writing). */
export const RECENT_TABLES = ["NafsSkill", "NafsSkillFamily", "NafsBankItem", "NafsTest", "NafsTestClass", "NafsResult", "NafsPractice", "NafsPracticeRun", "NafsPracticeAnswer", "WritingRubric", "WritingRubricCriterion", "WritingIntegrityEvent"];
export const NAFS_TABLES = RECENT_TABLES.filter((t) => t.startsWith("Nafs"));
/** Columns added to older tables by the recent updates. */
export const RECENT_COLUMNS: Record<string, string[]> = {
  SkillPlan: ["status", "program", "doc", "baseline", "source", "studentIds", "goals", "startAt", "dueAt", "sentAt", "updatedAt"],
  WritingTask: ["locked", "promptHtml", "gradeLevel", "timeLimitMin", "rubricId", "rubric", "assignTo", "groupId", "studentIds", "rubricText", "aiNotes"],
  WritingSubmission: ["startedAt", "autosavedAt", "submitMode", "leaveCount", "lock", "grading", "aiGrade", "returnedAt", "scorePct"],
  TeacherTest: ["marks"],
  SecondChanceAnswer: ["source"],
};

/** Drops tables (and, when `columns`, the recent columns with their indexes). Nothing else is touched. */
export function dropRecent(db: DatabaseSync, tables: string[], columns: Record<string, string[]> = {}): void {
  db.exec("PRAGMA foreign_keys = OFF");
  for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t}"`);
  for (const [t, cols] of Object.entries(columns)) {
    const idx = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`).all(t) as { name: string; sql: string }[];
    for (const i of idx) if (cols.some((c) => i.sql.includes(`"${c}"`))) db.exec(`DROP INDEX "${i.name}"`);
    for (const c of cols) db.exec(`ALTER TABLE "${t}" DROP COLUMN "${c}"`);
  }
}

/** Prisma's reading habits over the SQLite repo: named columns, whole-row read-back after a write. */
export class PrismaLikeRepo implements Repo {
  constructor(private readonly inner: Repo, private readonly schema: Schema) {}
  private cols(model: string): string[] {
    const m = this.schema.models.get(model);
    if (!m) return [];
    return m.fields.filter((f) => !this.schema.models.has(f.type) && !f.list).map((f) => f.name);
  }
  private async readBack(model: string, row: Row): Promise<Row> {
    const m = this.schema.models.get(model);
    if (!m || !m.id.length) return row;
    const got = await this.inner.findMany(model, Object.fromEntries(m.id.map((k) => [k, row[k]])), { select: this.cols(model), take: 1 });
    return got[0] ?? row;
  }
  async upsert(m: string, w: Record<string, unknown>, c: Row, u?: Row) { return this.readBack(m, await this.inner.upsert(m, w, c, u)); }
  async create(m: string, d: Row) { return this.readBack(m, await this.inner.create(m, d)); }
  createMany(m: string, rows: Row[]) { return this.inner.createMany(m, rows); }
  async findUnique(m: string, w: Record<string, unknown>) {
    const r = await this.inner.findUnique(m, w);
    return r ? this.readBack(m, r) : (await this.inner.findMany(m, w as Where, { select: this.cols(m), take: 1 }))[0] ?? null;
  }
  findMany(m: string, w?: Where, o: FindOptions = {}) { return this.inner.findMany(m, w, o.select?.length ? o : { ...o, select: this.cols(m) }); }
  count(m: string, w?: Where) { return this.inner.count(m, w); }
  groupCount(m: string, by: string, w?: Where) { return this.inner.groupCount!(m, by, w); }
  updateMany(m: string, w: Where, d: Row) { return this.inner.updateMany(m, w, d); }
  deleteMany(m: string, w: Where) { return this.inner.deleteMany(m, w); }
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> { return this.inner.transaction((tx) => fn(new PrismaLikeRepo(tx, this.schema))); }
}

export function prismaLike(repo: SqliteRepo, schema: Schema): PrismaLikeRepo { return new PrismaLikeRepo(repo, schema); }
