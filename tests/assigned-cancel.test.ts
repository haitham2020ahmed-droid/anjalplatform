/**
 * 📌 "Assigned" (owner r67 § 3) — FAKE data only (in-memory Test School): one list of everything a teacher assigned
 * (every kind), Cancel for everyone or for one student, hidden from My Work / the home badge / the menu numbers /
 * My Tests at once, answers and results KEPT (soft cancel), Undo, the admin's view of every teacher, and who may cancel.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { assignSkill } from "../src/server/teacher/assign";
import { assignTest, myTests } from "../src/server/tests/assessments";
import { createMapTest } from "../src/server/map/map-test";
import { assignLearn } from "../src/server/learn/teacher";
import { allWorkItems } from "../src/server/student/all-work";
import { studentHome } from "../src/server/student/student-home";
import { navCounts } from "../src/server/teacher/week-plan";
import { ASSIGNED_KIND_LABEL, ASSIGNED_KINDS, assignedList, assignedStudents, cancelAssignment, restoreAssignment, type AssignedKind } from "../src/server/teacher/assigned";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { navItemsFor, searchablePagesFor } from "../src/components/nav-items";
import { demoDatabase, ROOT } from "./helpers/db";

const DAY = 86_400_000;
const AUTO = new Set(["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN", "TRUE_FALSE"]);
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("Assigned: see and cancel everything a teacher assigned", () => {
  let repo: SqliteRepo; let teacher: Actor; let teacher2: Actor; let admin: Actor; let me: Actor; let other: Actor;
  let classId = ""; let sid = ""; let sid2 = ""; let schoolId = "";
  /** each kind → [its id in Assigned, its My Work key for `me`] */
  const made = {} as Record<AssignedKind, [string, string]>;
  const now = new Date(Date.UTC(2026, 10, 2, 8));
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  const keys = async (a: Actor) => new Set((await allWorkItems(repo, a, now)).map((r) => r.assignmentId));

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await actorFor("test.teacher.1"); teacher2 = await actorFor("test.teacher.2"); admin = await actorFor("test.admin");
    const c = (await readableClasses(repo, teacher))[0];
    classId = String(c.id); schoolId = String(c.schoolId);
    const members = await repo.findMany("ClassMembership", { classId, leftAt: null });
    sid = String(members[0].studentId); sid2 = String(members[1].studentId);
    me = await studentActor(sid); other = await studentActor(sid2);
    const u = teacher.userId;
    const grade = await repo.findUnique("Grade", { id: c.gradeId });
    const skills = await repo.findMany("Skill", { curriculumId: { in: (await repo.findMany("Curriculum", { gradeId: grade!.id })).map((x) => x.id) } }, { select: ["id"] });
    const types = new Map((await repo.findMany("QuestionType", {})).map((t) => [String(t.id), String(t.code)]));
    const qs = (await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "typeId"] })).filter((q) => AUTO.has(types.get(String(q.typeId)) ?? ""));
    // skills the Test School has not given this class yet (My Work shows one row per skill)
    const given0 = new Set((await repo.findMany("Assignment", { classId }, { select: ["skillId"] })).map((a) => String(a.skillId)));
    const skillIds = [...new Set(qs.map((q) => String(q.skillId)))].filter((k) => !given0.has(k)).sort();
    const skill = (await assignSkill(repo, teacher, { classId, skillId: skillIds[0] }, now)).assignmentId;
    made.SKILL = [skill, skill];
    const check = (await assignSkill(repo, teacher, { classId, skillId: skillIds[1] }, now)).assignmentId;
    await repo.create("ProgressCheck", { schoolId, classId, lessonId: "L1", assignmentId: check, title: "Check 1", categories: [], createdById: u, createdAt: now });
    made.PROGRESS_CHECK = [check, check];
    // a test of the "Review" type (any testType string)
    const review = await assignTest(repo, teacher, { classId, type: "CUSTOM", title: "Unit review", levelMode: "SAME", questions: { SAME: qs.slice(3, 6).map((q) => String(q.id)) } }, now);
    await repo.updateMany("TeacherTest", { id: review.testId }, { testType: "REVIEW" });
    const set = String((await repo.findMany("Assignment", { testId: review.testId }))[0].id);
    made.TEST = [review.testId, `test:${set}`];
    const map = await createMapTest(repo, teacher, { kind: "AUTO", subject: "READING", classIds: [classId], items: 20, opensAt: new Date(now.getTime() - DAY), closesAt: new Date(now.getTime() + 14 * DAY) }, now);
    made.MAP_TEST = [map, `map_test:${map}:READING`];
    const nt = await repo.create("NafsTest", { schoolId, createdById: u, title: "NAFS Reading 1", mode: "MANUAL", questionIds: [], createdAt: now, updatedAt: now });
    const given = String((await repo.create("NafsTestClass", { testId: nt.id, classId, createdById: u, createdAt: now, dueAt: new Date(now.getTime() + 7 * DAY) })).id);
    made.NAFS_TEST = [given, `nafs_test:${given}`];
    const np = String((await repo.create("NafsPractice", { schoolId, createdById: u, title: "Main idea practice", targets: ["NAFS.RC.MAIN"], classId, createdAt: now })).id);
    made.NAFS_PRACTICE = [np, `nafs_practice:${np}`];
    const art = String((await repo.create("RRArticle", { schoolId, code: "T-1", title: "Sea turtles", topic: "Science", pollStatement: "Turtles are fast.", status: "PUBLISHED", createdAt: now, updatedAt: now })).id);
    const rr = await repo.create("RRClassArticle", { classId, articleId: art, assignedById: u, dueAt: new Date(now.getTime() + 3 * DAY), createdAt: now });
    made.READRISE = [String(rr.id), `readrise:${art}`];
    const w = String((await repo.create("WritingTask", { schoolId, classId, createdById: u, kind: "WRITE", title: "My hero", prompt: "Write about a hero.", genre: "NARRATIVE", createdAt: now })).id);
    made.WRITING = [w, `writing:${w}`];
    const aloud = String((await repo.create("WritingTask", { schoolId, classId, createdById: u, kind: "READ_ALOUD", title: "Read the poem", prompt: "Read it aloud.", genre: "FREE", createdAt: now })).id);
    made.FLUENCY = [aloud, `read_aloud:${aloud}`];
    const ex = String((await repo.create("ExitTicket", { schoolId, classId, createdById: u, title: "Commas", questionIds: [String(qs[0].id)], status: "OPEN", createdAt: now })).id);
    made.EXIT_TICKET = [ex, `exit_ticket:${ex}`];
    const teacherRow = await repo.findUnique("Teacher", { userId: u });
    const resp = String((await repo.create("RespondAssignment", { schoolId, classId, setCode: "G4.U1.TS1.RTR", title: "Respond to Reading · Unit 1 · Set 1", createdById: teacherRow!.id, createdAt: now })).id);
    for (const x of [sid, sid2]) await repo.create("RespondAssignmentStudent", { assignmentId: resp, studentId: x, level: "ON", updatedAt: now });
    made.RESPOND = [resp, `respond:${resp}`];
    const lesson = String((await repo.create("LessonRun", { studentId: sid, schoolId, skillId: skillIds[0], source: "TEACHER", log: [], startedAt: now, updatedAt: now })).id);
    made.LESSON = [lesson, `lesson:${lesson}`];
    // a study plan whose place is its own (sent) set
    const place = (await assignSkill(repo, teacher, { classId, skillId: skillIds[2] }, now)).assignmentId;
    const plan = String((await repo.create("SkillPlan", { schoolId, classId, title: "Grade curriculum plan", kind: "CURRICULUM", gradeLevel: Number(grade!.level), status: "SENT", createdById: u, createdAt: now })).id);
    await repo.create("SkillPlanItem", { planId: plan, code: "U1", label: "Unit 1", assignmentIds: [place], order: 1 });
    made.PLAN = [plan, `plan:${plan}`];
    const learn = await assignLearn(repo, teacher, { kind: "LESSON", ref: "LN-000", classId, target: "STUDENTS", studentIds: [sid, sid2], dueAt: new Date(now.getTime() + 5 * DAY) }, now);
    made.LEARN = [learn.assignId, "learn:LESSON:LN-000"];
    const wa = String((await repo.create("LearnAssign", { schoolId, kind: "WORDS", ref: "4|1|1", title: "Unit 1 words", classId, target: "CLASS", createdById: u, createdAt: now })).id);
    for (const x of [sid, sid2]) await repo.create("LearnAssignee", { assignId: wa, schoolId, studentId: x, kind: "WORDS", ref: "4|1|1", title: "Unit 1 words", status: "NOT_STARTED", createdAt: now, updatedAt: now });
    made.WORDS = [wa, "learn:WORDS:4|1|1"];
    // answers already given (they must survive a cancel)
    await repo.updateMany("AssignmentStudent", { studentId: sid, assignmentId: set }, { status: "COMPLETED", completedAt: now, progress: 1 });
    await repo.create("NafsResult", { testId: nt.id, classId, studentId: sid, source: "ONLINE", answers: [], submittedAt: now, updatedAt: now });
    await repo.create("WritingSubmission", { taskId: w, studentId: sid, status: "DRAFT", text: "My hero is my mother.", updatedAt: now });
  });

  test("the list has every kind the teacher assigned, once each, with who / due / progress", async () => {
    const v = await assignedList(repo, teacher, {}, now);
    for (const k of ASSIGNED_KINDS) {
      const row = v.items.find((x) => x.kind === k && x.id === made[k][0]);
      assert.ok(row, `${k} is listed`);
      assert.ok(row.recipients >= 1, `${k} reaches students`);
      assert.equal(row.status === "CANCELLED", false);
    }
    assert.equal(new Set(v.items.map((x) => `${x.kind}:${x.id}`)).size, v.items.length, "each once");
    assert.ok(!v.items.some((x) => x.kind === "SKILL" && x.title && x.id === made.TEST[1].slice(5)), "a test's set is not also a skill row");
    const test = v.items.find((x) => x.kind === "TEST")!;
    assert.equal(test.detail, "REVIEW", "the Review type shows");
    assert.equal(test.done, 1, "progress x / y counts the finished student");
    assert.ok(v.items.find((x) => x.kind === "NAFS_TEST")!.done >= 1);
    // filters
    assert.ok((await assignedList(repo, teacher, { kind: "WRITING" }, now)).items.every((x) => x.kind === "WRITING"));
    assert.ok((await assignedList(repo, teacher, { classId }, now)).items.every((x) => x.classIds.includes(classId) || x.kind === "LEARN"));
    assert.equal((await assignedList(repo, teacher, { from: "2030-01-01" }, now)).items.length, 0, "date filter");
    // every kind is in My Work for the student before any cancel
    const mine = await keys(me);
    for (const k of ASSIGNED_KINDS) assert.ok(mine.has(made[k][1]), `${k} in My Work: ${made[k][1]}`);
    for (const l of Object.values(ASSIGNED_KIND_LABEL)) { assert.ok((UI_STRINGS as readonly string[]).includes(l), l); assert.ok(ar[l as (typeof UI_STRINGS)[number]], l); }
  });

  test("cancel for everyone hides each kind from My Work and the badge at once, keeps the answers; Undo brings it back", async () => {
    const answers = async () => [await repo.count("AssignmentStudent", { studentId: sid }), await repo.count("NafsResult", { studentId: sid }), await repo.count("WritingSubmission", { studentId: sid }), await repo.count("LearnAssignee", {}), await repo.count("RespondAssignmentStudent", {})];
    const before = await answers();
    const badge0 = (await studentHome(repo, me, now)).toDo;
    for (const k of ASSIGNED_KINDS) {
      const [id, key] = made[k];
      await cancelAssignment(repo, teacher, k, id, null, now);
      const after = await keys(me);
      assert.ok(!after.has(key), `${k} hidden from My Work`);
      assert.ok(!(await keys(other)).has(key) || k === "LESSON", `${k} hidden for the other student too`);
      // r68 (owner): a cancelled item disappears from the default list; it is listed with Status = Cancelled
      assert.ok(!(await assignedList(repo, teacher, { kind: k }, now)).items.some((x) => x.id === id), `${k} gone from the default list`);
      const row = (await assignedList(repo, teacher, { kind: k, status: "CANCELLED" }, now)).items.find((x) => x.id === id)!;
      assert.equal(row.status, "CANCELLED"); assert.equal(row.cancelled, true);
      assert.deepEqual(await answers(), before, `${k}: no answer or row deleted`);
      await restoreAssignment(repo, teacher, k, id, null, now);
      assert.ok((await keys(me)).has(key), `${k} back after Undo`);
    }
    // the badge: one cancelled thing (not done) is one less to do
    await cancelAssignment(repo, teacher, "WRITING", made.WRITING[0], null, now);
    assert.equal((await studentHome(repo, me, now)).toDo, badge0 - 1, "the home badge drops at once");
    const nav = await navCounts(repo, me, now);
    assert.equal(nav["/student/writing"]?.count ?? 0, 1, "the menu number counts only the reading-aloud task");
    await restoreAssignment(repo, teacher, "WRITING", made.WRITING[0], null, now);
    assert.equal((await studentHome(repo, me, now)).toDo, badge0);
    // twice is harmless; Undo of nothing is 0
    const a = await cancelAssignment(repo, teacher, "EXIT_TICKET", made.EXIT_TICKET[0], null, now);
    assert.equal(await cancelAssignment(repo, teacher, "EXIT_TICKET", made.EXIT_TICKET[0], null, now), a);
    assert.equal(await restoreAssignment(repo, teacher, "EXIT_TICKET", made.EXIT_TICKET[0], null, now), 1);
    assert.equal(await restoreAssignment(repo, teacher, "EXIT_TICKET", made.EXIT_TICKET[0], null, now), 0);
    assert.ok(await repo.count("AssignmentCancel", { refId: made.EXIT_TICKET[0] }) >= 1, "the cancel is kept (restoredAt set), never deleted");
  });

  test("a finished test stays in My Tests' results; a cancelled one leaves the to-do list", async () => {
    const t0 = await myTests(repo, me, now);
    const doneTest = t0.completed.find((x) => `test:${x.assignmentId}` === made.TEST[1]);
    assert.ok(doneTest, "the Review test is completed");
    await cancelAssignment(repo, teacher, "TEST", made.TEST[0], null, now);
    assert.ok((await myTests(repo, me, now)).completed.some((x) => `test:${x.assignmentId}` === made.TEST[1]), "the result is kept");
    assert.ok(!(await myTests(repo, other, now)).toDo.some((x) => `test:${x.assignmentId}` === made.TEST[1]), "not to do any more");
    await restoreAssignment(repo, teacher, "TEST", made.TEST[0], null, now);
    assert.ok((await myTests(repo, other, now)).toDo.some((x) => `test:${x.assignmentId}` === made.TEST[1]), "back after Undo");
  });

  test("remove one student: hidden for that student only; Undo for that student", async () => {
    for (const k of ["SKILL", "READRISE", "LEARN", "WORDS", "RESPOND", "WRITING"] as const) {
      const [id, key] = made[k];
      await cancelAssignment(repo, teacher, k, id, sid2, now);
      assert.ok(!(await keys(other)).has(key), `${k}: removed for the student`);
      assert.ok((await keys(me)).has(key), `${k}: the rest of the class still has it`);
      const d = await assignedStudents(repo, teacher, k, id);
      assert.equal(d.students.find((x) => x.id === sid2)?.removed, true);
      assert.equal(d.item.removed, 1);
      assert.equal(d.item.status === "CANCELLED", false);
      await restoreAssignment(repo, teacher, k, id, sid2, now);
      assert.ok((await keys(other)).has(key), `${k}: back for the student`);
    }
    await assert.rejects(cancelAssignment(repo, teacher, "LESSON", made.LESSON[0], sid2, now), /did not get/, "only a student who got it");
  });

  test("the same Learn lesson given again (still active) stays in My Work when the first is cancelled", async () => {
    // (a second assignment of the same lesson to me, e.g. from another teacher or an older row)
    const again = String((await repo.create("LearnAssign", { schoolId, kind: "LESSON", ref: "LN-000", title: "Main idea", classId, target: "STUDENTS", createdById: teacher.userId, createdAt: now })).id);
    await repo.create("LearnAssignee", { assignId: again, schoolId, studentId: sid, kind: "LESSON", ref: "LN-000", title: "Main idea", status: "NOT_STARTED", createdAt: now, updatedAt: now });
    await cancelAssignment(repo, teacher, "LEARN", made.LEARN[0], null, now);
    assert.ok((await keys(me)).has(made.LEARN[1]), "still given by the second assignment");
    assert.ok(!(await keys(other)).has(made.LEARN[1]), "gone for the student who had only the first");
    await restoreAssignment(repo, teacher, "LEARN", made.LEARN[0], null, now);
  });

  test("the admin sees every teacher's (filter by teacher); permissions", async () => {
    const all = await assignedList(repo, admin, {}, now);
    assert.equal(all.admin, true);
    assert.ok(all.teachers.some((x) => x.id === teacher.userId), "the teacher filter lists the teacher");
    for (const k of ASSIGNED_KINDS.filter((x) => x !== "LESSON")) assert.ok(all.items.some((x) => x.kind === k && x.id === made[k][0]), `admin sees ${k}`);
    const one = await assignedList(repo, admin, { teacher: teacher.userId }, now);
    assert.ok(one.items.length > 0 && one.items.every((x) => x.teacher?.id === teacher.userId), "filtered by teacher");
    assert.ok(one.items.find((x) => x.kind === "SKILL")!.teacher!.name.length > 0, "the teacher's name");
    const none = await assignedList(repo, admin, { teacher: teacher2.userId }, now);
    assert.ok(!none.items.some((x) => x.id === made.SKILL[0]));
    // the admin may cancel and undo
    await cancelAssignment(repo, admin, "NAFS_PRACTICE", made.NAFS_PRACTICE[0], null, now);
    assert.ok(!(await keys(me)).has(made.NAFS_PRACTICE[1]));
    await restoreAssignment(repo, admin, "NAFS_PRACTICE", made.NAFS_PRACTICE[0], null, now);
    // another teacher (not of this class) can neither see nor cancel
    const t2 = await assignedList(repo, teacher2, {}, now);
    assert.ok(!t2.items.some((x) => x.id === made.SKILL[0]), "teacher 2 does not see teacher 1's work");
    await assert.rejects(cancelAssignment(repo, teacher2, "SKILL", made.SKILL[0], null, now), /Not found|not in your classes|Only/);
    await assert.rejects(cancelAssignment(repo, teacher2, "MAP_TEST", made.MAP_TEST[0], null, now), /Not found|not in your classes|Only/);
    // students and parents: no
    await assert.rejects(assignedList(repo, me, {}, now), /teachers and admins|not allowed|Forbidden|permission/i);
    await assert.rejects(cancelAssignment(repo, me, "SKILL", made.SKILL[0], null, now));
    assert.ok((await keys(me)).has(made.SKILL[1]), "nothing changed");
  });

  test("the page, the menu entry and the strings", () => {
    const page = read("src/app/teacher/assigned/page.tsx");
    assert.match(page, /<AppShell/);
    assert.equal((page.match(/^export /gm) ?? []).length, 2, "a page file exports only its component and metadata");
    for (const s of ["Cancel assignment", "Undo", "Remove", "All teachers", "Show all ({n})"]) assert.ok(page.includes(`"${s}"`), s);
    assert.match(page, /ask=\{t\("Cancel “\{title\}” for everyone\?/, "asks before cancelling");
    assert.match(read("src/app/teacher/assigned/actions.ts"), /^"use server";/);
    assert.ok(navItemsFor("TEACHER").some((i) => i.href === "/teacher/assigned" && i.label === "Assigned" && i.line), "teacher menu entry");
    assert.ok(searchablePagesFor("SCHOOL_ADMIN").some((i) => i.href === "/teacher/assigned"), "the admin finds it by name");
    assert.equal(ar["Assigned"], "المهام المُسنَدة");
    for (const s of ["Cancel assignment", "Undo", "Not cancelled", "Whole class", "{n} chosen students"]) assert.ok(ar[s as (typeof UI_STRINGS)[number]], s);
    assert.match(read("prisma/schema.prisma"), /model AssignmentCancel \{[\s\S]*restoredAt\s+DateTime\?/, "additive table, soft cancel");
  });
});
