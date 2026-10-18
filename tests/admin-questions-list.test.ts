/**
 * 📚 The Questions list on a production-sized bank (14,000 questions): paging, the count, every filter, sort, the
 * banners, every command (publish / unpublish, move to skill, flag, archive, delete, all matching), and the time and
 * memory of one page (target: under 500 ms and 60 MB on the generated SQLite bank).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { listQuestions, publishQuestions } from "../src/server/admin/questions";
import { archiveQuestions, deleteQuestions } from "../src/server/admin/question-delete";
import { PER_PAGE, bankBanners, bankStatusCounts, familiesMatching, familyOptions, flagQuestionsForReview, listBankPage, matchingIds, moveQuestionsToSkill, moveTargets, unpublishQuestions } from "../src/server/admin/questions-list";
import { schoolSkillIndex } from "../src/server/questions/skill-questions";
import { unclassifiedSkillId } from "../src/server/curriculum-map/questions";
import { flagList } from "../src/server/teacher/classroom";
import { demoDatabase } from "./helpers/db";
import { addBigBank } from "./helpers/big-bank";

const s = (v: unknown) => String(v ?? "");
const gc = (globalThis as { gc?: () => void }).gc;

/** time and the highest heap growth while fn runs */
async function measure<T>(fn: () => Promise<T>): Promise<{ ms: number; mb: number; value: T }> {
  gc?.();
  const h0 = process.memoryUsage().heapUsed;
  let peak = h0;
  const iv = setInterval(() => { peak = Math.max(peak, process.memoryUsage().heapUsed); }, 1);
  const t0 = performance.now();
  const value = await fn();
  const ms = performance.now() - t0;
  clearInterval(iv);
  peak = Math.max(peak, process.memoryUsage().heapUsed);
  return { ms, mb: (peak - h0) / 1048576, value };
}

describe("📚 Questions list on a 14,000-question bank", () => {
  let db: DatabaseSync; let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId: string;
  before(async () => {
    ({ db, repo } = await demoDatabase());
    await addBigBank(db, repo, { n: 14_000 });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = s(admin.schoolId);
  });

  test("one page of 50 with the full count; pages, sort and the status counts come from the database", async () => {
    const total = await repo.count("Question", { deletedAt: null });
    const p1 = await listBankPage(repo, admin, { status: "ALL" });
    assert.equal(PER_PAGE, 50);
    assert.equal(p1.rows.length, 50);
    assert.equal(p1.total, total);
    assert.equal(p1.pages, Math.ceil(total / 50));
    const p2 = await listBankPage(repo, admin, { status: "ALL", page: 2 });
    assert.ok(!p2.rows.some((r) => p1.rows.some((x) => x.id === r.id)), "page 2 has other rows");
    assert.ok(p1.rows[0].updatedAt >= p1.rows[49].updatedAt, "newest changes first");
    const easy = await listBankPage(repo, admin, { status: "ALL", sort: "easy" });
    assert.ok(easy.rows.every((r) => r.level === 1));
    const hard = await listBankPage(repo, admin, { status: "ALL", sort: "hard" });
    assert.ok(hard.rows.every((r) => r.level === 7));
    const last = await listBankPage(repo, admin, { status: "ALL", page: 99999 });
    assert.equal(last.page, p1.pages, "a page past the end shows the last page");
    const counts = await bankStatusCounts(repo, admin, {});
    assert.equal(counts.ALL, total);
    assert.equal(counts.PUBLISHED, await repo.count("Question", { status: "PUBLISHED", deletedAt: null }));
  });

  test("filters: skill family (every grade), type, status, level, search; the school's questions only", async () => {
    const idx = await schoolSkillIndex(repo, schoolId);
    const fams = await familyOptions(repo, admin);
    const multi = fams.find((f) => f.grades.length > 1)!;
    const r = await listBankPage(repo, admin, { family: multi.key, status: "ALL", per: 100 });
    assert.ok(r.total > 0);
    const members = new Set(idx.members.get(multi.key));
    assert.ok(r.rows.every((x) => members.has(x.skillId)));
    assert.ok(new Set(r.rows.map((x) => x.grade)).size > 1, "the family's questions of every grade");
    const typed = await listBankPage(repo, admin, { type: "MULTIPLE_CHOICE", status: "DRAFT", level: 3 });
    assert.ok(typed.rows.every((x) => x.type === "MULTIPLE_CHOICE" && x.status === "DRAFT" && x.level === 3));
    assert.equal(typed.total, await repo.count("Question", { status: "DRAFT", difficultyLevel: 3, deletedAt: null }));
    assert.equal((await listBankPage(repo, admin, { type: "NO_SUCH_TYPE" })).total, 0);
    const found = await listBankPage(repo, admin, { q: "Question 12345:", status: "ALL" });
    assert.deepEqual(found.rows.map((x) => x.stem.slice(0, 15)), ["Question 12345:"]);
    const byId = await listBankPage(repo, admin, { q: found.rows[0].id, status: "ALL" });
    assert.deepEqual(byId.rows.map((x) => x.id), [found.rows[0].id], "a question id finds that question");
    assert.ok((await familiesMatching(repo, admin, multi.name.slice(0, 6))).some((f) => f.key === multi.key));
    assert.ok((await moveTargets(repo, admin)).length > 0);
    // another school sees none of them
    const other = { ...admin, schoolId: "another-school" } as Actor;
    assert.equal((await listBankPage(repo, other, {})).total, 0);
  });

  test("speed and memory of one page (target < 500 ms, < 60 MB), before (old list) and after", async () => {
    const cases: [string, Parameters<typeof listBankPage>[2], Parameters<typeof listQuestions>[2]][] = [
      ["first page", { status: "ALL" }, { limit: 100, page: 1 }],
      ["published, page 40", { status: "PUBLISHED", page: 40 }, { status: "PUBLISHED", limit: 100, page: 20 }],
      ["search", { status: "PUBLISHED", q: "river" }, { status: "PUBLISHED", q: "river", limit: 400, page: 1 }],
    ];
    for (const [name, now, old] of cases) {
      const before_ = await measure(() => listQuestions(repo, admin, old));
      const after = await measure(() => Promise.all([listBankPage(repo, admin, now), bankStatusCounts(repo, admin, now), bankBanners(repo, admin), familyOptions(repo, admin)]));
      console.log(`  ${name}: before ${before_.ms.toFixed(0)} ms / ${before_.mb.toFixed(1)} MB · after ${after.ms.toFixed(0)} ms / ${after.mb.toFixed(1)} MB`);
      assert.ok(after.ms < 500, `${name}: ${after.ms} ms`);
      assert.ok(after.mb < 60, `${name}: ${after.mb} MB`);
    }
    // “select all matching” reads ids only
    const all = await measure(() => matchingIds(repo, admin, { status: "ALL" }));
    console.log(`  all matching ids: ${all.ms.toFixed(0)} ms / ${all.mb.toFixed(1)} MB (${all.value.ids.length}, capped ${all.value.capped})`);
    assert.equal(all.value.ids.length, 5000);
    assert.ok(all.value.capped && all.mb < 60);
  });

  test("banners: questions not under a skill, and drafts", async () => {
    const hidden = await unclassifiedSkillId(repo, schoolId, 4);
    const ids = (await listBankPage(repo, admin, { status: "PUBLISHED" })).rows.slice(0, 3).map((r) => r.id);
    await repo.updateMany("Question", { id: { in: ids } }, { skillId: hidden });
    const b = await bankBanners(repo, admin);
    assert.equal(b.unclassified, 3);
    assert.equal(b.drafts, await repo.count("Question", { status: "DRAFT", deletedAt: null }));
    // “Move to skill” sorts them (a reference already used in the target skill gets a suffix)
    const target = (await moveTargets(repo, admin))[0].id;
    const clash = (await repo.findMany("Question", { skillId: target }, { select: ["externalRef"], take: 1 }))[0];
    if (clash) await repo.updateMany("Question", { id: ids[0] }, { externalRef: clash.externalRef });
    assert.deepEqual(await moveQuestionsToSkill(repo, admin, ids, target), { moved: 3 });
    assert.equal((await bankBanners(repo, admin)).unclassified, 0);
    assert.equal(await repo.count("AuditLog", { action: "question.move_skill" }), 3);
    await assert.rejects(moveQuestionsToSkill(repo, admin, ids, "no-such-skill"), /Choose a skill/);
  });

  test("commands: publish / unpublish, flag, archive, delete, and all matching for publishing", async () => {
    const drafts = (await listBankPage(repo, admin, { status: "DRAFT" })).rows.slice(0, 3).map((r) => r.id);
    const pub = await publishQuestions(repo, admin, drafts);
    assert.equal(pub.published.length, 3, JSON.stringify(pub.skipped));
    assert.deepEqual(await unpublishQuestions(repo, admin, [...drafts, (await listBankPage(repo, admin, { status: "DRAFT" })).rows[0].id]), { unpublished: 3, skipped: 1 });
    assert.ok((await repo.findMany("Question", { id: { in: drafts } })).every((q) => q.status === "DRAFT"));
    await assert.rejects(unpublishQuestions(repo, teacher, drafts), /permission|not allowed|cannot|Forbidden/i);
    assert.deepEqual(await flagQuestionsForReview(repo, admin, drafts.slice(0, 2), "Wrong key?"), { flagged: 2 });
    assert.deepEqual(await flagQuestionsForReview(repo, admin, drafts.slice(0, 2), "Again"), { flagged: 2 }, "flagging twice keeps one flag");
    assert.equal(await repo.count("QuestionFlag", { questionId: { in: drafts } }), 2);
    assert.ok((await flagList(repo, admin, "OPEN")).some((f) => f.questionId === drafts[0]));
    assert.equal((await archiveQuestions(repo, admin, [drafts[0]], "test")).archived, 1);
    assert.equal((await deleteQuestions(repo, admin, [drafts[1]])).deleted, 1);
    assert.equal(await repo.findUnique("Question", { id: drafts[1] }), null);
    const pubIds = await matchingIds(repo, admin, { status: "ALL", level: 2, type: "MULTIPLE_CHOICE" }, { statuses: ["DRAFT", "UNDER_REVIEW"] });
    assert.ok(pubIds.ids.length > 0 && !pubIds.capped);
    assert.ok((await repo.findMany("Question", { id: { in: pubIds.ids.slice(0, 500) } }, { select: ["status"] })).every((q) => q.status === "DRAFT" || q.status === "UNDER_REVIEW"));
    assert.deepEqual(await matchingIds(repo, admin, { status: "PUBLISHED" }, { statuses: ["DRAFT"] }), { ids: [], capped: false });
    await assert.rejects(flagQuestionsForReview(repo, admin, Array.from({ length: 101 }, (_, i) => `x${i}`), ""), /at most 100/);
  });

  test("the page: one tab row of the useful pages, banners, 50 per page, no removed controls", () => {
    const tabs = [...readFileSync("src/app/admin/questions/bank-tabs.tsx", "utf8").matchAll(/\{ href: "([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(tabs, ["/admin/questions", "/admin/question-review", "/admin/question-flags", "/admin/item-quality", "/admin/bank-gaps", "/admin/questions/duplicates", "/admin/questions/import", "/admin/questions/load"]);
    const page = readFileSync("src/app/admin/questions/page.tsx", "utf8");
    // r67: drafts and waiting questions are published by “Fix stuck questions” on this page (no second place)
    for (const want of ["questions are not under a skill.", "Sort them", "/admin/questions/unclassified", "<FixStuck ", "listBankPage", "<BankTabs />"]) assert.ok(page.includes(want), want);
    for (const gone of ["MapPlacePicker", "editorOptions", "listQuestions(", "PrintToggle", "view=skills"]) assert.ok(!page.includes(gone), `removed: ${gone}`);
    for (const f of ["question-review", "question-flags", "item-quality", "bank-gaps", "questions/import", "questions/duplicates"]) assert.match(readFileSync(`src/app/admin/${f}/page.tsx`, "utf8"), /<BankTabs \/>/, f);
  });

  test("⚠️ scope check: a question's own text that doesn't look related to its skill is flagged on the list, a real one for that skill is not", async () => {
    const base = (await repo.findMany("Skill", { deletedAt: null }, { take: 1 }))[0]!;
    const { id: _drop, code: _c, name: _n, ...rest } = base;
    void _drop; void _c; void _n;
    const skillId = s((await repo.create("Skill", { ...rest, code: "SCOPE.ap", name: "Active and Passive Voice", isActive: true })).id);
    let type = await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" });
    if (!type) type = await repo.create("QuestionType", { code: "MULTIPLE_CHOICE", name: "multiple choice", isAutoScored: true });
    const now = new Date();
    const onTopic = s((await repo.create("Question", { skillId, typeId: type.id, stem: "The window was broken by Sam.", content: {}, difficultyLevel: 3, irtB: 0, status: "PUBLISHED", createdAt: now, updatedAt: now })).id);
    const offTopic = s((await repo.create("Question", { skillId, typeId: type.id, stem: "Which word correctly completes the sentence? Marcus sat ___ his brother at the game.", content: {}, difficultyLevel: 3, irtB: 0, status: "PUBLISHED", createdAt: now, updatedAt: now })).id);
    const { rows } = await listBankPage(repo, admin, { skillId, status: "PUBLISHED" });
    assert.equal(rows.find((r) => r.id === onTopic)?.scopeFlag, undefined);
    assert.equal(rows.find((r) => r.id === offTopic)?.scopeFlag, true);
  });
});
