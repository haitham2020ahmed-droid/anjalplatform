/**
 * ⚡ Admin → Questions → Load new questions opens at once and never fails as a whole:
 *   - the page's loader does NO counting (no question, pack or NAFS reads — two small SchoolSetting reads);
 *   - each pack is counted by its own request; one failing pack (e.g. a NAFS table / column missing because
 *     `npx prisma db push` did not run) shows its reason and the others are counted as usual;
 *   - the missing table / column message says what to do; the counts are cached (pack signature + bank version);
 *   - the error page's real message is for admins only.
 * Demo school in memory (never a real database); small pack files in a temp folder.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Repo } from "../src/server/seeding/repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { loadSkillSetsFile } from "../src/server/questions/skill-sets";
import { CHUNK_BUDGET_MS, PACKS, usePackDir } from "../src/server/questions/load-packs";
import { explainLoadError, loadStatus, packCount, SCHEMA_FIX } from "../src/server/admin/load-questions";
import { adminErrorText, schemaGap } from "../src/server/db/schema-errors";
import { errorDetail, logError } from "../src/server/teacher/extras";
import { noteWrite } from "../src/server/cache/bank-version";

/** a Repo that counts every call per model, and can make one model fail like a missing column */
function watched(repo: Repo, failOn?: { model: string; error: () => Error }) {
  const calls: string[] = [];
  const wrap = (r: Repo): Repo => new Proxy(r, {
    get(t, k) {
      const v = (t as unknown as Record<string | symbol, unknown>)[k];
      if (typeof v !== "function") return v;
      if (k === "transaction") return (fn: (x: Repo) => Promise<unknown>) => (v as Repo["transaction"]).call(t, (x: Repo) => fn(wrap(x)));
      return (...a: unknown[]) => {
        const model = String(a[0]);
        calls.push(model);
        if (failOn && model === failOn.model) return Promise.reject(failOn.error());
        return (v as (...b: unknown[]) => unknown).apply(t, a);
      };
    },
  });
  return { repo: wrap(repo), calls };
}

/** what Prisma throws when the database lacks a column of the schema (P2022) */
const p2022 = () => Object.assign(new Error("Invalid `prisma.nafsBankItem.count()` invocation: The column `NafsBankItem.booklet` does not exist in the current database."), { code: "P2022", meta: { column: "NafsBankItem.booklet" } });

describe("⚡ Load new questions: the page opens at once, packs are counted one by one", () => {
  let db: DatabaseSync; let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let dir = "";
  before(async () => {
    ({ db, repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const su = (await repo.findMany("User", { role: "STUDENT" }, { select: ["username"], take: 1 }))[0];
    student = await resolveActor(repo, (await repo.findUnique("User", { username: String(su.username) }))!);
    dir = mkdtempSync(join(tmpdir(), "packs-fast-"));
    const gap = (await loadSkillSetsFile("gap-skill-sets.json")).slice(0, 2).map((x) => ({ ...x, questions: x.questions.slice(0, 3) }));
    writeFileSync(join(dir, "gap-skill-sets.json"), JSON.stringify({ sets: gap }));
    mkdirSync(join(dir, "nafs-booklets"));
    copyFileSync(join(ROOT, "data/nafs/booklets/NB-001.json"), join(dir, "nafs-booklets", "NB-001.json"));
    mkdirSync(join(dir, "nafs-practice"));
    copyFileSync(join(ROOT, "data/nafs/practice/NP-001.json"), join(dir, "nafs-practice", "NP-001.json"));
    usePackDir(dir);
  });
  after(() => { usePackDir(null); rmSync(dir, { recursive: true, force: true }); });

  test("the page's loader does no counting: only the progress / lock settings are read", async () => {
    const w = watched(repo);
    const st = await loadStatus(w.repo, admin);
    assert.deepEqual(st.packs.map((p) => p.key), PACKS.map((p) => p.key));
    assert.deepEqual(st.packs.filter((p) => p.present).map((p) => p.key).sort(), ["gap", "nafs", "nafsPractice"]);
    assert.ok(w.calls.length <= 2, `${w.calls.length} database calls`);
    assert.deepEqual([...new Set(w.calls)], ["SchoolSetting"], "no Question / Skill / NAFS reads on the page itself");
    assert.ok(st.packs.every((p) => !("count" in p)), "no counts in the page's data");
    const page = readFileSync(join(ROOT, "src/app/admin/questions/load/page.tsx"), "utf8");
    assert.doesNotMatch(page, /countPack|packCount\(/, "the page never counts");
    assert.match(page, /try \{ st = await loadStatus/, "even the page's own read cannot break it");
    const runner = readFileSync(join(ROOT, "src/app/admin/questions/load/load-runner.tsx"), "utf8");
    assert.match(runner, /\/api\/admin\/question-packs\/count\?pack=/, "the counts are asked for after the page opened");
    assert.match(runner, /Counting…/);
  });

  test("the count request is school admin only", async () => {
    await assert.rejects(() => packCount(repo, teacher, "gap"), /school admin/i);
    await assert.rejects(() => packCount(repo, student, "gap"), /school admin/i);
    await assert.rejects(() => packCount(repo, admin, "nope"), /Unknown question pack/);
    const route = readFileSync(join(ROOT, "src/app/api/admin/question-packs/count/route.ts"), "utf8");
    assert.match(route, /apiActor\(\)/);
    assert.match(route, /actor\.role !== "SCHOOL_ADMIN"/);
  });

  test("a failing pack (missing NAFS column) shows why; the other packs are counted as usual", async () => {
    const w = watched(repo, { model: "NafsBankItem", error: p2022 });
    const all = await Promise.all(PACKS.map((p) => packCount(w.repo, admin, p.key)));
    const by = new Map(all.map((r) => [r.key, r]));
    for (const key of ["nafs", "nafsPractice"] as const) {
      const r = by.get(key)!;
      assert.equal(r.ok, false, key);
      if (r.ok) continue;
      assert.equal(r.schema, true);
      assert.equal(r.error, SCHEMA_FIX);
      assert.match(r.what, /NafsBankItem\.booklet/);
    }
    const gap = by.get("gap")!;
    assert.ok(gap.ok && gap.count && gap.count.questions === 6, "the gap pack is counted");
    assert.ok(all.filter((r) => r.key !== "nafs" && r.key !== "nafsPractice").every((r) => r.ok), "nothing else fails");
    // the page itself still opens
    assert.equal((await loadStatus(w.repo, admin)).packs.length, PACKS.length);
    // a failed count is not kept: once the database is right, the pack is counted
    const ok = await packCount(repo, admin, "nafs");
    assert.ok(ok.ok && ok.count && ok.count.questions > 0 && ok.count.applies);
  });

  test("a really missing column (SQLite) and Prisma's codes give the 'Run npx prisma db push' message", async () => {
    assert.match(SCHEMA_FIX, /npx prisma db push/);
    assert.deepEqual(schemaGap(Object.assign(new Error("x"), { code: "P2021", meta: { table: "NafsPractice" } })), { what: "NafsPractice" });
    assert.deepEqual(schemaGap(new Error("Unknown column 'difficulty' in 'field list'")), { what: "difficulty" });
    assert.deepEqual(schemaGap(new Error("Table 'app.NafsPracticeRun' doesn't exist")), { what: "app.NafsPracticeRun" });
    assert.equal(schemaGap(new Error("Connection reset")), null);
    assert.match(adminErrorText(p2022()), /npx prisma db push/);
    const plain = explainLoadError(new Error("boom"));
    assert.equal(plain.schema, false); assert.equal(plain.what, "boom");
    // the real thing: the column is gone from the (in-memory) database
    db.exec("ALTER TABLE NafsBankItem DROP COLUMN booklet");
    noteWrite("NafsBankItem");
    try {
      const r = await packCount(repo, admin, "nafs");
      assert.equal(r.ok, false);
      if (!r.ok) { assert.equal(r.schema, true); assert.equal(r.what, "booklet"); }
      const g = await packCount(repo, admin, "gap");
      assert.ok(g.ok, "the other packs are still counted");
      assert.equal((await loadStatus(repo, admin)).packs.length, PACKS.length, "the page still opens");
    } finally {
      db.exec("ALTER TABLE NafsBankItem ADD COLUMN booklet TEXT");
      noteWrite("NafsBankItem");
    }
  });

  test("counts are cached by pack signature + bank version: a second look reads nothing; a change counts again", async () => {
    noteWrite("Question");
    const w = watched(repo);
    const a = await packCount(w.repo, admin, "gap");
    const first = w.calls.length;
    assert.ok(first > 0);
    const b = await packCount(w.repo, admin, "gap");
    assert.equal(w.calls.length, first, "cached");
    assert.deepEqual(a, { ...b, ms: a.ok ? a.ms : 0 });
    assert.ok(!w.calls.includes("ReadingPassage") && !w.calls.includes("QuestionOption"), "never passages or choices");
    noteWrite("Question");
    await packCount(w.repo, admin, "gap");
    assert.ok(w.calls.length > first, "the bank changed: counted again");
    // concurrent requests share one count
    noteWrite("Question");
    const before = w.calls.length;
    await Promise.all([packCount(w.repo, admin, "gap"), packCount(w.repo, admin, "gap"), packCount(w.repo, admin, "gap")]);
    const once = w.calls.length - before;
    noteWrite("Question");
    const b2 = w.calls.length;
    await packCount(w.repo, admin, "gap");
    assert.equal(once, w.calls.length - b2, "three at once cost what one costs");
  });

  test("chunks stay short: a chunk starts no new unit after 5 s", () => {
    assert.ok(CHUNK_BUDGET_MS <= 5_000);
    const runner = readFileSync(join(ROOT, "src/app/admin/questions/load/load-runner.tsx"), "utf8");
    assert.match(runner, /BACKOFF_MS = \[/, "a failed chunk is tried again after a pause");
    assert.match(runner, /bad\.push\(/, "a pack that keeps failing is skipped; Load everything goes on");
  });

  test("the error page's real message: school admin / platform admin only, never a teacher or a student", async () => {
    await logError(repo, { source: "SERVER", message: "The column `NafsBankItem.difficulty` does not exist in the current database.", path: "/admin/questions/load", digest: "1602237576" });
    const d = await errorDetail(repo, admin, "1602237576");
    assert.ok(d);
    assert.match(d!.message, /npx prisma db push/);
    assert.match(d!.message, /NafsBankItem\.difficulty/);
    assert.equal(await errorDetail(repo, teacher, "1602237576"), null);
    assert.equal(await errorDetail(repo, student, "1602237576"), null);
    assert.equal(await errorDetail(repo, admin, "unknown-digest"), null);
    const route = readFileSync(join(ROOT, "src/app/api/admin/error-detail/route.ts"), "utf8");
    assert.match(route, /apiActor\(\)/);
    // the error page and the last-resort page both ask (one shared hook)
    const hook = readFileSync(join(ROOT, "src/components/ui/admin-error-detail.ts"), "utf8");
    assert.match(hook, /\/api\/admin\/error-detail\?digest=/);
    for (const f of ["src/app/error.tsx", "src/app/global-error.tsx"]) assert.match(readFileSync(join(ROOT, f), "utf8"), /useAdminErrorDetail\(error\.digest\)/, f);
  });
});
