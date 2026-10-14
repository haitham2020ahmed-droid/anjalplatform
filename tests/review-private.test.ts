/**
 * ✏️ A teacher's edited question copy (Review test → Edit, src/server/tests/review.ts) is PRIVATE to that teacher:
 * not in the shared bank lists, not picked by other teachers' builders / practice / adaptive / MAP / NAFS pools, not
 * counted in bank totals; visible and reusable only by its creator; the admin sees every copy under "Teacher copies".
 * Copies made before the rule become private too. Nothing is ever deleted.
 * Demo school in memory — never a real database or real student data.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { bankSearch, editQuestionCopy } from "../src/server/tests/review";
import { assignTest } from "../src/server/tests/assessments";
import { questionsOfSkill } from "../src/server/tests/question-source";
import { loadItemsForSkills, loadQuestionItems, loadSkillItems } from "../src/server/practice/items";
import { groupPools } from "../src/server/map/map-plan";
import { nafsIndex } from "../src/server/nafs/bank";
import { bankStatusCounts, listBankPage } from "../src/server/admin/questions-list";
import { privatizeOldCopies, sharedBankWhere } from "../src/server/questions/private-copies";
import { startPractice } from "../src/server/practice/session";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");

describe("✏️ teacher copies are private", () => {
  let repo: SqliteRepo; let A: Actor; let B: Actor; let admin: Actor; let student: Actor;
  let original: string; let skillId: string; let copyId: string; let classA: string;
  let shared0: number; let total0: number;

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 2 }));
    await publishGrade4Bank(repo);
    const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    A = await actor("demo.teacher.4a"); B = await actor("demo.teacher.4b"); admin = await actor("demo.admin");
    const tA = (await repo.findUnique("Teacher", { userId: A.userId }))!;
    classA = s((await repo.findMany("ClassTeacher", { teacherId: tA.id }))[0].classId);
    const m = (await repo.findMany("ClassMembership", { classId: classA, leftAt: null }))[0];
    const st = (await repo.findUnique("Student", { id: m.studentId }))!;
    student = await resolveActor(repo, (await repo.findUnique("User", { id: st.userId }))!);
    // a published multiple-choice question of a Grade 4 skill the teachers can practise
    const mc = (await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" }))!;
    const q = (await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null, typeId: mc.id, passageId: null }, { select: ["id", "skillId", "externalRef"], take: 400 })).find((x) => s(x.externalRef).startsWith("G4-"))!;
    original = s(q.id); skillId = s(q.skillId);
    shared0 = await repo.count("Question", {});
    total0 = shared0 + await repo.count("Question", { privateToId: { not: null } });
  });

  test("the repo's rule: a shared-bank read gets privateToId: null; reads by id and reads naming the owner do not", () => {
    assert.deepEqual(sharedBankWhere("Question", { skillId: "k" }), { skillId: "k", privateToId: null });
    assert.deepEqual(sharedBankWhere("Question", undefined), { privateToId: null });
    assert.deepEqual(sharedBankWhere("Question", { id: "q1" }), { id: "q1" });
    assert.deepEqual(sharedBankWhere("Question", { id: { in: ["q1"] } }), { id: { in: ["q1"] } });
    assert.deepEqual(sharedBankWhere("Question", { id: { notIn: ["q1"] } }), { id: { notIn: ["q1"] }, privateToId: null }, "excluding ids is still a bank read");
    assert.deepEqual(sharedBankWhere("Question", { privateToId: "u1" }), { privateToId: "u1" });
    assert.deepEqual(sharedBankWhere("Skill", { id: { not: "x" } }), { id: { not: "x" } }, "other tables untouched");
  });

  test("A edits a question: a private copy of A; the original is untouched; nothing deleted", async () => {
    const opts = (await repo.findMany("QuestionOption", { questionId: original })).sort((x, y) => Number(x.order) - Number(y.order));
    const before = (await repo.findUnique("Question", { id: original }))!;
    const row = await editQuestionCopy(repo, A, { questionId: original, stem: `${s(before.stem)} (my version)`, options: opts.map((o) => ({ label: s(o.label), text: s(o.text), correct: Boolean(o.isCorrect) })) });
    copyId = row.id;
    const c = (await repo.findUnique("Question", { id: copyId }))!;
    assert.equal(s(c.privateToId), A.userId);
    assert.equal(s(c.status), "PUBLISHED");
    assert.equal(s((await repo.findUnique("Question", { id: original }))!.stem), s(before.stem));
    assert.equal(await repo.count("Question", {}), shared0, "the shared bank total does not change");
    assert.equal(await repo.count("Question", {}) + await repo.count("Question", { privateToId: { not: null } }), total0 + 1, "one more question in the table, none deleted");
    // a copy of the copy keeps pointing at the shared original
    const again = await editQuestionCopy(repo, A, { questionId: copyId, stem: `${s(before.stem)} (v2)` });
    const tg = (await repo.findUnique("Question", { id: again.id }))!.tags;
    const t2 = (typeof tg === "string" ? JSON.parse(tg) : tg) as { teacherCopyOf?: string };
    assert.equal(t2.teacherCopyOf, original);
    assert.equal(s((await repo.findUnique("Question", { id: again.id }))!.privateToId), A.userId);
  });

  test("not in the shared lists or totals; the admin sees every copy under Teacher copies, A sees only A's", async () => {
    const f = { status: "ALL" as const, skillId, sort: "new" as const, page: 1, per: 100 };
    const shared = await listBankPage(repo, admin, f);
    assert.ok(!shared.rows.some((r) => r.id === copyId));
    assert.ok(shared.rows.some((r) => r.id === original));
    const counts = await bankStatusCounts(repo, admin, f);
    assert.equal(counts.ALL, shared.total, "bank totals count the shared questions only");
    // searching by the copy's id from the shared list finds nothing
    assert.equal((await listBankPage(repo, B, { status: "ALL", q: copyId })).total, 0);
    const adminCopies = await listBankPage(repo, admin, { status: "ALL", source: "COPIES" });
    assert.ok(adminCopies.rows.some((r) => r.id === copyId));
    const aCopies = await listBankPage(repo, A, { status: "ALL", source: "COPIES" });
    assert.ok(aCopies.rows.some((r) => r.id === copyId));
    assert.equal((await listBankPage(repo, B, { status: "ALL", source: "COPIES" })).total, 0, "B has no copies and never sees A's");
  });

  test("other teachers' builders, practice, adaptive, MAP and NAFS pools never pick it", async () => {
    const bsB = await bankSearch(repo, B, { skillId });
    assert.ok(!bsB.rows.some((r) => r.id === copyId));
    assert.ok((await questionsOfSkill(repo, s(B.schoolId), skillId)).every((q) => q.id !== copyId), "test builder pool");
    assert.ok((await loadSkillItems(repo, skillId)).every((i) => i.questionId !== copyId), "practice / adaptive pool");
    assert.ok((await loadItemsForSkills(repo, [skillId])).every((i) => i.questionId !== copyId));
    for (const g of [3, 4, 5]) for (const list of (await groupPools(repo, s(B.schoolId), g)).pools.values()) assert.ok(list.every((q) => q.id !== copyId), "MAP pools");
    assert.ok((await nafsIndex(repo, s(B.schoolId), Date.now() + 1e9)).every((e) => e.id !== copyId), "NAFS pool");
    // a practice session of a student never serves it
    const v = await startPractice(repo, student, skillId, new Date("2026-10-13T08:00:00Z"));
    assert.notEqual(v.question?.questionId, copyId);
  });

  test("only A reuses it: My edited copies, A's test, loading by id; B cannot copy or assign it", async () => {
    const mine = await bankSearch(repo, A, { mine: true });
    assert.ok(mine.rows.some((r) => r.id === copyId), "A finds the copy under My edited copies");
    assert.equal((await bankSearch(repo, B, { mine: true })).total, 0);
    const r = await assignTest(repo, A, { classId: classA, type: "REVIEW", title: "Private copy test", levelMode: "SAME", questions: { SAME: [copyId, original] } });
    assert.ok(r.testId);
    assert.equal((await loadQuestionItems(repo, [copyId])).length, 1, "the test's own questions load by id");
    await assert.rejects(editQuestionCopy(repo, B, { questionId: copyId, stem: "B's change" }), ForbiddenError);
    const tB = (await repo.findUnique("Teacher", { userId: B.userId }))!;
    const classB = s((await repo.findMany("ClassTeacher", { teacherId: tB.id }))[0].classId);
    await assert.rejects(assignTest(repo, B, { classId: classB, type: "REVIEW", title: "x", levelMode: "SAME", questions: { SAME: [copyId] } }), ForbiddenError);
  });

  test("copies made before the rule become private (idempotent), and are never deleted", async () => {
    const q = (await repo.findUnique("Question", { id: original }))!;
    const old = await repo.create("Question", {
      externalRef: `TCOPY-${original.slice(-8)}-old`, skillId: q.skillId, typeId: q.typeId, stem: "An old copy", content: {}, difficultyLevel: q.difficultyLevel, irtB: 0,
      tags: { teacherCopyOf: original }, status: "PUBLISHED", origin: "TEACHER_AUTHORED", createdById: B.userId, createdAt: new Date(), updatedAt: new Date(),
    });
    // an imported question whose reference only looks like a copy stays shared
    const lookalike = await repo.create("Question", { externalRef: "TCOPY-imported-1", skillId: q.skillId, typeId: q.typeId, stem: "Imported", content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", origin: "IMPORTED", createdAt: new Date(), updatedAt: new Date() });
    assert.ok((await questionsOfSkill(repo, s(A.schoolId), s(q.skillId))).some((x) => x.id === s(old.id)), "before: still shared");
    assert.equal(await privatizeOldCopies(repo, 2), 1);
    assert.equal(await privatizeOldCopies(repo), 0, "idempotent");
    assert.equal(s((await repo.findUnique("Question", { id: old.id }))!.privateToId), B.userId);
    assert.equal((await repo.findUnique("Question", { id: lookalike.id }))!.privateToId, null);
    assert.ok(!(await questionsOfSkill(repo, s(A.schoolId), s(q.skillId))).some((x) => x.id === s(old.id)), "after: private to B");
    assert.ok(await repo.findUnique("Question", { id: old.id }), "never deleted");
  });

  test("schema is additive; the UI strings have Arabic; the server starts the backfill", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    assert.match(schema, /privateToId\s+String\?\s+@db\.VarChar\(191\)/);
    for (const k of ["Only my edited copies (private to me)", "✏️ Teacher copies", "✏️ My edited copies", "Questions a teacher edited for a test: private to that teacher, never in the shared bank"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), k);
      assert.ok(ar[k as keyof typeof ar], k);
    }
    assert.match(readFileSync(join(ROOT, "src/instrumentation.ts"), "utf8"), /privatizeCopiesInBackground/);
  });
});
