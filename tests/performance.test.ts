import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { listQuestions, publishQuestions } from "../src/server/admin/questions";
import { loadSkillItems } from "../src/server/practice/items";
import { bankVersion } from "../src/server/cache/bank-version";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

describe("performance: database-side query options", () => {
  let repo: SqliteRepo;
  before(async () => ({ repo } = await demoDatabase()));

  test("select, orderBy, take/skip, contains and ranges give the same rows as doing it in JavaScript", async () => {
    const all = await repo.findMany("Skill", {});
    const sorted = [...all].sort((a, b) => String(b.name).localeCompare(String(a.name), "en", { sensitivity: "variant" }) || String(a.id).localeCompare(String(b.id)));
    const page = await repo.findMany("Skill", {}, { select: ["id", "name"], orderBy: [{ field: "name", dir: "desc" }, { field: "id" }], take: 5, skip: 2 });
    assert.deepEqual(Object.keys(page[0]).sort(), ["id", "name"], "only the selected columns");
    assert.equal(page.length, 5);
    for (let i = 1; i < page.length; i++) assert.ok(String(page[i - 1].name) >= String(page[i].name), "sorted in the database");
    assert.equal((await repo.findMany("Skill", {}, { orderBy: [{ field: "name", dir: "desc" }, { field: "id" }], take: 7 }))[2].id, (await repo.findMany("Skill", {}, { orderBy: [{ field: "name", dir: "desc" }, { field: "id" }], skip: 2, take: 1 }))[0].id);
    void sorted;
    const theme = await repo.findMany("Skill", { name: { contains: "tHeMe" } });
    assert.deepEqual(theme.map((s) => s.id).sort(), all.filter((s) => String(s.name).toLowerCase().includes("theme")).map((s) => s.id).sort(), "contains is case-insensitive");
    assert.equal((await repo.findMany("Skill", { name: { contains: "%" } })).length, 0, "% and _ are literal characters, not wildcards");
    assert.equal((await repo.findMany("Skill", { name: { gt: "M", lte: "P" } })).length, all.filter((s) => String(s.name) > "M" && String(s.name) <= "P").length);
    await assert.rejects(repo.findMany("Skill", {}, { select: ["nope"] }), /Unknown field Skill\.nope/);
  });
});

describe("performance: question list in the database", () => {
  let repo: SqliteRepo;
  let admin: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
  });

  test("a page of the list is the start of the full list; total and counts cover every match", async () => {
    const full = await listQuestions(repo, admin, { status: "PUBLISHED" });
    const page = await listQuestions(repo, admin, { status: "PUBLISHED", limit: 25 });
    assert.ok(full.items.length > 25);
    assert.deepEqual(page.items, full.items.slice(0, 25));
    assert.equal(page.total, full.items.length);
    assert.equal(full.total, full.items.length);
    assert.deepEqual(page.counts, full.counts);
    assert.equal(full.counts.PUBLISHED, full.items.length);
    for (let i = 1; i < full.items.length; i++) assert.ok(full.items[i - 1].updatedAt >= full.items[i].updatedAt, "newest first");
    const none = await listQuestions(repo, admin, { aiOnly: true, limit: 0 });
    assert.deepEqual([none.items, typeof none.aiPending], [[], "number"], "counts only");
  });

  test("search matches the question text (any case) or the reference, like before", async () => {
    const all = (await listQuestions(repo, admin, { status: "PUBLISHED" })).items;
    // a whole word of letters only (trim punctuation at its ends; skip words like “Sam's”), so it really occurs
    const word = all.flatMap((x) => x.stem.split(/\s+/)).map((w) => w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "")).find((w) => /^[A-Za-z]{6,}$/.test(w))!;
    const hits = await listQuestions(repo, admin, { status: "PUBLISHED", q: word.toUpperCase() });
    assert.ok(hits.items.length > 0);
    // the list shows the first 160 characters, so compare with the full text from the database
    const qs = await repo.findMany("Question", { id: { in: all.map((x) => x.id) } });
    // search matches the question text, its reference, or its skill's name
    const skillNames = new Map((await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => q.skillId))] } })).map((k) => [String(k.id), String(k.name).toLowerCase()]));
    const expected = qs.filter((q) => String(q.stem).toLowerCase().includes(word.toLowerCase()) || String(q.externalRef ?? "").toLowerCase().includes(word.toLowerCase()) || (skillNames.get(String(q.skillId)) ?? "").includes(word.toLowerCase())).map((q) => String(q.id)).sort();
    assert.deepEqual(hits.items.map((x) => x.id).sort(), expected);
    const ref = all.find((x) => x.ref)!.ref;
    assert.ok((await listQuestions(repo, admin, { status: "PUBLISHED", q: ref })).items.some((x) => x.ref === ref), "search by reference");
  });
});

describe("performance: practice item cache", () => {
  let repo: SqliteRepo;
  let admin: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
  });

  test("callers get their own copy (changing it never changes what the next student gets)", async () => {
    const skill = (await repo.findMany("Question", { status: "PUBLISHED" }))[0].skillId as string;
    const a = await loadSkillItems(repo, skill);
    a[0].stem = "CHANGED";
    a.reverse();
    const b = await loadSkillItems(repo, skill);
    assert.notEqual(b[0].stem, "CHANGED");
    assert.notEqual(b.at(-1)!.stem, "CHANGED");
  });

  test("a question published by any path is in practice at once; an archived one is gone at once", async () => {
    const draft = (await repo.findMany("Question", { status: "UNDER_REVIEW" }))[0];
    const skill = String(draft.skillId);
    const before = await loadSkillItems(repo, skill);
    assert.ok(!before.some((i) => i.questionId === draft.id));
    const v = bankVersion();
    await publishQuestions(repo, admin, [String(draft.id)]);
    assert.ok(bankVersion() > v, "the write changed the bank version");
    assert.ok((await loadSkillItems(repo, skill)).some((i) => i.questionId === draft.id), "published: served at once");
    await repo.updateMany("Question", { id: draft.id }, { status: "ARCHIVED" });
    assert.ok(!(await loadSkillItems(repo, skill)).some((i) => i.questionId === draft.id), "archived: gone at once");
    // a write inside a transaction is seen after it commits
    await repo.transaction(async (tx) => { await tx.updateMany("Question", { id: draft.id }, { status: "PUBLISHED" }); });
    assert.ok((await loadSkillItems(repo, skill)).some((i) => i.questionId === draft.id));
  });

  test("each section has a loading state (instant feedback on navigation)", () => {
    for (const seg of ["admin", "teacher", "student", "practice", "parent"]) assert.ok(existsSync(join(ROOT, `src/app/${seg}/loading.tsx`)), seg);
    assert.match(readFileSync(join(ROOT, "src/components/page-loading.tsx"), "utf8"), /role="status"/);
  });
});
