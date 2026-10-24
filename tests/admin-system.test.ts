/**
 * 🧱 Admin → System check: the tables/columns/enum values/indexes the code expects vs. the live database
 * (src/server/admin/system-check.ts, pure — SQLite in tests), and the "Compute skill stars again" button
 * (src/server/skills/status-extras.ts queueMigration / runMigration), admin only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { compareSchema, expectedFromSchema, liveSqlite } from "../src/server/admin/system-check";
import { migrationReport, runMigration } from "../src/server/skills/status-extras";
import { demoDatabase } from "./helpers/db";

const SCHEMA = `
model Widget {
  id        String   @id
  name      String
  kind      Kind
  createdAt DateTime
  @@index([name])
}
enum Kind { A B C }
`;

describe("admin · system check (pure schema comparison)", () => {
  test("a database that matches the schema: ok, with the right table/column counts", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE "Widget" (id TEXT, name TEXT, kind TEXT, createdAt TEXT); CREATE INDEX "Widget_name_idx" ON "Widget"(name);`);
    const expected = expectedFromSchema(SCHEMA);
    assert.equal(expected.tables[0].columns.length, 4);
    const check = compareSchema(expected, liveSqlite(db));
    assert.equal(check.ok, true);
    assert.deepEqual(check.missingTables, []);
    assert.deepEqual(check.missingColumns, []);
    assert.deepEqual(check.missingIndexes, []);
  });

  test("a missing table, a missing column, a missing enum value and a missing index are each reported", () => {
    const db = new DatabaseSync(":memory:");
    // "Widget" table exists but is missing the "kind" column and the index on "name"; the whole schema also expects
    // a (made up) second table that is not there at all
    db.exec(`CREATE TABLE "Widget" (id TEXT, name TEXT, createdAt TEXT);`);
    const expected = expectedFromSchema(SCHEMA + `\nmodel Gone { id String @id }\n`);
    const check = compareSchema(expected, liveSqlite(db));
    assert.equal(check.ok, false);
    assert.deepEqual(check.missingTables, ["Gone"]);
    assert.deepEqual(check.missingColumns, [{ table: "Widget", column: "kind" }]);
    assert.deepEqual(check.missingIndexes, [{ table: "Widget", columns: ["name"] }]);
  });

  test("an enum column present but missing one of its values is reported (not as a missing column)", () => {
    const db = new DatabaseSync(":memory:");
    // SQLite has no real enum type; the live schema check only runs against MySQL's information_schema in
    // production — liveSqlite reports column TYPE as-is, so this exercises compareSchema's enum branch directly
    // via a hand-built "live" shape instead of liveSqlite (which never sees MySQL's enum(...) type strings).
    db.exec(`CREATE TABLE "Widget" (id TEXT, name TEXT, kind TEXT, createdAt TEXT);`);
    const live = liveSqlite(db);
    live.tables.get("widget")!.columns.set("kind", "enum('A','B')"); // "C" missing
    const expected = expectedFromSchema(SCHEMA);
    const check = compareSchema(expected, live);
    assert.equal(check.ok, false);
    assert.deepEqual(check.missingEnumValues, [{ table: "Widget", column: "kind", values: ["C"] }]);
  });
});

describe("admin · system check (compute skill stars again)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor;
  const now = new Date("2026-10-20T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const anyStudent = (await repo.findMany("User", { schoolId: admin.schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("runMigration computes a report with the school's student count; safe to run again (idempotent)", async () => {
    assert.equal(await migrationReport(repo, admin.schoolId!), null, "nothing computed yet");
    const r1 = await runMigration(repo, admin, now);
    assert.ok(r1.students >= 1);
    assert.equal(typeof r1.counts.NOT_STARTED, "number");
    const saved = await migrationReport(repo, admin.schoolId!);
    assert.deepEqual(saved, r1);
    const r2 = await runMigration(repo, admin, new Date(now.getTime() + 60_000));
    assert.equal(r2.students, r1.students, "nothing changed in between: the same report shape");
  });

  test("permission gate: only school/platform admins may run it", async () => {
    await assert.rejects(runMigration(repo, teacher, now), ForbiddenError);
    await assert.rejects(runMigration(repo, student, now), ForbiddenError);
  });
});
