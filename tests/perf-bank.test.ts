/**
 * ⚡ Fast with a big bank (8,000+ loaded questions): the Load page's chunks use a fraction of the database calls with
 * the same result, counts are done by the database (GROUP BY), the shared lists are cached until their tables change,
 * and a broken ReadRise file no longer re-imports the whole library on every visit.
 * Demo school in memory (never a real database); small pack files made from the real ones in a temp folder.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Repo } from "../src/server/seeding/repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { countGroups } from "../src/server/db/group-count";
import { ReadCacheRepo } from "../src/server/db/read-cache-repo";
import { loadMapSetsFile } from "../src/server/questions/map-sets";
import { loadSkillSetsFile } from "../src/server/questions/skill-sets";
import { countPack, packOf, runPackChunk, usePackDir } from "../src/server/questions/load-packs";
import { countQuestionsOfSkills, schoolSkillIndex } from "../src/server/questions/skill-questions";
import { mapLinkedQuestionIds } from "../src/server/questions/bank-scope";
import { masterSkills } from "../src/server/skills/master";
import { partsWithQuestions } from "../src/server/curriculum-map/plans";
import { attachmentNodes } from "../src/server/curriculum-map/questions";
import { createDraft } from "../src/server/admin/questions";
import { loadQuestionItems } from "../src/server/practice/items";
import { ensureReadRiseLibrary } from "../src/server/readrise/seed";
import { contentKeysForIds, seenIndex, seenIndexAny } from "../src/server/questions/fresh";

const s = (v: unknown) => String(v ?? "");

/** counts every database call (also inside transactions) */
function counting(repo: Repo) {
  const n = { all: 0 };
  const wrap = (r: Repo): Repo => new Proxy(r, {
    get(t, k) {
      const v = (t as unknown as Record<string | symbol, unknown>)[k];
      if (typeof v !== "function") return v;
      if (k === "transaction") return (fn: (x: Repo) => Promise<unknown>) => (v as Repo["transaction"]).call(t, (x: Repo) => fn(wrap(x)));
      return (...a: unknown[]) => { n.all++; return (v as (...b: unknown[]) => unknown).apply(t, a); };
    },
  });
  return { repo: wrap(repo), n };
}

describe("⚡ performance with a big question bank", () => {
  let repo: SqliteRepo; let admin: Actor; let schoolId = ""; let dir = "";
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = admin.schoolId!;
    dir = mkdtempSync(join(tmpdir(), "perf-packs-"));
    const gap = (await loadSkillSetsFile("gap-skill-sets.json")).slice(0, 2).map((x) => ({ ...x, questions: x.questions.slice(0, 6) }));
    writeFileSync(join(dir, "gap-skill-sets.json"), JSON.stringify({ sets: gap }));
    const nodes = (await loadMapSetsFile()).slice(0, 2).map((n) => ({ ...n, questions: n.questions.slice(0, 6) }));
    writeFileSync(join(dir, "map-vocab-review-sets.json"), JSON.stringify({ nodes }));
    usePackDir(dir);
  });
  after(() => { usePackDir(null); rmSync(dir, { recursive: true, force: true }); });

  test("countGroups: one GROUP BY (SQLite / Prisma), the same numbers as counting rows; a repo without it still works", async () => {
    const where = { deletedAt: null };
    for (const by of ["skillId", "difficultyLevel", "typeId"]) {
      const rows = await repo.findMany("Question", where, { select: [by] });
      const manual = new Map<string, number>();
      for (const r of rows) manual.set(s(r[by]), (manual.get(s(r[by])) ?? 0) + 1);
      const grouped = await countGroups(repo, "Question", by, where);
      assert.deepEqual([...grouped].sort(), [...manual].sort(), by);
      const plain = { findMany: repo.findMany.bind(repo) } as unknown as Repo;
      assert.deepEqual([...(await countGroups(plain, "Question", by, where))].sort(), [...manual].sort(), "fallback: reads the column only");
    }
    assert.ok((await countGroups(repo, "Question", "difficultyLevel", where)).size > 1);
  });

  test("read cache: one read per distinct query of reference rows, copies only, dropped on a write or a failed transaction", async () => {
    const { repo: c, n } = counting(repo);
    const rc = new ReadCacheRepo(c);
    const g1 = await rc.findMany("Grade", { schoolId }, { select: ["id", "level"] });
    const g2 = await rc.findMany("Grade", { schoolId }, { select: ["id", "level"] });
    assert.deepEqual(g1, g2);
    assert.equal(n.all, 1, "the second read came from the cache");
    g1.sort((a, b) => Number(b.level) - Number(a.level)); g1[0].level = 99;
    assert.equal((await rc.findMany("Grade", { schoolId }, { select: ["id", "level"] })).find((g) => g.level === 99), undefined, "a caller changing its rows never changes the cache");
    await rc.findMany("Question", { status: "PUBLISHED" }, { select: ["id"], take: 1 });
    await rc.findMany("Question", { status: "PUBLISHED" }, { select: ["id"], take: 1 });
    assert.equal(n.all, 3, "question rows are never cached");
    const sk = (await rc.findMany("Skill", { deletedAt: null }, { select: ["id", "name"], take: 1 }))[0];
    await rc.updateMany("Skill", { id: sk.id }, { name: `${s(sk.name)} ` });
    const again = (await rc.findMany("Skill", { deletedAt: null }, { select: ["id", "name"], take: 1 }))[0];
    assert.equal(again.name, `${s(sk.name)} `, "a write drops the model's cached reads");
    await rc.updateMany("Skill", { id: sk.id }, { name: s(sk.name) });
    await assert.rejects(() => rc.transaction(async (tx) => { await tx.findMany("Grade", { schoolId }); throw new Error("boom"); }), /boom/);
    const before = n.all;
    await rc.findMany("Grade", { schoolId }, { select: ["id", "level"] });
    assert.equal(n.all, before + 1, "a failed transaction drops the cache");
  });

  test("bank counts by GROUP BY: the same as counting each question, Curriculum Map questions left out", async () => {
    // put the map in place and link one published bank question of a skill to a map place
    const { parseCurriculumMap } = await import("../src/server/curriculum-map/source");
    const { seedCurriculumMap } = await import("../src/server/curriculum-map/seed");
    const { clearMapCache } = await import("../src/server/curriculum-map/questions");
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId });
    clearMapCache();
    const idx = await schoolSkillIndex(repo, schoolId);
    const ids = [...idx.ids];
    const before = await countQuestionsOfSkills(repo, schoolId, ids, { own: true });
    const [skillId, n] = [...before].sort((a, b) => b[1] - a[1])[0];
    assert.ok(n > 2);
    const q = (await repo.findMany("Question", { skillId, status: "PUBLISHED", deletedAt: null }, { select: ["id"], take: 1 }))[0];
    const node = (await attachmentNodes(repo, schoolId))[0];
    await repo.create("QuestionMapLink", { questionId: q.id, nodeId: node.id, createdAt: new Date() });
    const after = await countQuestionsOfSkills(repo, schoolId, ids, { own: true });
    assert.equal(after.get(skillId), n - 1, "a Curriculum Map question is not a bank question");
    // the same as counting question by question
    const onMap = await mapLinkedQuestionIds(repo);
    for (const id of ids.slice(0, 40)) {
      const rows = await repo.findMany("Question", { skillId: id, status: "PUBLISHED", deletedAt: null }, { select: ["id"] });
      assert.equal(after.get(id) ?? 0, rows.filter((r) => !onMap.has(s(r.id))).length, `skill ${id}`);
    }
    const lvl = await countQuestionsOfSkills(repo, schoolId, ids, { own: true, level: "ON" });
    const onRows = await repo.findMany("Question", { skillId, status: "PUBLISHED", deletedAt: null, difficultyLevel: 4 }, { select: ["id"] });
    assert.equal(lvl.get(skillId) ?? 0, onRows.filter((r) => !onMap.has(s(r.id))).length, "a level narrows it the same way");
  });

  test("the master skills list is kept until its tables change (a new question changes the count)", async () => {
    const { repo: c, n } = counting(repo);
    const first = await masterSkills(c, schoolId);
    const calls = n.all;
    const second = await masterSkills(c, schoolId);
    assert.equal(n.all, calls, "the second read costs no query");
    assert.deepEqual(second, first);
    second[0].name = "changed";
    assert.notEqual((await masterSkills(c, schoolId))[0].name, "changed", "callers get their own copy");
    const k = first.find((x) => x.grade === 4 && x.questions > 0)!;
    const id = await createDraft(repo, admin, { skillId: k.id, type: "MULTIPLE_CHOICE", stem: "Which word means very small?", level: 4, whyCorrect: "Tiny means very small.",
      options: [{ label: "A", text: "huge", correct: false, rationale: "Huge means very big." }, { label: "B", text: "tiny", correct: true, rationale: null }, { label: "C", text: "loud", correct: false, rationale: "Loud is about sound." }] } as never);
    await repo.updateMany("Question", { id }, { status: "PUBLISHED" });
    const third = await masterSkills(c, schoolId);
    assert.equal(third.find((x) => x.id === k.id)!.questions, k.questions + 1);
    // the options / answers / explanation written in one insert per table: same item as before
    const [it] = await loadQuestionItems(repo, [id]);
    assert.deepEqual(it.options!.map((o) => [o.label, o.text, o.correct]), [["A", "huge", false], ["B", "tiny", true], ["C", "loud", false]]);
    assert.equal(it.explanation.whyCorrect, "Tiny means very small.");
  });

  test("Load new questions: a chunk costs a fraction of the calls, every question is published and analysed, a second run is quick and adds nothing", async () => {
    const { repo: c, n } = counting(repo);
    let added = 0;
    for (const key of ["gap", "map"] as const) {
      const def = packOf(key)!;
      let from = 0;
      for (;;) { const w = await runPackChunk(c, schoolId, def, from); added += w.added; assert.deepEqual(w.errors, []); if (w.next >= w.total) break; from = w.next; }
    }
    assert.equal(added, 2 * 6 + 2 * 6);
    // skills created by the gap pack cost their own calls; the questions themselves ~15–35 calls each (was ~90)
    assert.ok(n.all / added < 35, `${(n.all / added).toFixed(1)} database calls per added question`);
    const made = await repo.findMany("Question", { status: "PUBLISHED", intelligenceAt: { not: null }, deletedAt: null }, { select: ["id"] });
    const fresh = await repo.findMany("Question", { origin: "TEACHER_AUTHORED", deletedAt: null }, { select: ["id", "status", "intelligenceAt"] });
    assert.ok(fresh.length >= added && fresh.every((q) => q.status === "PUBLISHED" && q.intelligenceAt), "published and analysed");
    assert.ok(made.length >= added);
    const before = n.all, count = await repo.count("Question", {});
    for (const key of ["gap", "map"] as const) {
      const def = packOf(key)!;
      let from = 0;
      for (;;) { const w = await runPackChunk(c, schoolId, def, from); assert.equal(w.added, 0); if (w.next >= w.total) break; from = w.next; }
    }
    assert.equal(await repo.count("Question", {}), count, "nothing added twice");
    assert.ok(n.all - before < 80, `skipping is quick: ${n.all - before} calls`);
    const pc = await countPack(repo, schoolId, packOf("gap")!);
    assert.equal(pc!.inBank, 12); assert.equal(pc!.left, 0);
  });

  test("a student's map: the places with questions are kept until a question changes; a hidden question is seen at once", async () => {
    const nodes = await attachmentNodes(repo, schoolId);
    const links = await repo.findMany("QuestionMapLink", {}, { select: ["questionId", "nodeId"] });
    const node = nodes.find((x) => links.some((l) => s(l.nodeId) === x.id) && x.grade)!;
    const parts = await partsWithQuestions(repo, schoolId, node.grade);
    assert.ok(parts.has(node.code));
    const { repo: c, n } = counting(repo);
    await partsWithQuestions(c, schoolId, node.grade);
    const calls = n.all;
    assert.deepEqual([...(await partsWithQuestions(c, schoolId, node.grade))].sort(), [...parts].sort());
    assert.equal(n.all, calls, "cached");
    // never deleted: the place's questions are hidden (archived)
    const ids = links.filter((l) => s(l.nodeId) === node.id).map((l) => s(l.questionId));
    await repo.updateMany("Question", { id: { in: ids } }, { status: "ARCHIVED" });
    assert.equal((await partsWithQuestions(repo, schoolId, node.grade)).has(node.code), false);
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
  });

  test("ReadRise: a broken article file is retried at most every 10 minutes, not on every page view", async () => {
    const root = mkdtempSync(join(tmpdir(), "rr-root-"));
    mkdirSync(join(root, "data", "readrise", "articles"), { recursive: true });
    writeFileSync(join(root, "data", "readrise", "articles", "broken.json"), "{ not json");
    const { repo: c, n } = counting(repo);
    const first = await ensureReadRiseLibrary(c, root);
    assert.equal(first?.skipped.length, 1);
    const calls = n.all;
    assert.equal(await ensureReadRiseLibrary(c, root), null);
    assert.equal(n.all, calls, "the next visit costs nothing");
    rmSync(root, { recursive: true, force: true });
  });

  test("a plan's students: one seen-index for the group = the latest of each student's own", async () => {
    const qs = await repo.findMany("Question", { deletedAt: null }, { select: ["id", "skillId"], take: 12, orderBy: [{ field: "id" }] });
    const keys = await contentKeysForIds(repo, qs.map((q) => s(q.id)));
    const pool = qs.map((q) => ({ id: s(q.id), keys: keys.get(s(q.id)) ?? [] }));
    const kids = (await repo.findMany("Student", {}, { select: ["id"], take: 3 })).map((x) => s(x.id));
    const day = (d: number) => new Date(Date.UTC(2026, 8, d));
    for (const [i, sid] of kids.entries()) {
      const ses = await repo.create("PracticeSession", { studentId: sid, skillId: null, mode: "ADAPTIVE_PRACTICE", startedAt: day(1) });
      for (const [j, q] of qs.entries()) if ((i + j) % 3 === 0) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: sid, questionId: q.id, skillId: q.skillId, response: {}, isCorrect: true, responseMs: 9000, difficultyB: 0, createdAt: day(2 + i + j) });
    }
    const each = await Promise.all(kids.map((sid) => seenIndex(repo, sid, pool)));
    const any = await seenIndexAny(repo, kids, pool);
    let seenSome = 0;
    for (const p of pool) {
      const want = Math.max(0, ...each.map((x) => x.lastSeen(p.id, p.keys)));
      assert.equal(any.lastSeen(p.id, p.keys), want, p.id);
      if (want) seenSome++;
    }
    assert.ok(seenSome > 3);
    assert.equal((await seenIndexAny(repo, [], pool)).lastSeen(pool[0].id), 0);
  });

  test("schema: the per-skill index for the bank's pools and counts", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    assert.match(schema, /@@index\(\[skillId, deletedAt, status, difficultyLevel\]\)/);
  });
});
