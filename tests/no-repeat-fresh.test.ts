/**
 * 🆕 The school's no-repeat rule (src/server/questions/fresh.ts), demo school in memory — never a real database:
 *   1. one sitting never shows the same question twice, nor two COPIES of one question (same fingerprint, or same
 *      stem + correct answer stored under another skill / grade) — a long practice session over a bank full of copies
 *   2. across sittings: never-attempted questions first, then the ones seen longest ago; a seen question comes back
 *      only when every question of the pool has been seen (an adaptive set taken twice)
 *   3. teacher-built sets and tests never hold two copies of one content (builder + delivery guard)
 *   4. every wrong answer lands in Second Chance exactly once (practice, sets, exit tickets, games; copies are one
 *      entry) and Second Chance is where it comes back
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { assignQuestions, teacherCurriculum } from "../src/server/teacher/assign";
import { startPractice, startQuiz, submitAnswer, submitQuizAnswer, type PracticeView, type QuizView } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { backfillContentHashes } from "../src/server/questions/dedupe-hash";
import { contentKeysForIds, dedupeIds, freshFilter, freshOrder, seenIndex } from "../src/server/questions/fresh";
import { answerSecondChance, pendingMistakes, recordGameMisses } from "../src/server/second-chance/service";
import { createExitTicket, submitExitTicket } from "../src/server/teacher/classroom";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const T0 = new Date("2027-05-03T08:00:00Z");

describe("🆕 no repeats: one sitting, across sittings, builders, Second Chance", () => {
  let repo: SqliteRepo; let teacher: Actor; let A: Actor; let B: Actor; let C: Actor; let classId = "";
  let g4 = "", g5 = "", other = "", mc = "";
  /** content number → its copies' question ids */
  const copies = new Map<number, string[]>();
  const stemOf = new Map<string, string>();
  let clock = T0.getTime();
  const tick = (ms = 30_000) => new Date((clock += ms));

  const makeQ = async (skillId: string, n: number, level = 4) => {
    // the same stem and the same correct answer = the same content. Grade 5's copies have another distractor (so only
    // the stem + answer key matches them); the unrelated skill's copies are exact (same fingerprint as Grade 4's)
    const q = await repo.create("Question", { skillId, typeId: mc, stem: `Which word in sentence ${n} is the clue?`, content: {}, difficultyLevel: level, irtB: (level - 4) * 0.6, status: "PUBLISHED", createdAt: T0, updatedAt: T0 });
    const opts = [`clue ${n}`, `other ${n}`, skillId === g5 ? `fourth ${n}` : `third ${n}`];
    for (const [i, text] of opts.entries()) await repo.create("QuestionOption", { questionId: q.id, label: "ABC"[i], text, isCorrect: i === 0, order: i });
    copies.set(n, [...(copies.get(n) ?? []), s(q.id)]);
    stemOf.set(s(q.id), `content-${n}`);
    return s(q.id);
  };

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 3 }));
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    const toActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
    [A, B, C] = await Promise.all(view.students.slice(0, 3).map((x) => toActor(x.id)));
    const st = (await repo.findUnique("Student", { id: A.studentId! }))!;
    const grade4 = (await repo.findUnique("Grade", { id: st.gradeId }))!;
    const grade5 = (await repo.findMany("Grade", { schoolId: grade4.schoolId, level: 5 }))[0];
    const cur4 = (await repo.findMany("Curriculum", { gradeId: grade4.id, isActive: true }))[0];
    const cur5 = (await repo.findMany("Curriculum", { gradeId: grade5.id }))[0];
    mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const fam = s((await repo.upsert("SkillFamily", { code: "school.reading.fresh-clues" }, { name: "reading · fresh clues", domain: "READING", category: "COMPREHENSION" })).id);
    // one skill family in two grades; EVERY content is stored twice (once per grade) → a pool full of copies
    g4 = s((await repo.create("Skill", { curriculumId: cur4.id, familyId: fam, code: "G4.fresh-clues", name: "Fresh Clues", domain: "READING", category: "COMPREHENSION", sequence: 9200, isActive: true })).id);
    g5 = s((await repo.create("Skill", { curriculumId: cur5.id, familyId: fam, code: "G5.fresh-clues", name: "Fresh Clues", domain: "READING", category: "COMPREHENSION", sequence: 9200, isActive: true })).id);
    // an unrelated skill holding a third copy of contents 1–3 (found only by fingerprint)
    const fam2 = s((await repo.upsert("SkillFamily", { code: "school.reading.fresh-other" }, { name: "reading · fresh other", domain: "READING", category: "COMPREHENSION" })).id);
    other = s((await repo.create("Skill", { curriculumId: cur4.id, familyId: fam2, code: "G4.fresh-other", name: "Fresh Other", domain: "READING", category: "COMPREHENSION", sequence: 9201, isActive: true })).id);
    for (let n = 1; n <= 25; n++) { await makeQ(g4, n); await makeQ(g5, n); }
    for (let n = 1; n <= 3; n++) await makeQ(other, n);
    // the stored fingerprints (as the importer and the nightly backfill write them)
    await backfillContentHashes(repo);
  });

  const right = (id: string) => "A";
  const pick = (id: string, ok: boolean) => (ok ? right(id) : "B");

  test("fingerprints and keys: copies share a key, different contents do not", async () => {
    const ids = [...copies.get(1)!, ...copies.get(2)!];
    const keys = await contentKeysForIds(repo, ids);
    const shared = (a: string, b: string) => keys.get(a)!.some((k) => keys.get(b)!.includes(k));
    assert.ok(shared(copies.get(1)![0], copies.get(1)![1]) && shared(copies.get(1)![0], copies.get(1)![2]), "the three copies of content 1 match");
    assert.ok(!shared(copies.get(1)![0], copies.get(2)![0]), "content 1 ≠ content 2");
    assert.deepEqual(await dedupeIds(repo, ids), [copies.get(1)![0], copies.get(2)![0]], "one copy per content, the first wins");
  });

  test("1. a long practice session never repeats a question or a copy of one (50 copies of 25 contents)", async () => {
    // student A already answered content 1 under the UNRELATED skill: its copies in this family are not new either
    const ses = await repo.create("PracticeSession", { studentId: A.studentId!, skillId: other, mode: "ADAPTIVE_PRACTICE", startedAt: tick(), endedAt: tick() });
    await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: A.studentId!, questionId: copies.get(1)![2], skillId: other, response: { value: "A" }, isCorrect: true, responseMs: 9000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: tick() });
    let v: PracticeView = await startPractice(repo, A, g4, tick());
    const served: string[] = [];
    let end: string | null = null;
    for (let k = 0; k < 80 && v.question; k++) {
      const id = v.question.questionId;
      served.push(id);
      const r = await submitAnswer(repo, A, { sessionId: v.sessionId, questionId: id, response: pick(id, k % 3 !== 0) }, tick());
      v = r.view; end = r.feedback.next.endReason;
    }
    assert.equal(new Set(served).size, served.length, "never the same question twice");
    const contents = served.map((id) => stemOf.get(id));
    assert.equal(new Set(contents).size, contents.length, "never two copies of one content");
    assert.ok(!contents.includes("content-1"), "a copy of a question answered under another skill is not served");
    assert.equal(served.length, 24, "every other content exactly once");
    assert.equal(end, "SKILL_FINISHED", "nothing new left: finished (missed ones wait in Second Chance)");
    await afterResponseSettled();
  });

  test("2. across sittings: unseen first, then the oldest seen; a question comes back only after exhaustion", async () => {
    // pure order
    const seenAt: Record<string, number> = { a: 0, b: 300, c: 0, d: 100, e: 200 };
    assert.deepEqual(freshOrder(["a", "b", "c", "d", "e"], (x) => seenAt[x]), ["a", "c", "d", "e", "b"]);
    assert.deepEqual(freshFilter(["a", "b", "c", "d", "e"], (x) => seenAt[x]), ["a", "c"], "unseen only while any is left");
    assert.deepEqual(freshFilter(["b", "d", "e"], (x) => seenAt[x]), ["d", "e"], "all seen: the older ones come back first");
    // an adaptive set over six contents (one copy each), taken twice by student B
    const six = [...copies].filter(([n]) => n >= 10 && n <= 15).map(([, ids]) => ids[0]);
    const runSet = async (max: number): Promise<string[]> => {
      const { assignmentId } = await assignQuestions(repo, teacher, { source: "CURRICULUM", classId, studentIds: [B.studentId!], questionIds: six, adaptive: { maxQuestions: max } }, tick());
      let v: QuizView = await startQuiz(repo, B, assignmentId, tick());
      const out: string[] = [];
      for (let k = 0; k < 20 && v.question; k++) {
        out.push(v.question.questionId);
        v = (await submitQuizAnswer(repo, B, { assignmentId, questionId: v.question.questionId, response: pick(v.question.questionId, k % 2 === 0) }, tick())).view;
      }
      return out;
    };
    const first = await runSet(3);
    assert.equal(first.length, 3);
    const seenBefore = await seenIndex(repo, B.studentId!, six.map((id) => ({ id })));
    assert.equal(six.filter((id) => seenBefore.lastSeen(id)).length, 3);
    const second = await runSet(6);
    assert.equal(new Set(second).size, second.length, "never twice in one sitting");
    assert.deepEqual(second.slice(0, 3).sort(), six.filter((id) => !first.includes(id)).sort(), "the three never-seen questions come first");
    assert.deepEqual(second.slice(3).sort(), [...first].sort(), "seen questions come back only after every question was seen");
    assert.equal(second[3], first[0], "…the one seen longest ago first");
    await afterResponseSettled();
  });

  test("3. teacher-built sets never hold two copies; a set stored with copies serves one (delivery guard)", async () => {
    const withCopies = [copies.get(20)![0], copies.get(20)![1], copies.get(21)![0], copies.get(21)![1], copies.get(22)![0]];
    const { assignmentId, questions } = await assignQuestions(repo, teacher, { source: "CURRICULUM", classId, studentIds: [C.studentId!], questionIds: withCopies }, tick());
    assert.equal(questions, 3, "the builder kept one copy per content");
    const a = (await repo.findUnique("Assignment", { id: assignmentId }))!;
    assert.deepEqual((await repo.findMany("AssessmentQuestion", { assessmentId: a.assessmentId })).sort((x, y) => Number(x.order) - Number(y.order)).map((x) => s(x.questionId)), [copies.get(20)![0], copies.get(21)![0], copies.get(22)![0]]);
    // an older set stored WITH copies (before the builder removed them): the student sees each content once
    await repo.createMany("AssessmentQuestion", [{ assessmentId: a.assessmentId, questionId: copies.get(20)![1], order: 9, points: 1 }]);
    let v: QuizView = await startQuiz(repo, C, assignmentId, tick(120_000));
    const served: string[] = [];
    for (let k = 0; k < 10 && v.question; k++) {
      served.push(v.question.questionId);
      v = (await submitQuizAnswer(repo, C, { assignmentId, questionId: v.question.questionId, response: "A" }, tick())).view;
    }
    assert.equal(new Set(served.map((id) => stemOf.get(id))).size, served.length, "each content once");
    // an answered question is never counted a second time (goal sets too): r68 — a repeat (the player sending again
    // after a lost reply) gets that answer's saved result back, and nothing is written
    const before = await repo.count("QuestionAttempt", { studentId: C.studentId! });
    const again = await submitQuizAnswer(repo, C, { assignmentId, questionId: served[0], response: "A" }, tick());
    assert.equal(again.feedback.replayed, true);
    assert.equal(await repo.count("QuestionAttempt", { studentId: C.studentId! }), before, "no second attempt");
    await afterResponseSettled();
  });

  test("4. every wrong answer lands in Second Chance exactly once (copies are one entry); fixing it clears the content", async () => {
    const D = C;
    const before = (await pendingMistakes(repo, D.studentId!, tick(0))).length;
    // the same content missed twice: in a set (copy 0) and in an exit ticket (copy 1)
    const { assignmentId } = await assignQuestions(repo, teacher, { source: "CURRICULUM", classId, studentIds: [D.studentId!], questionIds: [copies.get(23)![0]] }, tick());
    const v = await startQuiz(repo, D, assignmentId, tick());
    await submitQuizAnswer(repo, D, { assignmentId, questionId: v.question!.questionId, response: "B" }, tick());
    const ticket = await createExitTicket(repo, teacher, classId, { questionIds: [copies.get(23)![1], copies.get(24)![0]] }, tick());
    await submitExitTicket(repo, D, ticket, { [copies.get(23)![1]]: "C", [copies.get(24)![0]]: "B" }, tick());
    // a game miss (solo round / live game)
    await recordGameMisses(repo, D.studentId!, [copies.get(25)![0], copies.get(25)![0]], tick());
    await afterResponseSettled();
    const pending = await pendingMistakes(repo, D.studentId!, tick(0));
    const mine = pending.filter((p) => ["content-23", "content-24", "content-25"].includes(stemOf.get(p.key) ?? ""));
    assert.equal(pending.length, before + 3, JSON.stringify(pending));
    assert.deepEqual(mine.map((p) => stemOf.get(p.key)).sort(), ["content-23", "content-24", "content-25"], "one entry per content");
    assert.equal(mine.find((p) => stemOf.get(p.key) === "content-23")!.wrongCount, 2, "both mistakes counted on the one entry");
    assert.equal(mine.find((p) => stemOf.get(p.key) === "content-25")!.source, "GAME");
    assert.equal(mine.find((p) => stemOf.get(p.key) === "content-24")!.source, "EXIT");
    // Second Chance shows it again; a right answer there clears the whole content (no other copy pops up)
    const k23 = mine.find((p) => stemOf.get(p.key) === "content-23")!.key;
    const r = await answerSecondChance(repo, D, k23, "A", tick());
    assert.equal(r.correct, true);
    const after = await pendingMistakes(repo, D.studentId!, tick(0));
    assert.ok(!after.some((p) => stemOf.get(p.key) === "content-23"), "fixed: no copy of it stays in the list");
    assert.equal(after.length, pending.length - 1);
  });

  test("practice wrong answers land in Second Chance once and never come back in practice", async () => {
    const pending = await pendingMistakes(repo, A.studentId!, tick(0));
    const attempts = await repo.findMany("QuestionAttempt", { studentId: A.studentId!, isCorrect: false });
    assert.ok(attempts.length > 0);
    assert.equal(pending.length, new Set(attempts.map((x) => stemOf.get(s(x.questionId)))).size, "one entry per missed content");
    // the items still exist and can be shown in Second Chance
    assert.equal((await loadQuestionItems(repo, pending.map((p) => p.key))).length, pending.length);
  });
});
