import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { assignedSkills, assignmentReport, isAssignedSkill, placementRequired, setPlacementRequired } from "../src/server/student/assigned";
import { listNotifications, markAllRead, openNotification, unreadCount } from "../src/server/notifications";
import { assignmentUpdatesSettled, startPractice, submitAnswer } from "../src/server/practice/session";
import { loadSkillItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const NOW = new Date("2027-03-07T08:00:00Z");

describe("student: assigned skills only, notifications, report", () => {
  let repo: SqliteRepo;
  let teacher: Actor, otherTeacher: Actor, admin: Actor, student: Actor, classmate: Actor;
  let classId: string, skillA: string, skillB: string, skillC: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await actorFor("demo.teacher.4a");
    otherTeacher = await actorFor("demo.teacher.5a");
    admin = await actorFor("demo.admin");
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    const usable: string[] = [];
    for (const u of view.units) for (const k of u.skills) if (!usable.includes(k.id) && (await loadSkillItems(repo, k.id)).length >= 5) usable.push(k.id); // a skill can sit in several units
    [skillA, skillB] = usable;
    skillC = view.units.flatMap((u) => u.skills).find((k) => k.id !== skillA && k.id !== skillB)!.id; // only assigned, never practised
    const toActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
    student = await toActor(view.students[0].id);
    classmate = await toActor(view.students[1].id);
  });

  test("before anything is assigned: an empty list, and no practice allowed", async () => {
    const v = await assignedSkills(repo, student, NOW);
    assert.deepEqual([v.items, v.summary.assigned], [[], 0]);
    assert.equal(await isAssignedSkill(repo, student, skillA, NOW), false, "the server refuses unassigned practice");
  });

  test("the home page lists only assigned skills, with status, dates and a summary", async () => {
    await assignSkill(repo, teacher, { classId, skillId: skillA, dueAt: new Date("2027-03-08T20:59:59Z"), note: "Focus on the clues." }, NOW);
    await assignSkill(repo, teacher, { classId, skillId: skillB, studentIds: [student.studentId!] }, NOW);
    await assignSkill(repo, teacher, { classId, skillId: skillC, studentIds: [classmate.studentId!] }, NOW); // not for our student
    await assignSkill(repo, teacher, { classId, skillId: skillC, studentIds: [student.studentId!], startAt: new Date("2027-03-20T00:00:00Z") }, NOW);
    const v = await assignedSkills(repo, student, NOW);
    assert.equal(v.items.length, 3);
    assert.deepEqual(new Set(v.items.map((i) => i.skillId)), new Set([skillA, skillB, skillC]));
    assert.deepEqual(v.summary, { assigned: 3, completed: 0, inProgress: 0, notStarted: 3, overdue: 0 });
    assert.equal(v.newThisWeek, 3);
    const a = v.items.find((i) => i.skillId === skillA)!;
    assert.deepEqual([a.dueAt?.slice(0, 10), a.note, Boolean(a.standard)], ["2027-03-08", "Focus on the clues.", true]);
    assert.equal(v.items.find((i) => i.skillId === skillC)!.startsLater, true);
    assert.equal(await isAssignedSkill(repo, student, skillA, NOW), true);
    assert.equal(await isAssignedSkill(repo, student, skillC, NOW), false, "not before its start date");
    assert.equal(await isAssignedSkill(repo, classmate, skillB, NOW), false, "another student's assignment does not count");
    await assert.rejects(assignedSkills(repo, teacher, NOW), ForbiddenError);
  });

  test("notifications: unread count, open marks read and links to the assignment, owner only, due-soon once", async () => {
    const n0 = await unreadCount(repo, student.userId);
    assert.ok(n0 >= 3, String(n0));
    const due = (await listNotifications(repo, student)).filter((n) => n.title.startsWith("Due soon"));
    assert.equal(due.length, 1, "the skill due tomorrow produced one due-soon reminder");
    await assignedSkills(repo, student, NOW);
    assert.equal((await listNotifications(repo, student)).filter((n) => n.title.startsWith("Due soon")).length, 1, "not repeated");
    const first = (await listNotifications(repo, student)).find((n) => n.title === "Your teacher assigned you a new skill")!;
    assert.match(await openNotification(repo, student, first.id, NOW), /^\/student\/assignments\//);
    assert.equal(await unreadCount(repo, student.userId), n0 - 1);
    await assert.rejects(openNotification(repo, classmate, first.id, NOW), ForbiddenError);
    await markAllRead(repo, student, NOW);
    assert.equal(await unreadCount(repo, student.userId), 0);
    await assignedSkills(repo, student, new Date("2027-03-10T08:00:00Z"));
    assert.ok((await listNotifications(repo, student)).some((n) => n.title.startsWith("Overdue")), "overdue reminder after the due date");
  });

  test("complete an assigned skill, then the report: student sees own only; teacher of the class can open it", async () => {
    let view = await startPractice(repo, student, skillB, NOW);
    const items = await loadSkillItems(repo, skillB);
    let clock = NOW.getTime();
    for (let i = 0; i < 30; i++) {
      const it = items.find((x) => x.questionId === view.question!.questionId)!;
      const right = !it.options || i % 6 !== 5; // mostly right; wrong answers only on choice questions (always a valid answer shape)
      const correct = it.options ? (it.type === "MULTI_SELECT" ? it.options.filter((o) => o.correct).map((o) => o.label) : it.options.find((o) => o.correct)!.label) : it.type === "TRUE_FALSE" ? it.answer : it.answers?.[0] ?? it.sequence ?? it.errorIndex;
      const wrong = it.options?.find((o) => !o.correct)?.label;
      ({ view } = await submitAnswer(repo, student, { sessionId: view.sessionId, questionId: it.questionId, response: right || !wrong ? correct : it.type === "MULTI_SELECT" ? [wrong] : wrong }, new Date((clock += 20_000))));
      if (!view.question) view = await startPractice(repo, student, skillB, new Date((clock += 1000)));
      const home = await assignedSkills(repo, student, new Date(clock));
      if (home.items.find((x) => x.skillId === skillB)!.status === "COMPLETED") break;
    }
    const home = await assignedSkills(repo, student, new Date(clock));
    const b = home.items.find((x) => x.skillId === skillB)!;
    assert.equal(b.status, "COMPLETED", "completed skills stay visible");
    assert.equal(home.summary.completed, 1);
    const r = await assignmentReport(repo, student, b.assignmentId);
    assert.equal(r.status, "COMPLETED");
    assert.ok(r.answered >= 10 && r.correct <= r.answered && r.accuracy !== null && r.score >= 75, JSON.stringify(r));
    assert.ok(r.standard && r.completedAt && r.masteryLevel !== "Not started");
    assert.ok(r.strengths.length + r.needsPractice.length > 0, "rule-based feedback from real answers");
    assert.match(r.nextStep, /Well done|Excellent/);
    await assert.rejects(assignmentReport(repo, classmate, b.assignmentId), ForbiddenError, "another student cannot see it");
    await assert.rejects(assignmentReport(repo, student, b.assignmentId, classmate.studentId!), ForbiddenError);
    assert.equal((await assignmentReport(repo, teacher, b.assignmentId, student.studentId!)).answered, r.answered, "the teacher sees the same report");
    await assert.rejects(assignmentReport(repo, otherTeacher, b.assignmentId, student.studentId!), ForbiddenError);
  });

  test("placement test: hidden unless the school turns it on (admins only)", async () => {
    assert.equal(await placementRequired(repo, admin.schoolId!), false);
    await assert.rejects(setPlacementRequired(repo, teacher, true), ForbiddenError);
    await setPlacementRequired(repo, admin, true);
    assert.equal(await placementRequired(repo, admin.schoolId!), true);
    await setPlacementRequired(repo, admin, false);
    assert.equal(await placementRequired(repo, admin.schoolId!), false);
  });
});
