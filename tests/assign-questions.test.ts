import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { createDraft, listQuestions } from "../src/server/admin/questions";
import { assignQuestions, assignmentDetail, teacherRoster, weeklyAssignments } from "../src/server/teacher/assign";
import { assignedSkills, assignmentReport } from "../src/server/student/assigned";
import { listNotifications } from "../src/server/notifications";
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";

describe("⭐ assign chosen questions from the question list", () => {
  let repo: SqliteRepo;
  let teacher: Actor, otherTeacher: Actor, student: Actor, classmate: Actor, admin: Actor;
  let classId: string, chosen: string[], assignmentId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, otherTeacher, student, classmate, admin] = await Promise.all(["test.teacher.1", "test.teacher.3", "test.student.005", "test.student.006", "test.admin"].map(a));
  });

  test("the teacher searches by skill name and sees the class roster", async () => {
    const found = await listQuestions(repo, teacher, { status: "PUBLISHED", gradeLevel: 4, q: "central idea" });
    assert.ok(found.items.length >= 3, "skill-name search finds the skill's questions");
    assert.ok(found.items.some((x) => /central idea/i.test(x.skill) && !/central idea/i.test(x.stem)), "including questions whose text does not mention it");
    // the teacher stars 3 of them (a stable choice: auto-marked types only, ordered by id)
    chosen = found.items.filter((x) => x.type !== "SHORT_ANSWER").map((x) => x.id).sort().slice(0, 3);
    const roster = await teacherRoster(repo, teacher);
    assert.deepEqual(roster.map((c) => c.name), ["TEST 4A"]);
    classId = roster[0].id;
    assert.equal(roster[0].students.length, 34);
    assert.deepEqual(await teacherRoster(repo, student), [], "students get no roster");
  });

  test("assign 3 chosen questions to two students; only they are notified", async () => {
    const r = await assignQuestions(repo, teacher, { classId, questionIds: chosen, studentIds: [student.studentId!, classmate.studentId!], title: "Central idea check", dueAt: new Date(Date.now() + 3 * 86_400_000), note: "Read carefully" });
    assignmentId = r.assignmentId;
    assert.deepEqual([r.students, r.questions], [2, 3]);
    const n = (await listNotifications(repo, student)).find((x) => x.link === `/student/assignments/${assignmentId}`)!;
    assert.match(n.title, /assigned you questions/);
    assert.match(n.body, /Central idea check \(3 questions\)\. Due .*Note: Read carefully/);
    const outsider = await resolveActor(repo, (await repo.findUnique("User", { username: "test.student.007" }))!);
    assert.ok(!(await assignedSkills(repo, outsider)).items.some((i) => i.assignmentId === assignmentId), "not for other students");
  });

  test("the rules: own classes only, published questions only, 1–50 questions, teachers (or the admin for the class teacher)", async () => {
    await assert.rejects(assignQuestions(repo, otherTeacher, { classId, questionIds: chosen }), ForbiddenError);
    await assert.rejects(assignQuestions(repo, student, { classId, questionIds: chosen }), ForbiddenError);
    // a school admin sends on behalf of the class's teacher (Update 22)
    const byAdmin = await assignQuestions(repo, admin, { classId, questionIds: chosen });
    const t1 = (await repo.findMany("ClassTeacher", { classId }))[0];
    assert.equal(String((await repo.findUnique("Assignment", { id: byAdmin.assignmentId }))!.createdById), String(t1.teacherId));
    await repo.deleteMany("AssignmentStudent", { assignmentId: byAdmin.assignmentId });
    await repo.updateMany("Assignment", { id: byAdmin.assignmentId }, { deletedAt: new Date() });
    await assert.rejects(assignQuestions(repo, teacher, { classId, questionIds: [] }), /at least one question/);
    // a short answer (marked by a teacher) cannot go into a set
    const testAdmin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    const skillId = String((await repo.findUnique("Question", { id: chosen[0] }))!.skillId);
    const shortId = await createDraft(repo, testAdmin, { skillId, type: "SHORT_ANSWER", stem: "Explain the central idea in your own words.", level: 3, whyCorrect: "A good answer names the central idea.", answers: ["The central idea is…"] });
    await repo.updateMany("Question", { id: shortId }, { status: "PUBLISHED" });
    await assert.rejects(assignQuestions(repo, teacher, { classId, questionIds: [...chosen, shortId] }), /short answer that a teacher must mark/);
    const draft = (await repo.findMany("Question", {})).find((q) => q.status !== "PUBLISHED");
    if (draft) await assert.rejects(assignQuestions(repo, teacher, { classId, questionIds: [String(draft.id)] }), /Only published/);
    const g5 = (await repo.findMany("ClassMembership", {})).find((m) => m.classId !== classId)!;
    await assert.rejects(assignQuestions(repo, teacher, { classId, questionIds: chosen, studentIds: [String(g5.studentId)] }), /only assign work to students in this class/);
    const demoQ = (await repo.findMany("Question", { status: "PUBLISHED" })).find((q) => !chosen.includes(String(q.id)) && String(q.externalRef ?? "").startsWith("DEMO"));
    if (demoQ) await assert.rejects(assignQuestions(repo, teacher, { classId, questionIds: [String(demoQ.id)] }), /another school/);
  });

  test("the student answers exactly those questions, in order, one attempt each, then sees the report", async () => {
    const home = await assignedSkills(repo, student);
    const item = home.items.find((i) => i.assignmentId === assignmentId)!;
    assert.deepEqual([item.kind, item.questionCount, item.status], ["questions", 3, "NOT_STARTED"]);
    let v = await startQuiz(repo, student, assignmentId);
    assert.deepEqual([v.index, v.total, v.question?.questionId], [1, 3, chosen[0]]);
    const items = new Map((await loadQuestionItems(repo, chosen)).map((i) => [i.questionId, i]));
    // the exact answer shape for every question type (as in the test environment)
    const right = (id: string): unknown => {
      const it = items.get(id)!;
      switch (it.type) {
        case "MULTI_SELECT": return it.options!.filter((o) => o.correct).map((o) => o.label);
        case "MULTIPLE_CHOICE": case "DROPDOWN": return it.options!.find((o) => o.correct)!.label;
        case "TRUE_FALSE": return it.answer;
        case "FILL_BLANK": return it.answers![0];
        case "SENTENCE_ORDER": case "WORD_ORDER": return it.sequence;
        case "ERROR_CORRECTION": return it.errorIndex;
        case "MATCHING": return Object.fromEntries(it.pairs!.map((p) => [p.left, p.right]));
        default: throw new Error(`no answer for ${it.type}`);
      }
    };
    // a valid but wrong answer (select-all questions take a list of labels)
    const wrong = (id: string): unknown => {
      const it = items.get(id)!;
      const label = it.options?.find((o) => !o.correct)?.label;
      if (!label) return right(id);
      return it.type === "MULTI_SELECT" ? [label] : label;
    };
    let r = await submitQuizAnswer(repo, student, { assignmentId, questionId: chosen[0], response: right(chosen[0]) });
    assert.equal(r.feedback.correct, true);
    assert.ok(r.feedback.correctAnswer && r.feedback.whyCorrect, "the correct answer is shown after each question");
    await assert.rejects(submitQuizAnswer(repo, student, { assignmentId, questionId: chosen[0], response: right(chosen[0]) }), /already answered/, "one attempt per question");
    assert.equal((await assignedSkills(repo, student)).items.find((i) => i.assignmentId === assignmentId)!.status, "IN_PROGRESS");
    v = await startQuiz(repo, student, assignmentId);
    assert.equal(v.question?.questionId, chosen[1], "continues where the student stopped");
    r = await submitQuizAnswer(repo, student, { assignmentId, questionId: chosen[1], response: wrong(chosen[1]) });
    r = await submitQuizAnswer(repo, student, { assignmentId, questionId: chosen[2], response: right(chosen[2]) });
    assert.equal(r.view.ended, true);
    const done = (await assignedSkills(repo, student)).items.find((i) => i.assignmentId === assignmentId)!;
    assert.deepEqual([done.status, done.progress], ["COMPLETED", 1]);
    const rep = await assignmentReport(repo, student, assignmentId);
    const expectCorrect = items.get(chosen[1])!.options ? 2 : 3;
    assert.deepEqual([rep.answered, rep.correct, rep.score], [3, expectCorrect, Math.round((100 * expectCorrect) / 3)]);
    assert.ok((await repo.count("StudentSkillMastery", { studentId: student.studentId! })) > 0, "answers count toward the student's mastery");
    await assert.rejects(startQuiz(repo, (await resolveActor(repo, (await repo.findUnique("User", { username: "test.student.007" }))!)), assignmentId), ForbiddenError, "other students cannot open it");
  });

  test("the teacher sees it in the weekly view and the results page", async () => {
    const week = await weeklyAssignments(repo, teacher, new Date(Date.now() - 86_400_000));
    const row = week.find((x) => x.id === assignmentId)!;
    assert.deepEqual([row.assigned, row.counts.COMPLETED, row.counts.NOT_STARTED, row.scope], [2, 1, 1, "students"]);
    const det = await assignmentDetail(repo, teacher, assignmentId);
    assert.equal(det.students.find((x) => x.studentId === student.studentId)!.answered, 3);
    assert.equal((await assignmentReport(repo, teacher, assignmentId, student.studentId!)).answered, 3);
  });
});
