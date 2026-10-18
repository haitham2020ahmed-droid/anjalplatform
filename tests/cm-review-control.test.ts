/**
 * 🔁 Curriculum Map → Review (owner r67): the teacher edits a question (a PRIVATE copy — the shared original is never
 * edited or deleted), adds questions (writes one, picks one from the bank, ✨ AI draft shown for review first), removes
 * (hides) and puts back, reorders, and sets HOW MANY questions the Review has — the students then answer exactly
 * that many, in the teacher's order. Available and chosen counts are shown. Demo school in memory — never a real
 * database or real students.
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
import { ValidationError } from "../src/server/curriculum-admin";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { clearMapCache } from "../src/server/curriculum-map/questions";
import { changeReview, draftReviewQuestion, editReviewQuestion, reviewControlView, reviewQuestionDetail, writeReviewQuestion } from "../src/server/curriculum-map/review-control";
import { assignFromMap } from "../src/server/curriculum-map/levels";
import { bankSearch } from "../src/server/tests/review";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");
const CODE = "G4.U1.TS1.REV";
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("🔁 the teacher's Review of a text set", () => {
  let repo: SqliteRepo; let A: Actor; let B: Actor; let admin: Actor; let classA = ""; let mc: string[] = [];

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 3 }));
    await publishGrade4Bank(repo);
    const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    A = await actor("demo.teacher.4a"); B = await actor("demo.teacher.4b"); admin = await actor("demo.admin");
    const tA = (await repo.findUnique("Teacher", { userId: A.userId }))!;
    classA = s((await repo.findMany("ClassTeacher", { teacherId: tA.id }))[0].classId);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId: admin.schoolId! });
    clearMapCache();
    const type = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    mc = (await repo.findMany("Question", { status: "PUBLISHED", typeId: type.id, deletedAt: null, passageId: null })).filter((q) => s(q.externalRef).startsWith("G4-")).map((q) => s(q.id)).sort().slice(0, 12);
    const node = (await repo.findMany("CurriculumMapNode", { code: CODE }))[0];
    await repo.createMany("QuestionMapLink", mc.slice(0, 5).map((questionId, i) => ({ questionId, nodeId: node.id, createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)) })));
  });

  test("before any change: the place's shared questions; available and chosen are shown", async () => {
    const v = await reviewControlView(repo, A, CODE);
    assert.equal(v.custom, false);
    assert.equal(v.available, 5); assert.equal(v.chosen, 5); assert.equal(v.count, 5);
    assert.deepEqual(v.questions.map((q) => q.id), mc.slice(0, 5));
  });

  test("✏️ edit = a private copy in the teacher's Review; the shared original is never changed", async () => {
    const original = mc[1];
    const before = (await repo.findUnique("Question", { id: original }))!;
    const d = await reviewQuestionDetail(repo, A, CODE, original);
    assert.ok(d.options.length >= 2);
    const v = await editReviewQuestion(repo, A, CODE, { questionId: original, stem: `${d.stem} (my words)`, options: d.options });
    const copyId = v.questions[1].id;
    assert.notEqual(copyId, original, "the copy takes the original's place, same position");
    assert.equal(v.questions[1].own, true);
    const copy = (await repo.findUnique("Question", { id: copyId }))!;
    assert.equal(s(copy.privateToId), A.userId, "private to the teacher");
    assert.equal(s((await repo.findUnique("Question", { id: original }))!.stem), s(before.stem), "original unchanged");
    assert.equal((await repo.findUnique("Question", { id: original }))!.deletedAt ?? null, null, "never deleted");
    assert.equal(await repo.count("QuestionMapLink", { questionId: copyId }), 0, "the copy is not put on the shared map");
    // the other teacher still has the shared Review
    const vb = await reviewControlView(repo, B, CODE);
    assert.deepEqual(vb.questions.map((q) => q.id), mc.slice(0, 5));
    assert.ok(!(await bankSearch(repo, B, { q: "(my words)" }).catch(() => ({ rows: [] }))).rows.some((r) => r.id === copyId), "not in another teacher's bank");
  });

  test("➕ write a question (private), ➕ from the bank, ➖ remove and put back, ↕ reorder", async () => {
    const shared0 = await repo.count("Question", {});
    let v = await writeReviewQuestion(repo, A, CODE, { stem: "Which word means the same as 'happy'?", options: ["glad", "sad", "angry", "tired"], correct: 0 });
    const mine = v.questions.at(-1)!;
    assert.equal(mine.own, true);
    assert.equal(s((await repo.findUnique("Question", { id: mine.id }))!.privateToId), A.userId);
    assert.equal(await repo.count("Question", {}), shared0, "the shared bank does not grow");
    await assert.rejects(writeReviewQuestion(repo, A, CODE, { stem: "x", options: ["a"], correct: 0 }), ValidationError);
    v = await changeReview(repo, A, CODE, { op: "addBank", questionId: mc[8] });
    assert.equal(v.questions.at(-1)!.id, mc[8]);
    await assert.rejects(changeReview(repo, A, CODE, { op: "addBank", questionId: mc[8] }), ValidationError, "not twice");
    v = await changeReview(repo, A, CODE, { op: "remove", questionId: mc[0] });
    assert.ok(!v.questions.some((q) => q.id === mc[0]));
    assert.ok(v.hidden.some((q) => q.id === mc[0]), "listed under Removed");
    assert.equal(await repo.count("QuestionMapLink", { questionId: mc[0] }), 1, "still on the shared map");
    v = await changeReview(repo, A, CODE, { op: "restore", questionId: mc[0] });
    assert.equal(v.questions.at(-1)!.id, mc[0]);
    const order = [...v.questions.map((q) => q.id)].reverse();
    v = await changeReview(repo, A, CODE, { op: "order", questionIds: order });
    assert.deepEqual(v.questions.map((q) => q.id), order);
    await assert.rejects(changeReview(repo, A, CODE, { op: "order", questionIds: order.slice(1) }), ValidationError);
    assert.equal(v.chosen, 7); assert.equal(v.available, 7);
  });

  test("🔢 how many: the students answer exactly that many, in the teacher's order", async () => {
    let v = await changeReview(repo, A, CODE, { op: "count", count: 3 });
    assert.equal(v.count, 3);
    await assert.rejects(changeReview(repo, A, CODE, { op: "count", count: 99 }), ValidationError);
    const r = await assignFromMap(repo, A, { source: "CURRICULUM", classId: classA, categoryCode: CODE });
    assert.equal(r.groups.length, 1);
    const a = (await repo.findUnique("Assignment", { id: r.groups[0].assignmentId }))!;
    const set = (await repo.findUnique("Assessment", { id: a.assessmentId }))!;
    const items = (await repo.findMany("AssessmentQuestion", { assessmentId: set.id })).sort((x, y) => Number(x.order) - Number(y.order)).map((x) => s(x.questionId));
    assert.deepEqual(items, v.questions.slice(0, 3).map((q) => q.id), "exactly the first 3, in order");
    assert.equal(Boolean(set.isAdaptive), false); assert.equal(Number(set.maxQuestions), 3);
    // the other teacher's Review is unchanged: the place's shared questions
    v = await reviewControlView(repo, B, CODE);
    assert.equal(v.custom, false);
  });

  test("✨ AI draft: shown for review, nothing saved until the teacher adds it", async () => {
    const before = await repo.count("Question", { privateToId: { not: null } });
    const fake = { complete: async () => JSON.stringify({ questions: [{ slot: 1, level: 4, stem: "What is the main idea?", options: [{ text: "Seeds grow", correct: true }, { text: "Cats nap", correct: false }, { text: "Rain falls", correct: false }], explanation: "It is what the text is mostly about." }] }) };
    const d = await draftReviewQuestion(repo, A, CODE, fake);
    assert.equal(d.stem, "What is the main idea?"); assert.equal(d.correct, 0); assert.equal(d.options.length, 3);
    assert.equal(await repo.count("Question", { privateToId: { not: null } }), before, "a draft is not saved");
    await assert.rejects(draftReviewQuestion(repo, A, CODE, { complete: async () => "no json" }), ValidationError);
  });

  test("only the teacher changes their Review; a place that is not a Review is refused; reset", async () => {
    await assert.rejects(changeReview(repo, admin, CODE, { op: "count", count: 1 }), ForbiddenError);
    await assert.rejects(reviewControlView(repo, A, "G4.U1.TS1.CV"), ValidationError);
    const other = await repo.findMany("Question", { privateToId: A.userId }, { take: 1 });
    await assert.rejects(changeReview(repo, B, CODE, { op: "addBank", questionId: s(other[0].id) }), ForbiddenError, "another teacher's private question");
    const v = await changeReview(repo, A, CODE, { op: "reset" });
    assert.equal(v.custom, false); assert.deepEqual(v.questions.map((q) => q.id), mc.slice(0, 5));
    assert.ok(await repo.count("Question", { privateToId: A.userId }) >= 2, "the teacher's copies stay theirs");
  });

  test("the map shows ✏️ My Review on Review sections; the page and strings exist (EN + AR)", () => {
    assert.match(read("src/components/curriculum-map/lesson-card.tsx"), /s\.kind === "REVIEW" && <Link data-testid="map-review-edit" href=\{`\/teacher\/curriculum-review\?code=/);
    const page = read("src/app/teacher/curriculum-review/page.tsx");
    assert.match(page, /<ReviewControl initial=\{v\} \/>/);
    assert.doesNotMatch(page, /^export (const|function) (?!metadata|default)/m, "page files export only Next page fields");
    for (const w of ["My Review", "Available: {n}", "Chosen: {n}", "Students answer: {n}", "Number of questions", "Write a question", "From the bank", "AI draft", "Put back"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(w), w); assert.ok((ar as Record<string, string>)[w], w);
    }
  });
});
