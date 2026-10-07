import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { archiveQuestions, deleteQuestions } from "../src/server/admin/question-delete";
import { listQuestions } from "../src/server/admin/questions";
import { loadSkillItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

describe("delete and archive questions", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
  });

  test("delete one question: it and its parts are gone; curriculum and other questions untouched", async () => {
    const q = (await repo.findMany("Question", { status: "PUBLISHED" }))[0];
    const [skills, standards, otherQs] = [await repo.count("Skill", {}), await repo.count("Standard", {}), (await repo.count("Question", {})) - 1];
    // something that points at the question: a session's current question and a decision-log entry
    const st = (await repo.findMany("Student", {}))[0];
    const sess = await repo.create("PracticeSession", { studentId: st.id, skillId: q.skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(), currentQuestionId: q.id });
    const r = await deleteQuestions(repo, admin, [String(q.id)]);
    assert.deepEqual(r, { deleted: 1, skipped: [] });
    assert.equal(await repo.findUnique("Question", { id: q.id }), null);
    assert.equal(await repo.count("QuestionOption", { questionId: q.id }), 0);
    assert.equal(await repo.count("QuestionAnswer", { questionId: q.id }), 0);
    assert.equal(await repo.count("QuestionExplanation", { questionId: q.id }), 0);
    assert.equal((await repo.findUnique("PracticeSession", { id: sess.id }))!.currentQuestionId, null, "references are cleared");
    assert.deepEqual([await repo.count("Skill", {}), await repo.count("Standard", {}), await repo.count("Question", {})], [skills, standards, otherQs]);
    assert.ok(!(await loadSkillItems(repo, String(q.skillId))).some((i) => i.questionId === q.id), "gone from practice at once");
    assert.equal(await repo.count("AuditLog", { action: "question.delete", entityId: q.id }), 1);
  });

  test("bulk delete many in one call; answered questions are kept and reported", async () => {
    const ids = (await listQuestions(repo, admin, { status: "PUBLISHED", limit: 60 })).items.map((x) => x.id);
    const answered = ids[0];
    const st = (await repo.findMany("Student", {}))[0];
    const q = (await repo.findUnique("Question", { id: answered }))!;
    const sess = await repo.create("PracticeSession", { studentId: st.id, skillId: q.skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    await repo.create("QuestionAttempt", { studentId: st.id, sessionId: sess.id, questionId: answered, skillId: q.skillId, response: "x", isCorrect: false, responseMs: 5000, difficultyB: 0, createdAt: new Date() });
    const before = await repo.count("Question", {});
    const r = await deleteQuestions(repo, admin, ids);
    assert.equal(r.deleted, ids.length - 1);
    assert.deepEqual(r.skipped.map((x) => x.id), [answered]);
    assert.match(r.skipped[0].reason, /Archive it instead/);
    assert.equal(await repo.count("Question", {}), before - (ids.length - 1));
    assert.ok(await repo.findUnique("Question", { id: answered }), "student history is protected");
    await assert.rejects(deleteQuestions(repo, admin, Array.from({ length: 501 }, (_, i) => `x${i}`)), /at most 500/);
  });

  test("bulk archive: hidden from practice, still listed for admins, history kept", async () => {
    const qs = (await listQuestions(repo, admin, { status: "PUBLISHED", limit: 5 })).items.map((x) => x.id);
    const skill = String((await repo.findUnique("Question", { id: qs[0] }))!.skillId);
    await assert.rejects(archiveQuestions(repo, admin, qs, "  "), /reason/);
    const r = await archiveQuestions(repo, admin, qs, "Old wording");
    assert.deepEqual(r, { archived: 5, alreadyArchived: 0 });
    assert.deepEqual((await archiveQuestions(repo, admin, qs, "again")).alreadyArchived, 5);
    const archived = (await listQuestions(repo, admin, { status: "ARCHIVED" })).items.map((x) => x.id);
    assert.ok(qs.every((id) => archived.includes(id)), "admins still see them");
    assert.ok(!(await loadSkillItems(repo, skill)).some((i) => qs.includes(i.questionId)), "never in practice");
  });

  test("permissions: teachers cannot delete or archive; other schools are refused", async () => {
    const id = (await repo.findMany("Question", { status: "PUBLISHED" }))[0].id as string;
    await assert.rejects(deleteQuestions(repo, teacher, [id]), ForbiddenError);
    await assert.rejects(archiveQuestions(repo, teacher, [id], "x"), ForbiddenError);
    await assert.rejects(deleteQuestions(repo, { ...admin, schoolId: "another-school" }, [id]), ForbiddenError);
    await assert.rejects(deleteQuestions(repo, admin, ["does-not-exist"]), /no longer exist/);
  });
});
