/**
 * ✅ My Work completion (demo school in memory; never a real database):
 *   - finishing a practice makes the work Done in the SAME transaction as the last answer (no waiting for the
 *     background refresh), even below the target mastery; idempotent (double submit, second tab)
 *   - older assignments with skillIds only, a session opened before the work was assigned, another grade's copy of
 *     the skill, and a skill assigned twice are all completed
 *   - a stale status refresh never moves Done back
 *   - question sets: a goal set whose questions run out, and a set with a deleted question, are Done when finished
 *   - recomputeCompletion backfills rows left behind (lazy and bounded on My Work); a paused practice stays open
 *   - My Next Step suggests ONLY skills the teacher assigned (none → hidden)
 *   - the My Work page: progress, badge, Continue and empty state from one source; "Great job! ✓" then back
 *   - levels and mastery are not changed by any of this
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { assignQuestions, assignSkill, refreshAfterAnswer, refreshSkillAssignments, teacherCurriculum } from "../src/server/teacher/assign";
import { endPractice, startPractice, startQuiz, submitAnswer, submitQuizAnswer, type PracticeView } from "../src/server/practice/session";
import { FINISH_REASONS, recomputeCompletion, resetBackfillMemo } from "../src/server/practice/completion";
import { assignedSkills } from "../src/server/student/assigned";
import { myWorkItems } from "../src/server/plans/wizard";
import { myWorkView, workProgress } from "../src/server/student/program-work";
import { nextStep, assignedSkillIds } from "../src/server/student/next-step";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const T0 = new Date("2027-05-03T08:00:00Z");

describe("My Work: finished work is recorded as Done", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = "";
  const kids: Actor[] = [];
  const skill: Record<string, string> = {};
  const qOf: Record<string, string[]> = {};
  let clock = T0.getTime();
  const tick = (ms = 30_000) => new Date((clock += ms));
  const row = async (assignmentId: string, studentId: string) => (await repo.findMany("AssignmentStudent", { assignmentId, studentId }))[0];

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 6 }));
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    for (const st of view.students) kids.push(await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: st.id }))!.userId }))!));
    const st = (await repo.findUnique("Student", { id: kids[0].studentId! }))!;
    const grade4 = (await repo.findUnique("Grade", { id: st.gradeId }))!;
    const grade5 = (await repo.findMany("Grade", { schoolId: grade4.schoolId, level: 5 }))[0];
    const cur4 = (await repo.findMany("Curriculum", { gradeId: grade4.id, isActive: true }))[0];
    const cur5 = (await repo.findMany("Curriculum", { gradeId: grade5.id }))[0];
    const fam = s((await repo.upsert("SkillFamily", { code: "school.reading.comprehension" }, { name: "reading · comprehension", domain: "READING", category: "COMPREHENSION" })).id);
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const mk = async (key: string, curId: unknown, name: string, n: number) => {
      skill[key] = s((await repo.create("Skill", { curriculumId: curId, familyId: fam, code: `MW.${key}`, name, domain: "READING", category: "COMPREHENSION", sequence: 9200, isActive: true })).id);
      qOf[key] = [];
      for (let k = 0; k < n; k++) {
        const q = await repo.create("Question", { skillId: skill[key], typeId: mc, stem: `${name} question ${k + 1}?`, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: T0, updatedAt: T0 });
        for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Choice ${o} ${k}`, isCorrect: i === 0, order: i });
        qOf[key].push(s(q.id));
      }
    };
    await mk("a", cur4.id, "Omega Detail", 4);      // a small skill: finished after four answers
    await mk("b", cur4.id, "Kappa Sequence", 5);
    await mk("c4", cur4.id, "Lambda Signal", 0);    // Grade 4's copy reads Grade 5's questions (one family)
    await mk("c5", cur5.id, "lambda signal", 4);
    await mk("set", cur4.id, "Sigma Sets", 6);
  });

  /** answers until the practice ends; returns the last feedback/view */
  const finish = async (who: Actor, skillId: string, pattern: (k: number) => boolean = () => true) => {
    let v: PracticeView = await startPractice(repo, who, skillId, tick());
    let last: Awaited<ReturnType<typeof submitAnswer>> | null = null;
    for (let k = 0; v.question && k < 25; k++) {
      last = await submitAnswer(repo, who, { sessionId: v.sessionId, questionId: v.question.questionId, response: pattern(k) ? "A" : "B" }, tick());
      v = last.view;
    }
    return last!;
  };

  test("finishing the practice → Done at once (in the answer's transaction), even below the target mastery", async () => {
    const me = kids[0];
    const { assignmentId } = await assignSkill(repo, teacher, { classId, skillId: skill.a, studentIds: [me.studentId!], targetMastery: 95 }, tick(0));
    const last = await finish(me, skill.a, (k) => k % 2 === 0);
    assert.ok(FINISH_REASONS.has(String(last.feedback.next.endReason)), String(last.feedback.next.endReason));
    // NOT waiting for the background refresh: the row is already Done
    const r = await row(assignmentId, me.studentId!);
    assert.deepEqual([r.status, Number(r.progress), Boolean(r.completedAt)], ["COMPLETED", 1, true]);
    const m = (await repo.findMany("StudentSkillMastery", { studentId: me.studentId!, skillId: skill.a }))[0];
    assert.ok(Number(m.score) < 95, "below the target mastery, the finished work is still Done");
    // idempotent: a second submit (two tabs, a retry) changes nothing
    const at = s(r.completedAt);
    const again = await submitAnswer(repo, me, { sessionId: last.view.sessionId, questionId: qOf.a[0], response: "A" }, tick());
    assert.equal(again.feedback.alreadyEnded, true);
    assert.equal(s((await row(assignmentId, me.studentId!)).completedAt), at, "completed once");
    // a late background refresh never moves it back
    await afterResponseSettled();
    await refreshAfterAnswer(repo, assignmentId, me.studentId!, tick(), skill.a);
    await refreshSkillAssignments(repo, [(await repo.findUnique("Assignment", { id: assignmentId }))!], [me.studentId!], tick());
    assert.equal((await row(assignmentId, me.studentId!)).status, "COMPLETED");
    // My Work: Done, with the report link
    const item = (await myWorkItems(repo, me, tick())).find((x) => x.assignmentId === assignmentId)!;
    assert.deepEqual([item.status, item.action, item.href], ["Done", "Review", `/student/assignments/${assignmentId}/report`]);
  });

  test("a paused practice (Leave) is not Done; the session opened before the work was assigned is linked on return", async () => {
    const me = kids[1];
    const v = await startPractice(repo, me, skill.b, tick());
    const r1 = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: "A" }, tick());
    // the teacher assigns the skill now; the student comes back to the same open session
    const { assignmentId } = await assignSkill(repo, teacher, { classId, skillId: skill.b, studentIds: [me.studentId!] }, tick(0));
    const back = await startPractice(repo, me, skill.b, tick());
    assert.equal(back.sessionId, r1.view.sessionId, "the open session is resumed");
    assert.equal(s((await repo.findUnique("PracticeSession", { id: back.sessionId }))!.assignmentId), assignmentId, "and linked to the work");
    await endPractice(repo, me, back.sessionId, tick());
    assert.notEqual((await row(assignmentId, me.studentId!)).status, "COMPLETED", "leaving is a pause, not a finish");
    const last = await finish(me, skill.b);
    assert.ok(FINISH_REASONS.has(String(last.feedback.next.endReason)));
    assert.equal((await row(assignmentId, me.studentId!)).status, "COMPLETED");
  });

  test("older skillIds-only work, another grade's copy, and a skill assigned twice are all completed", async () => {
    const me = kids[2];
    // an older row: no skillId, its one skill in skillIds
    const teacherRow = (await repo.findMany("Teacher", { userId: teacher.userId }))[0];
    const legacy = await repo.create("Assignment", { classId, createdById: teacherRow.id, title: "Older work", target: "SKILL", skillIds: [skill.c4], targetMastery: 75, createdAt: tick(0) });
    await repo.create("AssignmentStudent", { assignmentId: legacy.id, studentId: me.studentId!, status: "NOT_STARTED", progress: 0 });
    // the same skill (Grade 5's copy) assigned too
    const { assignmentId: g5 } = await assignSkill(repo, teacher, { classId, skillId: skill.c5, studentIds: [me.studentId!] }, tick(0));
    const v = await startPractice(repo, me, skill.c4, tick());
    assert.equal(s((await repo.findUnique("PracticeSession", { id: v.sessionId }))!.assignmentId), s(legacy.id), "the exact skill's work is linked first");
    const last = await finish(me, skill.c4);
    assert.ok(FINISH_REASONS.has(String(last.feedback.next.endReason)));
    assert.equal((await row(s(legacy.id), me.studentId!)).status, "COMPLETED", "skillIds-only work is Done");
    assert.equal((await row(g5, me.studentId!)).status, "COMPLETED", "the other grade's copy of the same skill is Done too");
    // My Work lists the older row as a skill row and shows it Done
    const items = await myWorkItems(repo, me, tick());
    assert.ok(items.filter((x) => x.skillId === skill.c4 || x.skillId === skill.c5).every((x) => x.status === "Done"));
  });

  test("question sets: a goal set whose questions run out, and a set with a deleted question, are Done when finished", async () => {
    const me = kids[3];
    // a goal of 10 correct answers but only 6 questions: the student answers them all, the set ends → Done
    const goal = await assignQuestions(repo, teacher, { classId, studentIds: [me.studentId!], questionIds: qOf.set, adaptive: { maxQuestions: 6, targetCorrect: 10 }, title: "Goal place" }, tick(0));
    let qv = await startQuiz(repo, me, goal.assignmentId, tick());
    for (let k = 0; qv.question && k < 30; k++) ({ view: qv } = await submitQuizAnswer(repo, me, { assignmentId: goal.assignmentId, questionId: qv.question.questionId, response: "A" }, tick()));
    assert.equal(qv.ended, true);
    assert.equal((await row(goal.assignmentId, me.studentId!)).status, "COMPLETED", "finished goal set is Done");
    // a fixed set with one question deleted afterwards: the student can answer the rest and finish
    const fixed = await assignQuestions(repo, teacher, { classId, studentIds: [me.studentId!], questionIds: qOf.set.slice(0, 3), title: "Three questions" }, tick(0));
    await repo.updateMany("Question", { id: qOf.set[1] }, { deletedAt: tick(0) });
    qv = await startQuiz(repo, me, fixed.assignmentId, tick());
    assert.equal(qv.total, 2, "only questions that can still be answered");
    for (let k = 0; qv.question && k < 5; k++) ({ view: qv } = await submitQuizAnswer(repo, me, { assignmentId: fixed.assignmentId, questionId: qv.question.questionId, response: "A" }, tick()));
    assert.equal(qv.ended, true);
    assert.equal((await row(fixed.assignmentId, me.studentId!)).status, "COMPLETED");
    await repo.updateMany("Question", { id: qOf.set[1] }, { deletedAt: null });
  });

  test("recomputeCompletion backfills finished work left open (bounded, lazy on My Work); paused work stays open", async () => {
    const me = kids[4];
    const { assignmentId: done } = await assignSkill(repo, teacher, { classId, skillId: skill.b, studentIds: [me.studentId!] }, tick(0));
    const { assignmentId: paused } = await assignSkill(repo, teacher, { classId, skillId: skill.a, studentIds: [me.studentId!] }, tick(0));
    // as before the fix: a finished session whose status was never written, and a paused one
    await repo.create("PracticeSession", { studentId: me.studentId!, skillId: skill.b, assignmentId: done, mode: "ADAPTIVE_PRACTICE", startedAt: tick(), endedAt: tick(), endReason: "COMPLETED", questionCount: 20, correctCount: 9 });
    await repo.create("PracticeSession", { studentId: me.studentId!, skillId: skill.a, assignmentId: paused, mode: "ADAPTIVE_PRACTICE", startedAt: tick(), endedAt: tick(), endReason: "STUDENT_EXIT", questionCount: 3, correctCount: 1 });
    await repo.updateMany("AssignmentStudent", { studentId: me.studentId! }, { status: "IN_PROGRESS", progress: 0.4 });
    // a goal set that ended without its goal (its questions ran out), status never written
    const goal = await assignQuestions(repo, teacher, { classId, studentIds: [me.studentId!], questionIds: qOf.set, adaptive: { maxQuestions: 6, targetCorrect: 10 }, title: "Old goal place" }, tick(0));
    const set = (await repo.findUnique("Assignment", { id: goal.assignmentId }))!;
    await repo.create("PracticeSession", { studentId: me.studentId!, assessmentId: set.assessmentId, assignmentId: goal.assignmentId, mode: "TEACHER_QUIZ", startedAt: tick(), endedAt: tick(), endReason: "COMPLETED", questionCount: 6, correctCount: 6 });
    await repo.updateMany("AssignmentStudent", { assignmentId: goal.assignmentId, studentId: me.studentId! }, { status: "IN_PROGRESS", progress: 0.6 });
    // bounded: a limit of one row looks at one row only
    assert.ok((await recomputeCompletion(repo, me.studentId!, { now: tick(), limit: 1, force: true })) <= 1);
    const n = await recomputeCompletion(repo, me.studentId!, { now: tick(), force: true });
    const st = async (id: string) => (await row(id, me.studentId!)).status;
    assert.deepEqual([await st(done), await st(goal.assignmentId), await st(paused)], ["COMPLETED", "COMPLETED", "IN_PROGRESS"]);
    assert.ok(n >= 1);
    assert.equal(await recomputeCompletion(repo, me.studentId!, { now: tick(), force: true }), 0, "idempotent");
    // lazily on My Work (the page's own rows): a stuck row is completed when the student opens My Work
    await repo.updateMany("AssignmentStudent", { assignmentId: done, studentId: me.studentId! }, { status: "IN_PROGRESS", progress: 0.4, completedAt: null });
    resetBackfillMemo();
    const v = await assignedSkills(repo, me, tick());
    assert.equal(v.items.find((i) => i.assignmentId === done)?.status, "COMPLETED");
    // every school (an admin script): bounded too
    assert.ok((await recomputeCompletion(repo, undefined, { now: tick(), limit: 50 })) >= 0);
    await afterResponseSettled();
  });

  test("My Next Step suggests only skills the teacher assigned; none → hidden", async () => {
    const none = kids[5];
    const step0 = await nextStep(repo, none, tick());
    assert.ok(!["PRACTICE", "REVIEW"].includes(step0.kind), `no assigned skill → no skill suggestion (${step0.kind})`);
    if (step0.kind === "DONE") assert.equal(step0.href, null, "the section is hidden");
    await assignSkill(repo, teacher, { classId, skillId: skill.b, studentIds: [none.studentId!] }, tick(0));
    const mine = await assignedSkillIds(repo, none.studentId!, tick());
    assert.deepEqual([...mine.all], [skill.b]);
    const step = await nextStep(repo, none, tick());
    if (step.kind === "PRACTICE" || step.kind === "REVIEW") assert.equal(step.href, `/practice/${skill.b}`, "only the assigned skill");
    for (const p of step.path ?? []) assert.ok(p.href.endsWith(skill.b), "the path lists assigned skills only");
    await afterResponseSettled();
  });

  test("the My Work page: one source for rows, progress, badge, Continue and the empty state", () => {
    type R = { status: "Not started" | "In progress" | "Done"; href: string; skill: string; skillId: string | null };
    const rows: R[] = [
      { status: "In progress", href: "/practice/s1", skill: "One", skillId: "s1" },
      { status: "Done", href: "/student/assignments/a2/report", skill: "Two", skillId: "s2" },
      { status: "Not started", href: "/quiz/a3", skill: "Three", skillId: null },
    ];
    const v = myWorkView(rows, null);
    assert.deepEqual([v.open.length, v.done.length, v.toDo, v.progress], [2, 1, 2, workProgress(rows)]);
    assert.deepEqual(v.progress, { done: 1, total: 3, pct: 33 });
    assert.equal(v.open.length + v.done.length, v.progress.total, "the progress line counts exactly the rows shown");
    assert.deepEqual(v.cont, { href: "/practice/s1", title: "One" });
    assert.deepEqual(myWorkView(rows, { href: "/practice/s2", title: "Two" }).cont, { href: "/practice/s1", title: "One" }, "a Done skill is never 'continued'");
    assert.deepEqual(myWorkView(rows, { href: "/student/readrise/x", title: "Article" }).cont, { href: "/student/readrise/x", title: "Article" });
    const allDone = myWorkView([rows[1]], null);
    assert.deepEqual([allDone.allDone, allDone.toDo, allDone.cont], [true, 0, null]);
    assert.deepEqual([myWorkView([], null).progress.total, myWorkView([], null).cont], [0, null], "empty: no progress line, no Continue");
    const page = readFileSync(join(ROOT, "src/app/student/page.tsx"), "utf8");
    assert.match(page, /myWorkView\(h\.work, h\.last\)/);
    assert.match(page, /data-testid="my-work-todo"/);
    assert.match(page, /EmptyState/);
  });

  test("after finishing: 'Great job! ✓' for about 2 seconds, then back to My Work (button kept); strings in English and Arabic", () => {
    const player = readFileSync(join(ROOT, "src/components/practice/practice-player.tsx"), "utf8");
    assert.match(player, /DONE_REDIRECT_MS = 2000/);
    assert.match(player, /window\.location\.assign\(href\)/);
    assert.match(player, /t\("Great job! ✓"\)/);
    assert.match(player, /t\("Back to My Work"\)/);
    assert.match(player, /t\("You finished this skill! 🎉"\)/);
    for (const k of ["Great job! ✓", "You finished this skill! 🎉", "Going back to My Work…"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), k);
      assert.ok((ar as Record<string, string>)[k], `Arabic for ${k}`);
    }
    // students never see Below / On / Above about themselves in these screens
    for (const f of ["src/components/practice/practice-player.tsx", "src/components/practice/practice-frame.tsx"]) assert.doesNotMatch(readFileSync(join(ROOT, f), "utf8"), /\b(Below|Above) (level|Level)\b/);
  });
});
