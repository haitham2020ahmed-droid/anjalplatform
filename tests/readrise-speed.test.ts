/**
 * ⚡ ReadRise speed (the "ReadRise page does not open" report): an update that ships new article files never makes a
 * page wait. Only MISSING article codes are imported, in the background, once; a broken file never re-imports the
 * others; the student/teacher lists reuse the cached article catalog; a new article is imported with a few inserts and
 * the same rows as before.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoDatabase, ROOT } from "./helpers/db";
import type { Repo } from "../src/server/seeding/repo";
import { resolveActor } from "../src/server/auth/actor";
import {
  articleCodeOf, ensureReadRiseLibrary, readRiseLibraryStatus, resetReadRiseLibraryCheck, seedReadRiseLibrary, startReadRiseLibraryLoad,
} from "../src/server/readrise/seed";
import { importArticleJson } from "../src/server/readrise/import";
import { articleDetail, listLibrary, setArticleHidden } from "../src/server/readrise/library";
import { studentLibrary } from "../src/server/readrise/student";
import { questionKeys } from "../src/server/readrise/question-key";
import { readFileSync } from "node:fs";

const ARTICLES = join(ROOT, "data", "readrise", "articles");
const FILES = readdirSync(ARTICLES).filter((n) => n.endsWith(".json")).sort();

/** A temporary project root whose article folder holds the first `n` real files (+ extra files). */
function rootWith(n: number, extra: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "rr-speed-"));
  const dir = join(root, "data", "readrise", "articles");
  mkdirSync(dir, { recursive: true });
  for (const f of FILES.slice(0, n)) symlinkSync(join(ARTICLES, f), join(dir, f));
  for (const [f, body] of Object.entries(extra)) writeFileSync(join(dir, f), body);
  return root;
}

function counting(repo: Repo) {
  const n = { all: 0, byModel: new Map<string, number>() };
  const wrap = (r: Repo): Repo => new Proxy(r, {
    get(t, k) {
      const v = (t as unknown as Record<string | symbol, unknown>)[k];
      if (typeof v !== "function") return v;
      if (k === "transaction") return (fn: (x: Repo) => Promise<unknown>) => (v as Repo["transaction"]).call(t, (x: Repo) => fn(wrap(x)));
      return (...a: unknown[]) => { n.all++; const m = String(a[0]); n.byModel.set(`${String(k)}:${m}`, (n.byModel.get(`${String(k)}:${m}`) ?? 0) + 1); return (v as (...b: unknown[]) => unknown).apply(t, a); };
    },
  });
  return { repo: wrap(repo), n };
}

describe("⚡ ReadRise library load after an update", () => {
  test("only the missing article codes are imported; existing articles are not touched", async () => {
    const { repo } = await demoDatabase();
    const oldRoot = rootWith(3), newRoot = rootWith(5);
    const first = await seedReadRiseLibrary(repo, oldRoot, () => undefined);
    assert.equal(first.created, 3);
    const { repo: c, n } = counting(repo);
    const r = await ensureReadRiseLibrary(c, newRoot);
    assert.equal(r?.created, 2, "the 2 new files");
    assert.equal(r?.updated, 0, "existing articles are never re-imported");
    assert.equal(n.byModel.get("updateMany:RRArticle") ?? 0, 0);
    assert.equal(n.byModel.get("upsert:RRVersion") ?? 0, 0, "a new article: inserts, no upserts");
    assert.equal(n.byModel.get("findMany:RRArticle"), 1 + 2, "one query for the existing codes (+ one look-up per new file)");
    assert.equal(await repo.count("RRArticle", { schoolId: null, deletedAt: null }), 5);
    // the same day: nothing to do, no query
    n.all = 0;
    assert.equal(await ensureReadRiseLibrary(c, newRoot), null);
    assert.equal(n.all, 0);
    rmSync(oldRoot, { recursive: true, force: true }); rmSync(newRoot, { recursive: true, force: true });
  });

  test("pages never wait: the load starts in the background, once (single flight), and reports its status", async () => {
    const { repo } = await demoDatabase();
    const root = rootWith(4);
    const { repo: c, n } = counting(repo);
    startReadRiseLibraryLoad(c, root);
    const st = readRiseLibraryStatus(c);
    assert.equal(st.loading, true, "loading in the background");
    const calls = n.all;
    assert.ok(calls <= 1, `the page itself waits for nothing (${calls} call started)`);
    startReadRiseLibraryLoad(c, root); // a second page view while loading: shares the same load
    const r = await ensureReadRiseLibrary(c, root); // the daily job may await it
    assert.equal(r?.created, 4);
    const done = readRiseLibraryStatus(c);
    assert.equal(done.loading, false);
    assert.equal(done.pending, 4);
    assert.equal(done.last?.created, 4);
    assert.equal(await repo.count("RRArticle", { schoolId: null }), 4, "each article imported once");
    rmSync(root, { recursive: true, force: true });
  });

  test("a broken file is reported and remembered: it never makes the other files load again", async () => {
    const { repo } = await demoDatabase();
    const root = rootWith(2, { "RR-999.json": "{ \"code\": \"RR-999\", \"title\": " });
    const first = await ensureReadRiseLibrary(repo, root, new Date("2026-11-03T07:00:00Z"));
    assert.equal(first?.created, 2);
    assert.equal(first?.skipped.length, 1);
    assert.equal(first?.skipped[0].file, "RR-999.json");
    const { repo: c, n } = counting(repo);
    const next = await ensureReadRiseLibrary(c, root, new Date("2026-11-04T07:00:00Z"));
    assert.equal(n.all, 1, "the next day: one query for the codes; nothing is imported again");
    assert.equal(next?.created, 0);
    assert.equal(next?.updated, 0);
    assert.equal(next?.skipped[0].file, "RR-999.json", "the problem is still shown to the admin");
    assert.equal(readRiseLibraryStatus(c).last?.skipped.length, 1);
    resetReadRiseLibraryCheck(repo);
    rmSync(root, { recursive: true, force: true });
  });

  test("the article code is read from the start of a file", () => {
    assert.equal(articleCodeOf(join(ARTICLES, FILES[0])), JSON.parse(readFileSync(join(ARTICLES, FILES[0]), "utf8")).code);
    const root = rootWith(0, { "x.json": "{\n  \"title\": \"T\",\n  \"code\": \"RR-777\"\n}", "bad.json": "nope" });
    assert.equal(articleCodeOf(join(root, "data", "readrise", "articles", "x.json")), "RR-777", "code not first → the whole file is read");
    assert.equal(articleCodeOf(join(root, "data", "readrise", "articles", "bad.json")), null);
    rmSync(root, { recursive: true, force: true });
  });

  test("a new article (inserts) and a re-import (upserts) store the same content", async () => {
    const { repo } = await demoDatabase();
    const json = JSON.parse(readFileSync(join(ARTICLES, FILES[0]), "utf8"));
    const a = await importArticleJson(repo, null, json, { schoolId: null, publish: true });
    assert.ok(a.ok && a.created);
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const fresh = await articleDetail(repo, admin, a.articleId!);
    assert.equal(fresh.versions.length, 12);
    for (const b of ["LOW", "MID", "HIGH"] as const) { assert.equal(fresh.bands[b].questions.length, 8); assert.ok(fresh.bands[b].keyWords.length > 0); assert.ok(fresh.bands[b].prompt); }
    const again = await importArticleJson(repo, null, json, { schoolId: null, publish: true });
    assert.ok(again.ok && !again.created);
    const strip = (d: typeof fresh) => ({ ...d, versions: d.versions.map((v) => ({ ...v, id: "" })), bands: Object.fromEntries(Object.entries(d.bands).map(([k, b]) => [k, { ...b, questions: b.questions.map((q) => ({ ...q, id: "" })) }])) });
    assert.deepEqual(strip(await articleDetail(repo, admin, a.articleId!)), strip(fresh));
    assert.equal(await repo.count("RRQuestion", { articleId: a.articleId! }), 24);
  });
});

describe("⚡ ReadRise lists reuse the article catalog", () => {
  test("student library and teacher library: the second visit reads no articles or versions; changes are seen at once", async () => {
    const { repo } = await demoDatabase();
    const root = rootWith(6);
    await seedReadRiseLibrary(repo, root, () => undefined);
    rmSync(root, { recursive: true, force: true });
    const user = (await repo.findMany("User", { role: "STUDENT" }, { select: ["id"], take: 1 }))[0];
    const student = await resolveActor(repo, (await repo.findUnique("User", { id: user.id }))!);
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const { repo: c, n } = counting(repo);
    const lib1 = await studentLibrary(c, student, {});
    assert.equal(lib1.all.length, 6);
    n.byModel.clear();
    const lib2 = await studentLibrary(c, student, {});
    assert.deepEqual(lib2, lib1);
    assert.equal(n.byModel.get("findMany:RRVersion") ?? 0, 0, "versions come from the catalog");
    assert.equal(n.byModel.get("findMany:RRArticle") ?? 0, 0, "articles come from the catalog");

    const t1 = await listLibrary(c, admin, {});
    n.byModel.clear();
    assert.deepEqual(await listLibrary(c, admin, {}), t1);
    assert.equal(n.byModel.get("findMany:RRVersion") ?? 0, 0);

    // hiding an article (SchoolSetting) is seen at once
    await setArticleHidden(repo, admin, lib1.all[0].id, true);
    assert.equal((await studentLibrary(c, student, {})).all.length, 5);
    assert.equal((await listLibrary(c, admin, {})).items.find((i) => i.id === lib1.all[0].id)?.hidden, true);
    // a write to the article tables (an import, an unpublish) rebuilds the catalog
    await repo.updateMany("RRArticle", { id: lib1.all[1].id }, { status: "DRAFT" });
    assert.equal((await studentLibrary(c, student, {})).all.length, 4);
  });

  test("answer keys: read once per article, then from memory until a question changes", async () => {
    const { repo } = await demoDatabase();
    const root = rootWith(2);
    await seedReadRiseLibrary(repo, root, () => undefined);
    rmSync(root, { recursive: true, force: true });
    const ids = (await repo.findMany("RRArticle", {}, { select: ["id"] })).map((a) => String(a.id));
    const { repo: c, n } = counting(repo);
    const k1 = await questionKeys(c, ids);
    assert.equal(k1.get(ids[0])?.length, 24);
    n.all = 0;
    await questionKeys(c, ids);
    assert.equal(n.all, 0);
    await repo.updateMany("RRQuestion", { articleId: ids[0], band: "LOW", number: 1 }, { answer: "D" });
    const k2 = await questionKeys(c, ids);
    assert.equal(k2.get(ids[0])!.find((q) => q.band === "LOW" && q.number === 1)?.answer, "D");
  });
});
