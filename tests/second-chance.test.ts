import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { accessibleClasses } from "../src/server/teacher/assign";
import { loadQuestionItems, type PracticeItem } from "../src/server/practice/items";
import { answerSecondChance, PAGE_SIZE, pendingMistakes, secondChanceCount, secondChanceView } from "../src/server/second-chance/service";
import { needsHelpCounts, repeatedMistakes } from "../src/server/teacher/repeated-mistakes";
import { navCounts } from "../src/server/teacher/week-plan";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const T0 = Date.parse("2027-02-01T08:00:00Z");
const NOW = new Date("2027-02-14T08:00:00Z");
const at = (min: number) => new Date(T0 + min * 60_000);

/** a right (or wrong) response for a multiple-choice item */
const answerFor = (it: PracticeItem, right: boolean) => it.options!.find((o) => Boolean(o.correct) === right)!.label;

describe("⭐ Second Chance and 🧡 repeated mistakes", () => {
  let repo: SqliteRepo;
  let teacher: Actor, otherTeacher: Actor, admin: Actor, student: Actor, classmate: Actor, outsider: Actor;
  let items: PracticeItem[];
  let practiceSession: string, testSession: string;

  const attempt = (studentId: string, sessionId: string, it: PracticeItem, correct: boolean, min: number, source: string | null = null) =>
    repo.create("QuestionAttempt", { sessionId, studentId, questionId: it.questionId, skillId: it.skillKey, response: { value: answerFor(it, correct) }, isCorrect: correct, responseMs: 20_000, difficultyB: 0, createdAt: at(min), source });

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await actorFor("demo.teacher.4a");
    otherTeacher = await actorFor("demo.teacher.4b");
    admin = await actorFor("demo.admin");
    const [mine] = await accessibleClasses(repo, teacher);
    const [theirs] = await accessibleClasses(repo, otherTeacher);
    const members = async (classId: unknown) => (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId));
    const studentActor = async (sid: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    const [a, b] = await members(mine.id);
    student = await studentActor(a);
    classmate = await studentActor(b);
    outsider = await studentActor((await members(theirs.id))[0]);
    // multiple-choice questions of two different skills
    const qs = await repo.findMany("Question", { status: "PUBLISHED" }, { take: 600 });
    const all = (await loadQuestionItems(repo, qs.map((q) => String(q.id)))).filter((x) => x.type === "MULTIPLE_CHOICE");
    const skillA = all[0].skillKey, skillB = all.find((x) => x.skillKey !== skillA)!.skillKey;
    items = [...all.filter((x) => x.skillKey === skillA).slice(0, 4), ...all.filter((x) => x.skillKey === skillB).slice(0, 2)];
    assert.equal(items.length, 6);

    practiceSession = String((await repo.create("PracticeSession", { studentId: student.studentId, mode: "ADAPTIVE_PRACTICE", startedAt: at(0), endedAt: at(30) })).id);
    const test = await repo.create("Assessment", { title: "Unit quiz", type: "TEACHER_QUIZ", status: "PUBLISHED" });
    testSession = String((await repo.create("PracticeSession", { studentId: student.studentId, assessmentId: test.id, mode: "TEACHER_QUIZ", startedAt: at(40), endedAt: at(50) })).id);
    // 0: wrong then right later (fixed) · 1: wrong (waiting) · 2: right only · 3: wrong twice (waiting, repeated) · 4: wrong in a test · 5: wrong in ReadMaster
    await attempt(student.studentId!, practiceSession, items[0], false, 1);
    await attempt(student.studentId!, practiceSession, items[0], true, 5);
    await attempt(student.studentId!, practiceSession, items[1], false, 2);
    await attempt(student.studentId!, practiceSession, items[2], true, 3);
    await attempt(student.studentId!, practiceSession, items[3], false, 4);
    await attempt(student.studentId!, practiceSession, items[3], false, 6);
    await attempt(student.studentId!, testSession, items[4], false, 41);
    await attempt(student.studentId!, practiceSession, items[5], false, 7, "READMASTER");
    // the classmate: one question wrong once, from the Question of the Day
    await repo.create("QotdAnswer", { studentId: classmate.studentId, day: "2027-02-02", questionId: items[1].questionId, skillId: items[1].skillKey, level: "ON", correct: false, createdAt: at(10) });
    // a student of another class: a question wrong twice
    const os = String((await repo.create("PracticeSession", { studentId: outsider.studentId, mode: "ADAPTIVE_PRACTICE", startedAt: at(0), endedAt: at(30) })).id);
    await attempt(outsider.studentId!, os, items[1], false, 1);
    await attempt(outsider.studentId!, os, items[1], false, 2);
  });

  test("wrong questions are listed; right (and later fixed) ones are not; tests and ReadMaster are included", async () => {
    const p = await pendingMistakes(repo, student.studentId!, NOW);
    const keys = new Set(p.map((x) => x.key));
    assert.ok(!keys.has(items[0].questionId), "a later right answer fixed it");
    assert.ok(keys.has(items[1].questionId));
    assert.ok(!keys.has(items[2].questionId), "never wrong");
    assert.ok(keys.has(items[3].questionId));
    assert.equal(p.find((x) => x.key === items[4].questionId)?.source, "TEST", "test questions are included");
    assert.equal(p.find((x) => x.key === items[5].questionId)?.source, "READMASTER");
    assert.equal(await secondChanceCount(repo, student.studentId!, NOW), 4);
    const v = await secondChanceView(repo, student, {}, NOW);
    assert.equal(v.total, 4);
    assert.ok(v.questions.length <= PAGE_SIZE);
    assert.equal(v.groups.reduce((n, g) => n + g.count, 0), 4, "grouped by skill");
    assert.ok(v.questions.every((q) => !("correct" in (q.q.options?.[0] ?? {}))), "no answer key sent to the page");
    // the menu badge
    assert.equal((await navCounts(repo, student, NOW))["/student/second-chance"]?.count, 4);
  });

  test("a test still being taken is left out until it is over", async () => {
    await repo.updateMany("PracticeSession", { id: testSession }, { endedAt: null });
    assert.ok(!(await pendingMistakes(repo, student.studentId!, NOW)).some((x) => x.key === items[4].questionId));
    await repo.updateMany("PracticeSession", { id: testSession }, { endedAt: at(50) });
  });

  test("fixing a question removes it; SecondChanceAnswer never touches attempts, mastery or levels", async () => {
    const snap = async () => JSON.stringify(await Promise.all([
      repo.count("QuestionAttempt", { studentId: student.studentId }),
      repo.findMany("StudentSkillMastery", { studentId: student.studentId }),
      repo.findMany("StudentAbility", { studentId: student.studentId }),
      repo.findMany("StudentLevel", { studentId: student.studentId }),
      repo.findMany("StudentTier", { studentId: student.studentId }),
      repo.count("AdaptiveDecisionLog", { studentId: student.studentId }),
    ]));
    const before = await snap();
    const wrong = await answerSecondChance(repo, student, items[1].questionId, answerFor(items[1], false), new Date(NOW.getTime() + 1000));
    assert.equal(wrong.correct, false);
    assert.ok((await pendingMistakes(repo, student.studentId!, NOW)).some((x) => x.key === items[1].questionId), "a wrong try keeps it on the list");
    const right = await answerSecondChance(repo, student, items[1].questionId, answerFor(items[1], true), new Date(NOW.getTime() + 2000));
    assert.equal(right.correct, true);
    assert.equal(right.remaining, 3);
    assert.ok(!(await pendingMistakes(repo, student.studentId!, NOW)).some((x) => x.key === items[1].questionId), "fixed");
    assert.equal(await repo.count("SecondChanceAnswer", { studentId: student.studentId }), 2);
    assert.equal(await snap(), before, "no attempt, mastery, ability, level or tier change");
    // a fixed (or never wrong) question cannot be answered again here
    await assert.rejects(answerSecondChance(repo, student, items[1].questionId, "A"), /not waiting/);
    await assert.rejects(answerSecondChance(repo, student, items[2].questionId, "A"), /not waiting/);
  });

  test("a student only sees their own list", async () => {
    const mine = (await secondChanceView(repo, classmate, {}, NOW)).questions.map((q) => q.key);
    assert.deepEqual(mine, [items[1].questionId], "the classmate sees only their own Question of the Day mistake");
    await assert.rejects(answerSecondChance(repo, classmate, items[3].questionId, "A"), /not waiting/, "another student's question");
    await assert.rejects(secondChanceView(repo, teacher, {}, NOW), /Students only/);
  });

  test("ReadRise questions come in and can be fixed", async () => {
    const art = await repo.create("RRArticle", { code: "SC-1", title: "Bees", topic: "science", pollStatement: "Bees matter.", status: "PUBLISHED" });
    await repo.create("RRVersion", { articleId: art.id, level: 500, title: "Bees", body: "Bees make honey.", wordCount: 3, estLevel: 500 });
    const q = await repo.create("RRQuestion", { articleId: art.id, band: "LOW", number: 1, stem: "What do bees make?", options: ["Milk", "Honey", "Bread", "Silk"], answer: "B", skill: "detail" });
    await repo.create("RRRun", { studentId: classmate.studentId, schoolId: classmate.schoolId, articleId: art.id, versionLevel: 500, band: "LOW", step: "DONE", answers: { "1": "A" }, score: 0, levelBefore: 500, startedAt: at(20) });
    const v = await secondChanceView(repo, classmate, {}, NOW);
    const rr = v.questions.find((x) => x.key === `rr:${q.id}`)!;
    assert.equal(rr.source, "READRISE");
    assert.equal(rr.q.passage?.text, "Bees make honey.");
    assert.equal((await answerSecondChance(repo, classmate, `rr:${q.id}`, "B", new Date(NOW.getTime() + 3000))).correct, true);
    assert.ok(!(await pendingMistakes(repo, classmate.studentId!, NOW)).some((x) => x.key === `rr:${q.id}`));
  });

  test("repeated mistakes: a question wrong twice shows its skill; once is not enough", async () => {
    const rows = await repeatedMistakes(repo, teacher, {}, NOW);
    const me = rows.find((r) => r.studentId === student.studentId)!;
    assert.ok(me, "the student with a question wrong twice");
    assert.deepEqual(me.skills.map((k) => k.skillId), [items[3].skillKey]);
    assert.equal(me.skills[0].count, 1);
    assert.ok(me.skills[0].sample.length > 0 && me.skills[0].assignable);
    assert.ok(!rows.some((r) => r.studentId === classmate.studentId), "one wrong answer is not repeated");
    assert.equal((await needsHelpCounts(repo, teacher, NOW))[student.studentId!], 1);
  });

  test("a teacher cannot see another class; an admin sees the school", async () => {
    assert.ok(!(await repeatedMistakes(repo, teacher, {}, NOW)).some((r) => r.studentId === outsider.studentId));
    const [theirs] = await accessibleClasses(repo, otherTeacher);
    await assert.rejects(repeatedMistakes(repo, teacher, { classId: String(theirs.id) }, NOW), /do not teach/);
    await assert.rejects(repeatedMistakes(repo, teacher, { studentId: outsider.studentId! }, NOW), /not in your classes/);
    assert.ok((await repeatedMistakes(repo, otherTeacher, {}, NOW)).some((r) => r.studentId === outsider.studentId));
    const school = await repeatedMistakes(repo, admin, {}, NOW);
    assert.ok(school.some((r) => r.studentId === outsider.studentId) && school.some((r) => r.studentId === student.studentId));
    await assert.rejects(repeatedMistakes(repo, student, {}, NOW), /Teachers and admins/);
  });
});
