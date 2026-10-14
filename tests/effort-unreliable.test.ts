/**
 * 📉 r67 item 2 — every session's effort for the teacher, and "Unreliable" sessions (demo school in memory; never a
 * real database):
 *   · effort = careful answers / all answers (rapid guesses are not careful)
 *   · more than 20 % guesses → the session is Unreliable: the flag is kept on the session and copied to its answers,
 *     so its answers never move the student's level (level evidence), tier or intervention numbers
 *   · teacher reports show it: Practice Analytics (class, skills, one student's sessions) and the student page's
 *     effort figure (studentEffort)
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { teacherCurriculum } from "../src/server/teacher/assign";
import { startPractice, submitAnswer, type PracticeView } from "../src/server/practice/session";
import { effortFromCounts, sessionEffort, studentEffort, UNRELIABLE_SHARE } from "../src/server/practice/guessing";
import { practiceAnalytics } from "../src/server/analytics/practice";
import { levelThetas } from "../src/server/curriculum-map/level-evidence";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const T0 = new Date("2027-03-15T08:00:00Z");

describe("effort (pure)", () => {
  test("effort = careful / all; over 20 % guesses is Unreliable", () => {
    assert.equal(UNRELIABLE_SHARE, 0.2);
    assert.deepEqual(effortFromCounts(10, 2), { answers: 10, guesses: 2, effort: 80, unreliable: false }, "exactly 20 %: still reliable");
    assert.deepEqual(effortFromCounts(10, 3), { answers: 10, guesses: 3, effort: 70, unreliable: true });
    assert.deepEqual(effortFromCounts(0, 0), { answers: 0, guesses: 0, effort: null, unreliable: false });
    assert.deepEqual(sessionEffort([{ rapidGuess: true }, { rapidGuess: false }, { rapidGuess: false }, { rapidGuess: false }]), { answers: 4, guesses: 1, effort: 75, unreliable: true });
  });
});

describe("Unreliable sessions in practice and in the teacher's reports", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = ""; let skillId = "";
  const kids: Actor[] = [];
  let clock = T0.getTime();
  const tick = (ms = 30_000) => new Date((clock += ms));

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 4 }));
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    for (const st of view.students) kids.push(await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: st.id }))!.userId }))!));
    const st = (await repo.findUnique("Student", { id: kids[0].studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const fam = s((await repo.upsert("SkillFamily", { code: "r67.effort" }, { name: "r67 effort", domain: "READING", category: "COMPREHENSION" })).id);
    skillId = s((await repo.create("Skill", { curriculumId: cur.id, familyId: fam, code: "R67.effort", name: "Cobalt Details", domain: "READING", category: "COMPREHENSION", sequence: 9700, isActive: true })).id);
    for (let k = 0; k < 40; k++) {
      const q = await repo.create("Question", { skillId, typeId: mc, stem: `Cobalt Details item ${k + 1}: which detail fits?`, content: {}, difficultyLevel: 1 + (k % 7), irtB: -1 + (k % 5) * 0.4, status: "PUBLISHED", createdAt: T0, updatedAt: T0 });
      for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Cobalt option ${o} ${k}`, isCorrect: i === 0, order: i });
    }
  });

  test("a session over 20 % guesses is Unreliable: flagged with its answers, and left out of the level", async () => {
    const me = kids[0];
    let v: PracticeView = await startPractice(repo, me, skillId, tick(0));
    // 6 answers, 2 of them guesses (33 %)
    for (const ms of [30_000, 1000, 30_000, 30_000, 1000, 30_000]) v = (await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: "A" }, tick(ms))).view;
    const sess = (await repo.findUnique("PracticeSession", { id: v.sessionId }))!;
    assert.deepEqual([Number(sess.questionCount), Number(sess.guessCount), Boolean(sess.unreliable)], [6, 2, true]);
    const att = await repo.findMany("QuestionAttempt", { sessionId: v.sessionId });
    assert.ok(att.length === 6 && att.every((a) => Boolean(a.unreliable)), "the flag is copied to every answer of the session");
    // its answers never move the student's level (the level evidence leaves them out)
    const th = await levelThetas(repo, [me.studentId!], tick(0));
    assert.equal(th.get(me.studentId!), undefined, "no level evidence from an Unreliable session");
  });

  test("a careful session stays reliable and counts for the level", async () => {
    const me = kids[1];
    let v: PracticeView = await startPractice(repo, me, skillId, tick(0));
    for (let k = 0; k < 6; k++) v = (await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: "A" }, tick(k === 2 ? 1000 : 30_000))).view;
    const sess = (await repo.findUnique("PracticeSession", { id: v.sessionId }))!;
    assert.deepEqual([Number(sess.guessCount), Boolean(sess.unreliable)], [1, false], "1 of 6 (17 %) is still reliable");
    assert.ok((await levelThetas(repo, [me.studentId!], tick(0))).get(me.studentId!), "its careful answers count for the level");
  });

  test("teacher reports: effort for the class, each skill and student, and one student's sessions", async () => {
    const a = await practiceAnalytics(repo, teacher, { classId, from: new Date(T0.getTime() - 86_400_000), to: tick(0) });
    assert.equal(a.totals.unreliable, 1);
    assert.equal(a.totals.effort, Math.round((100 * 9) / 12), "9 careful answers of 12");
    const sk = a.skills.find((k) => k.skillId === skillId)!;
    assert.equal(sk.effort, 75);
    // accuracy counts careful answers only (every answer here was right)
    assert.equal(sk.accuracy, 100);
    const guesser = a.students.find((x) => x.id === kids[0].studentId)!;
    assert.deepEqual([guesser.effort, guesser.unreliable], [67, 1]);
    const one = await practiceAnalytics(repo, teacher, { classId, from: new Date(T0.getTime() - 86_400_000), to: tick(0), studentId: kids[0].studentId! });
    assert.equal(one.sessions.length, 1);
    assert.deepEqual([one.sessions[0].answers, one.sessions[0].effort, one.sessions[0].unreliable], [6, 67, true]);
    const e = await studentEffort(repo, kids[0].studentId!, 30, tick(0));
    assert.deepEqual([e.effort, e.unreliableSessions, e.sessions], [67, 1, 1]);
  });
});
