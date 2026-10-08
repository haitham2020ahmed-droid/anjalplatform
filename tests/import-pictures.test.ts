import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { analyzeImport, commitImportChunk, getImportJob } from "../src/server/admin/question-import";
import { demoDatabase } from "./helpers/db";

describe("📥 Curriculum import: pictures in the cells, placed by the map", () => {
  let repo: SqliteRepo; let admin: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
  });

  test("the picture on a question's row becomes its picture; an unknown skill name does not lose the question", async () => {
    const id = await analyzeImport(repo, admin, { fileName: "pics.xlsx", bytes: new Uint8Array(readFileSync("tests/fixtures/curriculum-with-picture.xlsx")), target: "CURRICULUM" });
    const j = await getImportJob(repo, admin, id);
    const [mc, open] = j.rows;
    assert.deepEqual(mc.errors, [], JSON.stringify(mc.errors));
    assert.ok(mc.warnings.some((w) => /not a platform skill: the question is placed by its Curriculum Map place/.test(w)));
    assert.ok((mc.detected as { input?: { imageId?: string } }).input?.imageId, "the picture is attached in the preview");
    assert.match(open.errors.join(" "), /Open-response question/);
    let p; do { p = await commitImportChunk(repo, admin, id, { publish: true }); } while (!p.done);
    const q = (await repo.findMany("Question", {})).find((x) => String(x.stem).includes("pictures in the fixture text"))!;
    assert.ok(q.imageId, "saved with its picture");
    const img = await repo.findUnique("QuestionImage", { id: q.imageId });
    assert.equal(img!.mime, "image/png");
    const node = await repo.findUnique("CurriculumMapNode", { id: (await repo.findMany("QuestionMapLink", { questionId: q.id }))[0].nodeId });
    assert.equal(node!.code, "G5.U5.TS1.ACS.ABOVE");
    assert.equal(q.status, "PUBLISHED");
  });

  test("a question without a skill keeps the file's CCSS standard (e.g. vocabulary: L.5.4.a)", async () => {
    const csv = "Grade,Unit,Text Set / Selection,Category,Map Level,Curriculum Map ID,Question Text,Question Type,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Passage/Text,Lexile,Difficulty Level,Cognitive Level,Skill,Standard\n"
      + "5,1,1,Concept Vocabulary,,G5.U1.TS1.CV,After the storm the yard was covered with ________.,Multiple Choice,generations,emphasis,debris,sunshine,C,Debris means scattered broken pieces.,,785,3,Remember,,L.5.4.a\n";
    const id = await analyzeImport(repo, admin, { fileName: "vocab.csv", bytes: new TextEncoder().encode(csv), target: "CURRICULUM" });
    let p; do { p = await commitImportChunk(repo, admin, id, { publish: true }); } while (!p.done);
    const q = (await repo.findMany("Question", {})).find((x) => String(x.stem).startsWith("After the storm the yard"))!;
    const std = await repo.findUnique("Standard", { id: q.standardId });
    assert.match(String(std!.code), /L\.5\.4\.a$/i);
    assert.equal(Number(q.lexile), 785);
  });

  test("the same question words about another passage are NOT a duplicate; “L.6.5c” is read as L.6.5.c", async () => {
    const head = "Grade,Unit,Text Set / Selection,Category,Map Level,Curriculum Map ID,Question Text,Question Type,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Passage/Text,Lexile,Difficulty Level,Cognitive Level,Skill,Standard\n";
    const row = (passage: string, std: string) => `6,1,1,Analyze Craft and Structure,On,G6.U1.SEL1.ACS.ON,What is the main purpose of this fixture text?,Multiple Choice,To inform,To entertain,To persuade,To describe,A,It gives facts.,"${passage}",1000,4,Understand,,${std}\n`;
    const csv = head + row("Volcanoes form when magma rises through cracks in the crust of the earth.", "RI.6.6") + row("Bees and wasps look alike but they live very different lives in the garden.", "L.6.5c") + row("Volcanoes form when magma rises through cracks in the crust of the earth.", "RI.6.6");
    const id = await analyzeImport(repo, admin, { fileName: "dups.csv", bytes: new TextEncoder().encode(csv), target: "CURRICULUM" });
    const j = await getImportJob(repo, admin, id);
    assert.equal(j.rows[1].warnings.some((w) => /Same question as|Very similar to/.test(w)), false, "another passage: not a duplicate");
    assert.equal(j.rows[2].warnings.some((w) => /Same question as row/.test(w)), true, "same words, same passage: a duplicate");
    let p; do { p = await commitImportChunk(repo, admin, id, { publish: true }); } while (!p.done);
    const q = (await repo.findMany("Question", {})).find((x) => String(x.stem).includes("fixture text") && x.standardId && String(x.stem));
    const stds = await repo.findMany("Standard", { id: { in: (await repo.findMany("Question", {})).filter((x) => String(x.stem).includes("main purpose of this fixture")).map((x) => x.standardId).filter(Boolean) } });
    assert.ok(q && stds.some((x) => /L\.6\.5\.c$/i.test(String(x.code))), "L.6.5c saved as L.6.5.c");
  });

  test("the same question words about ANOTHER passage are not a duplicate; “L.6.5c” = “L.6.5.c”", async () => {
    const head = "Grade,Unit,Text Set / Selection,Category,Map Level,Curriculum Map ID,Question Text,Question Type,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Passage/Text,Lexile,Difficulty Level,Cognitive Level,Skill,Standard\n";
    const row = (passage: string, std: string) => `4,1,1,Analyze Craft and Structure,On,G4.U1.TS1.ACS.ON,What is the main purpose of this text about animals?,Multiple Choice,To inform,To entertain,To persuade,To complain,A,It gives facts.,"${passage}",650,4,Understand,,${std}\n`;
    const csv = head + row("Bees and wasps can look alike but they live very different lives in the garden.", "RI.4.8") + row("Owls hunt at night and can turn their heads almost all the way around.", "RI.4.8") + row("Owls hunt at night and can turn their heads almost all the way around.", "RI.4.8");
    const id = await analyzeImport(repo, admin, { fileName: "dups.csv", bytes: new TextEncoder().encode(csv), target: "CURRICULUM" });
    let p; do { p = await commitImportChunk(repo, admin, id, { publish: true }); } while (!p.done);
    const j = await getImportJob(repo, admin, id);
    assert.deepEqual([j.summary!.imported, j.summary!.skipped], [2, 1], "two passages = two questions; the same passage twice = a duplicate");
    const csv2 = head + `6,1,1,Analyze Craft and Structure,On,G6.U1.SEL1.ACS.ON,Which word in the sentence has a negative connotation for the reader?,Multiple Choice,thrifty,cheap,careful,saving,B,Cheap sounds negative.,,900,4,Analyze,,L.6.5c\n`;
    const id2 = await analyzeImport(repo, admin, { fileName: "std.csv", bytes: new TextEncoder().encode(csv2), target: "CURRICULUM" });
    do { p = await commitImportChunk(repo, admin, id2, { publish: true }); } while (!p.done);
    const q = (await repo.findMany("Question", {})).find((x) => String(x.stem).startsWith("Which word in the sentence has a negative connotation"))!;
    assert.match(String((await repo.findUnique("Standard", { id: q.standardId }))!.code), /L\.6\.5\.c$/i);
  });
});
