/**
 * 🎯 Assigned skill work (demo school in memory; never a real database). The old 25-question rule is REPLACED by the
 * 30–50 rule (tests/work-30-50.test.ts covers mastered at 30, 50 + choice, and running out of questions):
 *   - 25 answers no longer make the work Done; the student sees "x of 30"
 *   - completion, accuracy and mastery are three separate values (My Work list, the practice screen, the report)
 *   - "Skill not assigned" no longer shows for another grade's copy of an assigned skill or an older skillIds row
 *   - a double submit is saved once
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { startPractice, submitAnswer, type PracticeView } from "../src/server/practice/session";
import { ASSIGNMENT_MIN_QUESTIONS, assignedSkillAccess } from "../src/server/practice/completion";
import { assignedSkills, assignmentReport } from "../src/server/student/assigned";
import { myWorkItems } from "../src/server/plans/wizard";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const T0 = new Date("2027-06-07T08:00:00Z");

describe("assigned skill work (was: the 25-question rule)", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = "";
  const kids: Actor[] = [];
  const skill: Record<string, string> = {};
  let clock = T0.getTime();
  const tick = (ms = 30_000) => new Date((clock += ms));
  const row = async (assignmentId: string, studentId: string) => (await repo.findMany("AssignmentStudent", { assignmentId, studentId }))[0];

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
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const fam = s((await repo.upsert("SkillFamily", { code: "school.reading.comprehension" }, { name: "reading · comprehension", domain: "READING", category: "COMPREHENSION" })).id);
    const mk = async (key: string, curId: unknown, name: string, n: number) => {
      skill[key] = s((await repo.create("Skill", { curriculumId: curId, familyId: fam, code: `W25.${key}`, name, domain: "READING", category: "COMPREHENSION", sequence: 9300, isActive: true })).id);
      for (let k = 0; k < n; k++) {
        const q = await repo.create("Question", { skillId: skill[key], typeId: mc, stem: `${name} item ${k + 1}?`, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: T0, updatedAt: T0 });
        for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Option ${o} ${k}`, isCorrect: i === 0, order: i });
      }
    };
    await mk("big", cur4.id, "Zephyr Evidence", 45);
    await mk("g5", cur5.id, "Quasar Theme", 3);
    await mk("g4copy", cur4.id, "quasar theme", 0);
  });

  test("25 answers no longer finish the work (the 30–50 rule): x of 30, accuracy and mastery kept apart", async () => {
    const me = kids[0];
    const { assignmentId } = await assignSkill(repo, teacher, { classId, skillId: skill.big, studentIds: [me.studentId!], targetMastery: 99 }, tick(0));
    let v: PracticeView = await startPractice(repo, me, skill.big, tick());
    assert.equal(v.work?.answered, 0);
    assert.equal(v.work?.of, ASSIGNMENT_MIN_QUESTIONS);
    let right = 0;
    for (let k = 0; k < 25; k++) {
      const ok = k % 5 !== 0; // 20 of 25 right → 80 %
      if (ok) right++;
      const r = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: ok ? "A" : "B" }, tick());
      v = r.view;
      assert.notEqual(r.feedback.work?.justDone, true, `not Done at ${k + 1}`);
      assert.equal(r.feedback.next.hasQuestion, true, "practice goes on (no choice before 30)");
    }
    await afterResponseSettled();
    const now = await row(assignmentId, me.studentId!);
    assert.notEqual(now.status, "COMPLETED", "25 answers are not enough any more");
    assert.deepEqual([Number(now.coreAnswered), Number(now.coreCorrect)], [25, right]);
    assert.deepEqual([v.work?.completion, v.work?.answered, v.work?.of, v.work?.accuracy], ["IN_PROGRESS", 25, 30, 80]);
    // three separate values in My Work and in the report
    const item = (await assignedSkills(repo, me, tick())).items.find((x) => x.assignmentId === assignmentId)!;
    assert.notEqual(item.status, "COMPLETED");
    assert.deepEqual([item.work?.answered, item.work?.of, item.work?.accuracy], [25, 30, 80]);
    assert.ok(item.work?.mastery !== null);
    const rep = await assignmentReport(repo, me, assignmentId);
    assert.equal(rep.accuracy, 80, "the report's accuracy counts the work's answers");
    assert.equal(rep.answered, 25);
    assert.deepEqual(rep.completion, { answered: 25, of: 30, correct: right });
    assert.match(rep.nextStep, /at least 5 more question/);
    const w = (await myWorkItems(repo, me, tick())).find((x) => x.assignmentId === assignmentId)!;
    assert.notEqual(w.status, "Done");
  });

  test("another grade's copy of an assigned skill and an older skillIds row are 'assigned' (no false message)", async () => {
    const me = kids[1];
    await assignSkill(repo, teacher, { classId, skillId: skill.g5, studentIds: [me.studentId!] }, tick(0));
    assert.equal((await assignedSkillAccess(repo, me.studentId!, skill.g5, tick())).assigned, true);
    assert.equal((await assignedSkillAccess(repo, me.studentId!, skill.g4copy, tick())).assigned, true, "same family, another grade");
    // an older row keeps its skills in skillIds only
    const other = kids[2];
    const a = await repo.create("Assignment", { classId, createdById: (await repo.findMany("Assignment", { classId }))[0].createdById, title: "Old", target: "SKILL", skillIds: [skill.big, skill.g5], createdAt: tick() });
    await repo.create("AssignmentStudent", { assignmentId: a.id, studentId: other.studentId!, status: "NOT_STARTED", progress: 0 });
    assert.equal((await assignedSkillAccess(repo, other.studentId!, skill.big, tick())).assigned, true);
    assert.equal((await assignedSkillAccess(repo, kids[3].studentId!, skill.big, tick())).assigned, false, "not assigned stays refused");
  });

  test("assigned for later: not open yet, with its start date", async () => {
    const me = kids[3];
    const startAt = new Date(clock + 3 * 86_400_000);
    await assignSkill(repo, teacher, { classId, skillId: skill.g5, studentIds: [me.studentId!], startAt }, tick(0));
    const acc = await assignedSkillAccess(repo, me.studentId!, skill.g5, tick());
    assert.equal(acc.assigned, false);
    assert.equal(acc.startsAt?.toISOString().slice(0, 10), startAt.toISOString().slice(0, 10));
  });
});
