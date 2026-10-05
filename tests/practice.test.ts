import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { scoreResponse } from "../src/imports/questions/validate";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { loadSkillItems, type ClientQuestion, type PracticeItem } from "../src/server/practice/items";
import { currentQuestion, endPractice, normalizeResponse, startPractice, submitAnswer } from "../src/server/practice/session";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { demoDatabase, ROOT, seededRandom } from "./helpers/db";
const rng = seededRandom(4242);

let repo: SqliteRepo;
let lina: Actor;
let omar: Actor;
const T0 = new Date("2026-11-02T08:00:00Z");
const sec = (s: number) => new Date(T0.getTime() + s * 1000);
let clock = 0;
const later = (s = 30) => sec((clock += s));
const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
const skillId = async (code: string) => {
  const st = (await repo.findUnique("Student", { id: lina.studentId! }))!;
  const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
  return String((await repo.findUnique("Skill", { curriculumId: cur.id, code }))!.id);
};

/** Builds the correct (or a wrong) response for any type, from the server-side item. */
function responseFor(item: PracticeItem, q: ClientQuestion, right: boolean): unknown {
  switch (item.type) {
    case "MULTIPLE_CHOICE":
    case "DROPDOWN": {
      const o = item.options!.find((x) => x.correct === right)!;
      return o.label;
    }
    case "MULTI_SELECT":
      return right ? item.options!.filter((o) => o.correct).map((o) => o.label) : item.options!.map((o) => o.label);
    case "TRUE_FALSE":
      return right ? item.answer : !item.answer;
    case "FILL_BLANK":
      return right ? item.answers![0].toUpperCase() : "zzz";
    case "SENTENCE_ORDER":
    case "WORD_ORDER":
      return right ? item.sequence : [...item.sequence!].reverse();
    case "ERROR_CORRECTION":
      return right ? item.errorIndex : (item.errorIndex! + 1) % item.segments!.length;
    case "MATCHING":
      return Object.fromEntries(item.pairs!.map((p, i) => [p.left, right ? p.right : item.pairs![(i + 1) % item.pairs!.length].right]));
    default:
      return q;
  }
}

before(async () => {
  ({ repo } = await demoDatabase());
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
  await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
  lina = await actorFor("demo.s1001");
  omar = await actorFor("demo.s1002");
});

describe("starting practice", () => {
  test("the browser never receives keys, rationales or explanations", async () => {
    const sid = await skillId("G4.theme");
    const view = await startPractice(repo, lina, sid, sec(0), rng);
    assert.ok(view.question);
    const payload = JSON.stringify(view.question);
    for (const leak of ["correct", "rationale", "whyCorrect", "explanation", "tip", "answers", "errorIndex", "pairs", "sequence"]) assert.ok(!payload.includes(`"${leak}"`), `leaked field ${leak}`);
    const items = await loadSkillItems(repo, sid);
    for (const it of items) for (const o of it.options ?? []) if (o.rationale) assert.ok(!payload.includes(o.rationale), "a distractor rationale leaked");
  });

  test("no published question of ANY type leaks answer data in its browser payload", async () => {
    const { toClientQuestion } = await import("../src/server/practice/items");
    const skills = [...new Set((await repo.findMany("Question", { status: "PUBLISHED" })).map((q) => String(q.skillId)))];
    let checked = 0;
    for (const s of skills)
      for (const it of await loadSkillItems(repo, s)) {
        const payload = JSON.stringify(toClientQuestion(it, "seed"));
        for (const leak of ["correct", "isCorrect", "rationale", "whyCorrect", "explanation", "tip", "answer", "answers", "errorIndex", "correction", "pairs", "sequence"])
          assert.ok(!payload.includes(`"${leak}"`), `${it.ref} (${it.type}) leaked ${leak}`);
        if (it.type === "FILL_BLANK") assert.ok(!payload.toLowerCase().includes(`"${it.answers![0].toLowerCase()}"`), `${it.ref} leaked the fill-in answer`);
        checked++;
      }
    assert.ok(checked > 80, `checked ${checked}`);
  });

  test("starting again resumes the same open session", async () => {
    const sid = await skillId("G4.theme");
    const a = await startPractice(repo, lina, sid, sec(1), rng);
    const b = await startPractice(repo, lina, sid, sec(2), rng);
    assert.equal(a.sessionId, b.sessionId);
    assert.equal(a.question!.questionId, b.question!.questionId);
  });

  test("teachers cannot practise; students cannot open another grade's skill or a skill with no questions", async () => {
    const teacher = await actorFor("demo.teacher.4a");
    await assert.rejects(startPractice(repo, teacher, await skillId("G4.theme")), /Only students/);
    const g6 = (await repo.findMany("Skill", { code: "G6.theme" }))[0];
    await assert.rejects(startPractice(repo, lina, String(g6.id)), /not part of your curriculum/);
    await assert.rejects(startPractice(repo, lina, await skillId("G4.plot-flashback")), /no questions/);
  });

  test("ordering and matching tasks are shown shuffled, never already solved", async () => {
    const sid = await skillId("G4.plot-events");
    const items = await loadSkillItems(repo, sid);
    const ord = items.find((i) => i.type === "SENTENCE_ORDER")!;
    const { toClientQuestion } = await import("../src/server/practice/items");
    for (let k = 0; k < 20; k++) assert.notDeepEqual(toClientQuestion(ord, `seed-${k}`).elements, ord.sequence);
  });
});

describe("answering", () => {
  test("a correct answer: ✓ feedback, saved attempt, decision log linked to it, ability + mastery updated, XP earned", async () => {
    const sid = await skillId("G4.central-idea");
    const view = await startPractice(repo, lina, sid, later(0), rng);
    const item = (await loadSkillItems(repo, sid)).find((i) => i.questionId === view.question!.questionId)!;
    const { feedback } = await submitAnswer(repo, lina, { sessionId: view.sessionId, questionId: item.questionId, response: responseFor(item, view.question!, true) }, later(40));
    assert.equal(feedback.correct, true);
    assert.ok(feedback.whyCorrect.length > 10);
    assert.ok(feedback.xp > 0);
    const attempts = await repo.findMany("QuestionAttempt", { sessionId: view.sessionId });
    assert.equal(attempts.length, 1);
    assert.equal(Number(attempts[0].responseMs), 40_000, "timed by the server clock");
    const log = (await repo.findMany("AdaptiveDecisionLog", { sessionId: view.sessionId })).find((l) => l.attemptId !== null)!;
    assert.equal(Number(log.attemptId), Number(attempts[0].id));
    assert.ok(String(log.reason).length > 15);
    assert.ok(await repo.findUnique("StudentAbility", { studentId: lina.studentId, scope: `SKILL:${sid}` }));
    const m = (await repo.findUnique("StudentSkillMastery", { studentId: lina.studentId, skillId: sid }))!;
    assert.equal(Number(m.attempts), 1);
    assert.equal(Number(m.correct), 1);
  });

  test("a wrong answer: ✗ feedback with your answer, the correct answer, why yours is wrong, and a tip", async () => {
    const sid = await skillId("G4.context-clues");
    const view = await startPractice(repo, lina, sid, later(0), rng);
    const item = (await loadSkillItems(repo, sid)).find((i) => i.questionId === view.question!.questionId)!;
    const wrong = responseFor(item, view.question!, false);
    const { feedback } = await submitAnswer(repo, lina, { sessionId: view.sessionId, questionId: item.questionId, response: wrong }, later(35));
    assert.equal(feedback.correct, false);
    assert.ok(feedback.yourAnswer && feedback.yourAnswer !== "No answer");
    assert.ok(feedback.correctAnswer.length > 0 && feedback.correctAnswer !== feedback.yourAnswer);
    assert.ok(feedback.tip.length > 5);
    if (item.type === "MULTIPLE_CHOICE") assert.equal(feedback.whyYoursIsWrong, item.options!.find((o) => o.label === wrong)!.rationale);
    assert.equal(feedback.xp, 0);
  });

  test("the same question cannot be answered twice (replay / double-submit)", async () => {
    const sid = await skillId("G4.synonyms-antonyms");
    const view = await startPractice(repo, lina, sid, later(0), rng);
    const item = (await loadSkillItems(repo, sid)).find((i) => i.questionId === view.question!.questionId)!;
    const r = responseFor(item, view.question!, true);
    await submitAnswer(repo, lina, { sessionId: view.sessionId, questionId: item.questionId, response: r }, later(20));
    await assert.rejects(submitAnswer(repo, lina, { sessionId: view.sessionId, questionId: item.questionId, response: r }, later(1)), /already answered/);
    assert.equal(await repo.count("QuestionAttempt", { sessionId: view.sessionId }), 1);
  });

  test("another student cannot answer in my session", async () => {
    const sid = await skillId("G4.prefixes");
    const view = await startPractice(repo, lina, sid, later(0), rng);
    await assert.rejects(submitAnswer(repo, omar, { sessionId: view.sessionId, questionId: view.question!.questionId, response: "A" }, later(10)), /not yours/);
    await assert.rejects(currentQuestion(repo, omar, view.sessionId), /not yours/);
  });

  test("malformed answers are refused without being recorded", async () => {
    const sid = await skillId("G4.suffixes");
    const view = await startPractice(repo, lina, sid, later(0), rng);
    for (const bad of [null, 42, "Z", ["A", "Z"], { x: 1 }, "x".repeat(500)])
      await assert.rejects(submitAnswer(repo, lina, { sessionId: view.sessionId, questionId: view.question!.questionId, response: bad }, later(5)), /could not be read/);
    assert.equal(await repo.count("QuestionAttempt", { sessionId: view.sessionId }), 0);
  });

  test("a rapid guess is flagged and earns no XP, even when correct", async () => {
    const sid = await skillId("G4.idioms-adages");
    const view = await startPractice(repo, lina, sid, later(0), rng);
    const item = (await loadSkillItems(repo, sid)).find((i) => i.questionId === view.question!.questionId)!;
    const { feedback } = await submitAnswer(repo, lina, { sessionId: view.sessionId, questionId: item.questionId, response: responseFor(item, view.question!, true) }, later(1));
    assert.equal(feedback.correct, true);
    assert.equal(feedback.rapidGuess, true);
    assert.equal(feedback.xp, 0);
  });

  test("a session ends cleanly when every question of the skill has been answered", async () => {
    const sid = await skillId("G4.poetry-elements");
    let view = await startPractice(repo, omar, sid, later(0), rng);
    const items = await loadSkillItems(repo, sid);
    let guard = 0;
    while (view.question && guard++ < 30) {
      const item = items.find((i) => i.questionId === view.question!.questionId)!;
      ({ view } = await submitAnswer(repo, omar, { sessionId: view.sessionId, questionId: item.questionId, response: responseFor(item, view.question!, true) }, later(30)));
    }
    assert.equal(view.ended, true);
    assert.ok(["ALL_QUESTIONS_ANSWERED", "POOL_EXHAUSTED", "COMPLETED"].includes(view.endReason!), view.endReason!);
    assert.ok(view.answered >= items.length && view.answered <= 20, `answered ${view.answered} of ${items.length}`);
  });

  test("three wrong answers in a row route the student to a weak prerequisite", async () => {
    const st = (await repo.findUnique("Student", { id: omar.studentId! }))!;
    const sid = await skillId("G4.theme");
    const pre = await repo.findMany("SkillPrerequisite", { skillId: sid });
    assert.ok(pre.length > 0, "theme has prerequisites in the seeded graph");
    let view = await startPractice(repo, omar, sid, later(0), rng);
    const items = await loadSkillItems(repo, sid);
    let fb;
    for (let k = 0; k < 6 && view.question; k++) {
      const item = items.find((i) => i.questionId === view.question!.questionId)!;
      ({ feedback: fb, view } = await submitAnswer(repo, omar, { sessionId: view.sessionId, questionId: item.questionId, response: responseFor(item, view.question!, false) }, later(30)));
      if (fb.next.endReason === "PREREQ_ROUTE") break;
    }
    assert.equal(fb!.next.endReason, "PREREQ_ROUTE");
    assert.ok(fb!.next.routeToSkillName);
    void st;
  });

  test("mastery shown to the student is continuous and never rises after a wrong answer", async () => {
    const sid = await skillId("G4.figurative-language");
    let view = await startPractice(repo, omar, sid, later(0), rng);
    const items = await loadSkillItems(repo, sid);
    let lastSeen: number | null = null;
    for (const right of [true, false, true, false, false, true]) {
      if (!view.question) break;
      const item = items.find((i) => i.questionId === view.question!.questionId)!;
      const r = await submitAnswer(repo, omar, { sessionId: view.sessionId, questionId: item.questionId, response: responseFor(item, view.question!, right) }, later(30));
      if (lastSeen !== null) assert.equal(r.feedback.masteryBefore, lastSeen, "continues from the score the student last saw");
      if (!right) assert.ok(r.feedback.masteryAfter <= r.feedback.masteryBefore, "a wrong answer never raises mastery");
      assert.equal(r.view.mastery, r.feedback.masteryAfter, "header matches the feedback");
      lastSeen = r.feedback.masteryAfter;
      view = r.view;
    }
  });

  test("leaving ends the session", async () => {
    const sid = await skillId("G4.multiple-meaning");
    const view = await startPractice(repo, lina, sid, later(0), rng);
    await endPractice(repo, lina, view.sessionId, later(5));
    const v = await currentQuestion(repo, lina, view.sessionId);
    assert.equal(v.ended, true);
    assert.equal(v.question, null);
  });
});

describe("every question type is scored correctly after a database round trip", () => {
  test("all 8 types: right answer scores 1, wrong answer scores less", async () => {
    const qs = await repo.findMany("Question", { status: "PUBLISHED" });
    const bySkill = [...new Set(qs.map((q) => String(q.skillId)))];
    const seen = new Set<string>();
    for (const s of bySkill) {
      for (const item of await loadSkillItems(repo, s)) {
        if (seen.has(item.type)) continue;
        const { toClientQuestion } = await import("../src/server/practice/items");
        const q = toClientQuestion(item, "t");
        const right = normalizeResponse(item, responseFor(item, q, true));
        const wrong = normalizeResponse(item, responseFor(item, q, false));
        assert.equal(scoreResponse(item, right), 1, `${item.type} correct`);
        assert.ok(scoreResponse(item, wrong) < 1, `${item.type} wrong`);
        seen.add(item.type);
      }
    }
    assert.deepEqual([...seen].sort(), ["DROPDOWN", "ERROR_CORRECTION", "FILL_BLANK", "MATCHING", "MULTIPLE_CHOICE", "MULTI_SELECT", "SENTENCE_ORDER", "TRUE_FALSE"]);
  });
});
