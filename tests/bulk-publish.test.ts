import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { loadSkillItems } from "../src/server/practice/items";
import { archivableIds, publishableIds, publishQuestions, reviewQuestion, reviseQuestion, submitForReview } from "../src/server/admin/questions";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

describe("bulk publishing", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor;
  const status = async (id: string) => String((await repo.findUnique("Question", { id }))!.status);

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    // a realistic mix to work with: most of the Grade 4 bank back under review, some drafts
    const all = await repo.findMany("Question", {});
    for (const [i, q] of all.entries()) await repo.updateMany("Question", { id: q.id }, { status: i % 5 === 0 ? "PUBLISHED" : i % 3 === 0 ? "DRAFT" : "UNDER_REVIEW" });
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
  });

  test("publishes drafts and questions under review directly; never archived or published ones", async () => {
    const qs = await repo.findMany("Question", {});
    const [draft, review, archived, published] = qs.slice(0, 4).map((q) => String(q.id));
    await repo.updateMany("Question", { id: draft }, { status: "DRAFT" });
    await repo.updateMany("Question", { id: review }, { status: "UNDER_REVIEW" });
    await repo.updateMany("Question", { id: archived }, { status: "ARCHIVED" });
    await repo.updateMany("Question", { id: published }, { status: "PUBLISHED" });
    const r = await publishQuestions(repo, admin, [draft, review, archived, published]);
    assert.deepEqual(r.published.sort(), [draft, review].sort());
    assert.deepEqual(r.skipped.map((s) => s.reason).sort(), ["already published", "archived questions are never published"]);
    assert.equal(await status(draft), "PUBLISHED");
    assert.equal(await status(review), "PUBLISHED");
    assert.equal(await status(archived), "ARCHIVED");
    const skill = String((await repo.findUnique("Question", { id: draft }))!.skillId);
    assert.ok((await loadSkillItems(repo, skill)).some((i) => i.questionId === draft), "published questions reach the practice engine");
    const log = (await repo.findMany("AuditLog", { action: "question.publish", entityId: draft }))[0];
    assert.match(JSON.stringify(log.after), /"bulk":true/);
  });

  test("a question that fails validation is reported, not published; the rest still publish", async () => {
    const [bad, good] = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).slice(0, 2).map((q) => String(q.id));
    await repo.updateMany("Question", { id: bad }, { status: "DRAFT" });
    await repo.deleteMany("QuestionExplanation", { questionId: bad });
    const r = await publishQuestions(repo, admin, [bad, good]);
    assert.deepEqual(r.published, [good]);
    assert.equal(r.skipped[0].id, bad);
    assert.match(r.skipped[0].reason, /explanation/i);
    assert.equal(await status(bad), "DRAFT");
  });

  test("a published revision archives the version it replaces (same rule as single publishing)", async () => {
    const original = String((await repo.findMany("Question", { status: "PUBLISHED" }))[0].id);
    const revision = await reviseQuestion(repo, admin, original);
    const r = await publishQuestions(repo, admin, [revision]);
    assert.deepEqual(r.published, [revision]);
    assert.equal(await status(original), "ARCHIVED");
  });

  test("Publish All covers exactly the publishable questions matching the filters", async () => {
    const ids = await publishableIds(repo, admin, { status: "UNDER_REVIEW", gradeLevel: 4 });
    const qs = await repo.findMany("Question", { id: { in: ids } });
    assert.ok(ids.length > 0);
    assert.ok(qs.every((q) => q.status === "UNDER_REVIEW"));
    const all = await publishableIds(repo, admin, {});
    assert.ok(all.length >= ids.length);
    const statuses = (await repo.findMany("Question", { id: { in: all } })).map((q) => q.status);
    assert.ok(statuses.every((s) => s === "DRAFT" || s === "UNDER_REVIEW"), "never archived or published");
  });

  test("Archive All covers every non-archived question matching the filters (e.g. one question type)", async () => {
    const ids = await archivableIds(repo, admin, { gradeLevel: 4, status: "PUBLISHED" });
    assert.ok(ids.length > 0);
    const qs = await repo.findMany("Question", { id: { in: ids } });
    assert.ok(qs.every((q) => q.status === "PUBLISHED"));
    const mc = await archivableIds(repo, admin, { gradeLevel: 4, status: "PUBLISHED", typeCode: "MULTIPLE_CHOICE" });
    const types = new Map((await repo.findMany("QuestionType", {})).map((x) => [String(x.id), String(x.code)]));
    assert.ok(mc.length > 0 && (await repo.findMany("Question", { id: { in: mc } })).every((q) => types.get(String(q.typeId)) === "MULTIPLE_CHOICE"), "only the chosen type");
    await assert.rejects(archivableIds(repo, teacher, {}), ForbiddenError);
  });

  test("only staff with publishing permission; batches are limited; other schools' questions are not found", async () => {
    const id = String((await repo.findMany("Question", { status: "UNDER_REVIEW" }))[0].id);
    await assert.rejects(publishQuestions(repo, teacher, [id]), ForbiddenError);
    await assert.rejects(publishableIds(repo, teacher, {}), ForbiddenError);
    await assert.rejects(publishQuestions(repo, admin, Array.from({ length: 101 }, (_, i) => `x${i}`)), ValidationError);
    const outsider = { ...admin, schoolId: "another-school" } as Actor;
    const r = await publishQuestions(repo, outsider, [id]);
    assert.deepEqual([r.published, r.skipped[0].reason], [[], "not found"]);
    assert.equal(await status(id), "UNDER_REVIEW");
  });

  test("single-question publishing is unchanged (review approval still requires UNDER_REVIEW)", async () => {
    const id = String((await repo.findMany("Question", { status: "UNDER_REVIEW" }))[0].id);
    await reviewQuestion(repo, admin, id, "approve", null);
    assert.equal(await status(id), "PUBLISHED");
    const draft = String((await repo.findMany("Question", { status: "DRAFT" }))[0]?.id ?? "");
    if (draft) await assert.rejects(reviewQuestion(repo, admin, draft, "approve", null), /Only questions under review/);
    void submitForReview;
  });
});
