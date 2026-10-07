import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { MIN_ANSWERS_TO_COMPLETE, assignSkill, assignmentDetail, assignmentStatus, openAssignmentFor, teacherCurriculum, weeklyAssignments } from "../src/server/teacher/assign";
import { classAssignments } from "../src/server/teacher/assignments";
import { assignmentUpdatesSettled, startPractice, submitAnswer } from "../src/server/practice/session";
import { loadSkillItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const NOW = new Date("2027-02-14T08:00:00Z");

describe("⭐ Assign: teacher assigns a skill", () => {
  let repo: SqliteRepo;
  let teacher: Actor, otherTeacher: Actor, admin: Actor, student: Actor;
  let classId: string, otherClassId: string, skillId: string, students: { id: string; name: string }[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await actorFor("demo.teacher.4a");
    otherTeacher = await actorFor("demo.teacher.5a");
    admin = await actorFor("demo.admin");
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    students = view.students;
    otherClassId = (await teacherCurriculum(repo, otherTeacher))!.classId;
    // a skill with enough published questions to practise
    for (const u of view.units) for (const k of u.skills) if (!skillId && (await loadSkillItems(repo, k.id)).length >= 12) skillId = k.id;
    const st = (await repo.findUnique("Student", { id: students[0].id }))!;
    student = await resolveActor(repo, (await repo.findUnique("User", { id: st.userId }))!);
  });

  test("status rules: only work done for the assignment counts", () => {
    const base = { mastery: 0, target: 75, dueAt: null, now: NOW };
    assert.equal(assignmentStatus({ ...base, answered: 0 }).status, "NOT_STARTED");
    assert.equal(assignmentStatus({ ...base, answered: 3, mastery: 40 }).status, "IN_PROGRESS");
    assert.equal(assignmentStatus({ ...base, answered: MIN_ANSWERS_TO_COMPLETE - 1, mastery: 95 }).status, "IN_PROGRESS", "high mastery alone is not enough");
    assert.deepEqual(assignmentStatus({ ...base, answered: MIN_ANSWERS_TO_COMPLETE, mastery: 80 }), { status: "COMPLETED", progress: 1 });
    assert.equal(assignmentStatus({ ...base, answered: 2, dueAt: new Date("2027-02-01"), mastery: 10 }).status, "OVERDUE");
    assert.ok(assignmentStatus({ ...base, answered: 9, mastery: 74 }).progress < 1);
  });

  test("the teacher's view: Grade → Unit → Skill → Standard, only their own classes", async () => {
    const view = (await teacherCurriculum(repo, teacher))!;
    assert.equal(view.grade.level, 4);
    assert.ok(view.units.length > 0 && view.units[0].skills[0].standards.length > 0);
    assert.ok(view.classes.every((c) => c.grade === 4), "only the classes this teacher teaches");
    await assert.rejects(teacherCurriculum(repo, teacher, otherClassId), ForbiddenError);
  });

  test("assign to the entire class: every student gets a row and a notification", async () => {
    const before = await repo.count("Notification", { type: "NEW_ASSIGNMENT" });
    const r = await assignSkill(repo, teacher, { classId, skillId, dueAt: new Date("2027-02-20T20:59:59Z"), note: "Read carefully." }, NOW);
    assert.equal(r.students, students.length);
    assert.equal(await repo.count("AssignmentStudent", { assignmentId: r.assignmentId, status: "NOT_STARTED" }), students.length);
    assert.equal((await repo.count("Notification", { type: "NEW_ASSIGNMENT" })) - before, students.length);
    const n = (await repo.findMany("Notification", { link: `/student/assignments/${r.assignmentId}` }))[0];
    assert.match(String(n.title), /Your teacher assigned you a new skill/);
    assert.match(String(n.body), /Due 2027-02-20\. Note: Read carefully\./);
  });

  test("assign to selected students and to one student; never to students outside the class", async () => {
    const two = await assignSkill(repo, teacher, { classId, skillId, studentIds: [students[0].id, students[1].id] }, NOW);
    assert.equal(two.students, 2);
    const one = await assignSkill(repo, teacher, { classId, skillId, studentIds: [students[2].id] }, NOW);
    assert.equal(one.students, 1);
    const outsider = (await repo.findMany("ClassMembership", { classId: otherClassId }))[0].studentId as string;
    await assert.rejects(assignSkill(repo, teacher, { classId, skillId, studentIds: [outsider] }, NOW), /only assign work to students in this class/);
    await assert.rejects(assignSkill(repo, otherTeacher, { classId, skillId }, NOW), ForbiddenError, "another teacher's class");
    await assert.rejects(assignSkill(repo, student, { classId, skillId }, NOW), ForbiddenError, "students cannot assign");
    await assert.rejects(assignSkill(repo, teacher, { classId, skillId, dueAt: new Date("2020-01-01") }, NOW), /in the past/);
    await assert.rejects(assignSkill(repo, teacher, { classId, skillId: "" }, NOW), /Choose a skill/);
    await assert.rejects(assignSkill(repo, teacher, { classId, skillId, startAt: new Date("2027-03-01"), dueAt: new Date("2027-02-28") }, NOW), /after the start date/);
    const g5skill = (await teacherCurriculum(repo, otherTeacher))!.units[0].skills[0].id;
    await assert.rejects(assignSkill(repo, teacher, { classId, skillId: g5skill }, NOW), /this class's curriculum/);
  });

  test("practice links to the assignment and moves the student from Not Started to In Progress to Completed", async () => {
    const assignmentId = await openAssignmentFor(repo, student.studentId!, skillId, NOW);
    assert.ok(assignmentId, "the student has an open assignment for the skill");
    let view = await startPractice(repo, student, skillId, NOW);
    const session = (await repo.findUnique("PracticeSession", { id: view.sessionId }))!;
    assert.equal(session.assignmentId, assignmentId, "the session is linked to the assignment");
    const items = await loadSkillItems(repo, skillId);
    let clock = NOW.getTime();
    const answerRight = async () => {
      const it = items.find((i) => i.questionId === view.question!.questionId)!;
      const correct = it.options ? (it.type === "MULTI_SELECT" ? it.options.filter((o) => o.correct).map((o) => o.label) : it.options.find((o) => o.correct)!.label)
        : it.type === "TRUE_FALSE" ? it.answer : it.answers?.[0] ?? it.sequence ?? it.errorIndex;
      ({ view } = await submitAnswer(repo, student, { sessionId: view.sessionId, questionId: it.questionId, response: correct }, new Date((clock += 30_000))));
      if (!view.question) view = await startPractice(repo, student, skillId, new Date((clock += 1000)));
    };
    await answerRight();
    await assignmentUpdatesSettled();
    let row = (await repo.findMany("AssignmentStudent", { assignmentId: assignmentId!, studentId: student.studentId! }))[0];
    assert.equal(row.status, "IN_PROGRESS");
    for (let i = 0; i < 25 && row.status !== "COMPLETED"; i++) {
      await answerRight();
      await assignmentUpdatesSettled();
      row = (await repo.findMany("AssignmentStudent", { assignmentId: assignmentId!, studentId: student.studentId! }))[0];
    }
    assert.equal(row.status, "COMPLETED", "enough correct answers reach the target mastery");
    assert.equal(Number(row.progress), 1);
    assert.ok(row.completedAt);
    const detail = await assignmentDetail(repo, teacher, assignmentId!, new Date(clock));
    const mine = detail.students.find((x) => x.studentId === student.studentId)!;
    assert.ok(mine.answered >= MIN_ANSWERS_TO_COMPLETE && mine.accuracy === 100, JSON.stringify(mine));
  });

  test("weekly view and older views count the same statuses; overdue appears after the due date", async () => {
    const week = new Date("2027-02-14T00:00:00Z");
    const rows = await weeklyAssignments(repo, teacher, week, NOW);
    assert.equal(rows.length, 3);
    const whole = rows.find((r) => r.scope === "class")!;
    assert.equal(whole.assigned, students.length);
    assert.equal(whole.counts.COMPLETED, 1);
    assert.equal(whole.counts.NOT_STARTED, students.length - 1);
    const late = await weeklyAssignments(repo, teacher, week, new Date("2027-02-21T08:00:00Z"));
    assert.equal(late.find((r) => r.scope === "class")!.counts.OVERDUE, students.length - 1, "unfinished work becomes overdue");
    const legacy = await classAssignments(repo, teacher, classId, new Date("2027-02-21T08:00:00Z"));
    assert.equal(legacy.find((x) => x.id === whole.id)!.counts.COMPLETED, 1, "the class page uses the same rules");
    assert.deepEqual(await weeklyAssignments(repo, otherTeacher, week, NOW), [], "other teachers do not see them");
    assert.equal((await weeklyAssignments(repo, admin, week, NOW)).length, 3, "school admins see all classes");
    await assert.rejects(assignmentDetail(repo, otherTeacher, whole.id), ForbiddenError);
  });
});
