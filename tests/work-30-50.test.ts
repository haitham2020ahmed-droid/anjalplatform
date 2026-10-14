/**
 * 🎯 The 30–50 rule for assigned skill practice + 🗺️ plan skills of another grade (demo school in memory; never a
 * real database):
 *   - mastered by the 30th answer (or as soon as mastered after it) → Done, the session ends with a celebration
 *   - not mastered at 30 → practice simply goes on (no choice) up to 50 → Done, the student chooses Stop / Keep going
 *   - running out of fresh questions (no-repeat rule) ends the session and the work is Done
 *   - a skill of another grade in the student's own plan opens its questions; a random other-grade skill does not
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { startPractice, submitAnswer, MAX_QUESTIONS_PER_SESSION, type PracticeView } from "../src/server/practice/session";
import { ASSIGNMENT_MAX_QUESTIONS, ASSIGNMENT_MIN_QUESTIONS } from "../src/server/practice/completion";
import { assignedSkills } from "../src/server/student/assigned";
import { myWorkItems } from "../src/server/plans/wizard";
import { isPlanSkill } from "../src/server/student/plan-access";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const T0 = new Date("2027-06-14T08:00:00Z");

describe("the 30–50 rule and plan skills of another grade", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = "";
  const kids: Actor[] = [];
  const skill: Record<string, string> = {};
  let clock = T0.getTime();
  const tick = (ms = 30_000) => new Date((clock += ms));
  const row = async (assignmentId: string, studentId: string) => (await repo.findMany("AssignmentStudent", { assignmentId, studentId }))[0];
  let mc = "";

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 4 }));
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    for (const st of view.students) kids.push(await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: st.id }))!.userId }))!));
    const st = (await repo.findUnique("Student", { id: kids[0].studentId! }))!;
    const grade4 = (await repo.findUnique("Grade", { id: st.gradeId }))!;
    const grade5 = (await repo.findMany("Grade", { schoolId: grade4.schoolId, level: 5 }))[0];
    const cur4 = (await repo.findMany("Curriculum", { gradeId: grade4.id, isActive: true }))[0];
    const cur5 = (await repo.findMany("Curriculum", { gradeId: grade5.id }))[0];
    mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const mk = async (key: string, curId: unknown, name: string, n: number, bOf = (k: number) => Math.round((-4 + (8 * (k % 17)) / 16) * 100) / 100) => {
      // a family of its own per skill (no pooled questions from the demo bank), questions at every level
      const fam = s((await repo.upsert("SkillFamily", { code: `w3050.${key}` }, { name: `w3050 ${key}`, domain: "READING", category: "COMPREHENSION" })).id);
      skill[key] = s((await repo.create("Skill", { curriculumId: curId, familyId: fam, code: `W3050.${key}`, name, domain: "READING", category: "COMPREHENSION", sequence: 9400, isActive: true })).id);
      for (let k = 0; k < n; k++) {
        const level = 1 + (k % 7);
        const q = await repo.create("Question", { skillId: skill[key], typeId: mc, stem: `${name} item ${k + 1}: which clue fits?`, content: {}, difficultyLevel: level, irtB: bOf(k), status: "PUBLISHED", createdAt: T0, updatedAt: T0 });
        for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `${name} option ${o} ${k}`, isCorrect: i === 0, order: i });
      }
    };
    await mk("master", cur4.id, "Nimbus Inference", 70);
    // near the student's level all along (no content gap ends the long practice early)
    await mk("long", cur4.id, "Halcyon Details", 70, (k) => -1.5 + (k % 5) * 0.25);
    await mk("small", cur4.id, "Tundra Summary", 8);
    await mk("plan5", cur5.id, "Orbit Theme", 12);
    await mk("other5", cur5.id, "Comet Structure", 12);
  });

  test("the safety cap per session stays above the 30–50 rule", () => {
    assert.equal(ASSIGNMENT_MIN_QUESTIONS, 30);
    assert.equal(ASSIGNMENT_MAX_QUESTIONS, 50);
    assert.ok(MAX_QUESTIONS_PER_SESSION >= ASSIGNMENT_MAX_QUESTIONS);
  });

  test("mastered by question 30 (or as soon as mastered after it) → Done, the session ends with a celebration", async () => {
    const me = kids[0];
    const { assignmentId } = await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId: skill.master, studentIds: [me.studentId!] }, tick(0));
    let v: PracticeView = await startPractice(repo, me, skill.master, tick());
    assert.deepEqual([v.work?.answered, v.work?.of], [0, 30]);
    let doneAt = 0;
    for (let k = 1; k <= ASSIGNMENT_MAX_QUESTIONS && v.question; k++) {
      const r = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question.questionId, response: "A" }, tick());
      v = r.view;
      if (k < ASSIGNMENT_MIN_QUESTIONS) {
        assert.notEqual(r.feedback.work?.justDone, true, `not Done before 30 (answer ${k})`);
        assert.equal(r.feedback.next.hasQuestion, true, `practice goes on before 30 (answer ${k})`);
        continue;
      }
      if (r.feedback.work?.justDone) {
        doneAt = k;
        assert.equal(r.feedback.band, "MASTERED");
        assert.equal(r.feedback.work.doneBy, "MASTERED");
        assert.equal(r.feedback.next.hasQuestion, false, "the session finishes");
        assert.equal(r.feedback.next.endReason, "WORK_MASTERED");
        break;
      }
      assert.notEqual(r.feedback.band, "MASTERED", "not Done only while not mastered");
    }
    assert.ok(doneAt >= ASSIGNMENT_MIN_QUESTIONS && doneAt < ASSIGNMENT_MAX_QUESTIONS, `mastered and Done between 30 and 49 (was ${doneAt})`);
    const done = await row(assignmentId, me.studentId!);
    assert.deepEqual([done.status, Number(done.coreAnswered)], ["COMPLETED", doneAt]);
    assert.equal(v.ended, true);
    await afterResponseSettled();
    const w = (await myWorkItems(repo, me, tick())).find((x) => x.assignmentId === assignmentId)!;
    assert.equal(w.status, "Done");
  });

  test("not mastered → goes on by itself up to 50 → Done, and the student chooses Stop for now / Keep practising", async () => {
    const me = kids[1];
    const { assignmentId } = await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId: skill.long, studentIds: [me.studentId!] }, tick(0));
    let v: PracticeView = await startPractice(repo, me, skill.long, tick());
    let right = 0;
    for (let k = 1; k <= ASSIGNMENT_MAX_QUESTIONS; k++) {
      const ok = k % 2 === 0; // half right: never mastered
      if (ok) right++;
      const r = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: ok ? "A" : "B" }, tick());
      v = r.view;
      if (k < ASSIGNMENT_MAX_QUESTIONS) {
        assert.notEqual(r.feedback.work?.justDone, true, `not Done at ${k}`);
        assert.equal(r.feedback.next.hasQuestion, true, `practice continues at ${k} (no choice before 50) ${r.feedback.next.endReason}`);
        if (k === ASSIGNMENT_MIN_QUESTIONS) assert.deepEqual([v.work?.answered, v.work?.of], [30, 50], "past 30: x of 50");
      } else {
        assert.equal(r.feedback.work?.justDone, true, "the 50th answer makes the work Done");
        assert.equal(r.feedback.work?.doneBy, "MAX", "the student chooses (Stop for now / Keep practising)");
        assert.equal(r.feedback.next.hasQuestion, true, "Keep practising is possible");
        assert.equal(r.feedback.work?.accuracy, Math.round((100 * right) / 50));
      }
    }
    const done = await row(assignmentId, me.studentId!);
    assert.deepEqual([done.status, Number(done.coreAnswered), Number(done.coreCorrect)], ["COMPLETED", 50, right]);
    // Keep practising: the work stays Done, its result unchanged
    for (let k = 0; k < 3 && v.question; k++) v = (await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question.questionId, response: "A" }, tick())).view;
    await afterResponseSettled();
    const after = await row(assignmentId, me.studentId!);
    assert.deepEqual([after.status, Number(after.coreAnswered), Number(after.coreCorrect)], ["COMPLETED", 50, right]);
    const item = (await assignedSkills(repo, me, tick())).items.find((x) => x.assignmentId === assignmentId)!;
    assert.equal(item.status, "COMPLETED");
    assert.deepEqual([item.work?.answered, item.work?.of], [50, 50]);
    const w = (await myWorkItems(repo, me, tick())).find((x) => x.assignmentId === assignmentId)!;
    assert.equal(w.status, "Done", "My Work shows Done");
  });

  test("running out of fresh questions (no-repeat) ends the session and the work is Done", async () => {
    const me = kids[2];
    const { assignmentId } = await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId: skill.small, studentIds: [me.studentId!] }, tick(0));
    let v: PracticeView = await startPractice(repo, me, skill.small, tick());
    let last = null as Awaited<ReturnType<typeof submitAnswer>> | null;
    for (let k = 0; k < 20 && v.question; k++) { last = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question.questionId, response: "B" }, tick()); v = last.view; }
    assert.ok(last && !last.feedback.next.hasQuestion);
    assert.ok(["SKILL_FINISHED", "POOL_EXHAUSTED"].includes(s(last!.feedback.next.endReason)), s(last!.feedback.next.endReason));
    assert.ok(v.answered < ASSIGNMENT_MIN_QUESTIONS);
    const done = await row(assignmentId, me.studentId!);
    assert.equal(done.status, "COMPLETED");
    await afterResponseSettled();
    assert.equal((await myWorkItems(repo, me, tick())).find((x) => x.assignmentId === assignmentId)!.status, "Done");
  });

  test("a skill of another grade in the student's plan opens its questions; a random other-grade skill does not", async () => {
    const me = kids[3];
    const st = (await repo.findUnique("Student", { id: me.studentId! }))!;
    // not in any plan yet: refused
    assert.equal(await isPlanSkill(repo, me, skill.plan5), false);
    await assert.rejects(startPractice(repo, me, skill.plan5, tick()), ForbiddenError);
    // the teacher sends a MAP plan with the Grade 5 skill to this Grade 4 student
    await repo.create("MapPlan", { schoolId: st.schoolId, classId, studentId: me.studentId!, subject: "READING", term: "Fall 2027", status: "SENT", items: [{ group: "LIT", rit: 190, low: 181, high: 190, status: "DEVELOP", skillIds: [skill.plan5], count: 1 }], sentAt: tick(), createdAt: tick(), updatedAt: tick() });
    assert.equal(await isPlanSkill(repo, me, skill.plan5), true);
    const v = await startPractice(repo, me, skill.plan5, tick());
    assert.ok(v.question, "its questions open (the adaptive engine, at the student's own level)");
    assert.equal(v.skillId, skill.plan5);
    // a draft plan or another student's plan does not count; a random Grade 5 skill stays closed
    await repo.create("MapPlan", { schoolId: st.schoolId, classId, studentId: me.studentId!, subject: "LANGUAGE", term: "Fall 2027", status: "DRAFT", items: [{ group: "LIT", skillIds: [skill.other5] }], createdAt: tick(), updatedAt: tick() });
    assert.equal(await isPlanSkill(repo, me, skill.other5), false);
    await assert.rejects(startPractice(repo, me, skill.other5, tick()), ForbiddenError);
    assert.equal(await isPlanSkill(repo, kids[0], skill.plan5), false, "another student's plan");
  });
});
