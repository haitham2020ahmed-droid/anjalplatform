/**
 * 📖 r67 item 6 — mastery on a NEW text (demo school in memory; never a real database). For a passage-based skill the
 * answers that can turn the star must include a correct answer on a passage the student has not seen before:
 *   · the final mastery stretch (Proficient or higher) serves questions on unseen passages first (no-repeat at the
 *     PASSAGE level);
 *   · the star waits for a correct answer on a new text while new texts remain (HOLD); when none is left it is earned
 *     and marked "mastered on seen texts" for the teacher (SEEN_TEXTS);
 *   · isUnseenPassage(studentId, passageId) is exported for the skill-status stars.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { teacherCurriculum } from "../src/server/teacher/assign";
import { startPractice, submitAnswer, type PracticeView } from "../src/server/practice/session";
import { correctOnNewText, isPassageSkill, isUnseenPassage, newTextStar } from "../src/server/practice/guessing";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const T0 = new Date("2027-03-22T08:00:00Z");

describe("the new-text star rule (pure)", () => {
  test("OK / HOLD / SEEN_TEXTS", () => {
    const base = { passageSkill: true, turningStar: true, newTextCorrect: false, unseenLeft: 3 };
    assert.equal(newTextStar(base), "HOLD", "no correct answer on a new text yet, new texts remain: the star waits");
    assert.equal(newTextStar({ ...base, newTextCorrect: true }), "OK");
    assert.equal(newTextStar({ ...base, unseenLeft: 0 }), "SEEN_TEXTS", "no new text left: earned, marked for the teacher");
    assert.equal(newTextStar({ ...base, passageSkill: false }), "OK", "a skill without passages: the rule does not apply");
    assert.equal(newTextStar({ ...base, turningStar: false }), "OK");
  });

  test("a correct, careful answer on a passage met for the first time", () => {
    const p = (id: string) => ({ q1: "P1", q2: "P1", q3: "P2", q4: null } as Record<string, string | null>)[id];
    assert.equal(correctOnNewText([{ itemId: "q1", correct: false }, { itemId: "q2", correct: true }], p), false, "right only on the second question of a seen text");
    assert.equal(correctOnNewText([{ itemId: "q1", correct: false }, { itemId: "q3", correct: true }], p), true);
    assert.equal(correctOnNewText([{ itemId: "q3", correct: true, rapid: true }], p), false, "a rapid guess never counts");
    assert.equal(correctOnNewText([{ itemId: "q4", correct: true }], p), false, "no passage");
    assert.equal(isPassageSkill([{ passage: "P1" }, { passage: null }]), true);
    assert.equal(isPassageSkill([{ passage: "P1" }, { passage: null }, { passage: null }]), false);
  });
});

describe("new texts first in the final stretch", () => {
  let repo: SqliteRepo; let me: Actor; let skillId = "";
  const passageOf = new Map<string, string>();
  const passages: string[] = [];
  let clock = T0.getTime();
  const tick = (ms = 120_000) => new Date((clock += ms));

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 }));
    const teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    me = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: view.students[0].id }))!.userId }))!);
    const st = (await repo.findUnique("Student", { id: me.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const fam = s((await repo.upsert("SkillFamily", { code: "r67.text" }, { name: "r67 text", domain: "READING", category: "COMPREHENSION" })).id);
    skillId = s((await repo.create("Skill", { curriculumId: cur.id, familyId: fam, code: "R67.text", name: "Harbor Theme", domain: "READING", category: "COMPREHENSION", sequence: 9800, isActive: true })).id);
    for (let p = 0; p < 5; p++) {
      const body = `Story ${p}. ` + Array.from({ length: 60 }, (_, i) => `harbor${p}word${i}`).join(" ") + ".";
      const pas = await repo.create("ReadingPassage", { title: `Harbor story ${p}`, body, wordCount: 61, sentenceCount: 2, avgSentenceLength: 30, avgWordLength: 9, status: "PUBLISHED", createdAt: T0, updatedAt: T0 });
      passages.push(s(pas.id));
      for (let k = 0; k < 4; k++) {
        const q = await repo.create("Question", { skillId, typeId: mc, passageId: pas.id, stem: `Harbor story ${p}, question ${k + 1}: what is the lesson?`, content: {}, difficultyLevel: 4, irtB: -0.5 + k * 0.2, status: "PUBLISHED", createdAt: T0, updatedAt: T0 });
        passageOf.set(s(q.id), s(pas.id));
        for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Harbor option ${o} ${p}.${k}`, isCorrect: i === 0, order: i });
      }
    }
  });

  test("isUnseenPassage: true before the first answer on a passage, false after", async () => {
    assert.equal(await isUnseenPassage(repo, me.studentId!, passages[0]), true);
    assert.equal(await isUnseenPassage(repo, me.studentId!, null), false, "no passage: never a new text");
  });

  test("Proficient or higher: every next question comes from a passage the student has not seen", async () => {
    // the student is in the final stretch (Proficient, not yet mastered)
    await repo.upsert("StudentSkillMastery", { studentId: me.studentId, skillId }, { score: 82, band: "PROFICIENT", attempts: 20, correct: 17, isMastered: false }, { score: 82 });
    let v: PracticeView = await startPractice(repo, me, skillId, tick(0));
    const seen: string[] = [];
    for (let k = 0; k < 5 && v.question; k++) {
      const p = passageOf.get(v.question.questionId)!;
      if (k > 0) assert.ok(!seen.includes(p), `answer ${k + 1}: a new text (${seen.length} seen)`);
      seen.push(p);
      // still in the final stretch (the stored score the engine continues from)
      await repo.updateMany("StudentSkillMastery", { studentId: me.studentId, skillId }, { score: 82, band: "PROFICIENT", isMastered: false });
      v = (await submitAnswer(repo, me, { sessionId: v.sessionId, questionId: v.question.questionId, response: "A" }, tick())).view;
    }
    assert.equal(new Set(seen).size, 5, "five answers, five different texts");
    assert.equal(await isUnseenPassage(repo, me.studentId!, passages[0]), false, "seen now");
    // every text seen: practice goes on with the remaining questions (no early stop)
    assert.ok(v.question, "practice goes on on seen texts");
  });
});
