/**
 * 🩹 (Oct 2026, "عايز نستفيد من البنك لو المنهج خلص والعكس"): when an adaptive set's own questions are genuinely
 * exhausted, adaptiveNext borrows more of the SAME skill from the other pool (Curriculum Map ↔ Question Bank) —
 * see crossSkillPool() in leveled-run.ts. These tests go straight at adaptiveNext with a deliberately tiny native
 * pool, so the exhaustion path is reached quickly and deterministically.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { adaptiveNext } from "../src/server/curriculum-map/leveled-run";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("🩹 cross-skill fallback: the other pool fills in once a set's own questions run out", () => {
  let repo: SqliteRepo; let admin: Actor; let schoolId = ""; let studentId = "";
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    schoolId = admin.schoolId!;
    const teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const roster = (await teacherRoster(repo, teacher))[0];
    studentId = roster.students[0].id;
  });

  /**
   * A Skill plus `n` published MULTIPLE_CHOICE questions of it, all On level (difficulty 4) — and a LessonSkill
   * row linking it to a (throwaway) Lesson, since the fallback only borrows a skill actually tied to a lesson
   * (the Grammar/Writing case: see crossSkillPool's doc comment in leveled-run.ts).
   */
  async function mkSkillWithQuestions(code: string, n: number): Promise<{ skillId: string; ids: string[] }> {
    const grade = (await repo.findMany("Grade", { schoolId }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: grade.id }))[0];
    const fam = s((await repo.upsert("SkillFamily", { code: `school.${code}` }, { name: code, domain: "READING", category: "COMPREHENSION" })).id);
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const skillId = s((await repo.create("Skill", { curriculumId: cur.id, familyId: fam, code, name: code, domain: "READING", category: "COMPREHENSION", sequence: 9500, isActive: true })).id);
    const unit = await repo.create("Unit", { curriculumId: cur.id, number: 900 + Math.floor(Math.random() * 1000), title: `Unit for ${code}` });
    const lesson = await repo.create("Lesson", { unitId: unit.id, number: 1, code: `${code}-L1`, title: `Lesson for ${code}` });
    await repo.create("LessonSkill", { lessonId: lesson.id, skillId, role: "GRAMMAR", label: code });
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const q = await repo.create("Question", { skillId, typeId: mc, stem: `${code} question ${i}?`, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
      for (const [j, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `${code} ${i} ${o}`, isCorrect: j === 0, order: j });
      ids.push(s(q.id));
    }
    return { skillId, ids };
  }

  /** A fresh adaptive Assessment + PracticeSession over `order`, with a `targetCorrect` goal that outruns a tiny native pool. */
  async function startSet(order: string[], targetCorrect: number) {
    const set = await repo.create("Assessment", { title: "Cross-skill test set", type: "UNIT_QUIZ", isAdaptive: true, targetCorrect, status: "PUBLISHED", createdAt: new Date() });
    for (const [i, id] of order.entries()) await repo.create("AssessmentQuestion", { assessmentId: set.id, questionId: id, order: i });
    const session = await repo.create("PracticeSession", { studentId, skillId: null, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(), assignmentId: null, assessmentId: set.id });
    return { set, sessionId: s(session.id) };
  }

  test("a set with only 2 of its own questions borrows more of the same skill once they're both answered", async () => {
    const native = await mkSkillWithQuestions("BL.cross.native1", 2);
    // the "other pool" questions share the SAME skillId as the native set (same skill, Bank ↔ Curriculum Map)
    const extra: string[] = [];
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    for (let i = 0; i < 2; i++) {
      const q = await repo.create("Question", { skillId: native.skillId, typeId: mc, stem: `borrowed question ${i}?`, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
      for (const [j, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `borrowed ${i} ${o}`, isCorrect: j === 0, order: j });
      extra.push(s(q.id));
    }

    const order = native.ids; // the set's own pool: only the 2 native questions
    const { set, sessionId } = await startSet(order, 5); // target of 5 correct — more than the 2 native questions can give
    let t = Date.now();
    const seenIds: string[] = [];
    let last: Awaited<ReturnType<typeof adaptiveNext>> | null = null;
    for (let k = 0; k < 6; k++) {
      last = await adaptiveNext(repo, set, order, sessionId, studentId);
      if (!last.nextId) break;
      seenIds.push(last.nextId);
      await repo.create("QuestionAttempt", { sessionId, studentId, questionId: last.nextId, skillId: native.skillId, response: { value: "A" }, isCorrect: true, partialCredit: null, responseMs: 9000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: new Date((t += 1000)) });
    }
    // the first 2 answers come from the set's own (native) pool
    assert.deepEqual(seenIds.slice(0, 2).sort(), [...order].sort(), "the set's own questions come first");
    // once those are exhausted, the student is served one of the OTHER pool's questions of the same skill — not NO_QUESTIONS
    assert.ok(seenIds.length > 2, "the session did not stop at NO_QUESTIONS once its own 2 questions were used");
    assert.ok(seenIds.slice(2).every((id) => extra.includes(id)), "every question after the native 2 is a borrowed one of the same skill");
    assert.ok(seenIds.slice(2).every((id) => !order.includes(id)), "never repeats one of the set's own questions as a 'borrowed' one");
  });

  test("never borrows a question the student already answered (in an earlier session) or one already in the set", async () => {
    const native = await mkSkillWithQuestions("BL.cross.native2", 1);
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    // one borrowable question of the same skill, already answered by this student in an unrelated earlier session
    const alreadyAnswered = await repo.create("Question", { skillId: native.skillId, typeId: mc, stem: "already answered elsewhere?", content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
    for (const [j, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: alreadyAnswered.id, label: o, text: `x ${o}`, isCorrect: j === 0, order: j });
    const otherSession = await repo.create("PracticeSession", { studentId, skillId: null, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    await repo.create("QuestionAttempt", { sessionId: otherSession.id, studentId, questionId: alreadyAnswered.id, skillId: native.skillId, response: { value: "A" }, isCorrect: true, partialCredit: null, responseMs: 9000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: new Date() });
    // one genuinely fresh borrowable question of the same skill
    const fresh = await repo.create("Question", { skillId: native.skillId, typeId: mc, stem: "a genuinely fresh borrowed question?", content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
    for (const [j, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: fresh.id, label: o, text: `y ${o}`, isCorrect: j === 0, order: j });

    const order = native.ids; // just the 1 native question
    const { set, sessionId } = await startSet(order, 5);
    let t = Date.now();
    // answer the 1 native question
    let st = await adaptiveNext(repo, set, order, sessionId, studentId);
    assert.equal(st.nextId, order[0]);
    await repo.create("QuestionAttempt", { sessionId, studentId, questionId: st.nextId!, skillId: native.skillId, response: { value: "A" }, isCorrect: true, partialCredit: null, responseMs: 9000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: new Date((t += 1000)) });
    // next call: must borrow — and must be the fresh one, never the one already answered in the other session
    st = await adaptiveNext(repo, set, order, sessionId, studentId);
    assert.equal(st.nextId, s(fresh.id), "borrows the fresh question of the same skill, skipping the one already answered");
  });

  test("a Placement test never borrows across pools, even once its own questions are exhausted", async () => {
    const native = await mkSkillWithQuestions("BL.cross.placement", 1);
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const q = await repo.create("Question", { skillId: native.skillId, typeId: mc, stem: "borrowable but placement must not use it?", content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
    for (const [j, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `z ${o}`, isCorrect: j === 0, order: j });

    const order = native.ids;
    const set = await repo.create("Assessment", { title: "Placement test", type: "PLACEMENT", isAdaptive: true, targetCorrect: 5, status: "PUBLISHED", createdAt: new Date() });
    for (const [i, id] of order.entries()) await repo.create("AssessmentQuestion", { assessmentId: set.id, questionId: id, order: i });
    const session = await repo.create("PracticeSession", { studentId, skillId: null, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(), assessmentId: set.id });
    const sessionId = s(session.id);
    let t = Date.now();
    let st = await adaptiveNext(repo, set, order, sessionId, studentId);
    assert.equal(st.nextId, order[0]);
    await repo.create("QuestionAttempt", { sessionId, studentId, questionId: st.nextId!, skillId: native.skillId, response: { value: "A" }, isCorrect: true, partialCredit: null, responseMs: 9000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: new Date((t += 1000)) });
    st = await adaptiveNext(repo, set, order, sessionId, studentId);
    assert.equal(st.nextId, null, "a Placement test ends instead of widening its fixed item set");
    assert.equal(st.decision.reason, "NO_QUESTIONS");
  });

  test("never borrows across a Comprehension-style skill that isn't tied to any lesson (incl. the hidden 'Unclassified' bucket)", async () => {
    // a real, active Skill — but with no LessonSkill row, same shape as a Comprehension skill like "Compare and
    // Contrast" that the demo curriculum ships with real, unrelated questions of its own (r86: never wired to a
    // lesson). Borrowing across it would silently mix in whatever else happens to share it.
    const grade = (await repo.findMany("Grade", { schoolId }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: grade.id }))[0];
    const fam = s((await repo.upsert("SkillFamily", { code: "school.BL.cross.nolesson" }, { name: "no-lesson", domain: "READING", category: "COMPREHENSION" })).id);
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const skillId = s((await repo.create("Skill", { curriculumId: cur.id, familyId: fam, code: "BL.cross.nolesson", name: "no-lesson", domain: "READING", category: "COMPREHENSION", sequence: 9600, isActive: true })).id);
    const native = await (async () => {
      const q = await repo.create("Question", { skillId, typeId: mc, stem: "native, no-lesson skill?", content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
      for (const [j, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `n ${o}`, isCorrect: j === 0, order: j });
      return s(q.id);
    })();
    const borrowable = await repo.create("Question", { skillId, typeId: mc, stem: "borrowable, no-lesson skill?", content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
    for (const [j, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: borrowable.id, label: o, text: `b ${o}`, isCorrect: j === 0, order: j });

    const order = [native];
    const { set, sessionId } = await startSet(order, 5);
    let t = Date.now();
    let st = await adaptiveNext(repo, set, order, sessionId, studentId);
    assert.equal(st.nextId, native);
    await repo.create("QuestionAttempt", { sessionId, studentId, questionId: native, skillId, response: { value: "A" }, isCorrect: true, partialCredit: null, responseMs: 9000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: new Date((t += 1000)) });
    st = await adaptiveNext(repo, set, order, sessionId, studentId);
    assert.equal(st.nextId, null, "no LessonSkill link → the fallback stays off, even though a same-skill question exists");
    assert.equal(st.decision.reason, "NO_QUESTIONS");
  });

  /** Same shape as mkSkillWithQuestions, but the LessonSkill row's role is COMPREHENSION_SKILL, not GRAMMAR — a
   * real, specific, lesson-attached Comprehension skill (e.g. "Main Idea"), post-classification. The fallback
   * should now treat it exactly like Grammar/Writing. */
  async function mkComprehensionSkillWithQuestions(code: string, n: number): Promise<{ skillId: string; ids: string[] }> {
    const grade = (await repo.findMany("Grade", { schoolId }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: grade.id }))[0];
    const fam = s((await repo.upsert("SkillFamily", { code: `school.${code}` }, { name: code, domain: "READING", category: "COMPREHENSION" })).id);
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const skillId = s((await repo.create("Skill", { curriculumId: cur.id, familyId: fam, code, name: code, domain: "READING", category: "COMPREHENSION", sequence: 9700, isActive: true })).id);
    const unit = await repo.create("Unit", { curriculumId: cur.id, number: 900 + Math.floor(Math.random() * 1000), title: `Unit for ${code}` });
    const lesson = await repo.create("Lesson", { unitId: unit.id, number: 1, code: `${code}-L1`, title: `Lesson for ${code}` });
    await repo.create("LessonSkill", { lessonId: lesson.id, skillId, role: "COMPREHENSION_SKILL", label: code });
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const q = await repo.create("Question", { skillId, typeId: mc, stem: `${code} question ${i}?`, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
      for (const [j, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `${code} ${i} ${o}`, isCorrect: j === 0, order: j });
      ids.push(s(q.id));
    }
    return { skillId, ids };
  }

  test("a classified Comprehension skill (role COMPREHENSION_SKILL, tied to a lesson) DOES borrow across pools, same as Grammar/Writing", async () => {
    const native = await mkComprehensionSkillWithQuestions("BL.cross.compr.native", 1);
    const bank = await mkComprehensionSkillWithQuestions("BL.cross.compr.bank", 1);
    // same skillId on both sides: reuse native's questions as the "order" set, and treat bank's question as the
    // thing to borrow by giving it the SAME skillId as native (two Skill rows would never share a borrow target —
    // crossSkillPool matches by the order set's own skillId, so point bank's question at native's skillId directly)
    await repo.updateMany("Question", { id: { in: bank.ids } }, { skillId: native.skillId });

    const order = native.ids;
    const { set, sessionId } = await startSet(order, 5);
    let t = Date.now();
    let st = await adaptiveNext(repo, set, order, sessionId, studentId);
    assert.equal(st.nextId, order[0]);
    await repo.create("QuestionAttempt", { sessionId, studentId, questionId: st.nextId!, skillId: native.skillId, response: { value: "A" }, isCorrect: true, partialCredit: null, responseMs: 9000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: new Date((t += 1000)) });
    st = await adaptiveNext(repo, set, order, sessionId, studentId);
    assert.equal(st.nextId, bank.ids[0], "a COMPREHENSION_SKILL-roled, lesson-attached skill now borrows just like Grammar/Writing");
  });
});
