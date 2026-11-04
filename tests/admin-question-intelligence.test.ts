/**
 * Admin Question Intelligence (/admin/question-intelligence): src/server/questions/intelligence.ts — DOK and
 * difficulty estimated before student data, duplicates found, and a teacher/admin confirms a skill's automatic
 * metadata. analyzeQuestions()/queueDuplicates() take a schoolId, not a required Actor — background callers with
 * no user in the loop (the nightly job in insights/daily.ts, the post-import analysis in admin/question-import.ts,
 * the fire-and-forget re-analysis in admin/questions.ts) call them with no actor and keep working unchanged.
 * r86: both now also accept an OPTIONAL actor (analyzeQuestions via opts.actor, queueDuplicates as a 4th param) —
 * when passed, it is checked with the same "questions:review" + same-school rule confirmSkillMetadata already
 * enforces. The admin page's actions.ts now passes its actor on every call, so the library function itself also
 * refuses a non-admin/cross-school caller — defense-in-depth below the page's own requireActor gate, not a
 * replacement for it (a caller still reaches the page gate first in normal use).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { analyzeQuestions, confirmSkillMetadata, findDuplicateGroups, queueDuplicates, skillIdsOfSchool } from "../src/server/questions/intelligence";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin Question Intelligence", () => {
  let repo: SqliteRepo; let admin: Actor; let student: Actor; let schoolId: string; let skillId: string; let typeId: string;
  const now = new Date("2026-10-24T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await a("demo.admin");
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
    const type = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    typeId = s(type.id);
    const ids = await skillIdsOfSchool(repo, schoolId);
    skillId = ids[0];
  });

  test("confirmSkillMetadata: students are refused (lack questions:review)", async () => {
    await assert.rejects(confirmSkillMetadata(repo, student, skillId), ForbiddenError);
  });

  test("confirmSkillMetadata: a skill id outside the actor's school is refused", async () => {
    await assert.rejects(confirmSkillMetadata(repo, admin, "not-a-real-skill-id"), ForbiddenError);
  });

  test("analyzeQuestions: fills DOK and a difficulty estimate for unanalysed questions, flags a big disagreement", async () => {
    const q1 = await repo.create("Question", { skillId, typeId, stem: "A brand-new question never analysed.", content: {}, difficultyLevel: 4, irtB: 0, status: "DRAFT", createdAt: now, updatedAt: now });
    // an authored level (7 = hardest) on simple wording: the rule should estimate something much lower → a review suggestion
    const q2 = await repo.create("Question", { skillId, typeId, stem: "The cat sat.", content: {}, difficultyLevel: 7, irtB: 3, status: "DRAFT", createdAt: now, updatedAt: now });
    const r = await analyzeQuestions(repo, schoolId, { questionIds: [s(q1.id), s(q2.id)] }, now);
    assert.equal(r.analysed, 2);
    assert.ok(r.dokFilled >= 2);
    const after1 = (await repo.findUnique("Question", { id: q1.id }))!;
    assert.ok(after1.dok !== null && after1.dok !== undefined, "DOK was filled");
    assert.ok(after1.intelligenceAt, "marked analysed");
    assert.ok(r.suggestions >= 1, "the level-7 simple question disagrees with the estimate and is sent for review");
    const suggestion = (await repo.findMany("AiSuggestion", { schoolId, tool: "INTEL", questionId: q2.id }))[0];
    assert.ok(suggestion, "a review suggestion was filed");
    assert.equal(s(suggestion.status), "SUGGESTED");

    // explicitly-given question ids are always analysed again (an edit/import never re-scans the whole bank to decide);
    // `force` only matters for the whole-bank sweep (no questionIds), where it is the only way to redo analysed questions
    const later = new Date(now.getTime() + 60_000);
    const iso = (v: unknown) => new Date(v as string | Date).toISOString();
    const r2 = await analyzeQuestions(repo, schoolId, { questionIds: [s(q1.id), s(q2.id)] }, later);
    assert.equal(r2.analysed, 2);
    assert.equal(iso((await repo.findUnique("Question", { id: q1.id }))!.intelligenceAt), later.toISOString());

    // the whole-bank sweep (no questionIds) skips an already-analysed question unless forced
    await analyzeQuestions(repo, schoolId, { limit: 10000 }, new Date(now.getTime() + 120_000));
    assert.equal(iso((await repo.findUnique("Question", { id: q1.id }))!.intelligenceAt), later.toISOString(), "untouched without force");
    await analyzeQuestions(repo, schoolId, { limit: 10000, force: true }, new Date(now.getTime() + 180_000));
    assert.notEqual(iso((await repo.findUnique("Question", { id: q1.id }))!.intelligenceAt), later.toISOString(), "force re-analyses it in the sweep too");
  });

  test("analyzeQuestions never overwrites a person's own DOK value", async () => {
    const q = await repo.create("Question", { skillId, typeId, stem: "A teacher-authored question with its own DOK.", content: {}, difficultyLevel: 3, irtB: 0, dok: 4, dokSource: "MANUAL", status: "DRAFT", createdAt: now, updatedAt: now });
    await analyzeQuestions(repo, schoolId, { questionIds: [s(q.id)], force: true }, now);
    const after = (await repo.findUnique("Question", { id: q.id }))!;
    assert.equal(after.dok, 4);
    assert.equal(s(after.dokSource), "MANUAL");
  });

  test("findDuplicateGroups / queueDuplicates: an exact copy is found and queued once (idempotent)", async () => {
    const stem = "What is the main idea of the passage about the river trip?";
    const q1 = await repo.create("Question", { skillId, typeId, stem, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: now, updatedAt: now });
    const q2 = await repo.create("Question", { skillId, typeId, stem, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(now.getTime() + 1000), updatedAt: now });
    const groups = await findDuplicateGroups(repo, schoolId);
    const pair = groups.find((g) => (g.keep === s(q1.id) && g.remove === s(q2.id)) || (g.keep === s(q2.id) && g.remove === s(q1.id)));
    assert.ok(pair, "the exact duplicate pair is found");
    assert.equal(pair!.kind, "EXACT");
    assert.equal(pair!.keep, s(q1.id), "the older question is kept");
    const n = await queueDuplicates(repo, schoolId, now);
    assert.ok(n >= 1);
    const n2 = await queueDuplicates(repo, schoolId, now);
    assert.equal(n2, 0, "the same pair is not queued twice");
  });

  test("r86 fix: analyzeQuestions refuses a student when an actor is passed, but still runs with no actor at all (background callers)", async () => {
    const q = await repo.create("Question", { skillId, typeId, stem: "A question for the actor-gate test.", content: {}, difficultyLevel: 4, irtB: 0, status: "DRAFT", createdAt: now, updatedAt: now });
    await assert.rejects(analyzeQuestions(repo, schoolId, { questionIds: [s(q.id)], actor: student }), ForbiddenError, "a student passed as actor is refused");
    // no actor at all (the nightly job / post-import path): unchanged, still runs
    const r = await analyzeQuestions(repo, schoolId, { questionIds: [s(q.id)] }, now);
    assert.equal(r.analysed, 1);
    // the admin's own actor is accepted
    const r2 = await analyzeQuestions(repo, schoolId, { questionIds: [s(q.id)], actor: admin, force: true }, now);
    assert.equal(r2.analysed, 1);
  });

  test("r86 fix: analyzeQuestions with an actor from a different school is refused even if schoolId matches the call's own argument", async () => {
    const otherSchool = (await repo.findMany("School", { id: { not: schoolId } }))[0];
    if (!otherSchool) return; // only one school seeded in this fixture; nothing to assert
    const otherAdmin = await resolveActor(repo, (await repo.findMany("User", { schoolId: s(otherSchool.id), role: "SCHOOL_ADMIN" }))[0]);
    await assert.rejects(analyzeQuestions(repo, schoolId, { actor: otherAdmin }), ForbiddenError);
  });

  test("r86 fix: queueDuplicates refuses a student when an actor is passed, but still runs with no actor (background callers)", async () => {
    await assert.rejects(queueDuplicates(repo, schoolId, now, student), ForbiddenError);
    const n = await queueDuplicates(repo, schoolId, now); // no actor: unchanged
    assert.ok(n >= 0);
    const n2 = await queueDuplicates(repo, schoolId, now, admin); // admin's own actor: accepted
    assert.equal(n2, 0, "nothing new since the previous sweep already queued everything");
  });
});
