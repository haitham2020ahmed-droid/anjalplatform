import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveActor } from "../src/server/auth/actor";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { analyzeImport, archiveImportQuestions, commitImportChunk } from "../src/server/admin/question-import";
import { ForbiddenError } from "../src/server/auth/rbac";
import { demoDatabase } from "./helpers/db";

describe("🗄 archive an import's questions (to replace a file with a newer version)", () => {
  test("archives exactly that import's questions; teachers cannot; past answers are kept", async () => {
    const { repo } = await demoDatabase();
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    const teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const head = "Grade,Unit,Text Set / Selection,Category,Map Level,Curriculum Map ID,Question Text,Question Type,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Passage/Text,Lexile,Difficulty Level,Cognitive Level,Skill,Standard\n";
    const job = async (tag: string) => { const id = await analyzeImport(repo, admin, { fileName: `${tag}.csv`, bytes: new TextEncoder().encode(head + [1, 2, 3].map((i) => `5,1,1,Concept Vocabulary,,G5.U1.TS1.CV,${tag} question number ${i} about words?,Multiple Choice,right ${tag}${i},wrong a ${tag}${i},wrong b ${tag}${i},wrong c ${tag}${i},A,x,,,3,Remember,,L.5.4.a`).join("\n") + "\n"), target: "CURRICULUM" }); let p; do { p = await commitImportChunk(repo, admin, id, { publish: true }); } while (!p.done); return id; };
    const oldJob = await job("Old"), newJob = await job("New");
    await assert.rejects(archiveImportQuestions(repo, teacher, oldJob), ForbiddenError);
    assert.equal(await archiveImportQuestions(repo, admin, oldJob), 3);
    const byStem = async (t: string) => (await repo.findMany("Question", {})).filter((q) => String(q.stem).startsWith(t)).map((q) => String(q.status));
    assert.deepEqual(await byStem("Old question"), ["ARCHIVED", "ARCHIVED", "ARCHIVED"]);
    assert.deepEqual(await byStem("New question"), ["PUBLISHED", "PUBLISHED", "PUBLISHED"], "the other import is untouched");
    assert.equal(await archiveImportQuestions(repo, admin, oldJob), 0, "running it again does nothing");
    void newJob;
  });
});
