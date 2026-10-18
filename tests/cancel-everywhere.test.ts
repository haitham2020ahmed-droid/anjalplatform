/**
 * 🚫 A cancel is honoured EVERYWHERE the student sees work (owner r68 §E bug) — FAKE data only (in-memory Test School).
 * The owner's case: a cancelled Curriculum Map Review ("Unit 1 · Selection 1: Amigo Brothers · Review (adaptive…)") still
 * showed on the student home as "1 to do". Root causes found and fixed:
 *   1. the home's "Continue" (lastActivity) reopened the student's last unfinished session WITHOUT asking whether its work
 *      was cancelled — the hero showed the cancelled Review with Continue;
 *   2. a Review that is a PLACE of a plan: the plan's My Work row (and My Plans / the Curriculum Map page) still counted
 *      the cancelled place — "1 to do" stayed;
 *   3. the quiz player and "open this part" still opened it.
 * Now: home hero + to-do badge + menu numbers + My Work + My Plans / plan page + the quiz player all leave it out.
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
import { assignQuestions } from "../src/server/teacher/assign";
import { allWorkItems } from "../src/server/student/all-work";
import { lastActivity, studentHome } from "../src/server/student/student-home";
import { myWorkView } from "../src/server/student/program-work";
import { skillPlanForStudent, studentSkillPlans } from "../src/server/curriculum-map/plans";
import { isCancelledForStudent, placeCancelled } from "../src/server/student/cancelled-work";
import { assignedList, cancelAssignment, restoreAssignment } from "../src/server/teacher/assigned";
import { navCounts } from "../src/server/teacher/week-plan";
import { demoDatabase, ROOT } from "./helpers/db";

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const REVIEW = "Unit 1 · Selection 1: Amigo Brothers · Review (adaptive: Approaching → Meeting → Exceeding)";

describe("🚫 cancel honoured everywhere the student sees work", () => {
  let repo: SqliteRepo; let teacher: Actor; let me: Actor; let classId = ""; let schoolId = ""; let review = ""; let place = ""; let planId = "";
  const now = new Date(Date.UTC(2026, 10, 2, 8));

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const c = (await readableClasses(repo, teacher))[0];
    classId = String(c.id); schoolId = String(c.schoolId);
    const sid = String((await repo.findMany("ClassMembership", { classId, leftAt: null }))[0].studentId);
    me = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    const grade = await repo.findUnique("Grade", { id: c.gradeId });
    const skills = (await repo.findMany("Skill", { curriculumId: { in: (await repo.findMany("Curriculum", { gradeId: grade!.id })).map((x) => x.id) } }, { select: ["id"] })).map((k) => String(k.id));
    const qs = (await repo.findMany("Question", { skillId: { in: skills }, status: "PUBLISHED", deletedAt: null }, { select: ["id"], take: 12 })).map((q) => String(q.id));
    // 1. the Review as a single Curriculum Map set (Assign on the Review place)
    review = (await assignQuestions(repo, teacher, { source: "CURRICULUM", classId, questionIds: qs.slice(0, 6), title: REVIEW, exactTitle: true, track: "CURRICULUM", adaptive: { maxQuestions: 6 } }, now)).assignmentId;
    // the student opened it: an unfinished session ("Continue" on the home)
    await repo.create("PracticeSession", { studentId: me.studentId!, assignmentId: review, mode: "TEACHER_QUIZ", startedAt: new Date(now.getTime() - 3_600_000), questionCount: 2, correctCount: 1, activeMs: 0 });
    // 2. the same kind of Review as a PLACE of a unit plan (sent from the Curriculum Map)
    const plan = await repo.create("SkillPlan", { schoolId, classId, title: "Grade 4 · Unit 1 plan", kind: "UNIT", gradeLevel: Number(grade!.level), status: "SENT", createdById: teacher.userId, createdAt: now });
    planId = String(plan.id);
    place = (await assignQuestions(repo, teacher, { source: "CURRICULUM", classId, questionIds: qs.slice(6, 12), title: `${REVIEW} 2`, exactTitle: true, track: "CURRICULUM", adaptive: { maxQuestions: 6 }, curriculumPlanId: planId, silent: true }, now)).assignmentId;
    await repo.create("SkillPlanItem", { planId, code: "G4.U1.S1.REVIEW", label: "Unit 1 · Selection 1: Amigo Brothers · Review", assignmentIds: [place], order: 0 });
  });

  test("before: the Review is to do, in the hero (Continue) and in the plan", async () => {
    const h = await studentHome(repo, me, now);
    const v = myWorkView(h.work, h.last);
    assert.ok(h.work.some((w) => w.assignmentId === review), "in My Work");
    assert.equal(v.cont?.href, `/quiz/${review}`, "the hero offers Continue on it");
    assert.ok(h.work.some((w) => w.assignmentId === `plan:${planId}` && w.status !== "Done"), "the plan row is to do");
    assert.equal((await studentSkillPlans(repo, me)).find((p) => p.id === planId)?.places, 1);
  });

  test("the owner's bug: cancelled (as listed in Assigned) → gone from the hero, the badge, My Work and the quiz player", async () => {
    const listed = (await assignedList(repo, teacher, { kind: "SKILL" }, now)).items.find((x) => x.id === review);
    assert.ok(listed, "the Review is a row of Assigned");
    const toDo0 = (await studentHome(repo, me, now)).toDo;
    await cancelAssignment(repo, teacher, "SKILL", review, null, now);
    const h = await studentHome(repo, me, now);
    const v = myWorkView(h.work, h.last);
    assert.ok(!h.work.some((w) => w.assignmentId === review), "not in My Work");
    assert.equal(h.toDo, toDo0 - 1, "the home's \"to do\" drops at once");
    assert.equal(await lastActivity(repo, me, now), null, "never \"where you left off\"");
    assert.notEqual(v.cont?.href, `/quiz/${review}`, "the hero does not show it");
    assert.equal(await isCancelledForStudent(repo, me.studentId!, me.schoolId, review), true, "the quiz player refuses it");
    const nav = await navCounts(repo, me, now);
    assert.ok(Object.values(nav).every((c) => (c?.count ?? 0) <= h.toDo), "menu numbers follow");
    await restoreAssignment(repo, teacher, "SKILL", review, null, now);
    assert.equal((await studentHome(repo, me, now)).toDo, toDo0, "Undo brings it back");
    assert.equal(await isCancelledForStudent(repo, me.studentId!, me.schoolId, review), false);
  });

  test("a Review that is a place of a plan: cancelled → the plan no longer counts it (My Work, My Plans, the plan page)", async () => {
    // listed under "Skill or question set" when the list is filtered by that kind (the owner's view): cancel from there
    const row = (await assignedList(repo, teacher, { kind: "SKILL" }, now)).items.find((x) => x.id === place);
    assert.ok(row, "the place is a row of Assigned (filtered by kind)");
    await cancelAssignment(repo, teacher, "SKILL", place, null, now);
    const work = await allWorkItems(repo, me, now);
    assert.ok(!work.some((w) => w.assignmentId === `plan:${planId}`), "the plan's only place is cancelled: no plan row, nothing to do");
    assert.ok(!(await studentSkillPlans(repo, me)).some((p) => p.id === planId), "My Plans / Curriculum Map: gone");
    await assert.rejects(skillPlanForStudent(repo, me, planId, now), /not assigned|cancelled/i, "the plan page has nothing left to open");
    await restoreAssignment(repo, teacher, "SKILL", place, null, now);
    assert.ok((await allWorkItems(repo, me, now)).some((w) => w.assignmentId === `plan:${planId}`), "back after Undo");
    // cancelling the whole PLAN hides it too
    await cancelAssignment(repo, teacher, "PLAN", planId, null, now);
    assert.ok(!(await studentSkillPlans(repo, me)).some((p) => p.id === planId));
    await assert.rejects(skillPlanForStudent(repo, me, planId, now), /cancelled/i);
    await restoreAssignment(repo, teacher, "PLAN", planId, null, now);
  });

  test("the pure rule and the wiring", () => {
    const hidden = new Set(["a1"]);
    assert.equal(placeCancelled(["a1"], ["a1"], hidden), true);
    assert.equal(placeCancelled(["a1", "a2"], ["a2"], hidden), false, "my own set of the place is not cancelled");
    assert.equal(placeCancelled(["a1"], [], hidden), true, "a place not opened yet, cancelled for everyone");
    assert.equal(placeCancelled(["a1"], ["a1"], new Set()), false);
    assert.match(read("src/app/quiz/[assignmentId]/page.tsx"), /isCancelledForStudent\(/);
    assert.match(read("src/server/student/student-home.ts"), /isCancelledForStudent\(/);
    assert.match(read("src/server/curriculum-map/curriculum-plan.ts"), /placeCancelled\(/);
  });
});
