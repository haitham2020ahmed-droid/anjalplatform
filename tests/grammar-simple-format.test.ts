import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { workbookXlsx, templateXlsx } from "../src/imports/questions/template-files";
import { TEMPLATE_HEADERS } from "../src/imports/questions/template";
import { analyzeImport, loadCurriculumIndex } from "../src/server/admin/question-import";
import { ensureGrammarSkills, grammarCode, grammarSimpleTable, grammarTable, readGrammarWorkbook } from "../src/server/grammar/grammar";
import { unclassifiedSkillId } from "../src/server/curriculum-map/questions";
import { demoDatabase } from "./helpers/db";

/** One row of the "simple" Questions sheet, in TEMPLATE_HEADERS order. */
function simpleRow(v: Partial<Record<(typeof TEMPLATE_HEADERS)[number], string>>): string[] {
  return TEMPLATE_HEADERS.map((h) => v[h] ?? "");
}

/** The strict format's Q_HEAD, as in tests/grammar.test.ts, so a strict-format file can be built here too. */
const Q_HEAD = ["grade", "lesson_id", "unit", "week", "lesson_number", "lesson_title", "skill_id", "skill", "skill_kind", "question_id", "level", "rit_band_approx", "type", "map_area", "ccss", "passage", "question", "option_A", "option_B", "option_C", "option_D", "answer", "answer_letter", "accepted_answers", "explanation", "source"];
const strictQ = (skillId: string, n: number, type: string, stem: string, opts: string[], answer: string, letter: string) =>
  ["4", skillId.slice(0, 7), "1", "1", "", "", skillId, "", "", `${skillId}-Q${n}`, "On", "", type, "", "L.4.1f", "", stem, ...[0, 1, 2, 3].map((i) => opts[i] ?? ""), answer, letter, "", "Because it is right.", "Book"];

/** A tiny strict-format Grammar file: one skill, with the EXISTING skills the "simple" format tests match against. */
function strictGrammarFile(): Uint8Array {
  const rows: string[][] = [Q_HEAD];
  rows.push(strictQ("G4-U1W1-S1", 1, "mcq", "Which is a complete sentence?", ["The dog ran.", "Ran home.", "The dog.", "Home."], "The dog ran.", "A"));
  rows.push(strictQ("G4-U1W2-S1", 1, "mcq", "Pick the correct form.", ["Right.", "Wrong.", "No.", "Maybe."], "Right.", "A"));
  return workbookXlsx([
    { name: "Questions", rows, widths: [10] },
    { name: "Skills", widths: [10], rows: [["grade", "lesson_id", "lesson_title", "skill_id", "skill", "skill_kind", "ccss", "rule_summary"],
      ["4", "G4-U1W1", "Sentences", "G4-U1W1-S1", "Sentences and Sentence Fragments", "Grammar & Usage", "L.4.1f, W.4.5", "A sentence shows a complete thought."],
      ["4", "G4-U1W2", "Types", "G4-U1W2-S1", "Four Types of Sentences", "Grammar & Usage", "L.4.1f", "Statements, questions, commands, exclamations."]] },
    { name: "Lessons", widths: [10], rows: [["grade", "lesson_id", "unit", "week", "lesson_number", "title"], ["4", "G4-U1W1", "1", "1", "", "Sentences"], ["4", "G4-U1W2", "1", "2", "", "Types"]] },
  ]);
}

describe("🔤 Grammar bank: the simple (Questions + Curriculum) format", () => {
  let repo: SqliteRepo; let admin: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    // the EXISTING, already-placed skills the simple format must match against (never re-create or re-place them)
    await ensureGrammarSkills(repo, admin, readGrammarWorkbook(strictGrammarFile()), 4);
    // pre-create the grade's "Unclassified" skill (as a normal Curriculum import would have, sooner or later):
    // the safe fallback for a Skill text with no match at all.
    await unclassifiedSkillId(repo, admin.schoolId!, 4);
  });

  test("format detection: Lessons+Skills present → strict; otherwise → simple", () => {
    const strict = readGrammarWorkbook(strictGrammarFile());
    assert.equal(strict.format, "strict");
    const simple = readGrammarWorkbook(workbookXlsx([{ name: "Questions", rows: [TEMPLATE_HEADERS, simpleRow({ "Question Text": "x?", "Option A": "a", "Option B": "b", "Correct Answer": "A", Grade: "4" })], widths: [10] }]));
    assert.equal(simple.format, "simple");
  });

  test("(a) a Skill name that DOES match (after stripping “Grade N ”) is matched to the EXISTING skill: no new skill, no new placement", async () => {
    const before = (await repo.findMany("Skill", {})).length;
    const rows = [TEMPLATE_HEADERS,
      simpleRow({ "Question Text": "Which is a complete sentence?", "Question Type": "Multiple Choice", "Option A": "The cat slept.", "Option B": "Slept all day.", "Option C": "The cat.", "Option D": "All day.", "Correct Answer": "A", Explanation: "It has a subject and a verb.", Grade: "4", Skill: "Grade 4 Sentences and Sentence Fragments", Standard: "L.4.1.F", "Difficulty Level": "4", "Cognitive Level": "Apply" }),
    ];
    const wb = readGrammarWorkbook(workbookXlsx([{ name: "Questions", rows, widths: [10] }, { name: "Curriculum", rows: [["Grade", "Skill Code", "Skill Name", "Standards (use one of these)"], ["4", grammarCode(4, "G4-U1W1-S1"), "Sentences and Sentence Fragments", "L.4.1.F"]], widths: [10] }]));
    assert.equal(wb.format, "simple");
    const table = grammarSimpleTable(wb, 4);
    assert.equal(table.length, 2, "header + 1 row");
    const jobId = await analyzeImport(repo, admin, { fileName: "simple.xlsx", bytes: new Uint8Array([1]), target: "BANK", table });
    const job = (await repo.findUnique("ImportJob", { id: jobId }))!;
    assert.deepEqual([Number(job.validRows), Number(job.errorRows)], [1, 0], JSON.stringify(job.errors));
    const [log] = await repo.findMany("ImportedQuestionLog", { jobId });
    assert.equal(log.detected.meta.skillName, "Sentences and Sentence Fragments", "matched the EXISTING skill, not a guess");
    assert.ok(!log.detected.input?.aiNeeds?.includes("skill"), "an exact match needs no review");
    assert.equal((await repo.findMany("Skill", {})).length, before, "no new skill was created for the simple format");
  });

  test("(b) a Skill name with NO match is never guessed onto a curriculum placement: flagged for review (Unclassified-style), not silently placed", async () => {
    const before = (await repo.findMany("Skill", {})).length;
    const rows = [TEMPLATE_HEADERS,
      simpleRow({ "Question Text": "Qzxcvwerty lmnopqrs vbnmasdf?", "Question Type": "Multiple Choice", "Option A": "qzx", "Option B": "wer", "Option C": "tyu", "Option D": "iop", "Correct Answer": "A", Explanation: "qzx is right.", Grade: "4", Skill: "Grade 4 Qzxcvwerty Lmnopqrs", "Difficulty Level": "4" }),
    ];
    const wb = readGrammarWorkbook(workbookXlsx([{ name: "Questions", rows, widths: [10] }]));
    const table = grammarSimpleTable(wb, 4);
    const jobId = await analyzeImport(repo, admin, { fileName: "simple-unmatched.xlsx", bytes: new Uint8Array([1]), target: "BANK", table });
    const job = (await repo.findUnique("ImportJob", { id: jobId }))!;
    assert.equal(Number(job.errorRows), 0, "not refused outright: it is kept, flagged for review");
    const [log] = await repo.findMany("ImportedQuestionLog", { jobId });
    assert.ok(log.detected.input?.aiNeeds?.includes("skill"), "flagged for review, never silently placed");
    assert.equal(log.detected.meta.skillName, "Unclassified (Curriculum Map)", "the safe fallback, never a guessed skill");
    assert.equal((await repo.findMany("Skill", {})).length, before, "no new skill or placement was created for the unmatched row");
  });

  test("(c) Multi Select round-trips with its correct multiple answers intact, via BOTH formats", async () => {
    // simple format: Correct Answer "B, C" straight through the normal importer (already supports Multi Select)
    const rows = [TEMPLATE_HEADERS,
      simpleRow({ "Question Text": "Which TWO are verbs?", "Question Type": "Multi Select", "Option A": "jump", "Option B": "blue", "Option C": "write", "Option D": "table", "Correct Answer": "B, C", Explanation: "Verbs show actions.", Grade: "4", Skill: "Grade 4 Four Types of Sentences", Standard: "L.4.1.F" }),
    ];
    const wb = readGrammarWorkbook(workbookXlsx([{ name: "Questions", rows, widths: [10] }]));
    const jobId = await analyzeImport(repo, admin, { fileName: "simple-multiselect.xlsx", bytes: new Uint8Array([1]), target: "BANK", table: grammarSimpleTable(wb, 4) });
    const [log] = await repo.findMany("ImportedQuestionLog", { jobId });
    assert.equal(log.detected.input?.type, "MULTI_SELECT");
    assert.deepEqual(log.detected.input?.options?.filter((o: { correct: boolean }) => o.correct).map((o: { label: string }) => o.label).sort(), ["B", "C"]);

    // strict format: answer_letter holding several letters ("B,C") → grammarTable's own Multi Select branch
    const strictRows: string[][] = [Q_HEAD];
    strictRows.push(["4", "G4-U1W1", "1", "1", "", "", "G4-U1W1-S1", "", "", "G4-U1W1-S1-Q9", "On", "", "multi_select", "", "L.4.1f", "", "Which TWO are verbs?", "jump", "blue", "write", "table", "", "B,C", "", "Verbs show actions.", "Book"]);
    const strictWb = readGrammarWorkbook(workbookXlsx([
      { name: "Questions", rows: strictRows, widths: [10] },
      { name: "Skills", widths: [10], rows: [["grade", "lesson_id", "lesson_title", "skill_id", "skill", "skill_kind", "ccss"], ["4", "G4-U1W1", "Sentences", "G4-U1W1-S1", "Sentences and Sentence Fragments", "Grammar & Usage", "L.4.1f"]] },
      { name: "Lessons", widths: [10], rows: [["grade", "lesson_id", "unit", "week", "lesson_number", "title"], ["4", "G4-U1W1", "1", "1", "", "Sentences"]] },
    ]));
    const strictTable = grammarTable(strictWb, 4);
    const col = (h: string) => strictTable[0].indexOf(h);
    const row = strictTable[1];
    assert.equal(row[col("Question Type")], "Multi Select");
    assert.equal(row[col("Correct Answer")], "B, C");
  });

  test("(d) the original strict (Lessons/Skills/Questions) format still works unchanged", async () => {
    const wb = readGrammarWorkbook(strictGrammarFile());
    assert.equal(wb.format, "strict");
    const table = grammarTable(wb, 4);
    assert.equal(table.length, 3); // header + 2 questions
  });

  test("(e) the downloadable template is itself accepted as the simple format", async () => {
    const idx = await loadCurriculumIndex(repo, admin);
    const bytes = templateXlsx(idx);
    const wb = readGrammarWorkbook(bytes);
    assert.equal(wb.format, "simple", "the template (Questions + Instructions + Curriculum) is recognised, header and all");
    assert.ok((wb.simpleRows?.length ?? 0) > 1, "its example rows were read");
  });
});
