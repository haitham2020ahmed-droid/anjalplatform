import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { toCsv } from "../src/imports/csv";
import { readPart, readXlsx, readZipEntries } from "../src/imports/xlsx";
import { zip } from "../src/reports/zip";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import type { Repo, Row, Where } from "../src/server/seeding/repo";
import { detectKind, extract } from "../src/imports/questions/extract";
import {
  DuplicateIndex, EXAMPLE_MARK, TEMPLATE_HEADERS, buildCurriculumIndex, difficultyFrom, matchCurriculum, parseTemplateTable, questionTypeFrom, readRow, shortStandard,
  type ColumnKey, type CurriculumIndex,
} from "../src/imports/questions/template";
import { curriculumRows, exampleRows, templateCsv, templateXlsx } from "../src/imports/questions/template-files";
import {
  ImportFileError, analyzeImport, cancelImport, checkInput, commitImportChunk, getImportJob, importProblemRows, listImportJobs, loadCurriculumIndex, updateImportRow,
  type CommitProgress,
} from "../src/server/admin/question-import";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const enc = (s: string) => new TextEncoder().encode(s);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

/** A real .xlsx: sheets in the given order (inline strings, as Excel can write them). */
function xlsx(sheets: { name: string; rows: string[][] }[]): Uint8Array {
  const sheetXml = (rows: string[][]) => `<worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, c) => (v === "" ? "" : `<c r="${colName(c)}${i + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return zip([
    { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: "xl/workbook.xml", data: `<workbook xmlns:r="r"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>` },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) })),
  ]);
}

type RowSpec = Partial<Record<string, string>>;
const asRow = (r: RowSpec) => TEMPLATE_HEADERS.map((h) => r[h] ?? "");
const csvOf = (rows: RowSpec[], headers: readonly string[] = TEMPLATE_HEADERS) => enc(toCsv([[...headers], ...rows.map((r) => headers.map((h) => r[h] ?? ""))]));
const cells = (r: RowSpec): Partial<Record<ColumnKey, string>> => {
  const t = parseTemplateTable([[...TEMPLATE_HEADERS], asRow(r)]);
  if (!t.ok) throw new Error(t.errors.join());
  return t.rows[0].cells;
};

// a tiny curriculum for the pure tests
const IDX: CurriculumIndex = buildCurriculumIndex(
  [
    { id: "s1", code: "G4.theme", name: "Theme", grade: 4, standards: [{ id: "t1", code: "CCSS.ELA-LITERACY.RL.4.2", isPrimary: true }] },
    { id: "s2", code: "G4.authors-purpose", name: "Author’s Purpose", grade: 4, standards: [{ id: "t2", code: "CCSS.ELA-LITERACY.RI.4.8", isPrimary: true }, { id: "t3", code: "CCSS.ELA-LITERACY.RL.4.1", isPrimary: false }] },
    { id: "s3", code: "G5.theme", name: "Theme", grade: 5, standards: [{ id: "t4", code: "CCSS.ELA-LITERACY.RL.5.2", isPrimary: true }] },
    { id: "s4", code: "G5.similes", name: "Similes and Metaphors", grade: 5, standards: [] },
  ],
  [{ id: "t1", code: "CCSS.ELA-LITERACY.RL.4.2" }, { id: "t2", code: "CCSS.ELA-LITERACY.RI.4.8" }, { id: "t3", code: "CCSS.ELA-LITERACY.RL.4.1" }, { id: "t4", code: "CCSS.ELA-LITERACY.RL.5.2" }, { id: "t5", code: "CCSS.ELA-LITERACY.L.5.5.a" }],
  [4, 5, 6],
);

const MC: RowSpec = { "Question Text": "What is the theme of the story?", "Question Type": "Multiple Choice", "Option A": "Be kind", "Option B": "Run fast", "Option C": "Eat well", "Option D": "Sleep early", "Correct Answer": "A", Explanation: "The story shows kindness.", Grade: "4", Skill: "Theme", Standard: "RL.4.2", "Difficulty Level": "4", "Cognitive Level": "Understand" };
const NO_OPTS: RowSpec = { "Option A": "", "Option B": "", "Option C": "", "Option D": "" };

// ======================================================================= pure rules

describe("question import: the template and its rules (pure)", () => {
  test("header row: every missing required column is named; case, spaces and _ are ignored", () => {
    const noAnswer = TEMPLATE_HEADERS.filter((h) => h !== "Correct Answer" && h !== "Skill");
    const t = parseTemplateTable([noAnswer, ["x"]]);
    assert.equal(t.ok, false);
    assert.deepEqual(!t.ok && t.errors, ["Missing required column: Correct Answer", "Missing required column: Skill"]);
    const loose = TEMPLATE_HEADERS.map((h) => h.toUpperCase().replace(/ /g, "_"));
    const ok = parseTemplateTable([loose, asRow(MC), ["", ""], asRow(MC)]);
    assert.ok(ok.ok && ok.rows.length === 2 && ok.rows[0].row === 2 && ok.rows[1].row === 4, "blank rows are skipped, row numbers kept");
    assert.ok(parseTemplateTable([TEMPLATE_HEADERS.filter((h) => h !== "Passage/Text"), ["q"]]).ok, "Passage/Text is optional");
    const notHeader = parseTemplateTable([["What is a noun?", "A thing"], ["x"]]);
    assert.match(!notHeader.ok ? notHeader.errors[0] : "", /first row must be the template’s header row/);
    const twice = parseTemplateTable([[...TEMPLATE_HEADERS, "Skill"], ["x"]]);
    assert.match(!twice.ok ? twice.errors.join() : "", /“Skill” appears twice/);
    const extra = parseTemplateTable([[...TEMPLATE_HEADERS, "Notes"], asRow(MC)]);
    assert.deepEqual(extra.ok && extra.ignoredColumns, ["Notes"]);
  });

  test("question types: names a teacher would write; unsupported types get a specific message", () => {
    assert.equal(questionTypeFrom("multiple choice").code, "MULTIPLE_CHOICE");
    assert.equal(questionTypeFrom("MCQ").code, "MULTIPLE_CHOICE");
    assert.equal(questionTypeFrom("True / False").code, "TRUE_FALSE");
    assert.equal(questionTypeFrom("Fill in the blank").code, "FILL_BLANK");
    assert.equal(questionTypeFrom("multi-select").code, "MULTI_SELECT");
    assert.equal(questionTypeFrom("MULTI_SELECT").code, "MULTI_SELECT");
    assert.match(questionTypeFrom("Matching").error!, /cannot be imported from the template/);
    assert.match(questionTypeFrom("Essay").error!, /is not supported\. Use one of: Multiple Choice/);
    assert.match(questionTypeFrom("").error!, /Question Type is empty/);
  });

  test("difficulty: 1–7 or the platform's level words; anything else is refused, never guessed", () => {
    assert.equal(difficultyFrom("4").level, 4);
    assert.equal(difficultyFrom("4.0").level, 4);
    assert.equal(difficultyFrom("Level 6").level, 6);
    assert.equal(difficultyFrom("Grade level").level, 4);
    assert.equal(difficultyFrom("very easy").level, 1);
    assert.match(difficultyFrom("9").error!, /from 1 to 7/);
    assert.match(difficultyFrom("2.5").error!, /not valid|whole number/);
    assert.match(difficultyFrom("so-so").error!, /not valid/);
    assert.match(difficultyFrom("").error!, /empty/);
  });

  test("each type reads its answer exactly; problems name the column and the value", () => {
    const mc = readRow(cells(MC));
    assert.deepEqual(mc.errors, []);
    assert.deepEqual(mc.question!.options!.map((o) => o.correct), [true, false, false, false]);
    assert.equal(mc.grade, 4);
    assert.equal(mc.question!.cognitiveLevel, "Understand");
    assert.equal(readRow(cells({ ...MC, "Correct Answer": "b)" })).question!.options![1].correct, true);
    assert.equal(readRow(cells({ ...MC, "Correct Answer": "Option C" })).question!.options![2].correct, true);
    assert.equal(readRow(cells({ ...MC, "Correct Answer": "run fast" })).question!.options![1].correct, true, "the text of a choice works too");
    assert.match(readRow(cells({ ...MC, "Option D": "", "Correct Answer": "D" })).errors.join(), /points to Option D, which is empty/);
    assert.match(readRow(cells({ ...MC, "Option B": "" })).errors.join(), /Option B is empty but Option D is filled/);
    assert.match(readRow(cells({ ...MC, "Option C": "be kind" })).errors.join(), /Option A and Option C are the same/);
    assert.match(readRow(cells({ ...MC, "Correct Answer": "A, B" })).errors.join(), /exactly one correct answer.*use Multi Select/);
    assert.match(readRow(cells({ ...MC, "Correct Answer": "" })).errors.join(), /Correct Answer is empty/);
    assert.match(readRow(cells({ ...MC, "Correct Answer": "Z" })).errors.join(), /not a letter of a choice/);

    const ms = readRow(cells({ ...MC, "Question Type": "Multi Select", "Correct Answer": "A and C" }));
    assert.deepEqual(ms.errors, []);
    assert.deepEqual(ms.question!.options!.map((o) => o.correct), [true, false, true, false], "the d of “and” is not option D");
    assert.match(readRow(cells({ ...MC, "Question Type": "Multi Select", "Correct Answer": "B" })).errors.join(), /2 or more correct answers/);

    const tf = readRow(cells({ ...MC, ...NO_OPTS, "Question Type": "True/False", "Correct Answer": "false" }));
    assert.deepEqual([tf.errors, tf.question!.answer, tf.question!.options], [[], false, undefined]);
    assert.match(readRow(cells({ ...MC, "Question Type": "True/False", "Correct Answer": "maybe" })).errors.join(), /must be True or False/);

    const fb = readRow(cells({ ...MC, ...NO_OPTS, "Question Text": "The cat ____ on the mat.", "Question Type": "Fill in the Blank", "Correct Answer": "sat | sits" }));
    assert.deepEqual([fb.errors, fb.question!.answers], [[], ["sat", "sits"]]);
    assert.match(readRow(cells({ ...MC, ...NO_OPTS, "Question Type": "Fill in the Blank", "Correct Answer": "x" })).warnings.join(), /no blank/);

    const sa = readRow(cells({ ...MC, ...NO_OPTS, "Question Type": "Short Answer", "Correct Answer": "Kindness matters.", Explanation: "" }));
    assert.deepEqual(sa.errors, []);
    assert.match(sa.warnings.join(), /scored by the teacher/);
    assert.equal(sa.question!.explanation, "Model answer: Kindness matters.");

    const noExpl = readRow(cells({ ...MC, Explanation: "" }));
    assert.match(noExpl.warnings.join(), /Explanation is empty/);
    assert.equal(noExpl.question!.explanation, "The correct answer is “Be kind”.");
    assert.match(readRow(cells({ ...MC, "Cognitive Level": "Memorize" })).errors.join(), /Cognitive Level “Memorize” is not valid/);
    assert.equal(readRow(cells({ ...MC, "Cognitive Level": "analyse" })).question!.cognitiveLevel, "Analyze");
    assert.equal(readRow(cells({ ...MC, Grade: "Grade 5" })).grade, 5);
    assert.match(readRow(cells({ ...MC, Grade: "fourth" })).errors.join(), /Grade “fourth” is not a grade number/);
    assert.match(readRow(cells({ ...MC, "Question Text": `${EXAMPLE_MARK} Which word is a noun?` })).errors.join(), /example row from the template/);
  });

  test("curriculum: exact grade, skill and standard only; every mismatch says what is wrong", () => {
    const ok = matchCurriculum(IDX, 4, "Theme", "RL.4.2");
    assert.deepEqual([ok.skill?.id, ok.standard?.id, ok.errors], ["s1", "t1", []]);
    assert.equal(matchCurriculum(IDX, 4, "g4.THEME", "CCSS.ELA-LITERACY.RL.4.2").skill?.id, "s1", "code, any case; full CCSS code");
    assert.equal(matchCurriculum(IDX, 4, "theme", "rl.4.2").skill?.id, "s1", "name, any case");
    assert.equal(matchCurriculum(IDX, 4, "Author's Purpose", "RI.4.8").skill?.id, "s2", "straight and curly apostrophes match");
    assert.deepEqual(matchCurriculum(IDX, 7, "Theme", "RL.4.2").errors, ["Grade 7 does not exist on the platform. Available grades: 4, 5, 6."]);
    assert.deepEqual(matchCurriculum(IDX, 4, "Similes and Metaphors", "RL.4.2").errors, ["Skill “Similes and Metaphors” is a Grade 5 skill, but this row says Grade 4."]);
    assert.match(matchCurriculum(IDX, 4, "Theme Park", "RL.4.2").errors[0], /Skill “Theme Park” was not found in Grade 4\. Use the exact skill name or code/);
    assert.match(matchCurriculum(IDX, 4, "Theme", "RL.9.9").errors[0], /Standard “RL\.9\.9” does not exist on the platform/);
    assert.deepEqual(matchCurriculum(IDX, 4, "Theme", "RI.4.8").errors, ["Standard RI.4.8 is not linked to skill “Theme”. Its standards are: RL.4.2."]);
    assert.match(matchCurriculum(IDX, 5, "Similes and Metaphors", "L.5.5.a").warnings.join(), /has no standards linked/, "a skill without links accepts an existing standard, with a warning");
    assert.equal(matchCurriculum(IDX, 4, "", "").errors.length, 2);
    assert.equal(shortStandard("CCSS.ELA-LITERACY.L.5.5.a"), "L.5.5.A");
  });

  test("duplicates: exact (case, punctuation, spacing ignored), similar, and different questions", () => {
    const d = new DuplicateIndex();
    d.add("q1", "What is the main idea of the passage?", ["Dogs", "Cats", "Birds", "Fish"]);
    d.add("q2", "ما الفكرة الرئيسية للنص؟", ["أ", "ب"]);
    assert.deepEqual(d.find("what is the MAIN idea of the passage", ["dogs", "cats", "birds", "fish!"]), { id: "q1", score: 1, exact: true });
    const similar = d.find("What is the main idea of this passage?", ["Dogs", "Cats", "Birds", "Fish"]);
    assert.ok(similar && !similar.exact && similar.score >= 0.8, JSON.stringify(similar));
    assert.equal(d.find("Which word is a verb?", ["run", "red", "rock", "rain"]), null);
    assert.equal(d.find("ما عنوان القصة؟", ["أ", "ب"]), null, "Arabic text is compared by its words, not reduced to nothing");
  });

  test("files: only CSV and Excel; every other kind gets a specific message", () => {
    assert.equal(detectKind("q.csv", enc("a,b")), "csv");
    assert.equal(detectKind("q.bin", xlsx([{ name: "Questions", rows: [["x"]] }])), "xlsx");
    const word = zip([{ name: "word/document.xml", data: "<w:document/>" }]);
    assert.throws(() => detectKind("bank.docx", word), /Word files cannot be imported.*official CSV or Excel template/);
    assert.throws(() => detectKind("bank.pdf", enc("%PDF-1.7")), /PDF files cannot be imported/);
    assert.throws(() => detectKind("scan.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), /Image files cannot be imported/);
    assert.throws(() => detectKind("bank.json", enc("[]")), /\.json files cannot be imported/);
    assert.throws(() => detectKind("bank.txt", enc("1. What?")), /\.txt files cannot be imported/);
    assert.throws(() => detectKind("old.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])), /Old Excel\/Word files/);
    assert.throws(() => detectKind("fake.xlsx", enc("hello")), /not a real Excel workbook/);
    assert.throws(() => extract("empty.csv", new Uint8Array()), /The file is empty/);
  });

  test("CSV variants Excel produces (BOM, semicolons, quotes, UTF-16) and the Questions sheet of a workbook", () => {
    const semi = extract("q.csv", enc('\uFEFFQuestion Text;Option A\r\n"Is it a noun, or a verb?";"yes; no"\r\n'));
    assert.deepEqual(semi.table, [["Question Text", "Option A"], ["Is it a noun, or a verb?", "yes; no"]]);
    const utf16 = new Uint8Array([0xff, 0xfe, ...Array.from("a\tb\r\nc\td").flatMap((c) => [c.charCodeAt(0), 0])]);
    assert.deepEqual(extract("q.csv", utf16).table, [["a", "b"], ["c", "d"]]);
    assert.throws(() => extract("q.csv", enc('Question Text\n"unclosed')), /quotation mark/);
    const book = xlsx([{ name: "Instructions", rows: [["Read me"]] }, { name: "Questions", rows: [["Question Text"], ["Q1"]] }]);
    assert.deepEqual(extract("bank.xlsx", book).table, [["Question Text"], ["Q1"]], "the Questions sheet is read even when it is not first");
  });

  test("Excel files whose tags carry a namespace prefix (<x:row>, written by .NET tools and converters) are read", () => {
    const plain = Buffer.from(xlsx([{ name: "Questions", rows: [["Question Text", "Grade"], ["Q1 & more", "4"]] }]));
    // rewrite every part the way the Open XML SDK does: x: on every element, rels with absolute targets
    const parts = [...readZipEntries(plain).entries()].map(([name, e]) => {
      let xml = readPart(plain, e);
      if (name.endsWith(".rels")) xml = xml.replace(/Target="worksheets/g, 'Target="/xl/worksheets');
      else xml = `\uFEFF<?xml version="1.0" encoding="utf-8"?>` + xml.replace(/<(\/?)(?![?!])/g, "<$1x:").replace(/<x:(\w+)/, '<x:$1 xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
      return { name, data: xml };
    });
    const prefixed = zip(parts);
    assert.match(Buffer.from(prefixed).toString("latin1"), /PK/);
    assert.deepEqual(extract("bank.xlsx", prefixed).table, [["Question Text", "Grade"], ["Q1 & more", "4"]]);
  });

  test("the downloadable templates: header, example rows that are never imported, curriculum sheet", () => {
    const book = Buffer.from(templateXlsx(IDX));
    const q = readXlsx(book, { sheet: "Questions" });
    assert.deepEqual(q[0], [...TEMPLATE_HEADERS]);
    assert.equal(readXlsx(book)[0][0], "Question Text", "Questions is the first sheet");
    const parsed = parseTemplateTable(q);
    assert.ok(parsed.ok && parsed.rows.length === exampleRows(IDX).length);
    for (const r of parsed.ok ? parsed.rows : []) assert.match(readRow(r.cells).errors.join(), /example row/);
    const cur = readXlsx(book, { sheet: "Curriculum" });
    assert.deepEqual(cur[0].slice(0, 4), ["Grade", "Skill Code", "Skill Name", "Standards (use one of these)"]);
    assert.deepEqual(curriculumRows(IDX).find((r) => r[1] === "G4.authors-purpose"), ["4", "G4.authors-purpose", "Author’s Purpose", "RI.4.8, RL.4.1"]);
    assert.ok(readXlsx(book, { sheet: "Instructions" }).some((r) => r.join(" ").includes("One question per row.")));
    const csv = extract("t.csv", enc(templateCsv(IDX))).table;
    assert.deepEqual(csv[0], [...TEMPLATE_HEADERS]);
    // the examples are valid questions once the marker is removed
    for (const r of parsed.ok ? parsed.rows : []) {
      const rr = readRow({ ...r.cells, stem: r.cells.stem!.replace(`${EXAMPLE_MARK} `, "") });
      assert.deepEqual(rr.errors, [], r.cells.stem);
      assert.deepEqual(matchCurriculum(IDX, rr.grade, r.cells.skill!, r.cells.standard!).errors, []);
    }
  });

  test("no AI anywhere in the importer", () => {
    for (const f of ["src/server/admin/question-import.ts", "src/imports/questions/template.ts", "src/imports/questions/extract.ts", "src/app/api/question-imports/route.ts"]) {
      assert.doesNotMatch(readFileSync(join(ROOT, f), "utf8"), /server\/ai\/|aiProvider|anthropic|gemini/i, f);
    }
  });
});

// ================================================================ database: end to end

/** A repo that fails to insert questions whose text contains "BOOM" (to test chunk recovery). */
class FlakyRepo implements Repo {
  constructor(private readonly inner: Repo) {}
  upsert(m: string, w: Record<string, unknown>, c: Row, u?: Row) { return this.inner.upsert(m, w, c, u); }
  create(m: string, d: Row) { return this.inner.create(m, d); }
  createMany(m: string, rows: Row[]) {
    if (m === "Question" && rows.some((r) => String(r.stem).includes("BOOM"))) return Promise.reject(new Error("Deadlock found when trying to get lock"));
    return this.inner.createMany(m, rows);
  }
  findUnique(m: string, w: Record<string, unknown>) { return this.inner.findUnique(m, w); }
  findMany(m: string, w?: Where) { return this.inner.findMany(m, w); }
  count(m: string, w?: Where) { return this.inner.count(m, w); }
  updateMany(m: string, w: Where, d: Row) { return this.inner.updateMany(m, w, d); }
  deleteMany(m: string, w: Where) { return this.inner.deleteMany(m, w); }
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> { return this.inner.transaction((tx) => fn(new FlakyRepo(tx))); }
}

async function commitAll(repo: Repo, actor: Actor, jobId: string, publish = false): Promise<{ last: CommitProgress; calls: number }> {
  let last: CommitProgress;
  let calls = 0;
  do {
    last = await commitImportChunk(repo, actor, jobId, { publish });
    calls++;
  } while (!last.done && calls < 1000);
  return { last, calls };
}

describe("question import: upload, preview and import (database)", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor;
  let idx: CurriculumIndex;
  let theme: { id: string; name: string; std: string };
  let unlinked: string;
  let existing: RowSpec;

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    idx = await loadCurriculumIndex(repo, admin);
    const g4 = idx.grades.get(4)!;
    const t = g4.find((s) => s.code === "G4.theme")!;
    theme = { id: t.id, name: t.name, std: shortStandard(t.standards.find((s) => s.isPrimary)!.code) };
    const o = g4.find((s) => s.standards.length && s.id !== t.id && !s.standards.some((x) => t.standards.some((y) => y.code === x.code)))!;
    unlinked = shortStandard(o.standards[0].code);
    // an existing published multiple-choice question of the theme skill, written out as a template row
    const qs = await repo.findMany("Question", { skillId: theme.id, status: "PUBLISHED" });
    let q: Row | undefined, opts: Row[] = [];
    for (const c of qs) {
      opts = (await repo.findMany("QuestionOption", { questionId: c.id })).sort((a, b) => Number(a.order) - Number(b.order));
      if (opts.length === 4 && opts.filter((x) => x.isCorrect).length === 1) { q = c; break; }
    }
    assert.ok(q, "a published 4-option question exists");
    existing = { ...MC, "Question Text": String(q!.stem), Skill: theme.name, Standard: theme.std, "Option A": String(opts[0].text), "Option B": String(opts[1].text), "Option C": String(opts[2].text), "Option D": String(opts[3].text), "Correct Answer": "ABCD"[opts.findIndex((x) => x.isCorrect)] };
  });

  const T = (r: RowSpec): RowSpec => ({ ...MC, Skill: theme.name, Standard: theme.std, ...r });

  test("small CSV: valid rows, curriculum errors with exact reasons, duplicates; nothing saved before confirming", async () => {
    const before = await repo.count("Question", {});
    const passage = "Lina found a lost kite in the park. She asked everyone nearby, and finally returned it to its owner, a little boy named Sami.";
    const rows: RowSpec[] = [
      T({ "Question Text": "Which sentence best states the theme of “The Lost Kite”?" }),                       // 2 valid
      T({ "Question Text": "Which detail shows the theme of the kite story?", Skill: "Theme Parks" }),           // 3 unknown skill
      T({ "Question Text": "Which detail supports the theme of the kite story?", Standard: "RL.9.9" }),          // 4 unknown standard
      T({ "Question Text": "Which event teaches the lesson of the kite story?", Standard: unlinked }),            // 5 not linked
      T({ "Question Text": "What does the hero of the kite story learn?", Grade: "9" }),                         // 6 grade not on platform
      existing,                                                                                                  // 7 exact duplicate of the bank
      T({ "Question Text": "Which sentence best states the theme of “The Lost Kite”" }),                         // 8 repeat of row 2
      T({ "Question Text": "Read the text. What is the theme?", "Passage/Text": passage }),                      // 9 passage
      T({ "Question Text": "Read the text again. Why did Lina return the kite?", "Option A": "She was kind", "Option B": "It was broken", "Option C": "It was ugly", "Option D": "Her mom said so", "Passage/Text": passage }), // 10 same passage
      T({ ...NO_OPTS, "Question Text": "The kite was ____ in the tree.", "Question Type": "Fill in the Blank", "Correct Answer": "stuck | caught", "Cognitive Level": "" }), // 11
    ];
    const jobId = await analyzeImport(repo, teacher, { fileName: "unit3.csv", bytes: csvOf(rows) });
    assert.equal(await repo.count("Question", {}), before, "the preview adds nothing to the bank");
    const job = await getImportJob(repo, teacher, jobId);
    assert.deepEqual(job.totals, { total: 10, valid: 4, invalid: 4, duplicates: 2 });
    const byRow = new Map(job.rows.map((r) => [r.rowNumber, r]));
    assert.equal(byRow.get(2)!.status, "VALID");
    assert.equal(byRow.get(2)!.detected.meta.skillName, theme.name);
    assert.equal(byRow.get(2)!.detected.meta.standardCode, theme.std);
    assert.match(byRow.get(3)!.errors.join(), /Skill “Theme Parks” was not found in Grade 4/);
    assert.match(byRow.get(4)!.errors.join(), /Standard “RL\.9\.9” does not exist on the platform/);
    assert.match(byRow.get(5)!.errors.join(), new RegExp(`Standard ${unlinked.replace(/\./g, "\\.")} is not linked to skill “${theme.name}”`));
    assert.match(byRow.get(6)!.errors.join(), /Grade 9 does not exist on the platform\. Available grades: 4, 5, 6\./);
    const dup = byRow.get(7)!;
    assert.deepEqual([dup.status, dup.decision, dup.duplicate?.exact], ["DUPLICATE", "SKIP", true]);
    assert.match(dup.warnings.join(), /This question already exists/);
    assert.equal(byRow.get(8)!.status, "DUPLICATE");
    assert.match(byRow.get(8)!.warnings.join(), /row 2 in this file/);
    assert.ok(byRow.get(8)!.inFileDuplicate);
    for (const n of [3, 4, 5, 6]) assert.equal(byRow.get(n)!.selected, false);
    assert.equal((await loadCurriculumIndex(repo, admin)).grades.get(4)!.length, idx.grades.get(4)!.length, "no skill was created");
    const problems = await importProblemRows(repo, teacher, jobId);
    assert.ok(problems.some((r) => r[0] === "3" && /Theme Parks/.test(r[3])), "problems CSV gives the spreadsheet row");

    // decisions: import the in-file repeat anyway, keep skipping the bank duplicate
    await updateImportRow(repo, teacher, jobId, byRow.get(8)!.id, { decision: "FORCE", selected: true });
    await assert.rejects(updateImportRow(repo, teacher, jobId, byRow.get(3)!.id, { selected: true }), /Fix the errors/);
    // fix row 3 in the preview by choosing the right skill
    const fixed = await updateImportRow(repo, teacher, jobId, byRow.get(3)!.id, { input: { ...byRow.get(3)!.detected.input!, skillId: theme.id, standardCode: `CCSS.ELA-LITERACY.${theme.std}` } });
    assert.deepEqual([fixed.status, fixed.selected, fixed.errors], ["VALID", true, []]);

    await assert.rejects(commitImportChunk(repo, teacher, jobId, { publish: true }), ForbiddenError, "teachers cannot approve on import");
    const { last } = await commitAll(repo, teacher, jobId);
    assert.equal(last.counts.imported, 6);
    assert.equal(last.counts.skipped, 1);
    assert.equal(last.counts.failed, 3);
    assert.equal(await repo.count("Question", {}), before + 6);

    const done = await getImportJob(repo, teacher, jobId);
    assert.equal(done.status, "COMPLETED");
    assert.ok(done.errors.some((e) => /^Row 4: /.test(e)), "failed rows are kept in the job's error list with their row number");
    const q2 = (await repo.findUnique("Question", { id: done.rows.find((r) => r.rowNumber === 2)!.questionId! }))!;
    assert.deepEqual([q2.skillId, q2.status, q2.origin, q2.difficultyLevel], [theme.id, "UNDER_REVIEW", "IMPORTED", 4]);   // a teacher's import waits for an admin straight away
    assert.equal(shortStandard(String((await repo.findUnique("Standard", { id: q2.standardId }))!.code)), theme.std);
    assert.equal((q2.tags as { cognitiveLevel?: string }).cognitiveLevel, "Understand");
    assert.equal((q2.tags as { importJob?: string }).importJob, jobId);
    const options = (await repo.findMany("QuestionOption", { questionId: q2.id })).sort((a, b) => Number(a.order) - Number(b.order));
    assert.deepEqual(options.map((o) => [o.label, o.isCorrect]), [["A", true], ["B", false], ["C", false], ["D", false]]);
    assert.ok(options.every((o) => o.isCorrect || String(o.rationale ?? "").length > 0), "wrong choices get feedback, as the bank requires");
    assert.equal((await repo.findMany("QuestionExplanation", { questionId: q2.id }))[0]?.kind, "WHY_CORRECT");
    const fill = (await repo.findUnique("Question", { id: done.rows.find((r) => r.rowNumber === 11)!.questionId! }))!;
    assert.deepEqual((await repo.findMany("QuestionAnswer", { questionId: fill.id })).map((a) => a.value), ["stuck", "caught"]);
    // the two rows with the same passage share one reading passage
    const p9 = (await repo.findUnique("Question", { id: done.rows.find((r) => r.rowNumber === 9)!.questionId! }))!;
    const p10 = (await repo.findUnique("Question", { id: done.rows.find((r) => r.rowNumber === 10)!.questionId! }))!;
    assert.ok(p9.passageId && p9.passageId === p10.passageId);
    const pass = (await repo.findUnique("ReadingPassage", { id: p9.passageId as string }))!;
    assert.deepEqual([pass.origin, pass.body], ["IMPORTED", passage]);
    const hist = (await listImportJobs(repo, teacher)).find((j) => j.id === jobId)!;
    assert.deepEqual(hist.summary, { imported: 6, replaced: 0, skipped: 1, failed: 3 });
    await assert.rejects(commitImportChunk(repo, teacher, jobId), /already finished/);
  });

  test("files that cannot be imported are refused with every reason and kept in the history as FAILED", async () => {
    const headers = TEMPLATE_HEADERS.filter((h) => h !== "Correct Answer" && h !== "Standard");
    const err = await analyzeImport(repo, teacher, { fileName: "no-answers.csv", bytes: csvOf([T({})], headers) }).catch((e) => e);
    assert.ok(err instanceof ImportFileError && err instanceof ValidationError, String(err));
    assert.deepEqual(err.details, ["Missing required column: Correct Answer", "Missing required column: Standard"]);
    assert.ok(err.jobId);
    const failed = await getImportJob(repo, teacher, err.jobId!);
    assert.deepEqual([failed.status, failed.errors], ["FAILED", ["Missing required column: Correct Answer", "Missing required column: Standard"]]);
    await assert.rejects(commitImportChunk(repo, teacher, err.jobId!), /could not be read/);

    const word = zip([{ name: "word/document.xml", data: "<w:document/>" }]);
    const w = await analyzeImport(repo, teacher, { fileName: "bank.docx", bytes: word }).catch((e) => e);
    assert.match(w.message, /Word files cannot be imported/);
    const empty = await analyzeImport(repo, teacher, { fileName: "empty.csv", bytes: csvOf([]) }).catch((e) => e);
    assert.match(empty.message, /header row but no questions/);
    const hist = await listImportJobs(repo, teacher);
    assert.ok(["no-answers.csv", "bank.docx", "empty.csv"].every((f) => hist.some((j) => j.fileName === f && j.status === "FAILED" && j.errors.length)));
  });

  test("admins can approve on import; cancelled imports add nothing; other schools cannot see an import", async () => {
    const book = xlsx([{ name: "Questions", rows: [[...TEMPLATE_HEADERS],
      asRow(T({ "Question Text": "Which title fits a story about sharing toys?", "Option A": "Sharing Is Caring", "Option B": "Fast Cars", "Option C": "Rainy Days", "Option D": "Big Cities" })),
      asRow(T({ ...NO_OPTS, "Question Text": "Explain the theme in your own words.", "Question Type": "Short Answer", "Correct Answer": "Sharing makes friends." }))] }]);
    const jobId = await analyzeImport(repo, admin, { fileName: "approve.xlsx", bytes: book });
    await commitAll(repo, admin, jobId, true);
    const rows = (await getImportJob(repo, admin, jobId)).rows;
    const [mc, sa] = await Promise.all(rows.map((r) => repo.findUnique("Question", { id: r.questionId! })));
    assert.deepEqual([mc!.status, mc!.reviewedById], ["PUBLISHED", admin.userId]);
    assert.equal(sa!.status, "DRAFT", "short answers stay drafts");
    assert.deepEqual((await repo.findMany("QuestionAnswer", { questionId: sa!.id })).map((a) => a.value), ["Sharing makes friends."]);

    const before = await repo.count("Question", {});
    const c = await analyzeImport(repo, admin, { fileName: "cancel.csv", bytes: csvOf([T({ "Question Text": "Which lesson does the fable teach about patience?" })]) });
    await cancelImport(repo, admin, c);
    assert.equal((await getImportJob(repo, admin, c)).status, "CANCELLED");
    await assert.rejects(commitImportChunk(repo, admin, c), /already finished/);
    assert.equal(await repo.count("Question", {}), before);

    const stranger: Actor = { ...admin, schoolId: "another-school" };
    await assert.rejects(getImportJob(repo, stranger, jobId), ForbiddenError);
    assert.ok(!(await listImportJobs(repo, stranger)).some((j) => j.id === jobId));
  });

  test("checkInput: the preview editor gets the same curriculum rules as the file", () => {
    const input = { skillId: theme.id, type: "MULTIPLE_CHOICE" as const, stem: "Q?", level: 4, whyCorrect: "Because.", standardCode: unlinked, options: [{ label: "A", text: "a", correct: true, rationale: null }, { label: "B", text: "b", correct: false, rationale: "no" }] };
    assert.match(checkInput(idx, input).join(), /is not linked to skill/);
    assert.deepEqual(checkInput(idx, { ...input, standardCode: theme.std }), []);
    assert.deepEqual(checkInput(idx, { ...input, skillId: "nope" }), ["Choose a skill that exists on the platform."]);
    assert.deepEqual(checkInput(idx, { ...input, standardCode: theme.std, options: [{ ...input.options[0], correct: false, rationale: "no" }, input.options[1]] }), ["No correct answer is marked."]);
  });

  test("a database error in one question does not stop the others; it is recorded on its row", async () => {
    const flaky = new FlakyRepo(repo);
    const topics = ["a fox and a crow", "a lion and a mouse", "BOOM the ant and the grasshopper", "the tortoise and the hare", "the boy who cried wolf"];
    const rows = topics.map((t, n) => T({ "Question Text": `In the fable about ${t}, what lesson is taught?`, "Option A": `lesson ${n} kindness`, "Option B": `lesson ${n} speed`, "Option C": `lesson ${n} money`, "Option D": `lesson ${n} noise` }));
    const jobId = await analyzeImport(flaky, teacher, { fileName: "flaky.csv", bytes: csvOf(rows) });
    const { last } = await commitAll(flaky, teacher, jobId);
    assert.deepEqual([last.counts.imported, last.counts.failed], [4, 1]);
    const job = await getImportJob(repo, teacher, jobId);
    const boom = job.rows.find((r) => r.rowNumber === 4)!;
    assert.equal(boom.status, "FAILED");
    assert.match(boom.errors.join(), /^Database error: Deadlock/);
    assert.equal(await repo.count("Question", { stem: rows[2]["Question Text"] }), 0, "the failed question was rolled back completely");
    assert.match(job.errors.join(), /Row 4: Database error/);
  });

  test("large Excel file: 2,000 questions across grades, skills and standards, imported in batches", async () => {
    const all = [...idx.grades.entries()].flatMap(([g, skills]) => skills.filter((s) => s.standards.length).map((s) => ({ g, s })));
    const types = ["Multiple Choice", "Multi Select", "True/False", "Fill in the Blank"];
    const words = ["river", "garden", "castle", "planet", "forest", "harbor", "desert", "valley", "island", "market", "tower", "meadow"];
    const rows: string[][] = [[...TEMPLATE_HEADERS]];
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const { g, s } = all[i % all.length];
      const type = types[i % types.length];
      const w = (k: number) => `${words[(i + k) % words.length]}${i}x${k}`;
      rows.push(asRow({
        "Question Text": type === "Fill in the Blank" ? `In story ${i}, the ${w(1)} was ____ by the ${w(2)}.` : `Item ${i}: what does the ${w(1)} near the ${w(2)} show about the ${w(3)}?`,
        "Question Type": type,
        ...(type === "Multiple Choice" || type === "Multi Select" ? { "Option A": w(4), "Option B": w(5), "Option C": w(6), "Option D": w(7) } : {}),
        "Correct Answer": type === "Multiple Choice" ? "ABCD"[i % 4] : type === "Multi Select" ? "A, C" : type === "True/False" ? (i % 2 ? "True" : "False") : `${w(8)} | ${w(9)}`,
        Explanation: `Because of clue ${i}.`, Grade: String(g), Skill: i % 2 ? s.name : s.code, Standard: i % 3 ? shortStandard(s.standards[0].code) : s.standards[0].code,
        "Difficulty Level": String((i % 7) + 1), "Cognitive Level": ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create", ""][i % 7],
      }));
    }
    const file = xlsx([{ name: "Questions", rows }]);
    const before = await repo.count("Question", {});
    let t = Date.now();
    const jobId = await analyzeImport(repo, admin, { fileName: "big.xlsx", bytes: file });
    const analyzeMs = Date.now() - t;
    const job = await getImportJob(repo, admin, jobId);
    const notValid = job.rows.filter((r) => r.status !== "VALID");
    assert.deepEqual(notValid.slice(0, 3).map((r) => [r.rowNumber, r.status, r.errors, r.warnings]), []);
    t = Date.now();
    const { last, calls } = await commitAll(repo, admin, jobId);
    const commitMs = Date.now() - t;
    assert.equal(last.counts.imported, N);
    assert.equal(calls, N / 100, "100 questions per request (progress bar steps)");
    assert.equal(await repo.count("Question", {}), before + N);
    const done = await getImportJob(repo, admin, jobId);
    for (const k of [0, 777, 1999]) {
      const { g, s } = all[k % all.length];
      const q = (await repo.findUnique("Question", { id: done.rows[k].questionId! }))!;
      assert.equal(q.skillId, s.id);
      assert.equal(q.difficultyLevel, (k % 7) + 1);
      assert.equal(done.rows[k].detected.meta.grade, g);
    }
    console.log(`  large import: ${N} questions, analyze ${analyzeMs} ms, import ${commitMs} ms (${calls} batches)`);
    assert.ok(analyzeMs < 60_000 && commitMs < 120_000, `analyze ${analyzeMs} ms, import ${commitMs} ms`);
  });
});
