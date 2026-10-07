import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { createDraft, getQuestion, updateDraft } from "../src/server/admin/questions";
import { loadSkillItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const STORY = "The Lost Kite\n\nOmar's kite flew over the wall. His neighbor found it in her garden and brought it back with a smile.";

describe("edit questions + optional passage", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor;
  let qid: string, skillId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    const q = (await repo.findMany("Question", { status: "PUBLISHED" })).find((x) => !x.passageId)!;
    qid = String(q.id); skillId = String(q.skillId);
  });

  test("a published question nobody has answered can be edited directly by an admin; it stays published", async () => {
    const d = await getQuestion(repo, admin, qid);
    assert.equal(d.canEdit, true);
    assert.equal(d.input.passageText, "", "no passage yet");
    await updateDraft(repo, admin, qid, { ...d.input, stem: "EDITED: which word is a noun?", cognitiveLevel: "Analyze" });
    const after = await getQuestion(repo, admin, qid);
    assert.deepEqual([after.status, after.input.stem, after.input.cognitiveLevel], ["PUBLISHED", "EDITED: which word is a noun?", "Analyze"]);
    assert.ok((await loadSkillItems(repo, skillId)).some((i) => i.questionId === qid && i.stem.startsWith("EDITED")), "practice sees the change at once (cache refreshed)");
  });

  test("teachers cannot edit published questions; nobody can once a student has answered", async () => {
    assert.equal((await getQuestion(repo, teacher, qid)).canEdit, false);
    const d = await getQuestion(repo, admin, qid);
    await assert.rejects(updateDraft(repo, teacher, qid, d.input), ForbiddenError);
    const st = (await repo.findMany("Student", {}))[0];
    const sess = await repo.create("PracticeSession", { studentId: st.id, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    await repo.create("QuestionAttempt", { studentId: st.id, sessionId: sess.id, questionId: qid, skillId, response: "x", isCorrect: false, responseMs: 5000, difficultyB: 0, createdAt: new Date() });
    assert.equal((await getQuestion(repo, admin, qid)).canEdit, false);
    await assert.rejects(updateDraft(repo, admin, qid, d.input), /already answered.*Revise/);
  });

  test("passage is optional: add, share, change (others unaffected), remove", async () => {
    const two = (await repo.findMany("Question", { status: "PUBLISHED", skillId })).filter((x) => x.id !== qid && !x.passageId).slice(0, 2).map((x) => String(x.id));
    const [a, b] = two;
    const da = await getQuestion(repo, admin, a);
    await updateDraft(repo, admin, a, { ...da.input, passageText: STORY });
    const db = await getQuestion(repo, admin, b);
    await updateDraft(repo, admin, b, { ...db.input, passageText: `  ${STORY}  ` });
    const qa = (await repo.findUnique("Question", { id: a }))!, qb = (await repo.findUnique("Question", { id: b }))!;
    assert.ok(qa.passageId && qa.passageId === qb.passageId, "the same text is one shared passage");
    const p = (await repo.findUnique("ReadingPassage", { id: qa.passageId as string }))!;
    assert.deepEqual([p.title, p.body], ["The Lost Kite", STORY]);
    assert.equal((await getQuestion(repo, admin, a)).input.passageText, STORY, "the editor shows the text");
    const item = (await loadSkillItems(repo, skillId)).find((i) => i.questionId === a)!;
    assert.equal(item.passageText, STORY, "practice shows the passage before the question");
    // change a's passage: b keeps the old one
    await updateDraft(repo, admin, a, { ...(await getQuestion(repo, admin, a)).input, passageText: STORY + " The end." });
    assert.notEqual((await repo.findUnique("Question", { id: a }))!.passageId, qb.passageId);
    assert.equal((await repo.findUnique("Question", { id: b }))!.passageId, qb.passageId, "other questions are not affected");
    // remove: a standalone question again
    await updateDraft(repo, admin, a, { ...(await getQuestion(repo, admin, a)).input, passageText: "" });
    assert.equal((await repo.findUnique("Question", { id: a }))!.passageId, null);
    assert.equal((await loadSkillItems(repo, skillId)).find((i) => i.questionId === a)!.passageText, null);
    // leaving passageText out keeps the passage as it is
    const keep = await getQuestion(repo, admin, b);
    const { passageText: _drop, ...noText } = keep.input;
    void _drop;
    await updateDraft(repo, admin, b, { ...noText, stem: keep.input.stem + " " });
    assert.equal((await repo.findUnique("Question", { id: b }))!.passageId, qb.passageId);
  });

  test("new questions take a passage too; validation still applies", async () => {
    const id = await createDraft(repo, admin, { skillId, type: "MULTIPLE_CHOICE", stem: "Why did the neighbor bring the kite back?", level: 3, whyCorrect: "She was kind.", passageText: STORY,
      options: [{ label: "A", text: "She was kind", correct: true, rationale: null }, { label: "B", text: "She disliked kites", correct: false, rationale: "Nothing says so." }] });
    const q = (await repo.findUnique("Question", { id }))!;
    assert.ok(q.passageId);
    await assert.rejects(updateDraft(repo, admin, id, { ...(await getQuestion(repo, admin, id)).input, passageText: "x".repeat(20_001) }), /passage is too long/);
    await assert.rejects(updateDraft(repo, admin, id, { ...(await getQuestion(repo, admin, id)).input, options: [{ label: "A", text: "a", correct: false, rationale: "no" }, { label: "B", text: "b", correct: false, rationale: "no" }] }), /correct/i);
  });
});
