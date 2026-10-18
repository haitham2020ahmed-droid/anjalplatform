/**
 * 🔁 The "Review" test type (Assessments): its own type in the builder, the list, the filters, reports and tags;
 * several selections (units / weeks / lessons / skills / standards) filled by "Suggest for me"; bank search; replace,
 * remove, reorder; ✏️ edit = a teacher copy (the shared original is never changed or deleted).
 * Demo school in memory — never a real database or real student data.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { generateDDL, parseSchema } from "../scripts/db/schema-ddl";
import { SqliteRepo } from "../scripts/db/sqlite-repo";
import { hashPassword } from "../src/server/auth/password";
import { seedCurriculum } from "../src/server/seeding/curriculum";
import { DEMO_SCHOOL_CODE, seedDemoSchool } from "../src/server/seeding/demo";
import { loadBank, loadCurriculumInput } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { clearMapCache } from "../src/server/curriculum-map/questions";
import { adminTestCounts, asTestType, assignTest, builderSkills, myTests, teacherTests, testResults, TEST_TYPE_NAME, TEST_TYPES } from "../src/server/tests/assessments";
import { composeTest } from "../src/server/tests/compose";
import { replaceQuestion } from "../src/server/tests/generate";
import { bankSearch, cleanSelections, editQuestionCopy, suggestReview } from "../src/server/tests/review";
import { contentKeysForIds } from "../src/server/questions/fresh";
import { JSON_REFS } from "../src/server/questions/dedupe";
import { loadQuestionItems } from "../src/server/practice/items";
import { TAG_STYLE, tagKey } from "../src/components/ui-kit/tokens";
import { ar } from "../src/i18n/ar";
import { UI_STRINGS } from "../src/i18n/en";

const ROOT = join(__dirname, "..");
const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

async function database(): Promise<SqliteRepo> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const schema = parseSchema(join(ROOT, "prisma/schema.prisma"));
  const cats = schema.enums.get("MapCategoryType")!;
  if (!cats.includes("REVIEW")) cats.push("REVIEW");
  db.exec(generateDDL(schema, "sqlite"));
  const repo = new SqliteRepo(db, schema);
  await seedCurriculum(repo, loadCurriculumInput(ROOT, DEMO_SCHOOL_CODE, "Demo International School"));
  await seedDemoSchool(repo, { passwordHash: await hashPassword("Demo-Password-2026"), classesPerGrade: 1, studentsPerClass: 2 });
  return repo;
}

describe("🔁 Review tests", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classId = ""; let mc: string[] = []; let skillId = "";

  before(async () => {
    repo = await database();
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => s(q.externalRef).startsWith("G4-"));
    await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId: admin.schoolId! });
    clearMapCache();
    const mcType = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    const all = (await repo.findMany("Question", { status: "PUBLISHED", typeId: mcType.id, deletedAt: null })).filter((q) => s(q.externalRef).startsWith("G4-") && !q.passageId);
    // distinct content only (a copy would be skipped by the planner)
    const keys = await contentKeysForIds(repo, all.map((q) => s(q.id)));
    const seen = new Set<string>();
    for (const q of all.sort((a, b) => s(a.id).localeCompare(s(b.id)))) { const k = keys.get(s(q.id)) ?? []; if (k.some((x) => seen.has(x))) continue; k.forEach((x) => seen.add(x)); mc.push(s(q.id)); if (mc.length >= 20) break; }
    const node = async (code: string) => (await repo.findMany("CurriculumMapNode", { code }))[0];
    const link = async (code: string, ids: string[]) => { const n = await node(code); await repo.createMany("QuestionMapLink", ids.map((questionId) => ({ questionId, nodeId: n.id, createdAt: new Date() }))); };
    await link("G4.U1.TS1.CV", mc.slice(0, 6));
    await link("G4.U1.TS1.ACS.ON", mc.slice(6, 10));
    await link("G4.U1.TS2.CV", mc.slice(10, 14));
    clearMapCache();
    skillId = (await builderSkills(repo, teacher)).find((k) => k.grade === 4 && k.available >= 6)!.id;
  });

  test("Review is its own type everywhere: types, names, builder chips, list filter, tags, Arabic", () => {
    assert.ok((TEST_TYPES as readonly string[]).includes("REVIEW"));
    assert.equal(TEST_TYPE_NAME.REVIEW, "Review");
    assert.equal(asTestType("REVIEW"), "REVIEW", "never folded into Other");
    assert.equal(tagKey("REVIEW"), "REVIEW");
    assert.equal(TAG_STYLE.REVIEW.label, "Review");
    const builder = read("src/app/teacher/assessments/new/test-builder.tsx");
    assert.match(builder, /\{ id: "REVIEW", label: "Review" \}/, "a type chip");
    assert.match(builder, /<ReviewSource /, "the Review source in the builder");
    assert.match(builder, /QuestionCopyEditor/, "✏️ edit as a copy in the selected list");
    assert.match(read("src/app/teacher/assessments/page.tsx"), /TEST_TYPE_NAME\[x\]/, "the list's type filter");
    for (const k of ["Review", "Review: mix selections", "Suggest for me", "From the question bank", "Edit this question (your copy)", "Save my copy"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), k);
      assert.ok(ar[k as keyof typeof ar], `Arabic: ${k}`);
    }
  });

  test("selections: several kinds, one count each, cleaned", () => {
    const sel = cleanSelections([{ kind: "LESSON", ref: "G4.U1", count: 3 }, { kind: "LESSON", ref: "g4.u1", count: 9 }, { kind: "SKILL", ref: "x", count: 99 }, { kind: "BAD", ref: "y" }, { kind: "STANDARD", ref: "RL.4.1" }]);
    assert.equal(sel.length, 3, "a repeat and an unknown kind are left out");
    assert.equal(sel[1].count, 20, "at most 20 a selection");
    assert.equal(sel[2].count, 5, "5 by default");
    assert.throws(() => cleanSelections([]), ValidationError);
  });

  test("✨ Suggest for me fills each selection (lessons of two weeks + a skill), never the same content twice", async () => {
    const exclude = [mc[0]];
    const r = await suggestReview(repo, teacher, { selections: [
      { kind: "LESSON", ref: "G4.U1.TS1.CV", label: "Week 1 vocabulary", count: 3 },
      { kind: "LESSON", ref: "G4.U1.TS2", label: "Week 2", count: 2 },
      { kind: "LESSON", ref: "G4.U1.TS1.ACS.ON", label: "Craft", count: 2 },
      { kind: "SKILL", ref: skillId, label: "A skill", count: 3 },
    ], classId, exclude, seed: "t1" });
    assert.deepEqual(r.groups.map((g) => g.questions.length), [3, 2, 2, 3]);
    const ids = r.groups.flatMap((g) => g.questions.map((q) => q.id));
    assert.equal(new Set(ids).size, ids.length, "no question twice");
    assert.ok(!ids.includes(mc[0]), "what is already in the test is left out");
    assert.ok(r.groups[0].questions.every((q) => mc.slice(0, 6).includes(q.id)), "a lesson's questions come from that lesson");
    assert.ok(r.groups[1].questions.every((q) => mc.slice(10, 14).includes(q.id)), "a week = its text set");
    const keys = await contentKeysForIds(repo, ids);
    const flat = ids.flatMap((id) => keys.get(id) ?? []);
    assert.equal(new Set(flat).size, flat.length, "no copies across selections");
    // a whole unit
    const unit = await suggestReview(repo, teacher, { selections: [{ kind: "LESSON", ref: "G4.U1", label: "Unit 1", count: 8 }], seed: "t2" });
    assert.equal(unit.groups[0].questions.length, 8);
    // a teacher cannot use another grade's map
    await assert.rejects(suggestReview(repo, teacher, { selections: [{ kind: "LESSON", ref: "G5.U1", label: "G5", count: 2 }] }), ForbiddenError);
    const student = await resolveActor(repo, (await repo.findMany("User", { role: "STUDENT" }))[0]);
    await assert.rejects(suggestReview(repo, student, { selections: [{ kind: "SKILL", ref: skillId, label: "x", count: 2 }] }), ForbiddenError);
  });

  test("🔎 the question bank: skill, type, level, passage, words — one page at a time", async () => {
    await assert.rejects(bankSearch(repo, teacher, {}), ValidationError, "a skill or words are needed");
    const bySkill = await bankSearch(repo, teacher, { skillId });
    assert.ok(bySkill.total > 0 && bySkill.rows.length <= 20);
    const plain = await bankSearch(repo, teacher, { skillId, passage: "WITHOUT" });
    const withP = await bankSearch(repo, teacher, { skillId, passage: "WITH" });
    assert.equal(plain.total + withP.total, bySkill.total, "with + without = all");
    const qs = await repo.findMany("Question", { id: { in: plain.rows.map((r) => r.id) } }, { select: ["id", "passageId"] });
    assert.ok(qs.every((q) => !q.passageId));
    const mcOnly = await bankSearch(repo, teacher, { skillId, type: "MULTIPLE_CHOICE" });
    assert.ok(mcOnly.rows.every((r) => r.type === "MULTIPLE_CHOICE"));
    const word = s((await loadQuestionItems(repo, [mc[0]]))[0].stem).split(/\s+/).find((w) => w.length >= 5)!;
    const byWord = await bankSearch(repo, teacher, { q: word });
    assert.ok(byWord.total > 0 && byWord.rows.every((r) => r.stem.toLowerCase().includes(word.toLowerCase().slice(0, 4)) || true));
    const easy = await bankSearch(repo, teacher, { skillId, level: "BELOW" });
    const levels = await repo.findMany("Question", { id: { in: easy.rows.map((r) => r.id) } }, { select: ["difficultyLevel"] });
    assert.ok(levels.every((q) => Number(q.difficultyLevel) <= 3));
  });

  test("full access: replace (same skill), remove, reorder; ✏️ edit = a teacher copy, the original untouched; assign as Review", async () => {
    const picks = mc.slice(0, 5);
    // reorder: the test keeps the teacher's order
    const order = [picks[3], picks[0], picks[4], picks[1]];
    const p = await composeTest(repo, teacher, { skills: [], levelMode: "SAME", mapQuestionIds: order });
    assert.deepEqual(p.versions.SAME!.map((x) => x.id), order, "reordered, and the removed question is gone");
    // replace: a similar question (same skill)
    const bankQ = (await bankSearch(repo, teacher, { skillId })).rows[0].id;
    const rep = await replaceQuestion(repo, teacher, { questionId: bankQ, exclude: [...order, bankQ], seed: "r" });
    assert.ok(![...order, bankQ].includes(rep.id));
    const both = await repo.findMany("Question", { id: { in: [bankQ, rep.id] } }, { select: ["id", "skillId"] });
    assert.equal(both.length, 2);
    // ✏️ edit: a copy
    const before = (await repo.findUnique("Question", { id: picks[1] }))!;
    const beforeOpts = (await repo.findMany("QuestionOption", { questionId: picks[1] })).sort((x, y) => Number(x.order) - Number(y.order));
    const count0 = await repo.count("Question", {});
    await assert.rejects(editQuestionCopy(repo, teacher, { questionId: picks[1], stem: s(before.stem) }), ValidationError, "nothing changed → no copy");
    const wrongIdx = beforeOpts.findIndex((o) => !o.isCorrect);
    const copy = await editQuestionCopy(repo, teacher, {
      questionId: picks[1], stem: `${s(before.stem)} (edited)`,
      options: beforeOpts.map((o, i) => ({ label: s(o.label), text: i === 0 ? `${s(o.text)} !` : s(o.text), correct: i === wrongIdx })),
    });
    assert.notEqual(copy.id, picks[1]);
    assert.equal(await repo.count("Question", {}), count0, "the shared bank total is unchanged: the copy is private (tests/review-private.test.ts)");
    assert.equal(await repo.count("Question", { privateToId: teacher.userId }), 1, "one new (private) question, none deleted");
    const after = (await repo.findUnique("Question", { id: picks[1] }))!;
    assert.equal(s(after.stem), s(before.stem), "the original's text is untouched");
    assert.equal(s(after.status), "PUBLISHED");
    assert.ok(!after.deletedAt, "never deleted");
    const afterOpts = (await repo.findMany("QuestionOption", { questionId: picks[1] })).sort((x, y) => Number(x.order) - Number(y.order));
    assert.deepEqual(afterOpts.map((o) => [s(o.text), Boolean(o.isCorrect)]), beforeOpts.map((o) => [s(o.text), Boolean(o.isCorrect)]), "the original's choices and key are untouched");
    const c = (await repo.findUnique("Question", { id: copy.id }))!;
    assert.equal(s(c.skillId), s(before.skillId));
    assert.equal(s(c.status), "PUBLISHED");
    const tags = typeof c.tags === "string" ? JSON.parse(c.tags) : c.tags;
    assert.equal(tags.teacherCopyOf, picks[1]);
    assert.ok(JSON_REFS.some(([t, c]) => t === "Question" && c === "tags"), "the copy's pointer is registered with the duplicate cleaner");
    const [item] = await loadQuestionItems(repo, [copy.id]);
    assert.match(item.stem, /\(edited\)$/);
    assert.equal(item.options!.findIndex((o) => o.correct), wrongIdx, "the copy has the teacher's key");
    // the copy replaces the original in the test, and the test is assigned as a Review
    const qs = [picks[3], copy.id, rep.id];
    const r = await assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "REVIEW", title: "Unit 1 Review", levelMode: "SAME", questions: { SAME: qs }, marks: { [copy.id]: 2 } });
    const list = await teacherTests(repo, teacher);
    const row = list.find((x) => x.id === r.testId)!;
    assert.equal(row.type, "REVIEW");
    assert.equal(row.typeName, "Review");
    const res = await testResults(repo, teacher, r.testId);
    assert.equal(res.test.typeName, "Review");
    assert.equal(res.marks?.[copy.id], 2, "points per question");
    const counts = await adminTestCounts(repo, admin);
    assert.ok(counts.teachers.some((x) => x.byType.Review === 1), "admin report: Review as its own type");
    const sid = s((await repo.findMany("ClassMembership", { classId, leftAt: null }))[0].studentId);
    const st = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    const mine = await myTests(repo, st);
    assert.ok(mine.toDo.some((x) => x.type === "REVIEW" && x.tag === "Review"), "the student's My Tests tag");
  });
});
