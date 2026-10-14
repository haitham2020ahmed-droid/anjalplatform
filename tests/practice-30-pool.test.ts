/**
 * 🐞 r67 item 0 — "Author's Purpose ended after exactly 4 questions and the student was told to start another skill"
 * (demo school in memory; never a real database).
 *
 * Root cause (reproduced below): a student whose ability estimate was low (a MAP-plan skill starts from the student's
 * RIT, seedAbilityFromRit) and who answered a few questions wrong saw the estimate fall below every question still
 * unanswered. The selector's bank-gap rule then returned NO question (NO_ITEM_IN_RANGE: nothing new within 2 levels),
 * and practice turned that into endReason POOL_EXHAUSTED — a FINISHING reason — so the session ended after 4 answers,
 * the work was marked Done and the student was sent back to pick another skill. A prerequisite route after 3 wrong
 * answers in a row (PREREQ_ROUTE: "Practise <another skill>") ended sessions after 3 the same way, and Curriculum Map
 * sets stopped at a "level confirmed" (MASTERED_ABOVE) or when no question was left at the nearby levels.
 *
 * Now: nothing but the rule ends practice — at least 30 counted answers (rapid guesses never count), Done when
 * mastered, at most 50 (or the teacher's own count, exactly), or the skill's WHOLE pool truly running out (every
 * grade's copy and its Curriculum Map questions; the teacher is told on Data Health), the guessing pause, or the
 * student choosing to stop.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { startPractice, submitAnswer, type Feedback, type PracticeView } from "../src/server/practice/session";
import { ASSIGNMENT_MAX_QUESTIONS, ASSIGNMENT_MIN_QUESTIONS } from "../src/server/practice/completion";
import { loadSkillItems, type PracticeItem } from "../src/server/practice/items";
import { shortPoolSkills } from "../src/server/practice/short-pool";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { demoDatabase, ROOT, seededRandom } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const T0 = new Date("2027-03-01T08:00:00Z");

describe("practice: at least 30, at most 50 — never an early stop (the 4-question stop)", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = "";
  const kids: Actor[] = [];
  const skill: Record<string, string> = {};
  let clock = T0.getTime();
  // a reader: 2 minutes a question (never a rapid guess, even on the first question of a long passage)
  const tick = (ms = 120_000) => new Date((clock += ms));
  let mc = "";
  const wrongOf = (it: PracticeItem): unknown => it.type === "TRUE_FALSE" ? !it.answer : it.options ? (it.type === "MULTI_SELECT" ? [it.options.find((o) => !o.correct)!.label] : it.options.find((o) => !o.correct)!.label)
    : it.type === "FILL_BLANK" ? "zzz" : it.sequence ? [...it.sequence].reverse() : it.pairs ? Object.fromEntries(it.pairs.map((p, k, a) => [p.left, a[(k + 1) % a.length].right])) : it.type === "ERROR_CORRECTION" ? (it.errorIndex! + 1) % it.segments!.length : "zzz";

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 6 }));
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    await repo.updateMany("Question", {}, { status: "PUBLISHED" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    for (const st of view.students) kids.push(await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: st.id }))!.userId }))!));
    const st = (await repo.findUnique("Student", { id: kids[0].studentId! }))!;
    const grade4 = (await repo.findUnique("Grade", { id: st.gradeId }))!;
    const grade5 = (await repo.findMany("Grade", { schoolId: grade4.schoolId, level: 5 }))[0];
    const cur4 = (await repo.findMany("Curriculum", { gradeId: grade4.id, isActive: true }))[0];
    const cur5 = (await repo.findMany("Curriculum", { gradeId: grade5.id }))[0];
    skill.ap = s((await repo.findUnique("Skill", { curriculumId: cur4.id, code: "G4.author-purpose" }))!.id);
    mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    // a family of its own per skill (Grade 4 and, for "split", Grade 5 copies of the same skill)
    const mk = async (key: string, curId: unknown, familyCode: string, name: string, n: number, b: (k: number) => number) => {
      const fam = s((await repo.upsert("SkillFamily", { code: `r67.${familyCode}` }, { name: `r67 ${familyCode}`, domain: "READING", category: "COMPREHENSION" })).id);
      skill[key] = s((await repo.create("Skill", { curriculumId: curId, familyId: fam, code: `R67.${key}`, name, domain: "READING", category: "COMPREHENSION", sequence: 9500, isActive: true })).id);
      for (let k = 0; k < n; k++) {
        const q = await repo.create("Question", { skillId: skill[key], typeId: mc, stem: `${name} item ${k + 1} (${key}): which clue fits?`, content: {}, difficultyLevel: 1 + (k % 7), irtB: b(k), status: "PUBLISHED", createdAt: T0, updatedAt: T0 });
        for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `${name} option ${o} ${key} ${k}`, isCorrect: i === 0, order: i });
      }
    };
    // every question far above a struggling student: the content-gap rule used to end practice at once
    await mk("hard", cur4.id, "hard", "Zephyr Craft", 60, (k) => 1.5 + (k % 5) * 0.2);
    // the same skill in two grades: 12 questions in Grade 4, 14 in Grade 5 (one pool of 26)
    await mk("split4", cur4.id, "split", "Quasar Evidence", 12, (k) => -1 + (k % 5) * 0.4);
    await mk("split5", cur5.id, "split", "Quasar Evidence", 14, (k) => -1 + (k % 5) * 0.4);
    await mk("count", cur4.id, "count", "Lumen Sequence", 40, (k) => -1 + (k % 5) * 0.4);
    await mk("small", cur4.id, "small", "Pebble Summary", 9, (k) => -0.5 + (k % 3) * 0.3);
  });

  test("the 4-question stop, reproduced: a struggling student on Author's Purpose (low start, wrong answers)", async () => {
    const me = kids[0];
    // the MAP plan starts the skill from a low RIT (seedAbilityFromRit): θ well below the bank's questions
    await repo.create("StudentAbility", { studentId: me.studentId, scope: `SKILL:${skill.ap}`, skillId: skill.ap, theta: -1.5, thetaSE: 1, responses: 0 });
    const items = new Map((await loadSkillItems(repo, skill.ap, { wholePool: true })).map((i) => [i.questionId, i]));
    assert.ok(items.size > 4 && items.size < ASSIGNMENT_MIN_QUESTIONS, `Author's Purpose pool across grades: ${items.size}`);
    let v: PracticeView = await startPractice(repo, me, skill.ap, tick(0), seededRandom(7));
    const ends: (string | null)[] = [];
    let n = 0;
    while (v.question && n < 70) {
      const it = items.get(v.question.questionId)!;
      const r = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: it.questionId, response: wrongOf(it) }, tick(), seededRandom(n));
      n++; v = r.view; ends.push(r.feedback.next.endReason);
      assert.equal(r.feedback.next.routeToSkillId, null, "never told to start another skill");
    }
    // before the fix: 4 answers, then POOL_EXHAUSTED (Done) with questions still unanswered
    assert.ok(n > 4, `ended after ${n} answers`);
    assert.ok(!ends.includes("POOL_EXHAUSTED") && !ends.includes("PREREQ_ROUTE"), ends.join(","));
    assert.equal(n, items.size, "every question of the skill's whole pool was answered");
    assert.equal(v.endReason, "SKILL_FINISHED", "only the pool truly running out ends it");
    await afterResponseSettled();
    assert.ok((await repo.count("AdaptiveDecisionLog", { sessionId: v.sessionId, reasonCode: "NO_ITEM_IN_RANGE" })) > 0, "the content gap is still logged for Bank Gaps");
  });

  test("a content gap never ends practice; without assigned work the same 30–50 rule closes it at 50", async () => {
    const me = kids[1];
    await repo.create("StudentAbility", { studentId: me.studentId, scope: `SKILL:${skill.hard}`, skillId: skill.hard, theta: -2, thetaSE: 1, responses: 0 });
    let v: PracticeView = await startPractice(repo, me, skill.hard, tick(0), seededRandom(3));
    let last: Feedback | null = null;
    for (let k = 1; k <= ASSIGNMENT_MAX_QUESTIONS; k++) {
      const r = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: "B" }, tick(), seededRandom(k));
      v = r.view; last = r.feedback;
      if (k < ASSIGNMENT_MAX_QUESTIONS) {
        assert.equal(r.feedback.next.hasQuestion, true, `practice goes on at ${k} (${r.feedback.next.endReason})`);
        assert.equal(r.feedback.goalDone ?? null, null, `not Done before 50 (${k})`);
      }
    }
    assert.equal(last!.goalDone, "MAX", "50 counted answers without mastery: Done, the student chooses");
    assert.equal(last!.next.hasQuestion, true, "Keep practising is possible");
  });

  test("the whole pool: every grade's copy and the skill's Curriculum Map questions count before a skill is 'short'", async () => {
    const g4 = await loadSkillItems(repo, skill.split4);
    const all = await loadSkillItems(repo, skill.split4, { wholePool: true });
    assert.equal(g4.length, 26, "both grades' copies (one family)");
    // a Curriculum Map question of the skill: part of the practice pool (the bank-level lists still leave it out)
    const st = (await repo.findUnique("Student", { id: kids[0].studentId! }))!;
    const node = await repo.create("CurriculumMapNode", { gradeId: st.gradeId, kind: "LEVEL", code: "R67.MAP.ON", title: "On Level", level: "ON", sortOrder: 0, acceptsQuestions: true, updatedAt: T0 });
    const q = await repo.create("Question", { skillId: skill.split4, typeId: mc, stem: "Quasar Evidence map question: which detail proves it?", content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: T0, updatedAt: T0 });
    for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `map option ${o}`, isCorrect: i === 0, order: i });
    await repo.create("QuestionMapLink", { questionId: q.id, nodeId: node.id });
    const bank = await loadSkillItems(repo, skill.split4);
    const whole = await loadSkillItems(repo, skill.split4, { wholePool: true });
    assert.ok(!bank.some((i) => i.questionId === q.id), "the bank list leaves Curriculum Map questions out");
    assert.ok(whole.some((i) => i.questionId === q.id), "practice's whole pool includes them");
    assert.equal(whole.length, all.length + 1);
  });

  test("the teacher's own count: exactly that many counted answers, then Done", async () => {
    const me = kids[2];
    const { assignmentId } = await assignSkill(repo, teacher, { classId, skillId: skill.count, studentIds: [me.studentId!], questionCount: 8 }, tick(0));
    assert.equal(Number((await repo.findUnique("Assignment", { id: assignmentId }))!.questionCount), 8);
    await assert.rejects(assignSkill(repo, teacher, { classId, skillId: skill.count, studentIds: [me.studentId!], questionCount: 2 }, tick(0)), /between 5 and 50/);
    let v: PracticeView = await startPractice(repo, me, skill.count, tick(0), seededRandom(5));
    let n = 0; let fb: Feedback | null = null;
    // one rapid guess on the way: it does not count toward the teacher's 8
    v = (await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question!.questionId, response: "A" }, tick(1000), seededRandom(1))).view;
    while (v.question && n < 20) {
      const r = await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question.questionId, response: "A" }, tick(), seededRandom(n));
      n++; v = r.view; fb = r.feedback;
    }
    assert.equal(n, 8, "exactly the teacher's count (the guess not counted)");
    assert.equal(fb!.work?.doneBy, "COUNT");
    assert.equal(fb!.next.endReason, "COMPLETED");
    const row = (await repo.findMany("AssignmentStudent", { assignmentId, studentId: me.studentId }))[0];
    assert.deepEqual([s(row.status), Number(row.coreAnswered)], ["COMPLETED", 8]);
  });

  test("a skill with fewer than 30 questions in its whole pool: all of them, Done, and the teacher is told", async () => {
    const me = kids[3];
    const { assignmentId } = await assignSkill(repo, teacher, { classId, skillId: skill.small, studentIds: [me.studentId!] }, tick(0));
    let v: PracticeView = await startPractice(repo, me, skill.small, tick(0), seededRandom(2));
    let n = 0;
    while (v.question && n < 20) { v = (await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question.questionId, response: n % 2 ? "A" : "B" }, tick(), seededRandom(n))).view; n++; }
    assert.equal(n, 9, "every question of the short skill");
    assert.equal(v.endReason, "SKILL_FINISHED");
    const row = (await repo.findMany("AssignmentStudent", { assignmentId, studentId: me.studentId }))[0];
    assert.equal(s(row.status), "COMPLETED", "the student sees Done");
    await afterResponseSettled();
    const short = await shortPoolSkills(repo, kids.map((k) => k.studentId!), tick(0));
    const mine = short.find((x) => x.skillId === skill.small);
    assert.ok(mine, JSON.stringify(short));
    assert.deepEqual([mine!.questions, mine!.students], [9, 1]);
  });
});
