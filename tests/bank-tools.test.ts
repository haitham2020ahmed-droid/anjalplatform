import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { analyzeImport, commitImportChunk } from "../src/server/admin/question-import";
import { archiveQuestions, restoreArchived } from "../src/server/admin/question-delete";
import { autoClassify } from "../src/server/curriculum-map/questions";
import { mapCoverage } from "../src/server/curriculum-map/coverage";
import { demoDatabase } from "./helpers/db";

describe("📚 bank tools: restore archived, auto-classify by standard, map coverage", () => {
  let repo: SqliteRepo; let admin: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const head = "Grade,Unit,Text Set / Selection,Category,Map Level,Curriculum Map ID,Question Text,Question Type,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Passage/Text,Lexile,Difficulty Level,Cognitive Level,Skill,Standard\n";
    const rows = Array.from({ length: 3 }, (_, i) => `4,1,1,Analyze Craft and Structure,On,G4.U1.TS1.ACS.ON,Tool question number ${i} about the bees?,Multiple Choice,yes${i},no${i},maybe${i},never${i},A,Because.,,650,4,Understand,A Name The Platform Does Not Know,RI.4.3\n`).join("");
    const id = await analyzeImport(repo, admin, { fileName: "t.csv", bytes: new TextEncoder().encode(head + rows), target: "CURRICULUM" });
    let p; do { p = await commitImportChunk(repo, admin, id, { publish: true }); } while (!p.done);
  });

  test("coverage counts the place's adaptive-ready questions", async () => {
    const c = await mapCoverage(repo, admin, 4);
    assert.equal(c.sets.find((s) => s.set === "G4.U1.TS1")!.cells["ACS.ON"].adaptive, 3);
  });

  test("archived questions come back published with ♻️ Restore", async () => {
    const qs = (await repo.findMany("Question", {})).filter((q) => String(q.stem).startsWith("Tool question number"));
    await archiveQuestions(repo, admin, [String(qs[0].id)], "test");
    assert.equal((await mapCoverage(repo, admin, 4)).sets.find((s) => s.set === "G4.U1.TS1")!.cells["ACS.ON"].adaptive, 2, "archived ones are not counted");
    assert.deepEqual(await restoreArchived(repo, admin, [String(qs[0].id), String(qs[1].id)]), { restored: 1 }, "only archived ones are restored");
    assert.equal((await repo.findUnique("Question", { id: qs[0].id }))!.status, "PUBLISHED");
  });

  test("🪄 map questions imported without a skill: a sure rule links them at import, an unsure one lists them for review; auto-classify is the admin's choice", async () => {
    // Update 39C + UI reorg Phase 1: the import's "skill from the map place" step links each question by the standard
    // when exactly one skill of the grade is linked to it, or by the place's skill. Here the standard (RI.4.3) has
    // several skills and the place names another one (Compare and Contrast): the platform does not guess silently —
    // the questions stay unclassified and are listed under “Links that need review” with the best guess.
    const qs = (await repo.findMany("Question", {})).filter((q) => String(q.stem).startsWith("Tool question number"));
    assert.equal(qs.length, 3);
    const skills = await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => String(q.skillId)))] } });
    const std = String(qs[0].standardId ?? "");
    const linked = std ? (await repo.findMany("SkillStandard", { standardId: std })).map((l) => String(l.skillId)) : [];
    if (linked.length === 1) assert.ok(qs.every((q) => q.skillId === linked[0]), "the skill linked to the standard");
    const hidden = skills.every((k) => String(k.code).endsWith(".curriculum-map-unclassified"));
    if (hidden) {
      const rows = await repo.findMany("SkillLinkReview", { kind: "QUESTION", status: "OPEN" });
      assert.ok(qs.every((q) => rows.some((r) => r.subjectId === q.id && r.guessId)), "each one is listed for review with a best guess");
    } else assert.ok(skills.every((k) => k.isActive !== false), skills.map((k) => k.code).join());
    // the admin's explicit Auto-classify button still classifies by standard + place words
    const r = await autoClassify(repo, admin.schoolId!, admin.userId);
    assert.equal(r.classified, hidden ? 3 : 0);
    assert.equal(r.left, 0, "nothing left on the hidden skill");
  });
});
