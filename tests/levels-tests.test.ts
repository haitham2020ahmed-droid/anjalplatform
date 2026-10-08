import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { assignFromMap, classLevels, giveTest, previewMapAssign, rosterForGrade, setStudentLevels, studentLevels } from "../src/server/curriculum-map/levels";
import { curriculumResults } from "../src/server/curriculum-map/results";
import { classifyQuestions, unclassifiedQuestions } from "../src/server/curriculum-map/questions";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { assignmentReport } from "../src/server/student/assigned";
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";

const right = (it: Awaited<ReturnType<typeof loadQuestionItems>>[number]): unknown => {
  switch (it.type) {
    case "MULTI_SELECT": return it.options!.filter((o) => o.correct).map((o) => o.label);
    case "MULTIPLE_CHOICE": case "DROPDOWN": return it.options!.find((o) => o.correct)!.label;
    case "TRUE_FALSE": return it.answer;
    case "FILL_BLANK": return it.answers![0];
    case "SENTENCE_ORDER": case "WORD_ORDER": return it.sequence;
    case "ERROR_CORRECTION": return it.errorIndex;
    case "MATCHING": return Object.fromEntries(it.pairs!.map((p) => [p.left, p.right]));
    default: throw new Error(it.type);
  }
};
const wrong = (it: Awaited<ReturnType<typeof loadQuestionItems>>[number]): unknown => {
  if (it.type === "MULTIPLE_CHOICE" || it.type === "DROPDOWN") return it.options!.find((o) => !o.correct)!.label;
  if (it.type === "MULTI_SELECT") return [it.options!.find((o) => !o.correct)!.label];
  if (it.type === "TRUE_FALSE") return !it.answer;
  if (it.type === "FILL_BLANK") return "zzzz";
  if (it.type === "ERROR_CORRECTION") return (it.errorIndex! + 1) % it.segments!.length;
  return right(it);
};

describe("student levels, assign by level, Placement and MAP tests, curriculum results, classifying", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let admin: Actor;
  let classId: string; let studentIds: string[];
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  const mc = (stem: string, map: string) => createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem, level: 4, whyCorrect: "Because.", mapNodeCode: map,
    options: [{ label: "A", text: `right ${stem}`, correct: true, rationale: null }, { label: "B", text: `wrong one ${stem}`, correct: false, rationale: "No." }, { label: "C", text: `wrong two ${stem}`, correct: false, rationale: "No." }] });
  const takeAll = async (st: Actor, assignmentId: string, correct: boolean) => {
    let v = await startQuiz(repo, st, assignmentId);
    while (v.question) {
      const it = (await loadQuestionItems(repo, [v.question.questionId]))[0];
      v = (await submitQuizAnswer(repo, st, { assignmentId, questionId: it.questionId, response: correct ? right(it) : wrong(it) })).view;
    }
  };
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, other, admin] = await Promise.all(["test.teacher.1", "test.teacher.3", "test.admin"].map(a));
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const roster = await teacherRoster(repo, teacher);
    classId = roster[0].id; studentIds = roster[0].students.map((x) => x.id);
    // questions on G4 · Unit 1 · Text Set 2 · Analyze Craft: 3 Above, 3 On, none Below; 2 Concept Vocabulary
    const ids: string[] = [];
    for (let i = 1; i <= 3; i++) ids.push(await mc(`Above question ${i} about the plot`, "G4.U1.TS2.ACS.ABOVE"), await mc(`On question ${i} about the plot`, "G4.U1.TS2.ACS.ON"));
    for (let i = 1; i <= 2; i++) ids.push(await mc(`Vocabulary question ${i} about idioms`, "G4.U1.TS2.CV"));
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
  });

  test("levels: the teacher sets them for their own class only", async () => {
    await setStudentLevels(repo, teacher, classId, [...studentIds.slice(0, 3).map((studentId) => ({ studentId, level: "ABOVE" as const })), ...studentIds.slice(3, 5).map((studentId) => ({ studentId, level: "BELOW" as const }))]);
    const v = await classLevels(repo, teacher, classId);
    assert.deepEqual([v.students.filter((x) => x.level === "ABOVE").length, v.students.filter((x) => x.level === "BELOW").length, v.students.filter((x) => !x.level).length], [3, 2, v.students.length - 5]);
    await assert.rejects(setStudentLevels(repo, other, classId, [{ studentId: studentIds[0], level: "ON" }]), ForbiddenError);
    const outsider = (await repo.findMany("ClassMembership", {})).find((m) => !studentIds.includes(String(m.studentId)))!;
    await assert.rejects(setStudentLevels(repo, teacher, classId, [{ studentId: String(outsider.studentId), level: "ON" }]), /not in this class/);
  });

  test("assign by level: each student gets the questions of their level; empty levels fall back to On", async () => {
    const p = await previewMapAssign(repo, teacher, classId, "G4.U1.TS2.ACS");
    assert.deepEqual(p.levels.map((x) => [x.level, x.questions]), [["ABOVE", 3], ["ON", 3], ["BELOW", 0]]);
    const r = await assignFromMap(repo, teacher, { classId, categoryCode: "G4.U1.TS2.ACS", mode: "BY_LEVEL" });
    const g = new Map(r.groups.map((x) => [x.level, x]));
    assert.deepEqual([g.get("ABOVE")!.students, g.get("BELOW")!.students, g.get("ON")!.students], [3, 2, studentIds.length - 5]);
    assert.equal(g.get("BELOW")!.usedLevel, "ON");
    assert.ok(r.notes.some((n) => /Below Level has no questions/.test(n)) && r.notes.some((n) => /have no level yet/.test(n)));
    const aboveSet = await repo.findUnique("Assignment", { id: g.get("ABOVE")!.assignmentId });
    const qs = (await repo.findMany("AssessmentQuestion", { assessmentId: aboveSet!.assessmentId })).map((x) => String(x.questionId));
    const stems = (await repo.findMany("Question", { id: { in: qs } })).map((x) => String(x.stem));
    assert.ok(stems.length === 3 && stems.every((x) => x.startsWith("Above question")));
    assert.match(String(aboveSet!.title), /Unit 1 · Text Set 2: Realistic Fiction · Analyze Craft and Structure \(Above Level\)/);
    const cv = await assignFromMap(repo, teacher, { classId, categoryCode: "G4.U1.TS2.CV" });
    assert.deepEqual(cv.groups.map((x) => [x.level, x.students, x.questions]), [[null, studentIds.length, 2]]);
    await assert.rejects(assignFromMap(repo, teacher, { classId, categoryCode: "G4.U2.TS1.ACS" }), /no published questions/);
    await assert.rejects(assignFromMap(repo, teacher, { classId, categoryCode: "G5.U1.TS1.ACS" }), /This class is Grade 4/);
    await assert.rejects(assignFromMap(repo, other, { classId, categoryCode: "G4.U1.TS2.ACS" }), ForbiddenError);
    // results on the map: a student answers their set
    await takeAll(await student(studentIds[0]), g.get("ABOVE")!.assignmentId, true);
    const res = await curriculumResults(repo, teacher, classId);
    const place = res.units.flatMap((u) => u.sets).flatMap((x) => x.places).find((x) => x.code === "G4.U1.TS2.ACS.ABOVE")!;
    assert.deepEqual([place.answered, place.pct, place.students], [3, 100, 1]);
  });

  test("Placement test sets each student's level from the score; MAP test reports by MAP goal area", async () => {
    // mark 8 published auto-marked Grade 4 questions for Placement and for MAP
    const g4 = (await repo.findMany("Grade", { schoolId: admin.schoolId!, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const skills = (await repo.findMany("Skill", { curriculumId: cur.id, isActive: true })).map((k) => k.id);
    const mcType = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    const pool = (await repo.findMany("Question", { skillId: { in: skills }, status: "PUBLISHED", typeId: mcType.id })).slice(0, 8);
    // MAP needs questions with a real skill (curriculum questions here are still Unclassified); Placement uses the curriculum automatically
    await assert.rejects(giveTest(repo, teacher, { classId, kind: "MAP_TEST" }), /at least 5 are needed/);
    await repo.createMany("QuestionUse", pool.flatMap((q) => [{ questionId: q.id, use: "PLACEMENT", createdAt: new Date() }, { questionId: q.id, use: "MAP_TEST", createdAt: new Date() }]));
    const t = await giveTest(repo, teacher, { classId, kind: "PLACEMENT", questions: 8, studentIds: studentIds.slice(10, 12) });
    assert.equal(t.students, 2);
    assert.ok(t.questions >= 8, "adaptive Placement: the whole pool (marked + the grade's curriculum questions); each student answers at most 8");
    await takeAll(await student(studentIds[10]), t.assignmentId, true);
    await takeAll(await student(studentIds[11]), t.assignmentId, false);
    const lv = await studentLevels(repo, studentIds.slice(10, 12));
    assert.deepEqual([lv.get(studentIds[10]), lv.get(studentIds[11])], [{ level: "ABOVE", source: "PLACEMENT" }, { level: "BELOW", source: "PLACEMENT" }]);
    const m = await giveTest(repo, teacher, { classId, kind: "MAP_TEST", questions: 8, studentIds: [studentIds[12]] });
    const st = await student(studentIds[12]);
    await takeAll(st, m.assignmentId, true);
    const rep = await assignmentReport(repo, st, m.assignmentId);
    const areaNames = new Set((await repo.findMany("MapGoalArea", {})).map((a) => String(a.name)));
    assert.equal(rep.score, 100);
    assert.ok(rep.strengths.length > 0 && rep.strengths.every((x) => [...areaNames].some((n) => x.startsWith(`${n}: `))), JSON.stringify(rep.strengths));
    assert.equal(String((await repo.findUnique("Assignment", { id: m.assignmentId }))!.track), "MAP");
  });

  test("classifying: Unclassified curriculum questions get a real skill of the same grade", async () => {
    const before = await unclassifiedQuestions(repo, admin.schoolId!);
    const row = before.rows.find((r) => r.stem.startsWith("On question 1"))!;
    assert.equal(row.mapCode, "G4.U1.TS2.ACS.ON");
    const g4skill = before.skills.find((k) => k.grade === 4)!, g5skill = before.skills.find((k) => k.grade === 5)!;
    await assert.rejects(classifyQuestions(repo, admin.schoolId!, admin.userId, [{ questionId: row.id, skillId: g5skill.id }]), /Grade 5, the question is Grade 4/);
    assert.equal(await classifyQuestions(repo, admin.schoolId!, admin.userId, [{ questionId: row.id, skillId: g4skill.id }]), 1);
    const after = await unclassifiedQuestions(repo, admin.schoolId!);
    assert.ok(!after.rows.some((r) => r.id === row.id));
    assert.equal(String((await repo.findMany("QuestionMapLink", { questionId: row.id }))[0].nodeId) !== "", true, "its map place is unchanged");
  });

  test("the fast roster (one set of queries) equals the per-class roster", async () => {
    const fast = await rosterForGrade(repo, teacher, 4);
    const cls = fast.find((c) => c.id === classId)!;
    const slow = await classLevels(repo, teacher, classId);
    assert.deepEqual(cls.students.map((x) => [x.id, x.level]), slow.students.map((x) => [x.id, x.level]));
    assert.deepEqual(await rosterForGrade(repo, teacher, 6), [], "no Grade 6 class for this teacher");
  });
});
