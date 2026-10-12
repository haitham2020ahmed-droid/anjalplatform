/**
 * 🔁 No repeated questions in skill practice (demo school in memory; never a real database):
 *   a. an attempted question never comes back — across sessions, across the skill family (another grade's copy), and
 *      within a session
 *   b. a MISSED question does not come back in practice either: it waits in Second Chance (the only place a missed
 *      question is shown again)
 *   c. nothing new left → "You finished this skill! 🎉" (SKILL_FINISHED) and the work is Done
 *   d. Assignment.questionIds: the same rules inside the teacher's picks
 *   e. any attempt history counts (the Diagnostic too); levels and mastery are computed exactly as before (only the
 *      choice of the next question changes)
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { endPractice, startPractice, submitAnswer, type PracticeView } from "../src/server/practice/session";
import { allowedQuestions, answerState, keyed, withAnswer } from "../src/server/practice/no-repeat";
import { loadSkillItems } from "../src/server/practice/items";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { processAnswer, type SkillState } from "../src/adaptive/engine";
import { DEFAULT_ADAPTIVE, DEFAULT_MASTERY } from "../src/config/engine";
import type { CandidateItem, ResponseEvidence } from "../src/types/domain";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const T0 = new Date("2027-04-05T08:00:00Z");

describe("no repeated questions within a skill (per student, across sessions)", () => {
  let repo: SqliteRepo; let teacher: Actor; let A: Actor; let B: Actor; let classId = "";
  let g4 = "", g5 = "";
  const qs: string[] = [];
  let clock = T0.getTime();
  const tick = (ms = 30_000) => new Date((clock += ms));

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 3 }));
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    const toActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
    A = await toActor(view.students[0].id);
    B = await toActor(view.students[1].id);
    const st = (await repo.findUnique("Student", { id: A.studentId! }))!;
    const grade4 = (await repo.findUnique("Grade", { id: st.gradeId }))!;
    const grade5 = (await repo.findMany("Grade", { schoolId: grade4.schoolId, level: 5 }))[0];
    const cur4 = (await repo.findMany("Curriculum", { gradeId: grade4.id, isActive: true }))[0];
    const cur5 = (await repo.findMany("Curriculum", { gradeId: grade5.id }))[0];
    const fam = s((await repo.upsert("SkillFamily", { code: "school.reading.comprehension" }, { name: "reading · comprehension", domain: "READING", category: "COMPREHENSION" })).id);
    // one skill FAMILY: Grade 4's copy has no questions of its own, Grade 5's has six (one pool)
    g4 = s((await repo.create("Skill", { curriculumId: cur4.id, familyId: fam, code: "G4.nr-zeta", name: "Zeta Clues", domain: "READING", category: "COMPREHENSION", sequence: 9100, isActive: true })).id);
    g5 = s((await repo.create("Skill", { curriculumId: cur5.id, familyId: fam, code: "G5.nr-zeta", name: "zeta  clues.", domain: "READING", category: "COMPREHENSION", sequence: 9100, isActive: true })).id);
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    for (const [k, level] of [3, 4, 4, 4, 4, 4].entries()) {
      const q = await repo.create("Question", { skillId: g5, typeId: mc, stem: `Zeta clue question ${k + 1}?`, content: {}, difficultyLevel: level, irtB: (level - 4) * 0.6, status: "PUBLISHED", createdAt: T0, updatedAt: T0 });
      for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Choice ${o} ${k}`, isCorrect: i === 0, order: i });
      qs.push(s(q.id));
    }
  });

  const answer = async (who: Actor, v: PracticeView, right: boolean) => {
    const r = await submitAnswer(repo, who, { sessionId: v.sessionId, questionId: v.question!.questionId, response: right ? "A" : "B" }, tick());
    return r;
  };

  test("pure rule: never-attempted questions only (copies count as attempted), then finished", () => {
    const pool = [
      { questionId: qs[0], b: 0, keys: ["s:one"] },
      { questionId: qs[1], b: 0, keys: ["s:two"] },
      { questionId: qs[2], b: 0, keys: ["s:three"] },
      { questionId: "copy-of-1", b: 0.2, keys: ["s:one"] },
    ];
    const none = { answered: new Set<string>(), keys: new Set<string>() };
    assert.deepEqual(allowedQuestions(pool, none), { phase: "NEW", ids: [qs[0], qs[1], qs[2], "copy-of-1"] });
    const st = withAnswer(withAnswer(none, pool[0]), pool[1]);
    assert.deepEqual(allowedQuestions(pool, st), { phase: "NEW", ids: [qs[2]] }, "the copy of an answered question is not new");
    assert.deepEqual(allowedQuestions(pool, withAnswer(st, pool[2])), { phase: "DONE", ids: [] }, "a missed question never comes back here");
  });

  test("across sessions: never an attempted question; a missed one does not come back; finished → Done", async () => {
    const served: string[] = [];
    const { assignmentId } = await assignSkill(repo, teacher, { classId, skillId: g4, studentIds: [A.studentId!] }, tick(0));
    // session 1: one right, one wrong, then the student leaves
    let v = await startPractice(repo, A, g4, tick());
    served.push(v.question!.questionId);
    let r = await answer(A, v, true); v = r.view;
    assert.ok(v.question && !served.includes(v.question.questionId), "a new question in the same session");
    served.push(v.question.questionId);
    r = await answer(A, v, false); v = r.view;
    await endPractice(repo, A, v.sessionId, tick());
    // session 2: the first question is one never answered
    v = await startPractice(repo, A, g4, tick());
    for (let k = 0; k < 4; k++) {
      const id = v.question!.questionId;
      assert.ok(!served.includes(id), `question ${k + 3} is new`);
      served.push(id);
      r = await answer(A, v, k !== 0); v = r.view;
    }
    assert.equal(new Set(served).size, 6, "all six questions answered, each once");
    // every question attempted (two of them missed): the missed ones wait in Second Chance, practice is finished
    assert.equal(r.feedback.next.endReason, "SKILL_FINISHED");
    assert.equal(r.view.ended, true);
    // session 3: nothing to serve — the finished screen at once, and the work is Done
    const again = await assignSkill(repo, teacher, { classId, skillId: g4, studentIds: [A.studentId!] }, tick(0));
    v = await startPractice(repo, A, g4, tick());
    assert.deepEqual([v.question, v.ended, v.endReason], [null, true, "SKILL_FINISHED"]);
    for (const id of [assignmentId, again.assignmentId]) {
      const row = (await repo.findMany("AssignmentStudent", { assignmentId: id, studentId: A.studentId! }))[0];
      assert.equal(row.status, "COMPLETED", "the work is Done");
    }
    await afterResponseSettled();
  });

  test("the skill family counts: answers on Grade 4's copy finish Grade 5's copy too", async () => {
    const st = await answerState(repo, A.studentId!, keyed(await loadSkillItems(repo, g5)));
    assert.equal(st.answered.size, 6, "attempts recorded on the Grade 4 skill id are read for the Grade 5 copy");
    const { assignmentId } = await assignSkill(repo, teacher, { classId, skillId: g5, studentIds: [A.studentId!] }, tick(0));
    const v = await startPractice(repo, A, g5, tick());
    assert.deepEqual([v.question, v.endReason], [null, "SKILL_FINISHED"], "no repeat through another grade's copy");
    assert.equal((await repo.findMany("AssignmentStudent", { assignmentId, studentId: A.studentId! }))[0].status, "COMPLETED");
  });

  test("the teacher's picked questions (Assignment.questionIds): the same rules inside the picks", async () => {
    const picks = [qs[5], qs[2], qs[4]];
    const { assignmentId } = await assignSkill(repo, teacher, { classId, skillId: g4, studentIds: [B.studentId!], questionIds: picks }, tick(0));
    let v = await startPractice(repo, B, g4, tick());
    const served: string[] = [];
    let guard = 0, last = null as Awaited<ReturnType<typeof answer>> | null;
    while (v.question && guard++ < 10) {
      const id = v.question.questionId;
      assert.ok(picks.includes(id), "only picked questions");
      served.push(id);
      // the first one is missed: it does NOT come back (Second Chance)
      last = await answer(B, v, served.length !== 1);
      v = last.view;
    }
    assert.deepEqual([...served].sort(), [...picks].sort(), "each pick exactly once");
    assert.equal(v.endReason, "SKILL_FINISHED");
    assert.equal((await repo.findMany("AssignmentStudent", { assignmentId, studentId: B.studentId! }))[0].status, "COMPLETED");
    // a double submit of the last answer writes nothing more
    const n = await repo.count("QuestionAttempt", { studentId: B.studentId! });
    const dup = await submitAnswer(repo, B, { sessionId: v.sessionId, questionId: served[served.length - 1], response: "A" }, tick());
    assert.equal(dup.feedback.alreadyEnded, true);
    assert.equal(await repo.count("QuestionAttempt", { studentId: B.studentId! }), n);
    void last;
    await afterResponseSettled();
  });

  test("any attempt history counts — the Diagnostic's answers too", async () => {
    const C = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: (await teacherCurriculum(repo, teacher))!.students[2].id }))!.userId }))!);
    const diag = await repo.create("PracticeSession", { studentId: C.studentId!, mode: "DIAGNOSTIC", startedAt: tick(), endedAt: tick() });
    await repo.create("QuestionAttempt", { sessionId: diag.id, studentId: C.studentId!, questionId: qs[0], skillId: g5, response: { value: "A" }, isCorrect: true, responseMs: 9000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: tick() });
    const st = await answerState(repo, C.studentId!, keyed(await loadSkillItems(repo, g4)));
    assert.deepEqual([...st.answered], [qs[0]]);
  });

  test("levels and mastery are unchanged: the engine scores the same; only the choice of the next question differs", () => {
    const items: CandidateItem[] = [-1, -0.5, 0, 0.5, 1, 1.5].map((b, i) => ({ id: `q${i}`, skillId: "s", level: 3 + Math.round(b), a: 1, b, c: 0, estimatedSeconds: 40 }));
    const history: ResponseEvidence[] = items.slice(0, 3).map((it, k) => ({ itemId: it.id, correct: k !== 1, level: it.level, a: 1, b: it.b, c: 0, responseMs: 20_000, estimatedSeconds: 40, usedHint: false, at: new Date(T0.getTime() + k * 60_000).toISOString() }));
    const state: SkillState = { studentId: "s", skillId: "s", sessionId: "x", mode: "PRACTICE", ability: { theta: 0.1, se: 0.8 }, prior: { mean: 0, sd: 1 }, history, previousTargetB: 0, candidates: items, prerequisites: [] };
    const r: ResponseEvidence = { itemId: "q3", correct: true, level: items[3].level, a: 1, b: 0.5, c: 0, responseMs: 25_000, estimatedSeconds: 40, usedHint: false, at: new Date(T0.getTime() + 5 * 60_000).toISOString() };
    const cfg = { adaptive: DEFAULT_ADAPTIVE, mastery: DEFAULT_MASTERY };
    const full = processAnswer(state, r, cfg, new Date(T0.getTime() + 5 * 60_000), () => 0.3);
    const only = processAnswer({ ...state, candidates: items.filter((i) => ["q4", "q5"].includes(i.id)) }, r, cfg, new Date(T0.getTime() + 5 * 60_000), () => 0.3);
    assert.deepEqual([only.ability, only.mastery, only.xp, only.rapidGuess], [full.ability, full.mastery, full.xp, full.rapidGuess]);
    assert.ok(["q4", "q5"].includes(String(only.next.itemId)), "the next question comes from the allowed ones");
  });

  test("the stored mastery follows the engine after every answer (no change to the math)", async () => {
    const rows = await repo.findMany("StudentSkillMastery", { studentId: A.studentId!, skillId: g4 });
    assert.equal(rows.length, 1);
    const atts = await repo.findMany("QuestionAttempt", { studentId: A.studentId!, skillId: g4 });
    assert.equal(Number(rows[0].attempts), atts.length, "every answer counted once");
    assert.equal(Number(rows[0].correct), atts.filter((x) => x.isCorrect).length);
  });
});
