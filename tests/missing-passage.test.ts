/**
 * 🧾 Owner r68 (1): every question whose wording needs a passage / story / text / poem / chart / picture that is NOT
 * attached is removed from the platform — soft-deleted (hidden everywhere, answers kept) by the admin delete rule — in
 * the bundled data files at the source, by the Fix stuck questions job and by the one-click admin action (list first).
 * Grammar / vocabulary questions that quote their own sentence stay. In-memory SQLite only; no real data.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { createDraft } from "../src/server/admin/questions";
import { missingPassageHit, needsMissingPassage } from "../src/lib/missing-passage";
import { listMissingPassage, removeAllMissingPassage } from "../src/server/admin/missing-passage";
import { fixStuckQuestions } from "../src/server/admin/stuck-questions";
import { DELETED_OWNER } from "../src/server/questions/private-copies";
import { findInBundledFiles } from "../scripts/load/remove-missing-passage-data";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("🧾 the detector (pure)", () => {
  test("flags a stem that needs a text it does not carry (the owner's examples first)", () => {
    const needs = [
      "A funny story about a talking cat is mainly written to—",
      "An article about how volcanoes form is written to—",
      "According to the article, why did the river flood?",
      "In paragraph 2, what does the word “steep” tell the reader?",
      "What is the poem mostly about?",
      "Which detail from the story shows that Omar is brave?",
      "What is the main idea of the text?",
      "Why does the author include the timeline?",
      "Look at the chart. Which month had the most rain?",
      "According to the graph, how many students walk to school?",
      "Which sentence best states a theme of “The Final Round”?",
      "In “Night Rain,” what does the speaker compare the rain to?",
      "What does the narrator learn at the end?",
      "Reread the last paragraph. How does Sara feel?",
    ];
    for (const stem of needs) assert.ok(missingPassageHit(stem), `should be flagged: ${stem}`);
  });

  test("never flags a question that carries its own text (false positives are a test failure)", () => {
    const fine = [
      "Read the sentence: “The story was very long.” Which word is the subject?",
      "Choose the correct article: ____ apple a day keeps the doctor away.",
      "Which word is a noun in “The author signed my book”?",
      "What does “alter” mean?",
      "Daniel stayed up late watching TV. The next day, he was so tired that he couldn't focus in class. Would you say the late night affected him?",
      "A poet writes, \"The moon is a silver coin.\" What did the poet use?",
      "The poet chose ____ instead of rhyme, letting each line end wherever the thought ended.",
      "In the line “Morning mist is a curtain hiding the valley,” the poet uses a ____ to compare mist to a curtain.",
      "On the table sat a melon that was much longer than it was wide. Would you describe it as oblong?",
      "Match each Concept Vocabulary word from “All Summer in a Day” with its meaning: “consequence,” “immense,” and “vital.”",
      "Is each sentence about the scientist Ibn al-Haytham a fact or the writer's opinion?",
      "A writer wants to slow down an exciting moment. What should the writer do?",
      "Who is the speaker of a poem?",
      "Which question requires thinking beyond the text (an inference)?",
      "An ad says \"Buy Crunchy Bars today!\" What is the purpose?",
      "A theme is ____ that a story expresses about life or people.",
      "Which sentence shows the author refining (qualifying) a claim?",
    ];
    for (const stem of fine) assert.equal(missingPassageHit(stem), null, `should NOT be flagged: ${stem}`);
  });

  test("a question with its passage or picture is never flagged", () => {
    assert.ok(needsMissingPassage("According to the passage, why did Omar run?", { passage: false, image: false }));
    assert.equal(needsMissingPassage("According to the passage, why did Omar run?", { passage: true, image: false }), null);
    assert.equal(needsMissingPassage("Look at the chart. Which month had the most rain?", { passage: false, image: true }), null);
  });

  test("the bundled question files have none left: removed at the source", () => {
    assert.deepEqual(findInBundledFiles(), [], "scripts/load/remove-missing-passage-data.ts --write removes them");
    const topup = read("data/questions/sets/topup-skill-sets.json");
    assert.doesNotMatch(topup, /talking cat is mainly written to/, "the owner's example is gone from the source file");
    assert.doesNotMatch(topup, /TOP-AUTHORSPURPOSE-B02|TOP-AUTHORSPURPOSE-B03/);
    assert.match(topup, /An ad says \\"Buy Crunchy Bars today!\\"/, "its neighbours that carry their own text stay");
  });
});

describe("🧾 the school's bank: Fix stuck questions and the one-click action", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, student: Actor;
  const ids: Record<string, string> = {};
  let skillId = "";

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    const teacherRow = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    const classId = s((await repo.findMany("ClassTeacher", { teacherId: teacherRow.id }))[0].classId);
    const studentId = s((await repo.findMany("ClassMembership", { classId }))[0].studentId);
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
    skillId = s((await repo.findMany("Question", { status: "PUBLISHED" }, { take: 1 }))[0].skillId);
    const mc = async (stem: string, extra: Record<string, unknown> = {}) => {
      const id = await createDraft(repo, admin, { skillId, type: "MULTIPLE_CHOICE", stem, level: 4, whyCorrect: "Because it is.", options: [{ label: "A", text: `entertain ${stem.length}`, correct: true, rationale: null }, { label: "B", text: "inform", correct: false, rationale: "No." }, { label: "C", text: "persuade", correct: false, rationale: "No." }], ...extra });
      await repo.updateMany("Question", { id }, { status: "PUBLISHED", publishedAt: new Date() });
      return id;
    };
    ids.cat = await mc("A funny story about a talking cat is mainly written to—");
    ids.article = await mc("According to the article, why did the bridge close?");
    ids.answered = await mc("What is the main idea of the passage?");
    ids.withPassage = await mc("According to the passage, why did the kite rip?", { passageText: "The Kite\n\nOmar's kite caught on the fig tree branch and the wind tore a long rip down its red paper middle before the festival." });
    ids.grammar = await mc("Read the sentence: “The story was very long.” Which word is the subject?");
    // a student answered one of them and reported another
    const sess = await repo.create("PracticeSession", { studentId: student.studentId, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    await repo.create("QuestionAttempt", { studentId: student.studentId, sessionId: sess.id, questionId: ids.answered, skillId, response: "A", isCorrect: true, responseMs: 20_000, difficultyB: 0, createdAt: new Date() });
    const { flagQuestion } = await import("../src/server/teacher/classroom");
    await flagQuestion(repo, student, ids.cat, "PICTURE", "There is no story");
  });

  test("bug reproduced: these questions are live in the bank before the fix (no rule removed them)", async () => {
    for (const k of ["cat", "article", "answered"]) assert.equal((await repo.findUnique("Question", { id: ids[k] }))!.deletedAt, null, k);
  });

  test("the admin sees the list first: only the questions that need a missing passage, with the reason", async () => {
    await assert.rejects(listMissingPassage(repo, teacher), ForbiddenError);
    const { items, total } = await listMissingPassage(repo, admin);
    const found = new Set(items.map((x) => x.id));
    for (const k of ["cat", "article", "answered"]) assert.ok(found.has(ids[k]), `${k} listed`);
    for (const k of ["withPassage", "grammar"]) assert.ok(!found.has(ids[k]), `${k} not listed`);
    assert.equal(total, items.length);
    assert.match(items.find((x) => x.id === ids.article)!.reason, /according to the article/i);
  });

  test("one click: soft-deleted by the admin delete rule — hidden everywhere, rows and answers kept, flags leave “To check”", async () => {
    await assert.rejects(removeAllMissingPassage(repo, teacher), ForbiddenError);
    const r = await removeAllMissingPassage(repo, admin);
    assert.ok(r.removed >= 3, JSON.stringify(r));
    for (const k of ["cat", "article", "answered"]) assert.equal(await repo.count("Question", { id: ids[k] }), 1, `${k}: never hard-deleted (a read by id still finds the row)`);
    for (const k of ["cat", "article", "answered"]) {
      const q = (await repo.findUnique("Question", { id: ids[k] }))!;
      assert.ok(q.deletedAt, `${k} hidden`);
      assert.equal(q.status, "ARCHIVED");
      assert.equal(q.privateToId, DELETED_OWNER, "owned by nobody: every shared read skips it");
    }
    assert.equal(await repo.count("QuestionAttempt", { questionId: ids.answered }), 1, "the student's answer is kept");
    for (const k of ["withPassage", "grammar"]) assert.equal((await repo.findUnique("Question", { id: ids[k] }))!.deletedAt, null, `${k} stays`);
    assert.equal((await repo.findUnique("QuestionFlag", { questionId: ids.cat, studentId: student.studentId }))!.status, "REMOVED");
    assert.ok(await repo.count("AuditLog", { action: "question.delete", entityId: ids.cat }) >= 1, "in the audit log");
    assert.equal((await listMissingPassage(repo, admin)).total, 0, "a second look finds nothing");
  });

  test("Fix stuck questions removes them too (first phase), and reports them", async () => {
    const id = await createDraft(repo, admin, { skillId, type: "MULTIPLE_CHOICE", stem: "In stanza 3, what does the poet compare the moon to?", level: 4, whyCorrect: "Because.", options: [{ label: "A", text: "a coin", correct: true, rationale: null }, { label: "B", text: "a ball", correct: false, rationale: "No." }] });
    const rep = await fixStuckQuestions(repo, admin);
    assert.equal(rep.removedNoPassage, 1, JSON.stringify(rep.removedList));
    assert.equal(rep.removedList?.[0]?.id, id);
    assert.ok((await repo.findUnique("Question", { id }))!.deletedAt, "hidden");
    assert.equal((await fixStuckQuestions(repo, admin)).removedNoPassage, 0, "idempotent");
  });

  test("the page: the list first, then one button; linked from the Fix stuck panel", () => {
    const page = read("src/app/admin/questions/missing-passage/page.tsx");
    assert.match(page, /listMissingPassage/);
    assert.match(page, /removeMissingPassageAction/);
    assert.match(read("src/app/admin/questions/missing-passage/actions.ts"), /removeAllMissingPassage/);
    assert.match(read("src/app/admin/questions/fix-stuck.tsx"), /\/admin\/questions\/missing-passage/);
    assert.match(read("src/server/admin/missing-passage.ts"), /soft: true/);
  });
});
