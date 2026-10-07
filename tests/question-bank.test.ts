import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { listQuestions } from "../src/server/admin/questions";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { demoDatabase } from "./helpers/db";

describe("📚 Question Bank filters: subject, difficulty, source", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" }); // the full bank
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
  });

  test("each filter returns exactly the matching questions", async () => {
    const all = (await listQuestions(repo, admin, {})).items;
    assert.ok(all.length > 500, "the full bank");
    const skills = new Map((await repo.findMany("Skill", {})).map((k) => [String(k.id), String(k.domain)]));
    const qs = new Map((await repo.findMany("Question", { deletedAt: null })).map((q) => [String(q.id), q]));
    const grammar = (await listQuestions(repo, admin, { subject: "GRAMMAR" })).items;
    assert.ok(grammar.length > 0);
    assert.ok(grammar.every((x) => skills.get(String(qs.get(x.id)!.skillId)) === "GRAMMAR"));
    assert.equal(grammar.length, all.filter((x) => skills.get(String(qs.get(x.id)!.skillId)) === "GRAMMAR").length);
    const l4 = (await listQuestions(repo, admin, { difficulty: 4 })).items;
    assert.ok(l4.length > 0 && l4.every((x) => x.level === 4));
    assert.equal(l4.length, all.filter((x) => x.level === 4).length);
    const origins = [...new Set([...qs.values()].map((q) => String(q.origin)))];
    for (const o of origins) {
      const got = (await listQuestions(repo, admin, { source: o })).items;
      assert.equal(got.length, all.filter((x) => String(qs.get(x.id)!.origin) === o).length, o);
    }
    // combined, and the same for teachers
    const combo = (await listQuestions(repo, teacher, { subject: "READING", difficulty: 3 })).items;
    assert.ok(combo.every((x) => x.level === 3 && skills.get(String(qs.get(x.id)!.skillId)) === "READING"));
  });

  test("the Question Bank never changes how questions are linked", async () => {
    const before = (await repo.findMany("Question", {}, { select: ["id", "skillId", "lessonId", "standardId", "passageId", "difficultyLevel"] })).map((q) => JSON.stringify(q)).sort();
    await listQuestions(repo, admin, { subject: "READING", difficulty: 2, source: "DEMO", q: "the" });
    const after = (await repo.findMany("Question", {}, { select: ["id", "skillId", "lessonId", "standardId", "passageId", "difficultyLevel"] })).map((q) => JSON.stringify(q)).sort();
    assert.deepEqual(after, before);
  });
});
