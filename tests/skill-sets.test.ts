/** ➕ School-supplied MAP skill sets: skills made in Grades 4–6, questions published, search finds them, idempotent. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { addSkillSets, loadSkillSetsFile } from "../src/server/questions/skill-sets";
import { skillsMatching, countQuestionsOfSkills } from "../src/server/questions/skill-questions";
import { demoDatabase } from "./helpers/db";

describe("➕ MAP skill sets (Persuasive Techniques, Rhetorical Questions)", () => {
  let repo: SqliteRepo; let schoolId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    schoolId = String((await repo.findMany("School", {}))[0].id);
  });

  test("the data file has both sets with 4 options and a correct letter each", async () => {
    const sets = await loadSkillSetsFile();
    assert.deepEqual(sets.map((x) => x.skill), ["Persuasive Techniques", "Rhetorical Questions"]);
    for (const set of sets) for (const q of set.questions) { assert.equal(q.options.length, 4); assert.match(q.correct, /^[ABCD]/); }
  });

  test("skills are created, questions published and found by search; a second run adds nothing", async () => {
    const sets = (await loadSkillSetsFile()).map((x) => ({ ...x, questions: x.questions.slice(0, 5) }));
    const r = await addSkillSets(repo, schoolId, sets);
    for (const x of r) { assert.deepEqual(x.errors, []); assert.equal(x.added, 5); assert.ok(x.skillsCreated >= 1); }
    for (const name of ["persuasive", "rhetorical"]) {
      const hits = await skillsMatching(repo, schoolId, name);
      const hit = hits.find((k) => /persuasive techniques|rhetorical questions/i.test(k.name));
      assert.ok(hit, name);
      assert.equal((await countQuestionsOfSkills(repo, schoolId, [hit!.id])).get(hit!.id), 5);
    }
    const again = await addSkillSets(repo, schoolId, sets);
    for (const x of again) { assert.equal(x.added, 0); assert.equal(x.skillsCreated, 0); }
  });
});
