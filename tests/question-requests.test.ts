import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { decideDeletion, listDeletionRequests, requestDeletion } from "../src/server/admin/question-requests";
import { listQuestions } from "../src/server/admin/questions";
import { demoDatabase } from "./helpers/db";

describe("teachers request, admins decide (question deletion); the bank groups by skill", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let ids: string[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    const g4 = (await repo.findMany("Grade", { schoolId: admin.schoolId!, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const skills = (await repo.findMany("Skill", { curriculumId: cur.id })).map((k) => k.id);
    ids = (await repo.findMany("Question", { skillId: { in: skills }, status: "PUBLISHED", deletedAt: null })).slice(0, 2).map((q) => String(q.id));
  });

  test("request → reject keeps the question; request → approve deletes it (or archives it once answered)", async () => {
    await assert.rejects(requestDeletion(repo, teacher, ids[0], "no"), /Write the reason/);
    await requestDeletion(repo, teacher, ids[0], "Two answers are correct in this question");
    await assert.rejects(listDeletionRequests(repo, teacher), ForbiddenError);
    await assert.rejects(decideDeletion(repo, teacher, ids[0], true), ForbiddenError, "a teacher cannot decide");
    const list = await listDeletionRequests(repo, admin);
    assert.deepEqual(list.map((r) => [r.id, r.request.reason]), [[ids[0], "Two answers are correct in this question"]]);
    assert.equal(await decideDeletion(repo, admin, ids[0], false), "rejected");
    assert.equal((await listDeletionRequests(repo, admin)).length, 0);
    assert.equal(String((await repo.findUnique("Question", { id: ids[0] }))!.status), "PUBLISHED", "rejected: it stays");
    // never answered → deleted
    await requestDeletion(repo, teacher, ids[0], "A duplicate of another question");
    const before = await repo.count("QuestionAttempt", { questionId: ids[0] });
    const r1 = await decideDeletion(repo, admin, ids[0], true);
    assert.equal(r1, before ? "archived" : "deleted");
    // answered → archived (history kept)
    const st = (await repo.findMany("Student", { schoolId: admin.schoolId! }))[0];
    const q = (await repo.findUnique("Question", { id: ids[1] }))!;
    const session = await repo.create("PracticeSession", { studentId: st.id, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    await repo.create("QuestionAttempt", { sessionId: session.id, studentId: st.id, questionId: ids[1], skillId: q.skillId, isCorrect: true, response: "A", responseMs: 5000, difficultyB: 0, createdAt: new Date() });
    await requestDeletion(repo, teacher, ids[1], "The wording is confusing for Grade 4");
    assert.equal(await decideDeletion(repo, admin, ids[1], true), "archived");
    assert.equal(String((await repo.findUnique("Question", { id: ids[1] }))!.status), "ARCHIVED");
  });

  test("bank rows carry their skill (grouping by skill)", async () => {
    const r = await listQuestions(repo, teacher, { status: "PUBLISHED", limit: 50, page: 1 });
    assert.ok(r.items.length && r.items.every((i) => i.skillId && i.skill));
  });
});
