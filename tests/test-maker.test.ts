/**
 * ⚡ "Make the test for me" + 👁 question drawer (demo school in memory, never a real database):
 *   the planner (counts, balance across lessons / skills, levels, no duplicates, passage groups together, easy → hard,
 *   recently seen avoided), generateTest end to end, 🔁 Replace keeps skill and level, marks (spread, stored, results,
 *   templates), the question detail endpoint (permissions, full passage, answers), Arabic strings.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { attachmentNodes, clearMapCache } from "../src/server/curriculum-map/questions";
import { assignTest, builderSkills, cleanMarks, openTemplate, saveTemplate, spreadMarks, testResults } from "../src/server/tests/assessments";
import { assertNoDuplicateQuestions } from "../src/server/tests/map-source";
import { easyToHard, generateTest, levelFromAccuracy, levelTargets, planTest, replaceQuestion, type GenCandidate } from "../src/server/tests/generate";
import { passageHeading, questionDetail } from "../src/server/tests/question-detail";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";

const s = (v: unknown) => String(v ?? "");

// ------------------------------------------------------------------ the pure planner

function cand(id: string, bucket: string, level: "BELOW" | "ON" | "ABOVE", extra: Partial<GenCandidate> = {}): GenCandidate {
  return { id, bucket, level, type: "MULTIPLE_CHOICE", passage: null, keys: [`k:${id}`], seen: false, difficulty: level === "BELOW" ? 2 : level === "ON" ? 4 : 6, ...extra };
}
const pool = (bucket: string, n: number, extra: (i: number) => Partial<GenCandidate> = () => ({})) =>
  Array.from({ length: n }, (_, i) => cand(`${bucket}${i}`, bucket, (["BELOW", "ON", "ABOVE"] as const)[i % 3], extra(i)));

describe("⚡ planner (pure)", () => {
  test("the exact count, spread evenly over lessons and skills", () => {
    const c = [...pool("A", 30), ...pool("B", 30), ...pool("C", 30)];
    const r = planTest(c, ["A", "B", "C"], { count: 12, levels: levelTargets("MIXED", 12), seed: "x" });
    assert.equal(r.ids.length, 12);
    const per = ["A", "B", "C"].map((b) => r.ids.filter((id) => id.startsWith(b)).length);
    assert.deepEqual(per, [4, 4, 4], "balanced across the buckets");
  });

  test("levels: one level → only that level; mixed → about 30 / 40 / 30; short → topped up with a note", () => {
    const c = [...pool("A", 30), ...pool("B", 30)];
    const levelOf = new Map(c.map((x) => [x.id, x.level]));
    const below = planTest(c, ["A", "B"], { count: 10, levels: levelTargets("BELOW", 10), seed: "y" });
    assert.ok(below.ids.every((id) => levelOf.get(id) === "BELOW"));
    const mixed = planTest(c, ["A", "B"], { count: 10, levels: levelTargets("MIXED", 10), seed: "y" });
    const n = (l: string) => mixed.ids.filter((id) => levelOf.get(id) === l).length;
    assert.deepEqual([n("BELOW"), n("ON"), n("ABOVE")], [3, 4, 3]);
    const few = planTest(pool("A", 9), ["A"], { count: 6, levels: levelTargets("ABOVE", 6), seed: "y" });
    assert.equal(few.ids.length, 6);
    assert.ok(few.notes.some((x) => /topped up from other levels/.test(x)));
    assert.equal(levelFromAccuracy(85), "ABOVE"); assert.equal(levelFromAccuracy(65), "ON"); assert.equal(levelFromAccuracy(40), "BELOW"); assert.equal(levelFromAccuracy(null), "ON");
  });

  test("no duplicates: never the same id, nor a copy (same text and answer) — even across buckets", () => {
    const a = pool("A", 10, (i) => ({ keys: [`same:${i % 5}`] })); // pairs of copies inside A
    const b = pool("B", 10, (i) => ({ keys: [`same:${i % 5}`] })); // and copies of A in B
    const r = planTest([...a, ...b, a[0]], ["A", "B"], { count: 8, levels: levelTargets("MIXED", 8), seed: "z" });
    const keys = r.ids.map((id) => [...a, ...b].find((x) => x.id === id)!.keys[0]);
    assert.equal(new Set(r.ids).size, r.ids.length);
    assert.equal(new Set(keys).size, keys.length, "one copy per content");
    assert.ok(r.ids.length <= 5 && r.notes.some((x) => /Only 5 question/.test(x)), "only 5 different contents exist");
  });

  test("passage questions stay together and the test runs easy → hard; the passage share is followed", () => {
    const c = [...pool("A", 12, (i) => ({ passage: i < 6 ? "P1" : null })), ...pool("B", 12, (i) => ({ passage: i < 6 ? "P2" : null }))];
    const r = planTest(c, ["A", "B"], { count: 10, levels: levelTargets("MIXED", 10), passageShare: 50, seed: "p" });
    const rows = r.ids.map((id) => c.find((x) => x.id === id)!);
    assert.equal(rows.filter((x) => x.passage).length, 5, "half with a passage");
    for (const p of ["P1", "P2"]) {
      const at = rows.map((x, i) => (x.passage === p ? i : -1)).filter((i) => i >= 0);
      if (at.length) assert.equal(at[at.length - 1] - at[0] + 1, at.length, `${p} questions are next to each other`);
    }
    const plain = rows.filter((x) => !x.passage).map((x) => ({ BELOW: 0, ON: 1, ABOVE: 2 })[x.level] * 10 + x.difficulty);
    assert.deepEqual(plain, [...plain].sort((x, y) => x - y), "easy → hard");
    const ordered = easyToHard([{ id: "h", level: "ABOVE" as const, difficulty: 6, passage: null }, { id: "e", level: "BELOW" as const, difficulty: 1, passage: null }]);
    assert.deepEqual(ordered.map((x) => x.id), ["e", "h"]);
  });

  test("answer-type mix and recently seen questions", () => {
    const c = pool("A", 40, (i) => ({ type: i % 2 ? "TRUE_FALSE" : "MULTIPLE_CHOICE", seen: i < 20 }));
    const r = planTest(c, ["A"], { count: 10, levels: { ON: 0, BELOW: 0, ABOVE: 0, ...levelTargets("MIXED", 10) }, types: { TRUE_FALSE: 70, MULTIPLE_CHOICE: 30 }, seed: "t" });
    const rows = r.ids.map((id) => c.find((x) => x.id === id)!);
    assert.equal(rows.filter((x) => x.type === "TRUE_FALSE").length, 7);
    assert.ok(rows.every((x) => !x.seen), "nothing the class saw recently while new questions are left");
  });

  test("marks: total ÷ number, adding up exactly; cleaned when stored", () => {
    const m = spreadMarks(["a", "b", "c"], 10);
    assert.deepEqual(Object.values(m), [3.33, 3.33, 3.34]);
    assert.equal(Object.values(spreadMarks(["a", "b"], 20)).reduce((x, y) => x + y, 0), 20);
    assert.equal(cleanMarks({ a: 1, b: 1 }, ["a", "b"]), null, "all 1 point: nothing stored");
    assert.deepEqual(cleanMarks({ a: 2, zz: 5 }, ["a", "b"]), { a: 2 }, "only the test's questions");
    assert.throws(() => cleanMarks({ a: -1 }, ["a"]), ValidationError);
  });
});

// ------------------------------------------------------------------ with the demo school

describe("⚡ generateTest, 🔁 replace, 👁 question detail, marks (demo school)", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let student: Actor; let classId = "";
  let lessonA = ""; let lessonB = ""; let skillId = ""; let passageQ = "";

  before(async () => {
    repo = (await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 })).repo;
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => s(q.externalRef).startsWith("G4-"));
    await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    student = await resolveActor(repo, (await repo.findMany("User", { role: "STUDENT" }))[0]);
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync(join(ROOT, "data/curriculum-map/source.txt"), "utf8")), { schoolId: admin.schoolId! });
    clearMapCache();
    const nodes = (await attachmentNodes(repo, admin.schoolId!)).filter((n) => n.grade === 4);
    const sets = [...new Set(nodes.map((n) => n.code.split(".").slice(0, 3).join(".")))];
    lessonA = sets[0]; lessonB = sets[1];
    const mcType = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    const all = (await repo.findMany("Question", { status: "PUBLISHED", typeId: mcType.id, deletedAt: null })).filter((q) => s(q.externalRef).startsWith("G4-")).sort((a, b) => s(a.id).localeCompare(s(b.id)));
    const plain = all.filter((q) => !q.passageId);
    const withPassage = all.filter((q) => q.passageId);
    passageQ = s(withPassage[0].id);
    const link = async (code: string, ids: string[]) => { const n = nodes.find((x) => x.code.startsWith(`${code}.`))!; await repo.createMany("QuestionMapLink", ids.map((questionId) => ({ questionId, nodeId: n.id, createdAt: new Date() }))); };
    await link(lessonA, plain.slice(0, 20).map((q) => s(q.id)));
    await link(lessonB, [...plain.slice(20, 30), ...withPassage.slice(0, 8)].map((q) => s(q.id)));
    skillId = (await builderSkills(repo, teacher, { grade: 4 })).filter((k) => k.available >= 15).sort((a, b) => b.available - a.available)[0].id;
    assert.ok(skillId && lessonA && lessonB);
  });

  test("a balanced test: the count, lessons + skill, no duplicates, passage questions together, marks add up", async () => {
    const r = await generateTest(repo, teacher, { lessons: [lessonA, lessonB], skillIds: [skillId], count: 15, level: "MIXED", classId, totalMarks: 30, seed: "one" });
    assert.equal(r.questions.length, 15);
    await assertNoDuplicateQuestions(repo, r.questions.map((q) => q.id));
    const fromA = r.questions.filter((q) => q.code.startsWith(`${lessonA}.`)).length, fromB = r.questions.filter((q) => q.code.startsWith(`${lessonB}.`)).length;
    assert.ok(fromA >= 4 && fromA <= 6 && fromB >= 4 && fromB <= 6, `spread over the lessons (${fromA}, ${fromB})`);
    assert.ok(r.questions.filter((q) => !q.code).length >= 4, "and the skill");
    const titles = r.questions.map((q) => q.passageTitle);
    for (const p of new Set(titles.filter(Boolean))) { const at = titles.map((x, i) => (x === p ? i : -1)).filter((i) => i >= 0); assert.equal(at[at.length - 1] - at[0] + 1, at.length, "a passage's questions are together"); }
    assert.equal(Math.round(Object.values(r.marks).reduce((a, b) => a + b, 0) * 100) / 100, 30);
    assert.equal(r.questions[0].marks, 2);
  });

  test("levels, fit my class, limits and permissions", async () => {
    const below = await generateTest(repo, teacher, { lessons: [lessonA], skillIds: [skillId], count: 6, level: "BELOW", seed: "lv" });
    assert.ok(below.questions.filter((q) => q.level === "BELOW").length >= 4, "Below Level questions first");
    const fit = await generateTest(repo, teacher, { skillIds: [skillId], count: 5, level: "FIT", classId, seed: "fit" });
    assert.equal(fit.level, "ON", "no recent answers → On Level");
    assert.ok(fit.notes.some((x) => /Fit my class/.test(x)));
    await assert.rejects(generateTest(repo, teacher, { skillIds: [skillId], count: 4, level: "ON" }), ValidationError);
    await assert.rejects(generateTest(repo, teacher, { skillIds: [skillId], count: 61, level: "ON" }), ValidationError);
    await assert.rejects(generateTest(repo, teacher, { count: 10, level: "ON" }), ValidationError);
    await assert.rejects(generateTest(repo, teacher, { lessons: ["G5.U1.TS1"], count: 10, level: "ON" }), ForbiddenError, "not the teacher's grade");
    await assert.rejects(generateTest(repo, student, { skillIds: [skillId], count: 10, level: "ON" }), ForbiddenError);
  });

  test("questions the class was given recently are left out of the next test", async () => {
    const first = await generateTest(repo, teacher, { lessons: [lessonA], count: 5, level: "MIXED", classId, seed: "s1" });
    const ids = first.questions.map((q) => q.id);
    await assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "WEEKLY_QUIZ", title: "Quiz A", levelMode: "SAME", questions: { SAME: ids }, marks: first.marks });
    const second = await generateTest(repo, teacher, { lessons: [lessonA], count: 5, level: "MIXED", classId, seed: "s1" });
    assert.equal(second.questions.filter((q) => ids.includes(q.id)).length, 0, "20 questions in the lesson: new ones are used first");
    assert.ok(!second.notes.some((x) => /saw recently/.test(x)));
  });

  test("🔁 Replace: same skill and level, never a question already in the test", async () => {
    const r = await generateTest(repo, teacher, { skillIds: [skillId], count: 6, level: "ON", seed: "rep" });
    const ids = r.questions.map((q) => q.id);
    const target = r.questions[0];
    const row = await replaceQuestion(repo, teacher, { questionId: target.id, exclude: ids, seed: "a" });
    assert.ok(!ids.includes(row.id));
    assert.equal(row.level, target.level);
    const skillOf = async (id: string) => s((await repo.findUnique("Skill", { id: s((await repo.findUnique("Question", { id }))!.skillId) }))!.name).toLowerCase();
    assert.equal(await skillOf(row.id), await skillOf(target.id), "the same skill");
    await assertNoDuplicateQuestions(repo, [...ids.filter((x) => x !== target.id), row.id]);
  });

  test("marks are stored with the test, shown in results and kept in templates", async () => {
    const r = await generateTest(repo, teacher, { skillIds: [skillId], count: 5, level: "MIXED", totalMarks: 12, seed: "mk" });
    const ids = r.questions.map((q) => q.id);
    const marks = { ...r.marks, [ids[0]]: 4 };
    const { testId } = await assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "CHAPTER_TEST", title: "Marked test", levelMode: "SAME", questions: { SAME: ids }, marks });
    const res = await testResults(repo, teacher, testId);
    assert.equal(res.marks?.[ids[0]], 4);
    const max = Math.round(Object.values(marks).reduce((a, b) => a + b, 0) * 100) / 100;
    assert.ok(res.students.every((x) => x.maxPoints === max && x.points === 0));
    const tid = await saveTemplate(repo, teacher, { title: "Marked", type: "CHAPTER_TEST", spec: { skills: [], levelMode: "SAME", timeLimitMin: null, shuffle: false, questions: { SAME: ids }, mapQuestionIds: ids, marks } });
    assert.equal((await openTemplate(repo, teacher, tid)).spec.marks?.[ids[0]], 4);
    await assert.rejects(assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "CHAPTER_TEST", title: "Bad", levelMode: "SAME", questions: { SAME: ids }, marks: { [ids[0]]: 500 } }), ValidationError);
  });

  test("👁 question detail: the full passage, every option with the answer marked; staff of the school only", async () => {
    const d = await questionDetail(repo, teacher, passageQ);
    assert.ok(d.passage && d.passage.text.length > 100, "the full passage text");
    assert.ok(d.options && d.options.some((o) => o.correct), "the right answer is marked");
    assert.ok(d.answerText && d.skill && d.grade === 4);
    assert.equal(d.row.id, passageQ);
    assert.equal((await questionDetail(repo, admin, passageQ)).id, passageQ);
    await assert.rejects(questionDetail(repo, student, passageQ), ForbiddenError, "students never get the answers");
    await assert.rejects(questionDetail(repo, { ...teacher, schoolId: "another-school" }, passageQ), ForbiddenError, "another school's teacher");
    await assert.rejects(questionDetail(repo, teacher, "nope"), ValidationError);
    assert.deepEqual(passageHeading("Imported passage: Our Class Solar Oven Last spring, our…", "Our Class Solar Oven\nLast spring, our class built an oven."), { title: "Our Class Solar Oven", text: "Last spring, our class built an oven." });
    assert.deepEqual(passageHeading("The Windmill Kid", "William grew up in Malawi."), { title: "The Windmill Kid", text: "William grew up in Malawi." });
  });

  test("🌐 the new words have Arabic", () => {
    const dict = ar as Record<string, string>;
    for (const k of ["Make the test for me", "View", "Replace", "Question {n} of {m}", "Fit my class", "{n} / {m} marks", "Marks for question {n}", "No similar question is left for this skill and level."]) assert.ok(dict[k], k);
  });
});
