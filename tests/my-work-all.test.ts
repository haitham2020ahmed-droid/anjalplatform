/**
 * My Work lists EVERYTHING the teacher assigns (owner, MAP Test plan § 5 / 5b) — FAKE data only (in-memory Test School):
 * skills, Assessments tests of every type (a "REVIEW" testType included), MAP Tests, NAFS tests and practice,
 * ReadRise articles, writing and reading-aloud tasks, exit tickets, Respond to Reading, lessons, study plans and the
 * strategy survey. Each appears once, shows Done when finished, is counted once in the home badge, and a table missing
 * from an older database never breaks My Work.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { parseSchema } from "../scripts/db/schema-ddl";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { assignSkill } from "../src/server/teacher/assign";
import { assignTest } from "../src/server/tests/assessments";
import { createMapTest } from "../src/server/map/map-test";
import { openStrategySurvey } from "../src/server/surveys/strategy";
import { allWorkItems, extraWorkItems, KIND_LABEL, WORK_KINDS } from "../src/server/student/all-work";
import { studentHome } from "../src/server/student/student-home";
import { myWorkView } from "../src/server/student/program-work";
import { resetSchemaGaps } from "../src/server/db/schema-errors";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { dropRecent, prismaLike } from "./helpers/behind-db";
import { demoDatabase, ROOT } from "./helpers/db";

const DAY = 86_400_000;
const AUTO = new Set(["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN", "TRUE_FALSE"]);

describe("My Work: everything a teacher assigns", () => {
  let db: DatabaseSync; let repo: SqliteRepo; let teacher: Actor; let me: Actor;
  let classId = ""; let sid = ""; let schoolId = "";
  const ids: Record<string, string> = {};
  const now = new Date(Date.UTC(2026, 10, 2, 8));
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ db, repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await actorFor("test.teacher.1");
    const c = (await readableClasses(repo, teacher))[0];
    classId = String(c.id); schoolId = String(c.schoolId);
    sid = String((await repo.findMany("ClassMembership", { classId, leftAt: null }))[0].studentId);
    me = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    const grade = await repo.findUnique("Grade", { id: c.gradeId });
    const skills = await repo.findMany("Skill", { curriculumId: { in: (await repo.findMany("Curriculum", { gradeId: grade!.id })).map((x) => x.id) } }, { select: ["id"] });
    const types = new Map((await repo.findMany("QuestionType", {})).map((t) => [String(t.id), String(t.code)]));
    const qs = (await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "typeId"] })).filter((q) => AUTO.has(types.get(String(q.typeId)) ?? ""));
    const skillId = String(qs[0].skillId);
    ids.skill = (await assignSkill(repo, teacher, { classId, skillId }, now)).assignmentId;
    // Assessments tests: a Weekly Quiz, and a test of the new "Review" type (another update adds it: any testType string)
    const quiz = await assignTest(repo, teacher, { classId, type: "WEEKLY_QUIZ", title: "Weekly Quiz 3", levelMode: "SAME", questions: { SAME: qs.slice(0, 3).map((q) => String(q.id)) } }, now);
    const review = await assignTest(repo, teacher, { classId, type: "CUSTOM", title: "Unit review", levelMode: "SAME", questions: { SAME: qs.slice(3, 6).map((q) => String(q.id)) } }, now);
    await repo.updateMany("TeacherTest", { id: review.testId }, { testType: "REVIEW" });
    ids.quiz = String((await repo.findMany("Assignment", { testId: quiz.testId }))[0].id);
    ids.review = String((await repo.findMany("Assignment", { testId: review.testId }))[0].id);
    ids.map = await createMapTest(repo, teacher, { kind: "AUTO", subject: "READING", classIds: [classId], items: 20, opensAt: new Date(now.getTime() - DAY), closesAt: new Date(now.getTime() + 14 * DAY) }, now);
    // NAFS test + practice
    const nt = await repo.create("NafsTest", { schoolId, createdById: teacher.userId, title: "NAFS Reading 1", mode: "MANUAL", questionIds: [], createdAt: now, updatedAt: now });
    ids.nafsGiven = String((await repo.create("NafsTestClass", { testId: nt.id, classId, createdById: teacher.userId, createdAt: now, dueAt: new Date(now.getTime() + 7 * DAY) })).id);
    ids.nafsTest = String(nt.id);
    ids.nafsPractice = String((await repo.create("NafsPractice", { schoolId, createdById: teacher.userId, title: "Main idea practice", targets: ["NAFS.RC.MAIN"], classId, createdAt: now })).id);
    // ReadRise article for the class
    ids.article = String((await repo.create("RRArticle", { schoolId, code: "T-1", title: "Sea turtles", topic: "Science", pollStatement: "Turtles are fast.", status: "PUBLISHED", createdAt: now, updatedAt: now })).id);
    await repo.create("RRClassArticle", { classId, articleId: ids.article, assignedById: teacher.userId, dueAt: new Date(now.getTime() + 3 * DAY), createdAt: now });
    // writing + reading aloud (fluency)
    ids.writing = String((await repo.create("WritingTask", { schoolId, classId, createdById: teacher.userId, kind: "WRITE", title: "My hero", prompt: "Write about a hero.", genre: "NARRATIVE", createdAt: now })).id);
    ids.aloud = String((await repo.create("WritingTask", { schoolId, classId, createdById: teacher.userId, kind: "READ_ALOUD", title: "Read the poem", prompt: "Read it aloud.", genre: "FREE", createdAt: now })).id);
    ids.exit = String((await repo.create("ExitTicket", { schoolId, classId, createdById: teacher.userId, title: "Commas", questionIds: [String(qs[0].id)], status: "OPEN", createdAt: now })).id);
    ids.respond = String((await repo.create("RespondAssignment", { schoolId, classId, setCode: "G4.U1.TS1.RTR", title: "Respond to Reading · Unit 1 · Set 1", createdById: teacher.userId, createdAt: now })).id);
    await repo.create("RespondAssignmentStudent", { assignmentId: ids.respond, studentId: sid, level: "ON", updatedAt: now });
    ids.lesson = String((await repo.create("LessonRun", { studentId: sid, schoolId, skillId, source: "TEACHER", log: [], startedAt: now, updatedAt: now })).id);
    ids.plan = String((await repo.create("SkillPlan", { schoolId, classId, title: "Grade curriculum plan", kind: "CURRICULUM", gradeLevel: Number(grade!.level), status: "SENT", createdAt: now })).id);
    await repo.create("SkillPlanItem", { planId: ids.plan, code: "U1", label: "Unit 1", assignmentIds: [ids.skill], order: 1 });
    await openStrategySurvey(repo, teacher, classId, now);
  });

  test("every assignable kind is a My Work row, once each, with its title, kind, date and the same player", async () => {
    const rows = await allWorkItems(repo, me, now);
    const kinds = new Set<string>(rows.map((r) => r.kind ?? "SKILL"));
    for (const k of [...WORK_KINDS, "SKILL"]) assert.ok(kinds.has(k), `${k} is in My Work`);
    assert.equal(new Set(rows.map((r) => r.assignmentId)).size, rows.length, "each row once");
    const by = (key: string) => rows.filter((r) => r.assignmentId === key);
    assert.equal(by(`test:${ids.quiz}`).length, 1); assert.equal(by(ids.quiz).length, 0, "a test is not also a set-of-questions row");
    assert.equal(by(`test:${ids.review}`)[0]?.kind, "TEST", "the Review type (any testType) is a test row");
    assert.equal(by(`test:${ids.quiz}`)[0].href, `/quiz/${ids.quiz}`, "Start opens the quiz player");
    const map = by(`map_test:${ids.map}:READING`)[0];
    assert.ok(map && map.href.startsWith(`/student/map-test/run?windowId=${ids.map}`) && map.dueAt && map.skill.startsWith("MAP Test — Reading"));
    assert.equal(by(`nafs_test:${ids.nafsGiven}`)[0].href, `/student/nafs/sim/${ids.nafsGiven}`);
    assert.equal(by(`nafs_practice:${ids.nafsPractice}`)[0].href, `/student/nafs/practice/${ids.nafsPractice}`);
    assert.equal(by(`readrise:${ids.article}`)[0].href, `/student/readrise/${ids.article}`);
    assert.equal(by(`writing:${ids.writing}`)[0].kind, "WRITING"); assert.equal(by(`read_aloud:${ids.aloud}`)[0].kind, "READ_ALOUD");
    assert.equal(by(`exit_ticket:${ids.exit}`)[0].href, `/student/exit/${ids.exit}`);
    assert.ok(by(`respond:${ids.respond}`)[0].href.startsWith("/student/respond/"));
    assert.ok(by(`lesson:${ids.lesson}`)[0].href.startsWith("/student/lesson?skillId="));
    assert.equal(by(`plan:${ids.plan}`)[0].href, `/student/plans/${ids.plan}`);
    assert.equal(by("survey:strategy")[0].href, "/student/strategy-survey");
    assert.ok(rows.filter((r) => r.kind).every((r) => r.status === "Not started" && r.action === "Start"));
    // the kind chips are translated
    for (const l of Object.values(KIND_LABEL)) { assert.ok((UI_STRINGS as readonly string[]).includes(l), l); assert.ok(ar[l as (typeof UI_STRINGS)[number]], l); }
  });

  test("the home badge counts each thing once (My Work = the home's to-do)", async () => {
    const h = await studentHome(repo, me, now);
    const all = await allWorkItems(repo, me, now);
    assert.deepEqual(h.work.map((w) => w.assignmentId).sort(), all.map((w) => w.assignmentId).sort());
    const v = myWorkView(h.work, h.last);
    assert.equal(h.toDo, all.filter((r) => r.status !== "Done").length);
    assert.equal(v.toDo, h.toDo);
    assert.ok(h.toDo >= WORK_KINDS.length + 1);
  });

  test("Done when finished", async () => {
    await repo.updateMany("AssignmentStudent", { studentId: sid, assignmentId: { in: [ids.skill, ids.quiz, ids.review] } }, { status: "COMPLETED", completedAt: now, progress: 1 });
    await repo.create("MapSimSession", { windowId: ids.map, schoolId, studentId: sid, subject: "READING", kind: "SIM", status: "DONE", total: 20, startRit: 200, rit: 204, se: 4, answered: 20, correct: 12, rapid: 0, resultRit: 204, resultLow: 200, resultHigh: 208, areas: { LIT: { rit: 200, n: 7 } }, startedAt: now, finishedAt: now });
    await repo.create("NafsResult", { testId: ids.nafsTest, classId, studentId: sid, source: "ONLINE", answers: [], submittedAt: now, updatedAt: now });
    await repo.create("NafsPracticeRun", { practiceId: ids.nafsPractice, studentId: sid, classId, state: {}, finishedAt: now, startedAt: now, updatedAt: now });
    await repo.create("RRRun", { studentId: sid, schoolId, articleId: ids.article, versionLevel: 3, band: "ON", step: "DONE", levelBefore: 3, completedAt: now, startedAt: now });
    for (const t of [ids.writing, ids.aloud]) await repo.create("WritingSubmission", { taskId: t, studentId: sid, status: "SUBMITTED", submittedAt: now, updatedAt: now });
    const q = (await repo.findUnique("ExitTicket", { id: ids.exit }))!.questionIds;
    await repo.create("ExitTicketAnswer", { ticketId: ids.exit, studentId: sid, questionId: String((typeof q === "string" ? JSON.parse(q) : q)[0]), isCorrect: true, response: "A", createdAt: now });
    await repo.updateMany("RespondAssignmentStudent", { assignmentId: ids.respond, studentId: sid }, { finishedAt: now, updatedAt: now });
    await repo.updateMany("LessonRun", { id: ids.lesson }, { finishedAt: now });
    await repo.create("StrategySurvey", { studentId: sid, schoolId, answers: {}, result: {}, createdAt: now });
    const rows = await allWorkItems(repo, me, now);
    // (the Test School's own seeded skill work stays as it was)
    const mine = rows.filter((r) => r.kind);
    assert.equal(mine.length, WORK_KINDS.length + 1, "every kind (and the second test)");
    assert.deepEqual(mine.filter((r) => r.status !== "Done").map((r) => `${r.assignmentId} ${r.skill}`), [], "everything is Done");
    assert.ok(rows.filter((r) => r.kind).every((r) => r.action === "Review"));
    assert.equal(rows.find((r) => r.assignmentId === `test:${ids.quiz}`)!.href, `/student/tests/${ids.quiz}`, "a finished test opens its review");
    const h = await studentHome(repo, me, now);
    assert.equal(h.toDo, rows.filter((r) => !r.kind && r.status !== "Done").length, "only the seeded skill work is still to do");
  });

  test("a table missing from an older database never breaks My Work", async () => {
    resetSchemaGaps();
    dropRecent(db, ["RRClassArticle", "ExitTicket", "NafsPractice"], { MapSimWindow: ["kind", "classIds", "studentIds", "itemIds", "areaShares", "excludedIds", "draft", "settings", "updatedAt"] });
    const behind = prismaLike(repo, parseSchema(join(ROOT, "prisma/schema.prisma")));
    const extra = await extraWorkItems(behind, me, now);
    const kinds = new Set(extra.map((r) => r.kind));
    for (const k of ["READRISE", "EXIT_TICKET", "NAFS_PRACTICE", "MAP_TEST"]) assert.ok(!kinds.has(k as never), `${k}: no rows, no error`);
    for (const k of ["TEST", "WRITING", "NAFS_TEST", "RESPOND", "LESSON"]) assert.ok(kinds.has(k as never), `${k} still listed`);
    const h = await studentHome(behind, me, now);
    assert.ok(h.work.length > 0);
  });
});
