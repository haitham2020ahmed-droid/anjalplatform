import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { workbookXlsx } from "../src/imports/questions/template-files";
import { TEMPLATE_HEADERS } from "../src/imports/questions/template";
import { analyzeImport } from "../src/server/admin/question-import";
import { ensureGrammarSkills, ensureSimpleGrammarSkills, grammarLibrary, grammarSimpleTable, readGrammarWorkbook } from "../src/server/grammar/grammar";
import { demoDatabase } from "./helpers/db";

/** One row of the "simple" Questions sheet, in TEMPLATE_HEADERS order. */
function simpleRow(v: Partial<Record<(typeof TEMPLATE_HEADERS)[number], string>>): string[] {
  return TEMPLATE_HEADERS.map((h) => v[h] ?? "");
}
function simpleFile(rows: string[][]): Uint8Array {
  return workbookXlsx([{ name: "Questions", rows: [TEMPLATE_HEADERS, ...rows], widths: [10] }]);
}

/**
 * The owner's real-world case: a grade that has NEVER had a strict-format Grammar upload (so it starts with
 * zero grammar skills — "No Grade 6 lessons loaded yet.") uploads the school's real file (the simple format).
 * Before this fix, every row failed to match (matchCurriculum is exact-name-only) and the grade stayed at
 * zero lessons forever, even though the upload itself "succeeded" (no error, a normal import job was created).
 */
describe("🔤 Grammar bank: bootstrapping a grade that starts with zero grammar skills (the simple format)", () => {
  let repo: SqliteRepo; let admin: Actor;
  before(async () => { ({ repo } = await demoDatabase()); admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!); });

  test("a Skill name with NO existing match, in a grade with no grammar skills at all, now gets its own skill created — and the row matches it exactly, not Unclassified", async () => {
    const before = (await repo.findMany("Skill", {})).length;
    const wb = readGrammarWorkbook(simpleFile([
      simpleRow({ "Question Text": "Which word is a verb?", "Question Type": "Multiple Choice", "Option A": "run", "Option B": "fast", "Option C": "happy", "Option D": "table", "Correct Answer": "A", Explanation: "Run shows an action.", Grade: "6", Skill: "Grade 6 Action Verbs", Standard: "L.6.1.A" }),
    ]));
    assert.equal(wb.format, "simple");
    const r = await ensureSimpleGrammarSkills(repo, admin, wb, 6);
    assert.deepEqual(r, { created: 1, skills: 1 });
    assert.equal((await repo.findMany("Skill", {})).length, before + 1, "exactly one new skill was created");

    const table = grammarSimpleTable(wb, 6);
    const jobId = await analyzeImport(repo, admin, { fileName: "grade6.xlsx", bytes: new Uint8Array([1]), target: "BANK", table });
    const job = (await repo.findUnique("ImportJob", { id: jobId }))!;
    assert.deepEqual([Number(job.validRows), Number(job.errorRows)], [1, 0], JSON.stringify(job.errors));
    const [log] = await repo.findMany("ImportedQuestionLog", { jobId });
    assert.equal(log.detected.meta.skillName, "Action Verbs", "matched the freshly created skill, not Unclassified");
    assert.ok(!log.detected.input?.aiNeeds?.includes("skill"), "an exact match needs no review");

    // the Grammar page's own list (grammarLibrary): Grade 6 is no longer "No Grade 6 lessons loaded yet."
    const lib = await grammarLibrary(repo, admin);
    assert.ok(lib.lessons.some((l) => l.name === "Action Verbs" && l.grade === 6), "the new skill is listed for Grade 6");
  });

  test("uploading the same file again does not create a duplicate skill (idempotent)", async () => {
    const wb = readGrammarWorkbook(simpleFile([
      simpleRow({ "Question Text": "Which word is a verb?", "Question Type": "Multiple Choice", "Option A": "run", "Option B": "fast", "Option C": "happy", "Option D": "table", "Correct Answer": "A", Grade: "6", Skill: "Grade 6 Action Verbs" }),
    ]));
    const before = (await repo.findMany("Skill", {})).length;
    const r = await ensureSimpleGrammarSkills(repo, admin, wb, 6);
    assert.deepEqual(r, { created: 0, skills: 1 }, "the name already exists now: nothing new is created");
    assert.equal((await repo.findMany("Skill", {})).length, before);
  });

  test("a second, different Skill name in the same grade adds to the catalog without dropping the first one", async () => {
    const wb = readGrammarWorkbook(simpleFile([
      simpleRow({ "Question Text": "Which sentence uses the correct tense?", "Question Type": "Multiple Choice", "Option A": "She ran.", "Option B": "She run.", "Option C": "She running.", "Option D": "She runs tomorrow.", "Correct Answer": "A", Grade: "6", Skill: "Grade 6 Verb Tense" }),
    ]));
    await ensureSimpleGrammarSkills(repo, admin, wb, 6);
    const lib = await grammarLibrary(repo, admin);
    const g6 = lib.lessons.filter((l) => l.grade === 6).map((l) => l.name);
    assert.ok(g6.includes("Action Verbs") && g6.includes("Verb Tense"), "both Grade 6 skills are listed: " + g6.join(", "));
  });

  test("a grade's EXISTING strict-format catalog (map-placed lessons) is preserved, not wiped, when it later also gets a simple-format upload with a brand-new name", async () => {
    const Q_HEAD = ["grade", "lesson_id", "unit", "week", "lesson_number", "lesson_title", "skill_id", "skill", "skill_kind", "question_id", "level", "rit_band_approx", "type", "map_area", "ccss", "passage", "question", "option_A", "option_B", "option_C", "option_D", "answer", "answer_letter", "accepted_answers", "explanation", "source"];
    const strictQ = ["4", "G4-U1W1", "1", "1", "", "", "G4-U1W1-S1", "", "", "G4-U1W1-S1-Q1", "On", "", "mcq", "", "L.4.1f", "", "Which is a complete sentence?", "The dog ran.", "Ran home.", "The dog.", "Home.", "The dog ran.", "A", "", "Because it is right.", "Book"];
    const strictWb = readGrammarWorkbook(workbookXlsx([
      { name: "Questions", rows: [Q_HEAD, strictQ], widths: [10] },
      { name: "Skills", widths: [10], rows: [["grade", "lesson_id", "lesson_title", "skill_id", "skill", "skill_kind", "ccss"], ["4", "G4-U1W1", "Sentences", "G4-U1W1-S1", "Sentences and Sentence Fragments", "Grammar & Usage", "L.4.1f"]] },
      { name: "Lessons", widths: [10], rows: [["grade", "lesson_id", "unit", "week", "lesson_number", "title"], ["4", "G4-U1W1", "1", "1", "", "Sentences"]] },
    ]));
    await ensureGrammarSkills(repo, admin, strictWb, 4);
    const before = (await grammarLibrary(repo, admin)).lessons.filter((l) => l.grade === 4).map((l) => l.name);
    assert.ok(before.includes("Sentences and Sentence Fragments"));

    const simpleWb = readGrammarWorkbook(simpleFile([
      simpleRow({ "Question Text": "Pick the correctly capitalized sentence.", "Question Type": "Multiple Choice", "Option A": "We live in Egypt.", "Option B": "we live in egypt.", "Option C": "We Live In Egypt.", "Option D": "we Live in Egypt.", "Correct Answer": "A", Grade: "4", Skill: "Grade 4 Capitalization of Proper Nouns" }),
    ]));
    await ensureSimpleGrammarSkills(repo, admin, simpleWb, 4);
    const after = (await grammarLibrary(repo, admin)).lessons.filter((l) => l.grade === 4).map((l) => l.name);
    assert.ok(after.includes("Sentences and Sentence Fragments"), "the earlier strict-format lesson is still there");
    assert.ok(after.includes("Capitalization of Proper Nouns"), "the new simple-format skill was added");
  });

  test("a Skill name that DOES already match an existing skill is still left alone (no duplicate, no change) — the normal path", async () => {
    const before = (await repo.findMany("Skill", {})).length;
    const wb = readGrammarWorkbook(simpleFile([
      simpleRow({ "Question Text": "x?", "Question Type": "Multiple Choice", "Option A": "a", "Option B": "b", "Correct Answer": "A", Grade: "6", Skill: "Grade 6 Action Verbs" }),
    ]));
    const r = await ensureSimpleGrammarSkills(repo, admin, wb, 6);
    assert.equal(r.created, 0);
    assert.equal((await repo.findMany("Skill", {})).length, before);
  });
});
