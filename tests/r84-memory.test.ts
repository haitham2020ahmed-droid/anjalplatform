/**
 * 🧠 r84 memory (512 MB server; owner-approved): measured on the demo fixtures (in-memory SQLite only — never a real
 * database or real students), each in a child process with a REAL --expose-gc (tests/helpers/r84-memory-child.ts):
 *   - the school's NAFS index is light (ids, codes, flags; shared strings) — heap held, MB;
 *   - opening the NAFS center on a fresh process no longer parses (and keeps) every booklet / practice-set file: the
 *     lists and counts use a light catalog, and "already loaded" is read from the loader's note;
 *   - the MAP pools are light and the Learning Continuum is ONE light copy per subject shared by every grade;
 *   - the big builds (NAFS index, MAP pools, continuum) run one at a time on a fresh server, never longer than a short
 *     wait (a student's next question is never held), and a cached value never waits at all;
 *   - the pages show the same results: lists and counts from the light data, full text loaded for the shown items.
 * Numbers before r84 (same fixture, same child script, commit 10262fd) are in the comments next to each budget.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "./helpers/db";
import { runWithGc } from "./helpers/peak-heap";
import { cacheSizes, clearCaches } from "../src/server/cache/idle";
import { heavyBuild, buildsWaiting } from "../src/server/monitoring/memory";
import { nafsSchool, type NafsSchool } from "./helpers/nafs-school";
import { nafsBankPage, nafsIndex, nafsQuestionView, nafsStandardCounts, usable } from "../src/server/nafs/bank";
import { bookletCatalog, bookletCount, readBooklets } from "../src/server/nafs/booklets";
import { practiceCatalog, practiceCount, readPracticeSets } from "../src/server/nafs/practice-sets";
import { setChoices } from "../src/server/nafs/build";
import { continuumFor, continuumIndex, groupsOf } from "../src/server/map/continuum";
import { groupPools } from "../src/server/map/map-plan";

interface NafsMem { indexMb: number; entries: number; bank: { peakMb: number; heldMb: number; outcome: string }; booklets: { peakMb: number; heldMb: number; outcome: string } }
interface MapMem { poolsMb: number; continuumMb: number; results: { peakMb: number; heldMb: number; outcome: string }; plan: { peakMb: number; heldMb: number; outcome: string } }
const CHILD = join(ROOT, "tests/helpers/r84-memory-child.ts");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("🧠 r84 measured memory (child process, real GC)", () => {
  test("NAFS: the index, and the NAFS center opened on a fresh process", () => {
    const r = runWithGc<NafsMem>(CHILD, ["nafs"]);
    console.log(`NAFS index ${r.entries} entries: ${r.indexMb} MB held (before r84: 1.7 MB) · bank tab: peak ${r.bank.peakMb} MB, held after ${r.bank.heldMb} MB (before: 13.7 / 7.9) · booklets tab: peak ${r.booklets.peakMb} MB, held ${r.booklets.heldMb} MB (before: 14.9 / 5.9)`);
    assert.equal(r.bank.outcome, "ok"); assert.equal(r.booklets.outcome, "ok");
    assert.ok(r.entries > 4000, "the demo bank with the Ministry booklets and practice sets");
    assert.ok(r.indexMb <= 1.4, `NAFS index ${r.indexMb} MB (budget 1.4; before r84 1.7)`);
    assert.ok(r.bank.heldMb <= 3.5, `held after the bank tab ${r.bank.heldMb} MB (budget 3.5; before r84 7.9: the parsed booklet files)`);
    assert.ok(r.bank.peakMb <= 10, `peak of the bank tab ${r.bank.peakMb} MB (budget 10; before r84 13.7)`);
    assert.ok(r.booklets.heldMb <= 3.5, `held after the booklets tab ${r.booklets.heldMb} MB (budget 3.5; before r84 5.9)`);
  });

  test("MAP: the pools and the continuum index, and a MAP results page on a fresh process", () => {
    const r = runWithGc<MapMem>(CHILD, ["map"]);
    console.log(`MAP pools (Grades 4–6): ${r.poolsMb} MB (before r84: 0.5) · continuum indexes (3 grades × 2 subjects): ${r.continuumMb} MB (before: 0.8) · results page: peak ${r.results.peakMb} MB, held ${r.results.heldMb} MB (before: 11.8 / 2.1) · plan tab: peak ${r.plan.peakMb} MB (before: 3.3)`);
    assert.equal(r.results.outcome, "ok"); assert.equal(r.plan.outcome, "ok");
    assert.ok(r.continuumMb <= 0.5, `continuum ${r.continuumMb} MB (budget 0.5; before r84 0.8)`);
    assert.ok(r.poolsMb <= 0.5, `pools ${r.poolsMb} MB (budget 0.5)`);
    assert.ok(r.results.heldMb <= 1.5, `held after the results page ${r.results.heldMb} MB (budget 1.5; before r84 2.1)`);
  });
});

describe("🧠 r84 one big build at a time (fresh server)", () => {
  test("two different builds never run side by side; the second starts right after the first", async () => {
    let active = 0, most = 0;
    const work = (ms: number, v: string) => heavyBuild(async () => { active++; most = Math.max(most, active); await sleep(ms); active--; return v; });
    const [a, b, c] = await Promise.all([work(60, "nafs index"), work(30, "map pools"), work(10, "continuum")]);
    assert.deepEqual([a, b, c], ["nafs index", "map pools", "continuum"]);
    assert.equal(most, 1, "never two at once");
    assert.equal(buildsWaiting(), 0);
  });

  test("a build waits at most a short time behind a slow one (a student's question is never held for long)", async () => {
    const slow = heavyBuild(() => sleep(400).then(() => "slow"));
    const t0 = Date.now();
    const quick = await heavyBuild(async () => "quick", 80);
    assert.equal(quick, "quick");
    assert.ok(Date.now() - t0 < 350, `started after the short wait, not after the slow build (${Date.now() - t0} ms)`);
    assert.equal(await slow, "slow");
  });

  test("a failed build never blocks the next one", async () => {
    await assert.rejects(heavyBuild(async () => { throw new Error("boom"); }));
    assert.equal(await heavyBuild(async () => 7), 7);
  });

  test("the NAFS index, the MAP pools and the continuum go through the lane; a cached value never does", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const read = (f: string) => fs.readFileSync(join(ROOT, f), "utf8");
    assert.match(read("src/server/nafs/bank.ts"), /heavyBuild\(\(\) => buildIndex\(repo, schoolId\)\)/);
    assert.match(read("src/server/map/map-plan.ts"), /POOL_MODELS, \(\) => heavyBuild\(\(\) => loadPools\(repo, schoolId, grade\)\)\)/);
    assert.match(read("src/server/map/continuum.ts"), /heavyBuild\(\(\) => linkSkills\(/);
    assert.match(read("src/server/map/continuum.ts"), /\["LearningStatement"\], \(\) => heavyBuild\(/);
    // the lane is its own (never behind the daily job's runHeavy queue)
    assert.doesNotMatch(read("src/server/monitoring/memory.ts").split("export function heavyBuild")[1] ?? "", /__heavyTail/);
  });
});

let N: NafsSchool;
describe("🧠 r84 the same results from the light data (NAFS)", () => {
  before(async () => { N = await nafsSchool(); N.b.S.m.latency = 0; });

  test("the catalogs give the same counts and titles as the full files, and keep no text", async () => {
    clearCaches();
    const schoolId = N.g6.schoolId!;
    const bc = await bookletCount(N.b.S.repo, schoolId), pc = await practiceCount(N.b.S.repo, schoolId);
    const kept = new Map(cacheSizes().map((c) => [c.name, c.size]));
    assert.equal(kept.get("nafs.booklets") ?? 0, 0, "the full booklet files are not kept by a count");
    assert.equal(kept.get("nafs.practice") ?? 0, 0, "nor the practice sets");
    const fullB = readBooklets(), fullP = readPracticeSets();
    assert.equal(bc.questions, fullB.valid.reduce((a, b) => a + b.questions.length, 0));
    assert.equal(pc.questions, fullP.valid.reduce((a, b) => a + b.questions.length, 0));
    assert.ok(bc.questions > 0 && bc.inBank >= bc.questions, "every booklet question is in the bank");
    const cat = bookletCatalog()!, pcat = practiceCatalog()!;
    assert.deepEqual(cat.list.map((x) => [x.code, x.title, x.kind, x.genre, x.questions]), fullB.valid.map((b) => [b.code, b.title, b.kind, b.genre, b.questions.length]));
    assert.deepEqual(pcat.list.map((x) => [x.code, x.title, x.questions]), fullP.valid.map((b) => [b.code, b.title, b.questions.length]));
    assert.ok(!JSON.stringify(cat).includes(fullB.valid[0].passage.slice(0, 60)), "no passage text in the catalog");
    const choices = await setChoices(N.b.S.repo, N.g6, "BOOKLET");
    assert.ok(choices.length > 0);
    for (const c of choices.slice(0, 10)) {
      const f = fullB.valid.find((b) => b.code === c.code)!;
      assert.equal(c.title, f.title); assert.equal(c.genre, f.genre); assert.equal(c.kind, f.kind === "LITERARY" ? "LIT" : "INFO");
    }
  });

  test("the first visit after a deploy does not read the files when the bank was loaded from them (the loader's note)", async () => {
    clearCaches();
    const { ensureNafsBooklets } = await import("../src/server/nafs/booklets");
    const { ensureNafsPracticeSets } = await import("../src/server/nafs/practice-sets");
    assert.equal(await ensureNafsBooklets(N.b.S.repo, N.g6.schoolId!, N.g6.userId), null);
    assert.equal(await ensureNafsPracticeSets(N.b.S.repo, N.g6.schoolId!, N.g6.userId), null);
    const kept = new Map(cacheSizes().map((c) => [c.name, c.size]));
    assert.equal((kept.get("nafs.booklets") ?? 0) + (kept.get("nafs.booklets.catalog") ?? 0) + (kept.get("nafs.practice") ?? 0) + (kept.get("nafs.practice.catalog") ?? 0), 0, "no file read at all");
  });

  test("lists, counts and opened questions: light index, full text on demand", async () => {
    clearCaches();
    const repo = N.b.S.repo;
    const idx = await nafsIndex(repo, N.g6.schoolId!);
    for (const e of idx.slice(0, 50)) for (const k of Object.keys(e)) assert.ok(!["stem", "options", "passage", "text", "body"].includes(k), `no text field in the index (${k})`);
    const counts = await nafsStandardCounts(repo, N.g6);
    assert.equal(counts.rows.reduce((x, r) => x + r.questions, 0) + counts.notSet, idx.filter(usable).length, "the counts cover every usable question");
    const page = await nafsBankPage(repo, N.g6, { page: 1 });
    assert.equal(page.total, idx.filter((e) => !e.hidden && !e.draft).length);
    assert.equal(page.rows.length, 20);
    for (const r of page.rows) { assert.ok(r.stem.length > 5, "the stem of a shown row is loaded"); if (r.kind === "MCQ") assert.equal(r.options.length, 4); }
    const withPassage = idx.find((e) => usable(e) && e.passageId && e.booklet)!;
    const v = await nafsQuestionView(repo, N.g6, withPassage.id);
    assert.ok(v.q.passage && v.q.passage.text.length > 100, "an opened question has its whole passage");
  });
});

describe("🧠 r84 the same results from the light data (MAP continuum)", () => {
  test("one shared light copy per subject; the Reinforce / Develop / Introduce views are unchanged", async () => {
    const { mapSchool } = await import("./helpers/map-school");
    const M = await mapSchool();
    M.b.S.m.latency = 0;
    const repo = M.b.S.repo, schoolId = M.teacher.schoolId!;
    clearCaches();
    const g4 = await continuumIndex(repo, schoolId, 4, "READING"), g5 = await continuumIndex(repo, schoolId, 5, "READING");
    assert.ok(g4.rows.length > 100);
    assert.equal(g4.rows, g5.rows, "every grade shares the subject's statements");
    for (const k of Object.keys(g4.rows[0])) assert.ok(["id", "ritLow", "ritHigh", "goalArea", "topic", "statement", "standards"].includes(k), `light row: ${k}`);
    // the same views as from the full database rows
    const full = (await repo.findMany("LearningStatement", { subject: "READING" })).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
    const ref = { ...g4, rows: full };
    for (const g of groupsOf("READING")) for (const rit of [175, 201, 222]) {
      const strip = (v: ReturnType<typeof continuumFor>) => JSON.stringify(v);
      assert.equal(strip(continuumFor(g4, g.key, rit)), strip(continuumFor(ref, g.key, rit)), `${g.key} @ ${rit}`);
    }
    const pk = await groupPools(repo, schoolId, 4);
    const all = [...pk.pools.values()].flat();
    assert.ok(all.length > 100);
    for (const k of Object.keys(all[0])) assert.ok(["id", "skillId", "rit"].includes(k), `light pool entry: ${k}`);
  });
});
