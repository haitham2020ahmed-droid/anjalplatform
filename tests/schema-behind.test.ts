/**
 * 🧱 The database BEHIND the code (the update's `npx prisma db push` did not run) — demo school in memory, never a real
 * database. The NAFS tables (then every recent table and column) are dropped from a SQLite copy, reads go through a
 * Prisma-like repo (named columns), and the common pages' data must still load:
 *   app shell (menus) for the three roles · student home · teacher home · admin home · My Tests · plans · writing
 *   NAFS menu entries hide; the NAFS pages show "The database needs an update"; System check lists what is missing.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { demoDatabase, ROOT } from "./helpers/db";
import { dropRecent, NAFS_TABLES, PrismaLikeRepo, RECENT_COLUMNS, RECENT_TABLES } from "./helpers/behind-db";
import { parseSchema } from "../scripts/db/schema-ddl";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Repo } from "../src/server/seeding/repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { shellData } from "../src/server/ui/shell-data";
import { studentHome } from "../src/server/student/student-home";
import { studentMenuFlags } from "../src/server/student/menu-flags";
import { teacherHomeData } from "../src/server/teacher/home";
import { teacherHomeSummary } from "../src/server/teacher/needs-attention";
import { writingToGrade } from "../src/server/writing/locked";
import { adminHomeData } from "../src/server/admin/home-data";
import { canSeeNafs, canSeeNafsCached } from "../src/server/teacher/nafs-access";
import { nafsReady, resetNafsReady } from "../src/server/nafs/ready";
import { myTests, teacherTests } from "../src/server/tests/assessments";
import { plansOverview } from "../src/server/plans/editor";
import { listSkillPlans, studentStudyPlans } from "../src/server/curriculum-map/plans";
import { classTasks, myTasks } from "../src/server/teacher/writing";
import { nextStep } from "../src/server/student/next-step";
import { navCounts } from "../src/server/teacher/week-plan";
import { DB_UPDATE_NEEDED, resetSchemaGaps, safeIfBehind, schemaGap, schemaGapsSeen } from "../src/server/db/schema-errors";
import { compareSchema, expectedFromSchema, expectedSchema, liveMysql, liveSqlite } from "../src/server/admin/system-check";
import { searchablePagesFor } from "../src/components/nav-items";
import { ADMIN_TOOLS } from "../src/components/admin-tools";

const s = (v: unknown) => String(v ?? "");
const schema = parseSchema(join(ROOT, "prisma/schema.prisma"));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

interface World { db: DatabaseSync; raw: SqliteRepo; repo: Repo; admin: Actor; teacher6: Actor; student6: Actor; teacher4: Actor; student4: Actor; class4: string }
async function world(): Promise<World> {
  const { db, repo: raw } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 });
  const as = async (username: string) => resolveActor(raw, (await raw.findUnique("User", { username }))!);
  const firstStudent = async (t: Actor) => {
    const classId = s((await raw.findMany("ClassTeacher", { teacherId: (await raw.findUnique("Teacher", { userId: t.userId }))!.id }))[0].classId);
    const st = await raw.findUnique("Student", { id: (await raw.findMany("ClassMembership", { classId }))[0].studentId });
    return { classId, student: await resolveActor(raw, (await raw.findUnique("User", { id: st!.userId }))!) };
  };
  const admin = await as("demo.admin"), teacher6 = await as("demo.teacher.6a"), teacher4 = await as("demo.teacher.4a");
  const g6 = await firstStudent(teacher6), g4 = await firstStudent(teacher4);
  return { db, raw, repo: new PrismaLikeRepo(raw, schema), admin, teacher6, student6: g6.student, teacher4, student4: g4.student, class4: g4.classId };
}

/** Every common page's data (what the app shell, the homes and the main lists read). */
async function commonPages(w: World) {
  const { repo } = w;
  await Promise.all([shellData(repo, w.student6), shellData(repo, w.teacher6), shellData(repo, w.admin), shellData(repo, w.student4)]);
  await Promise.all([navCounts(repo, w.student4), navCounts(repo, w.teacher4), navCounts(repo, w.admin)]);
  await studentMenuFlags(repo, s(w.student6.studentId));
  await canSeeNafsCached(repo, w.teacher6);
  await studentHome(repo, w.student6);
  await studentHome(repo, w.student4);
  await myTests(repo, w.student4);
  await studentStudyPlans(repo, w.student4);
  await nextStep(repo, w.student4);
  await myTasks(repo, w.student4);
  await teacherHomeData(repo, w.teacher4, null);
  await teacherHomeSummary(repo, w.teacher4);
  await writingToGrade(repo, w.teacher4);
  await teacherTests(repo, w.teacher4);
  await plansOverview(repo, w.teacher4, {});
  await listSkillPlans(repo, w.teacher4);
  await classTasks(repo, w.teacher4, w.class4);
  await adminHomeData(repo, w.admin);
}

describe("the database is behind the code", () => {
  describe("the NAFS tables are missing", () => {
    let w: World;
    before(async () => { w = await world(); dropRecent(w.db, NAFS_TABLES); resetSchemaGaps(); resetNafsReady(); });

    test("shell data, student home and teacher home open (no error)", async () => {
      await commonPages(w);
      const [, flags] = await shellData(w.repo, w.student6);
      assert.equal(flags?.nafs, false, "the student's NAFS icon hides");
      const h = await studentHome(w.repo, w.student6);
      assert.equal(h.nafsToDo, 0);
      assert.ok(await teacherHomeData(w.repo, w.teacher6, null));
    });

    test("NAFS menu entries hide (teacher, student, admin's Find a page); the access rule itself is unchanged", async () => {
      assert.equal(await nafsReady(w.repo), false);
      assert.equal(await canSeeNafsCached(w.repo, w.teacher6), false);
      assert.equal(await canSeeNafs(w.repo, w.teacher6), true, "a Grade 6 teacher still may — the menu just waits for the tables");
      assert.equal((await studentMenuFlags(w.repo, s(w.student6.studentId))).nafs, false);
      assert.ok(!searchablePagesFor("SCHOOL_ADMIN", { nafs: false }).some((p) => p.href === "/teacher/nafs"));
      assert.ok(searchablePagesFor("SCHOOL_ADMIN", {}).some((p) => p.href === "/teacher/nafs"), "unchanged when the flag is not given");
      assert.ok(schemaGapsSeen().some((g) => /^Nafs/.test(g.what)), "noticed once for the admin");
    });

    test("the NAFS pages say what to do instead of failing", () => {
      for (const f of ["src/app/teacher/nafs/page.tsx", "src/app/student/nafs/page.tsx", "src/app/student/nafs/sim/[id]/page.tsx", "src/app/student/nafs/practice/[id]/page.tsx", "src/app/admin/nafs-links/page.tsx",
        "src/app/teacher/nafs/tests/new/page.tsx", "src/app/teacher/nafs/tests/[id]/page.tsx", "src/app/teacher/nafs/question/page.tsx"]) {
        assert.match(read(f), /const gate = await nafsDbGate\(\); if \(gate\) return gate;/, f);
      }
      assert.match(read("src/components/db-update-needed.tsx"), /DB_UPDATE_NEEDED/);
      assert.equal(DB_UPDATE_NEEDED, "The database needs an update: run npx prisma db push");
    });
  });

  describe("every recent table and column is missing (the whole update was not pushed)", () => {
    let w: World;
    before(async () => { w = await world(); dropRecent(w.db, RECENT_TABLES, RECENT_COLUMNS); resetSchemaGaps(); resetNafsReady(); });

    test("the common pages' data still loads; the new lists are just empty", async () => {
      await commonPages(w);
      assert.deepEqual(await listSkillPlans(w.repo, w.teacher4), []);
      assert.deepEqual(await classTasks(w.repo, w.teacher4, w.class4), []);
      assert.ok(Array.isArray(await teacherTests(w.repo, w.teacher4)), "My Tests / Assessments read only the columns they show");
      const seen = schemaGapsSeen().map((g) => g.what);
      assert.ok(seen.length > 0);
    });
  });

  describe("safeIfBehind", () => {
    test("a missing table / column gives the empty value; any other error is thrown as before", async () => {
      resetSchemaGaps();
      assert.deepEqual(await safeIfBehind("t", Promise.reject(Object.assign(new Error("The table `NafsTest` does not exist in the current database."), { code: "P2021" })), []), []);
      assert.equal(await safeIfBehind("t", () => Promise.reject(new Error("Unknown column 'locked' in 'field list'")), 0), 0);
      await assert.rejects(safeIfBehind("t", Promise.reject(new Error("Connection lost")), []), /Connection lost/);
      assert.equal(await safeIfBehind("t", Promise.resolve(5), 0), 5);
      assert.deepEqual(schemaGapsSeen().map((g) => g.what).sort(), ["NafsTest", "locked"]);
      assert.equal(schemaGap({ code: "P2022", meta: { column: "SkillPlan.status" } })?.what, "SkillPlan.status");
    });
  });

  describe("System check (read-only)", () => {
    test("an up-to-date database matches; a behind one lists exactly what is missing", async () => {
      const expected = expectedSchema(ROOT)!;
      assert.equal(expected.tables.length, schema.models.size);
      const w = await world();
      const ok = compareSchema(expected, liveSqlite(w.db));
      assert.equal(ok.ok, true, JSON.stringify({ ...ok, missingIndexes: ok.missingIndexes.slice(0, 3) }));
      const idx = (w.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'Question' AND sql LIKE '%"difficultyLevel"%' AND sql LIKE '%"deletedAt"%'`).all() as { name: string }[])[0];
      assert.ok(idx, "the Question index exists in the copy");
      w.db.exec(`DROP INDEX "${idx.name}"`);
      dropRecent(w.db, RECENT_TABLES, RECENT_COLUMNS);
      const r = compareSchema(expected, liveSqlite(w.db));
      assert.equal(r.ok, false);
      assert.deepEqual([...r.missingTables].sort(), [...RECENT_TABLES].sort());
      for (const [t, cols] of Object.entries(RECENT_COLUMNS)) for (const c of cols) assert.ok(r.missingColumns.some((x) => x.table === t && x.column === c), `${t}.${c}`);
      assert.ok(r.missingIndexes.some((x) => x.table === "Question" && x.columns.join(",") === "skillId,deletedAt,status,difficultyLevel"));
      assert.equal(r.fix, "npx prisma db push");
    });

    test("MySQL: information_schema rows, enum values (MapCategoryType.REVIEW) and indexes", async () => {
      const expected = expectedFromSchema(`
        enum MapCategoryType { CONCEPT_VOCABULARY REVIEW }
        model MapCategory { id String @id
          type MapCategoryType
          code String @unique
          node Node @relation(fields: [code], references: [code])
          @@index([type, code]) }
        model NafsTest { id String @id }`);
      const sqls: string[] = [];
      const live = await liveMysql(async (q) => {
        sqls.push(q.join("?"));
        return /COLUMNS/.test(q.join("")) ? [{ t: "MapCategory", c: "id", ty: "varchar(191)" }, { t: "MapCategory", c: "type", ty: "enum('CONCEPT_VOCABULARY','ANALYZE')" }, { t: "MapCategory", c: "code", ty: "varchar(191)" }]
          : [{ t: "MapCategory", i: "PRIMARY", n: 1, c: "id" }, { t: "MapCategory", i: "MapCategory_code_key", n: 1, c: "code" }];
      });
      assert.ok(sqls.every((x) => /^SELECT .* FROM information_schema\.(COLUMNS|STATISTICS) WHERE TABLE_SCHEMA = DATABASE\(\)$/.test(x)), "read-only, this database only");
      const r = compareSchema(expected, live);
      assert.deepEqual(r.missingTables, ["NafsTest"]);
      assert.deepEqual(r.missingEnumValues, [{ table: "MapCategory", column: "type", values: ["REVIEW"] }]);
      assert.deepEqual(r.missingIndexes, [{ table: "MapCategory", columns: ["type", "code"] }]);
      assert.deepEqual(r.missingColumns, []);
    });

    test("the page: admins only, inside the admin tools; error pages show admins the real message", () => {
      const page = read("src/app/admin/system/page.tsx");
      assert.match(page, /requireActor\(\{ roles: \["SCHOOL_ADMIN", "SUPER_ADMIN"\] \}\)/);
      assert.ok(ADMIN_TOOLS.some((x) => x.href === "/admin/system"));
      const run = read("src/server/admin/system-check-run.ts");
      assert.doesNotMatch(run + read("src/server/admin/system-check.ts"), /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/);
      for (const f of ["src/app/error.tsx", "src/app/global-error.tsx"]) assert.match(read(f), /useAdminErrorDetail\(error\.digest\)/, f);
      assert.match(read("src/components/app-shell.tsx"), /dbBehind && \(/, "admins see the banner on every page");
    });
  });

  test("nothing changes while the database is up to date: the NAFS menu shows for a Grade 6 teacher", async () => {
    const w = await world();
    resetNafsReady();
    assert.equal(await nafsReady(w.repo), true);
    assert.equal(await canSeeNafsCached(w.repo, w.teacher6), true);
    assert.equal((await studentMenuFlags(w.repo, s(w.student6.studentId))).nafs, true);
    await commonPages(w);
  });
});
