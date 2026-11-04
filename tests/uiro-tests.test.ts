/**
 * UI reorg Phase 5 — Assessments, My Tests, results by skill, Reteach, templates, admin counts.
 * Test School (in-memory database, invented students only). Follows the ACCEPTANCE CHECK step:
 * build a Weekly Quiz → assign → To Do → submit → Completed with score → results by skill → Reteach → My Work.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment, rightAnswer } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { assignedSkills } from "../src/server/student/assigned";
import { startQuiz, submitQuizAnswer, type QuizView } from "../src/server/practice/session";
import { loadQuestionItems, type ClientQuestion, type PracticeItem } from "../src/server/practice/items";
import {
  adminTestCounts, assignTest, autoTestName, builderSkills, defaultLevelMode, deleteTemplate, listTemplates, myTests, openTemplate, previewTest, reteach, saveTemplate,
  teacherTests, testResults, testReview, testsToDoCount, RETEACH_PCT,
} from "../src/server/tests/assessments";
import { shuffleChoices, testOrder, unshuffleResponse } from "../src/server/tests/runtime";
import { familyKeyOf, familyRepresentatives, skillFamilyIds } from "../src/server/questions/skill-questions";
import { demoDatabase } from "./helpers/db";

const AUTO = new Set(["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN", "TRUE_FALSE"]);

describe("UI reorg Phase 5 — Assessments and My Tests", () => {
  let repo: SqliteRepo;
  let teacher: Actor, otherTeacher: Actor, student: Actor, classmate: Actor, admin: Actor;
  let classId: string;
  const items = new Map<string, PracticeItem>();
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, otherTeacher, student, classmate, admin] = await Promise.all(["test.teacher.1", "test.teacher.3", "test.student.005", "test.student.006", "test.admin"].map(a));
    classId = (await teacherRoster(repo, teacher))[0].id;
  });

  /** The answer the student gives to the question AS SHOWN (shuffled choices: picked by text). */
  async function answerShown(q: ClientQuestion, right: boolean): Promise<unknown> {
    if (!items.has(q.questionId)) for (const it of await loadQuestionItems(repo, [q.questionId])) items.set(it.questionId, it);
    const it = items.get(q.questionId)!;
    if (q.options && it.options) {
      const good = it.options.filter((o) => o.correct).map((o) => o.text);
      const pick = q.options.filter((o) => (right ? good.includes(o.text) : !good.includes(o.text)));
      const labels = right ? pick.map((o) => o.label) : [pick[0].label];
      return it.type === "MULTI_SELECT" ? labels : labels[0];
    }
    if (!right && it.type === "TRUE_FALSE") return !it.answer;
    return rightAnswer(it);
  }
  /** Two skills of Grade 4 Reading with enough auto-marked choice questions. */
  async function twoSkills(): Promise<{ skillId: string; name: string }[]> {
    const list = await builderSkills(repo, teacher, { filter: "READING", grade: 4 });
    const out: { skillId: string; name: string; familyKey: string }[] = [];
    // skills the student does not have in My Work yet (so Reteach can add one; which skills qualify depends on the pool)
    const mine = new Set((await repo.findMany("Assignment", { id: { in: (await repo.findMany("AssignmentStudent", { studentId: student.studentId })).map((x) => x.assignmentId) } })).map((x) => String(x.skillId)));
    for (const k of list) {
      if (mine.has(k.id)) continue;
      // one question bank: the skill's whole family pool must be choice questions
      const qs = await repo.findMany("Question", { skillId: { in: await skillFamilyIds(repo, k.id) }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "typeId"] });
      const types = qs.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => q.typeId))] } }) : [];
      const choice = qs.filter((q) => AUTO.has(String(types.find((t) => t.id === q.typeId)?.code)));
      if (choice.length >= 6 && choice.length === qs.length && !out.some((x) => x.familyKey === familyKeyOf({ id: k.id, name: k.name, domain: "READING" }))) out.push({ skillId: k.id, name: k.name, familyKey: familyKeyOf({ id: k.id, name: k.name, domain: "READING" }) });
      if (out.length === 2) break;
    }
    assert.equal(out.length, 2, "two Grade 4 reading skills with choice questions");
    return out;
  }

  let skills: { skillId: string; name: string }[];
  let weeklyId: string, studentSet: string;

  test("pick skills from ANY grade (with grade tag) and filter Reading / Grammar / Vocabulary", async () => {
    const all = await builderSkills(repo, teacher);
    const grades = new Set(all.map((k) => k.grade));
    assert.ok(grades.size >= 2, "a Grade 4 teacher sees skills of other grades too");
    const g = await builderSkills(repo, teacher, { filter: "GRAMMAR" });
    assert.ok(g.every((k) => k.filter === "GRAMMAR"));
    const found = await builderSkills(repo, teacher, { q: all[0].name.slice(0, 6) });
    assert.ok(found.some((k) => k.id === all[0].id), "search by name");
    await assert.rejects(builderSkills(repo, student), ForbiddenError);
  });

  test("types: automatic names (editable), custom names, level defaults", () => {
    assert.equal(autoTestName("WEEKLY_QUIZ", 6), "Weekly Quiz – Week 6");
    assert.equal(autoTestName("CHAPTER_TEST", 3), "Chapter Test – Week 3");
    assert.equal(autoTestName("CUSTOM", 3), "", "custom: the teacher types the name");
    assert.equal(defaultLevelMode("WEEKLY_QUIZ"), "LEVEL");
    for (const t of ["NAFS", "MAP", "CHAPTER_TEST"] as const) assert.equal(defaultLevelMode(t), "SAME");
  });

  test("build a Weekly Quiz at each student's level, preview, remove a question, assign to the whole class", async () => {
    skills = await twoSkills();
    const p = await previewTest(repo, teacher, { skills: skills.map((k) => ({ skillId: k.skillId, count: 3 })), levelMode: "LEVEL" });
    assert.deepEqual(Object.keys(p.versions).sort(), ["ABOVE", "BELOW", "ON"]);
    for (const l of ["BELOW", "ON", "ABOVE"] as const) assert.equal(p.versions[l]!.length, 6, `${l}: 3 per skill`);
    // remove one question from the On Level version (preview)
    const on = p.versions.ON!.map((q) => q.id);
    const removed = on[on.length - 1];
    const questions = { BELOW: p.versions.BELOW!.map((q) => q.id), ON: on.slice(0, -1), ABOVE: p.versions.ABOVE!.map((q) => q.id) };
    const r = await assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "WEEKLY_QUIZ", title: "", levelMode: "LEVEL", questions, dueAt: new Date(Date.now() + 5 * 86_400_000) });
    weeklyId = r.testId;
    assert.equal(r.students, 34);
    const t = await repo.findUnique("TeacherTest", { id: weeklyId });
    assert.match(String(t!.title), /^Weekly Quiz – Week \d+$/, "automatic name");
    // the student (no data yet: On Level) gets the On Level version without the removed question
    const mine = await myTests(repo, student);
    assert.equal(mine.toDo.length, 1);
    assert.deepEqual([mine.toDo[0].tag, mine.toDo[0].questions, mine.completed.length], ["Weekly Quiz", 5, 0]);
    assert.ok(mine.toDo[0].dueAt, "To Do shows the due date");
    assert.ok(!/Level/.test(mine.toDo[0].title), "students never see level names");
    studentSet = mine.toDo[0].assignmentId;
    const set = await repo.findUnique("Assignment", { id: studentSet });
    const qids = (await repo.findMany("AssessmentQuestion", { assessmentId: set!.assessmentId })).map((x) => String(x.questionId));
    assert.ok(!qids.includes(removed));
    assert.equal(await testsToDoCount(repo, student), 1, "badge: tests to do");
    // tests live in My Tests, not in My Work
    assert.ok(!(await assignedSkills(repo, student)).items.some((i) => i.assignmentId === studentSet));
    assert.ok((await teacherTests(repo, teacher)).some((x) => x.id === weeklyId));
  });

  test("assign to one student or a group only; only the teacher's own classes (server-side)", async () => {
    const p = await previewTest(repo, teacher, { skills: [{ skillId: skills[0].skillId, count: 2 }], levelMode: "SAME" });
    const q = { SAME: p.versions.SAME!.map((x) => x.id) };
    const one = await assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "CUSTOM", title: "Friday check-in", questions: q, studentIds: [classmate.studentId!] });
    assert.equal(one.students, 1);
    const tagOf = (await myTests(repo, classmate)).toDo.find((x) => x.title === "Friday check-in")!;
    assert.equal(tagOf.tag, "Friday check-in", "a custom test shows its own name");
    assert.equal((await teacherTests(repo, teacher)).find((x) => x.id === one.testId)!.typeName, "Other", "custom tests group as Other");
    assert.ok(!(await myTests(repo, student)).toDo.some((x) => x.title === "Friday check-in"), "not for other students");
    await assert.rejects(assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "CUSTOM", title: "", questions: q }), /name/);
    await assert.rejects(assignTest(repo, otherTeacher, { source: "CURRICULUM", classId, type: "MAP", questions: q }), ForbiddenError, "another teacher's class");
    const outsider = (await repo.findMany("ClassMembership", {})).find((m) => m.classId !== classId)!;
    await assert.rejects(assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "MAP", questions: q, studentIds: [String(outsider.studentId)] }), ForbiddenError);
    await assert.rejects(assignTest(repo, student, { source: "CURRICULUM", classId, type: "MAP", questions: q }), ForbiddenError);
  });

  test("the student takes it (no right/wrong while testing), submits, and it moves to Completed with the score", async () => {
    let v: QuizView = await startQuiz(repo, student, studentSet);
    assert.equal(v.testMode, true);
    assert.equal(v.isTest, true);
    const qRows = await repo.findMany("Question", { id: { in: (await repo.findMany("AssessmentQuestion", { assessmentId: (await repo.findUnique("Assignment", { id: studentSet }))!.assessmentId })).map((x) => x.questionId) } });
    // one question bank: a question of another grade's copy of a chosen skill counts for that skill
    const repOf = await familyRepresentatives(repo, String(teacher.schoolId), qRows.map((q) => String(q.skillId)), { ids: skills.map((k) => k.skillId) });
    const skillOf = new Map(qRows.map((q) => [String(q.id), repOf.get(String(q.skillId)) ?? String(q.skillId)]));
    // right on skill 1, wrong on skill 2 → skill 2 is under 70%
    while (v.question) {
      const right = skillOf.get(v.question.questionId) === skills[0].skillId;
      const r = await submitQuizAnswer(repo, student, { assignmentId: studentSet, questionId: v.question.questionId, response: await answerShown(v.question, right) });
      assert.equal(r.feedback.correctAnswer, "", "nothing revealed during the test");
      v = r.view;
    }
    const n1 = [...skillOf.values()].filter((k) => k === skills[0].skillId).length;
    const mine = await myTests(repo, student);
    assert.equal(mine.toDo.length, 0);
    assert.equal(mine.completed.length, 1);
    assert.equal(mine.completed[0].correct, n1);
    assert.equal(mine.completed[0].pct, Math.round((100 * n1) / 5));
    assert.ok(mine.completed[0].completedAt);
    assert.equal(await testsToDoCount(repo, student), 0);
    // review: own answers and the correct ones
    const rv = await testReview(repo, student, studentSet);
    assert.equal(rv.items.length, 5);
    assert.equal(rv.correct, n1);
    assert.ok(rv.items.every((x) => x.correctAnswer && x.answered));
    await assert.rejects(testReview(repo, classmate, studentSet, student.studentId), ForbiddenError, "another student cannot open someone else's answers");
    await assert.rejects(testReview(repo, classmate, studentSet), /when the test is finished/, "a classmate's own review waits until they finish");
  });

  test("the teacher sees the results BY SKILL (who finished, who didn't, scores); another teacher cannot", async () => {
    const r = await testResults(repo, teacher, weeklyId);
    assert.equal(r.finished, 1);
    assert.equal(r.notFinished, 33);
    const k1 = r.skills.find((k) => k.skillId === skills[0].skillId)!, k2 = r.skills.find((k) => k.skillId === skills[1].skillId)!;
    assert.equal(k1.avgPct, 100);
    assert.equal(k2.avgPct, 0);
    assert.deepEqual(k2.below.map((x) => x.id), [student.studentId]);
    assert.ok(k2.below[0].pct < RETEACH_PCT);
    const me = r.students.find((x) => x.id === student.studentId)!;
    assert.equal(me.finished, true);
    assert.ok(r.students.filter((x) => !x.finished).length === 33);
    await assert.rejects(testResults(repo, otherTeacher, weeklyId), ForbiddenError, "another teacher cannot open the results (typed URL)");
    await assert.rejects(testResults(repo, student, weeklyId), ForbiddenError);
    await assert.rejects(testReview(repo, otherTeacher, studentSet, student.studentId), ForbiddenError);
    assert.equal((await testReview(repo, teacher, studentSet, student.studentId)).total, 5, "the class teacher can open a student's answers");
    assert.ok((await testResults(repo, admin, weeklyId)).students.length === 34, "the admin sees all");
    assert.ok(!(await teacherTests(repo, otherTeacher)).some((x) => x.id === weeklyId));
  });

  test("Reteach adds every skill under 70% to that student's My Work (once)", async () => {
    await assert.rejects(reteach(repo, otherTeacher, weeklyId), ForbiddenError);
    const r = await reteach(repo, teacher, weeklyId);
    assert.deepEqual([r.assigned, r.students, r.skipped.length], [1, 1, 0]);
    const work = (await assignedSkills(repo, student)).items;
    const added = work.find((i) => i.kind === "skill" && i.skillId === skills[1].skillId)!;
    assert.ok(added, "skill 2 is in My Work");
    assert.match(String(added.note), /^Reteach: Weekly Quiz – Week \d+$/, "source tag");
    assert.ok(!work.some((i) => i.kind === "skill" && i.skillId === skills[0].skillId), "a skill scored 100% is not added");
    assert.ok(!(await assignedSkills(repo, classmate)).items.some((i) => i.skillId === skills[1].skillId), "only the student who scored under 70%");
    const again = await reteach(repo, teacher, weeklyId);
    assert.equal(again.assigned, 0, "not assigned twice");
  });

  test("time limit is enforced by the server", async () => {
    const p = await previewTest(repo, teacher, { skills: [{ skillId: skills[0].skillId, count: 3 }], levelMode: "SAME" });
    const r = await assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "NAFS", title: "Timed NAFS practice", questions: { SAME: p.versions.SAME!.map((x) => x.id) }, timeLimitMin: 5, studentIds: [classmate.studentId!] });
    const aid = (await myTests(repo, classmate)).toDo.find((x) => x.title === "Timed NAFS practice")!.assignmentId;
    const t0 = new Date();
    let v = await startQuiz(repo, classmate, aid, t0);
    assert.ok(v.endsAt && Math.abs(Date.parse(v.endsAt) - (t0.getTime() + 5 * 60_000)) < 1000, "the end time is shown");
    const first = await submitQuizAnswer(repo, classmate, { assignmentId: aid, questionId: v.question!.questionId, response: await answerShown(v.question!, true) }, new Date(t0.getTime() + 60_000));
    v = first.view;
    // 10 minutes later: time is up — no more answers are saved; the test is completed with what was given
    const late = await submitQuizAnswer(repo, classmate, { assignmentId: aid, questionId: v.question!.questionId, response: await answerShown(v.question!, true) }, new Date(t0.getTime() + 10 * 60_000));
    assert.equal(late.view.question, null);
    const done = (await myTests(repo, classmate)).completed.find((x) => x.assignmentId === aid)!;
    assert.deepEqual([done.correct, done.questions, done.pct], [1, 3, 33]);
    assert.equal((await repo.findMany("QuestionAttempt", { sessionId: v.sessionId })).length, 1);
    assert.equal((await startQuiz(repo, classmate, aid)).question, null, "reopening shows the end");
    void r;
  });

  test("shuffle: question order and answer choices differ per student and stay the same for each student", async () => {
    const p = await previewTest(repo, teacher, { skills: skills.map((k) => ({ skillId: k.skillId, count: 5 })), levelMode: "SAME" });
    const ids = p.versions.SAME!.map((x) => x.id);
    const r = await assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "CHAPTER_TEST", questions: { SAME: ids }, shuffle: true });
    const a = (await repo.findMany("Assignment", { testId: r.testId }))[0];
    const others = (await teacherRoster(repo, teacher))[0].students.map((x) => x.id);
    const orders = new Set(others.slice(0, 6).map((id) => testOrder(a, ids, id).join(",")));
    assert.ok(orders.size > 1, "different students get different orders");
    assert.deepEqual(testOrder(a, ids, others[0]), testOrder(a, ids, others[0]), "deterministic");
    assert.deepEqual([...testOrder(a, ids, others[0])].sort(), [...ids].sort(), "same questions");
    // the quiz player follows the student's order, and choices map back for marking
    const v1 = await startQuiz(repo, student, String(a.id));
    assert.equal(v1.question!.questionId, testOrder(a, ids, student.studentId!)[0]);
    const v2 = await startQuiz(repo, student, String(a.id));
    assert.deepEqual(v2.question!.options, v1.question!.options, "same choices order on reload");
    const it = (await loadQuestionItems(repo, [v1.question!.questionId]))[0];
    if (it.type === "MULTIPLE_CHOICE") {
      const seed = "x:y:z";
      const shown = shuffleChoices({ questionId: it.questionId, type: it.type, stem: "", level: 4, passage: null, image: null, options: it.options!.map((o) => ({ label: o.label, text: o.text })), hasHint: false }, seed);
      const good = it.options!.find((o) => o.correct)!;
      const shownLabel = shown.options!.find((o) => o.text === good.text)!.label;
      assert.equal(unshuffleResponse(it, shownLabel, seed), good.label);
    }
    const res = await submitQuizAnswer(repo, student, { assignmentId: String(a.id), questionId: v1.question!.questionId, response: await answerShown(v1.question!, true) });
    assert.equal(res.view.answered, 1);
    const at = (await repo.findMany("QuestionAttempt", { sessionId: res.view.sessionId }))[0];
    assert.equal(Boolean(at.isCorrect), true, "the right choice (by text) is marked right after shuffling");
  });

  test("save as a template, reuse it and edit it later; templates are private", async () => {
    const p = await previewTest(repo, teacher, { skills: [{ skillId: skills[0].skillId, count: 4 }], levelMode: "SAME" });
    const spec = { skills: [{ skillId: skills[0].skillId, count: 4 }], levelMode: "SAME" as const, timeLimitMin: 20, shuffle: true, questions: { SAME: p.versions.SAME!.map((x) => x.id) } };
    const id = await saveTemplate(repo, teacher, { title: "Unit 2 Chapter Test", type: "CHAPTER_TEST", spec });
    assert.deepEqual((await listTemplates(repo, teacher)).map((t) => [t.title, t.typeName, t.questions]), [["Unit 2 Chapter Test", "Chapter Test", 4]]);
    await assert.rejects(openTemplate(repo, otherTeacher, id), ForbiddenError);
    assert.equal((await listTemplates(repo, otherTeacher)).length, 0);
    // reuse: assign straight from the template
    const t = await openTemplate(repo, teacher, id);
    const r = await assignTest(repo, teacher, { source: "CURRICULUM", classId, type: t.type, title: t.title, levelMode: t.spec.levelMode, questions: t.spec.questions, timeLimitMin: t.spec.timeLimitMin, shuffle: t.spec.shuffle, templateId: id });
    const made = await repo.findUnique("TeacherTest", { id: r.testId });
    assert.deepEqual([made!.templateId, Number(made!.timeLimitMin), Boolean(made!.shuffle)], [id, 20, true]);
    // edit: one question fewer, new name
    await saveTemplate(repo, teacher, { id, title: "Unit 2 Chapter Test (v2)", type: "CHAPTER_TEST", spec: { ...spec, questions: { SAME: spec.questions.SAME.slice(1) } } });
    assert.deepEqual((await listTemplates(repo, teacher)).map((x) => [x.title, x.questions]), [["Unit 2 Chapter Test (v2)", 3]]);
    await assert.rejects(saveTemplate(repo, otherTeacher, { id, title: "mine", type: "MAP", spec }), ForbiddenError);
    await deleteTemplate(repo, teacher, id);
    assert.equal((await listTemplates(repo, teacher)).length, 0);
  });

  test("admin: tests per teacher and students who completed them (teachers cannot open it)", async () => {
    const c = await adminTestCounts(repo, admin);
    const t1 = c.teachers.find((x) => x.name === "Test Teacher 1")!;
    assert.ok(t1.tests >= 5);
    assert.ok(t1.completed >= 2);
    assert.equal(t1.byType["Weekly Quiz"], 1);
    assert.equal(c.totals.tests, c.teachers.reduce((a, x) => a + x.tests, 0));
    await assert.rejects(adminTestCounts(repo, teacher), ForbiddenError);
  });
});
