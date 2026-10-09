/**
 * Update 25 (FAKE data only — the Test School): the goal of correct answers, the full-curriculum plan (lazy parts,
 * hidden from My Work, locked units and the unit calendar, class grid), today's plan, the weekly goal and the
 * student's own Family Report access.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { assignFromMap } from "../src/server/curriculum-map/levels";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { assignedSkills } from "../src/server/student/assigned";
import { startQuiz, submitQuizAnswer, type QuizView } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { sendCurriculumPlan, openPlanItem, setOpenUnits, curriculumPlanGrid } from "../src/server/curriculum-map/curriculum-plan";
import { skillPlanForStudent, studentSkillPlans, todaysPlanStep, isUnitOpen } from "../src/server/curriculum-map/plans";
import { weekStats, weekStart } from "../src/server/student/weekly";
import { parentReport, shareParentReport } from "../src/server/insights/parent-report";
import { demoDatabase } from "./helpers/db";

describe("Update 25 · goals, the curriculum plan and the family", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId: string; let roster: { id: string; name: string }[];
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  const CODE = "G4.U1.TS2.ACS";

  /** Answers the current question; right or wrong. */
  async function answer(st: Actor, aid: string, v: QuizView, right: boolean, at: Date): Promise<QuizView> {
    const it = (await loadQuestionItems(repo, [v.question!.questionId]))[0];
    const opt = it.options!.find((o) => o.correct === right)!;
    return (await submitQuizAnswer(repo, st, { assignmentId: aid, questionId: it.questionId, response: opt.label }, at)).view;
  }

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, admin] = await Promise.all(["test.teacher.1", "test.admin"].map(a));
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
    const ids: string[] = [];
    for (const level of ["BELOW", "ON", "ABOVE"] as const) for (let i = 0; i < 6; i++) {
      ids.push(await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `${level} goal question ${i} words ${level}${i}`, level: 4, whyCorrect: "Because.", lexile: 800, mapNodeCode: `${CODE}.${level}`,
        options: [{ label: "A", text: `right ${level}${i}`, correct: true, rationale: null }, { label: "B", text: `wrong ${level}${i}`, correct: false, rationale: "No." }, { label: "C", text: `other ${level}${i}`, correct: false, rationale: "No." }] }));
    }
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
  });

  test("goal set: done at the goal of correct answers whatever the number answered; practice may go on", async () => {
    const r = await assignFromMap(repo, teacher, { classId, categoryCode: CODE, studentIds: [roster[0].id], mode: "ADAPTIVE", targetCorrect: 5 });
    const aid = r.groups[0].assignmentId;
    const st = await student(roster[0].id);
    let clock = Date.now(); let v = await startQuiz(repo, st, aid, new Date(clock));
    assert.deepEqual([v.goal?.target, v.goal?.correct, v.goal?.reached], [5, 0, false]);
    // wrong, right, wrong, right … until 5 correct
    let i = 0;
    while (!v.goal!.reached) { v = await answer(st, aid, v, i % 2 === 1, new Date((clock += 30_000))); i++; assert.ok(i < 40, "the goal is reachable"); }
    assert.equal(v.goal!.correct, 5);
    assert.ok(i >= 9, "about twice as many answers as the goal");
    assert.equal((await assignedSkills(repo, st)).items.find((x) => x.assignmentId === aid)!.status, "COMPLETED");
    assert.ok(v.question, "the student may keep practising after the goal");
  });

  let planId = "";
  test("full curriculum plan: one plan for the class, every part, nothing assigned until a student opens a part", async () => {
    const before = await repo.count("Assignment", {});
    const r = await sendCurriculumPlan(repo, teacher, { classId, targetCorrect: 5 });
    planId = r.planId;
    assert.ok(r.created && r.places > 20, `${r.places} parts`);
    assert.equal(await repo.count("Assignment", {}), before, "no assignments up front");
    const again = await sendCurriculumPlan(repo, teacher, { classId, targetCorrect: 6 });
    assert.deepEqual([again.planId, again.created], [planId, false], "sending again updates the same plan");

    const st = await student(roster[1].id);
    const mine = await studentSkillPlans(repo, st);
    assert.equal(mine[0].kind, "CURRICULUM");
    const view = await skillPlanForStudent(repo, st, planId);
    assert.equal(view.target, 6);
    const item = view.places.find((p) => p.code === CODE)!;
    assert.match(item.href!, new RegExp(`/student/plans/${planId}/open/`));

    const href = await openPlanItem(repo, st, planId, item.itemId);
    assert.match(href, /^\/quiz\//);
    const aid = href.split("/")[2];
    assert.equal(String((await repo.findUnique("Assignment", { id: aid }))!.curriculumPlanId), planId);
    assert.equal((await assignedSkills(repo, st)).items.some((x) => x.assignmentId === aid), false, "plan parts stay out of My Work");
    // a classmate opens the same part: the class's set, no second one
    const st2 = await student(roster[2].id);
    assert.equal(await openPlanItem(repo, st2, planId, item.itemId), href);
    // the part now links straight to the quiz
    assert.equal((await skillPlanForStudent(repo, st, planId)).places.find((p) => p.code === CODE)!.href, href);
    // silent: no “new assignment” notification for the part (only the plan's own)
    const notes = await repo.findMany("Notification", { userId: st.userId });
    assert.ok(notes.every((n) => !String(n.link ?? "").includes(aid)));
    assert.ok(notes.some((n) => /curriculum plan is ready/.test(String(n.title))));
  });

  test("locked units and the unit calendar", async () => {
    const st = await student(roster[3].id);
    const view = await skillPlanForStudent(repo, st, planId);
    const other = view.places.find((p) => !p.unit.startsWith("Unit 1"))!;
    await setOpenUnits(repo, teacher, planId, [view.places[0].unit]);
    const locked = (await skillPlanForStudent(repo, st, planId)).places.find((p) => p.itemId === other.itemId)!;
    assert.deepEqual([locked.locked, locked.href], [true, null]);
    await assert.rejects(openPlanItem(repo, st, planId, other.itemId), ValidationError);
    // a date in the past opens it by itself; a future date does not
    await setOpenUnits(repo, teacher, planId, [view.places[0].unit], { [other.unit]: "2000-01-01" });
    assert.equal(isUnitOpen((await repo.findUnique("SkillPlan", { id: planId }))!, other.unit), true);
    await setOpenUnits(repo, teacher, planId, [view.places[0].unit], { [other.unit]: "2999-01-01" });
    assert.equal(isUnitOpen((await repo.findUnique("SkillPlan", { id: planId }))!, other.unit), false);
    await setOpenUnits(repo, teacher, planId, null);
    await assert.rejects(setOpenUnits(repo, await student(roster[3].id), planId, null), ForbiddenError);
  });

  test("today's plan, the weekly goal and the class grid follow the student", async () => {
    const st = await student(roster[1].id);
    const step = await todaysPlanStep(repo, st);
    assert.ok(step);
    const aid = step!.href.startsWith("/quiz/") ? step!.href.split("/")[2] : (await openPlanItem(repo, st, planId, step!.href.split("/").pop()!)).split("/")[2];
    let clock = Date.now() - 60 * 60_000; let v = await startQuiz(repo, st, aid, new Date(clock));
    while (!v.goal!.reached) v = await answer(st, aid, v, true, new Date((clock += 20_000)));
    const w = await weekStats(repo, roster[1].id);
    assert.ok(w.partsDone >= 1 && w.correct >= 6, JSON.stringify(w));
    assert.equal(weekStart(new Date("2026-10-08T10:00:00Z")).toISOString().slice(0, 10), "2026-10-04", "the week starts on Sunday");
    const g = await curriculumPlanGrid(repo, teacher, planId);
    const row = g.students.find((x) => x.id === roster[1].id)!;
    assert.ok(row.done >= 1);
    assert.ok(Object.values(row.cells).some((c) => c.status === "COMPLETED"));
    await assert.rejects(curriculumPlanGrid(repo, await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.3" }))!), planId), ForbiddenError);
  });

  test("Family Report: a student opens the teacher's report only once it is shared, and only their own", async () => {
    const st = await student(roster[4].id);
    await assert.rejects(parentReport(repo, st, roster[4].id), ForbiddenError);
    await shareParentReport(repo, teacher, roster[4].id, true, null);
    assert.equal((await parentReport(repo, st, roster[4].id)).studentId, roster[4].id);
    await shareParentReport(repo, teacher, roster[5].id, true, null);
    await assert.rejects(parentReport(repo, st, roster[5].id), ForbiddenError);
  });
});
