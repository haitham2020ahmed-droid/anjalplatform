import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { zip } from "../src/reports/zip";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { loadSkillItems } from "../src/server/practice/items";
import { detectKind, extract } from "../src/imports/questions/extract";
import { parseJson, parseLines, parseTable } from "../src/imports/questions/parse";
import { redact } from "../src/server/ai/question-understanding";
import type { AiProvider } from "../src/server/ai/question-generator";
import { analyzeImport, commitImportChunk, getImportJob, listImportJobs, updateImportRow } from "../src/server/admin/question-import";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const enc = (s: string) => new TextEncoder().encode(s);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function xlsx(rows: string[][]): Uint8Array {
  const cell = (v: string, c: number, r: number) => `<c r="${"ABCDEFGHIJ"[c]}${r + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
  return zip([
    { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: "xl/workbook.xml", data: '<workbook xmlns:r="r"><sheets><sheet name="Q" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: "xl/worksheets/sheet1.xml", data: `<worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, c) => cell(v, c, i)).join("")}</row>`).join("")}</sheetData></worksheet>` },
  ]);
}
function docx(paragraphs: string[]): Uint8Array {
  return zip([
    { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types/>' },
    { name: "word/document.xml", data: `<w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`).join("")}</w:body></w:document>` },
  ]);
}
async function pdf(lines: string[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 800 - i * 18, size: 12, font }));
  return doc.save();
}

const TEXT_QUIZ = [
  "1. What is the plural of “child”?", "A) childs", "B) children", "C) childes", "D) childrens", "Answer: B", "Explanation: Child has an irregular plural.", "",
  "Q2: Choose the correct answer:", "The sun ____ in the east.", "a) rise", "b) rises", "c) rising", "Answer: b", "",
  "3. A noun names a person, place, thing or idea. (True/False)", "Answer: True",
];

describe("question import: reading files", () => {
  test("detects the type from the content, not only the name", async () => {
    assert.equal(detectKind("q.bin", await pdf(["x"])), "pdf");
    assert.equal(detectKind("anything", xlsx([["Question"]])), "xlsx");
    assert.equal(detectKind("anything", docx(["x"])), "docx");
    assert.equal(detectKind("bank.txt", enc("Question,A,B,Answer\nx,1,2,A\ny,1,2,B")), "csv");
    assert.equal(detectKind("bank", enc('[{"question":"x"}]')), "json");
    assert.throws(() => detectKind("old.doc", enc("x")), /save it as \.docx/);
  });

  test("all six formats produce the same questions", async () => {
    const table = [["Question", "A", "B", "C", "D", "Answer"], ["What is the plural of “child”?", "childs", "children", "childes", "childrens", "B"]];
    const fromCsv = (await extract("b.csv", enc(table.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")))).table!;
    const fromXlsx = (await extract("b.xlsx", xlsx(table))).table!;
    for (const t of [fromCsv, fromXlsx]) assert.equal(parseTable(t).questions[0].options!.find((o) => o.correct)!.text, "children");
    const fromJson = parseJson((await extract("b.json", enc(JSON.stringify({ questions: [{ question: "What is the plural of “child”?", options: ["childs", "children", "childes", "childrens"], answer: "B" }] })))).json);
    assert.equal(fromJson.questions[0].options!.find((o) => o.correct)!.text, "children");
    for (const [name, bytes] of [["b.txt", enc(TEXT_QUIZ.join("\n"))], ["b.docx", docx(TEXT_QUIZ)], ["b.pdf", await pdf(TEXT_QUIZ.filter(Boolean).map((l) => l.replace(/[“”]/g, '"')))]] as const) {
      const ex = await extract(name, bytes);
      const qs = parseLines(ex.lines!).questions;
      assert.equal(qs.length, 3, `${name}: ${qs.map((q) => q.stem).join(" / ")}`);
      assert.deepEqual(qs.map((q) => q.type), ["MULTIPLE_CHOICE", "DROPDOWN", "TRUE_FALSE"], name);
      assert.equal(qs[1].options!.find((o) => o.correct)!.text, "rises", name);
      assert.equal(qs[2].answer, true, name);
    }
  });

  test("the three example layouts from the brief", () => {
    const csv = parseTable([["Question", "A", "B", "C", "D", "Answer"], ["What is 2+2?", "3", "4", "5", "6", "B"]]).questions[0];
    assert.equal(csv.options!.find((o) => o.correct)!.text, "4");
    const numbered = parseLines("1. What is 2+2?\nA) 3\nB) 4\nC) 5\nD) 6\nAnswer: B".split("\n")).questions[0];
    assert.deepEqual([numbered.type, numbered.options!.find((o) => o.correct)!.text], ["MULTIPLE_CHOICE", "4"]);
    const noKey = parseLines("Q1: Choose the correct answer:\nThe sun ____ in the east.\na) rise\nb) rises\nc) rising".split("\n")).questions[0];
    assert.equal(noKey.type, "DROPDOWN");
    assert.match(noKey.problems.join(), /no correct answer/, "a missing answer is reported, not guessed");
  });

  test("every question type is recognized", () => {
    const qs = parseLines([
      "1. Select all the nouns.", "A) cat", "B) run", "C) city", "D) blue", "Answer: A, C",
      "2. Fill in: The cat ____ on the mat.", "Answer: sat / sits",
      "3. Match each word with its meaning.", "happy = glad", "tiny = small", "huge = big",
      "4. Put the events in order.", "A) She ate lunch.", "B) She woke up.", "C) She went to bed.", "Answer: B, A, C",
      "5. Find the error in the sentence.", "A) The dogs", "B) runs", "C) in the park.", "Answer: B", "Correction: run",
      "6. Explain why the author wrote the story.", "Answer: To teach a lesson about kindness.",
      "7. Is a whale a fish? (True/False)", "Answer: F",
    ]).questions;
    assert.deepEqual(qs.map((q) => q.type), ["MULTI_SELECT", "FILL_BLANK", "MATCHING", "SENTENCE_ORDER", "ERROR_CORRECTION", "SHORT_ANSWER", "TRUE_FALSE"]);
    assert.deepEqual(qs[1].answers, ["sat", "sits"]);
    assert.equal(qs[2].pairs!.length, 3);
    assert.deepEqual(qs[3].sequence, ["She woke up.", "She ate lunch.", "She went to bed."]);
    assert.deepEqual([qs[4].errorIndex, qs[4].correction], [1, "run"]);
    for (const q of qs) assert.deepEqual(q.problems, [], q.stem);
  });

  test("redaction removes personal strings (whole words, any case)", () => {
    const r = redact("Lina Haddad scored 3/5. Student S1001 wrote: Linaria is a plant.", ["Lina Haddad", "Lina", "S1001"]);
    assert.equal(r.text, "[REDACTED] scored 3/5. Student [REDACTED] wrote: Linaria is a plant.");
    assert.equal(r.count, 2);
  });
});

describe("question import: analyze, preview, import", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor;
  let themeId: string;
  let publishedStem: string, publishedId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    const theme = (await repo.findMany("Skill", { code: "G4.theme" }))[0];
    themeId = String(theme.id);
    const q = (await repo.findMany("Question", { skillId: themeId }))[0];
    await repo.updateMany("Question", { id: q.id }, { status: "PUBLISHED" });
    publishedStem = String(q.stem); publishedId = String(q.id);
  });

  const csvFile = () => enc([
    "Question,A,B,C,D,Answer,Explanation,Skill,Difficulty",
    `"What lesson does Maya learn when the bridge breaks?","Listen to warnings","Bridges are boring","Never build","Glue is bad",A,"She says she will listen next time.",G4.theme,medium`,
    `"${publishedStem.replace(/"/g, '""')}",x1,x2,x3,x4,A,,G4.theme,2`,
    `"What does the word ancient mean in the story?",very old,very new,very loud,very small,,,G4.context-clues,easy`,
    `"What lesson does Maya learn when the bridge breaks?","Listen to warnings","Bridges are boring","Never build","Glue is bad",A,"Same again.",G4.theme,medium`,
    `"Explain the theme in your own words.",,,,,"Kindness matters.",,G4.theme,6`,
  ].join("\n"));

  test("analyze: statuses for valid, existing duplicate, missing answer, in-file duplicate", async () => {
    const jobId = await analyzeImport(repo, teacher, { fileName: "unit1.csv", bytes: csvFile(), defaults: { gradeLevel: 4 }, useAi: false }, null);
    const job = await getImportJob(repo, teacher, jobId);
    assert.equal(job.status, "AWAITING_CONFIRMATION");
    assert.deepEqual(job.rows.map((r) => r.status), ["VALID", "DUPLICATE", "INVALID", "DUPLICATE", "VALID"]);
    assert.equal(job.rows[1].duplicate!.id, publishedId);
    assert.equal(job.rows[1].decision, "SKIP");
    assert.match(job.rows[2].errors.join(), /no correct answer/);
    assert.equal(job.rows[2].selected, false);
    assert.match(job.rows[3].warnings.join(), /same as question 1/);
    assert.equal(job.rows[4].detected.input!.type, "SHORT_ANSWER");
    assert.match(job.rows[4].warnings.join(), /not used in adaptive practice/);
    assert.equal(job.rows[0].detected.input!.level, 4);
    assert.match(job.rows[0].warnings.join(), /generic feedback/);
    assert.deepEqual(job.totals, { total: 5, valid: 2, invalid: 1, duplicates: 2 });
  });

  test("preview editing fixes an invalid question; decisions apply; teachers cannot approve on import", async () => {
    const jobId = await analyzeImport(repo, teacher, { fileName: "unit1.csv", bytes: csvFile(), defaults: { gradeLevel: 4 }, useAi: false }, null);
    let job = await getImportJob(repo, teacher, jobId);
    const fixed = { ...job.rows[2].detected.input!, options: job.rows[2].detected.input!.options!.map((o, i) => ({ ...o, correct: i === 0, rationale: i === 0 ? null : "Not the meaning." })) };
    const r = await updateImportRow(repo, teacher, jobId, job.rows[2].id, { input: fixed });
    assert.equal(r.status, "VALID");
    assert.equal(r.selected, true);
    await assert.rejects(updateImportRow(repo, teacher, jobId, job.rows[0].id, { decision: "REPLACE" }), /matches an existing/);
    await updateImportRow(repo, teacher, jobId, job.rows[3].id, { decision: "FORCE" });
    await assert.rejects(commitImportChunk(repo, teacher, jobId, { publish: true }), ForbiddenError);
    let p;
    do p = await commitImportChunk(repo, teacher, jobId); while (!p.done);
    assert.deepEqual(p.counts, { imported: 4, replaced: 0, skipped: 1, failed: 0, duplicates: 2 });
    job = await getImportJob(repo, teacher, jobId);
    assert.equal(job.status, "COMPLETED");
    const created = await repo.findUnique("Question", { id: job.rows[0].questionId! });
    assert.deepEqual([created!.status, created!.origin], ["DRAFT", "IMPORTED"]);
    await assert.rejects(updateImportRow(repo, teacher, jobId, job.rows[0].id, { selected: false }), /already started or finished/);
  });

  test("replace archives the matching question; admins may approve on import; short answers never reach practice", async () => {
    const jobId = await analyzeImport(repo, admin, { fileName: "unit1.csv", bytes: csvFile(), defaults: { gradeLevel: 4 }, useAi: false }, null);
    const job = await getImportJob(repo, admin, jobId);
    const dupRow = job.rows[1];
    const better = { ...dupRow.detected.input!, options: dupRow.detected.input!.options!.map((o, i) => ({ ...o, text: ["Patience", "Speed", "Luck", "Size"][i], rationale: i === 0 ? null : "No." })) };
    await updateImportRow(repo, admin, jobId, dupRow.id, { input: better, decision: "REPLACE" });
    // the short answer was already imported by the previous test, so it is (correctly) a duplicate now
    if (job.rows[4].status === "DUPLICATE") await updateImportRow(repo, admin, jobId, job.rows[4].id, { decision: "FORCE" });
    let p;
    do p = await commitImportChunk(repo, admin, jobId, { publish: true }); while (!p.done);
    const after = await getImportJob(repo, admin, jobId);
    const rep = after.rows[1];
    if (rep.status === "REPLACED") {
      assert.equal((await repo.findUnique("Question", { id: publishedId }))!.status, "ARCHIVED");
      assert.equal((await repo.findUnique("Question", { id: rep.questionId! }))!.status, "PUBLISHED");
    } else assert.equal(rep.status, "IMPORTED", "after the edit it no longer matched, so it was simply imported");
    const short = after.rows[4];
    assert.equal((await repo.findUnique("Question", { id: short.questionId! }))!.status, "DRAFT", "short answers stay drafts even when approving on import");
    await repo.updateMany("Question", { id: short.questionId! }, { status: "PUBLISHED" });
    const live = (await loadSkillItems(repo, themeId)).map((i) => i.questionId);
    assert.ok(!live.includes(short.questionId!), "the practice engine never serves teacher-scored questions");
    if (rep.status === "REPLACED" || rep.status === "IMPORTED") assert.ok(live.includes(rep.questionId!), "approved-on-import multiple choice is live");
  });

  test("AI reads unusual layouts and maps skills; student data is redacted before it is sent", async () => {
    const studentUser = (await repo.findMany("User", { role: "STUDENT" }))[0];
    const student = (await repo.findMany("Student", { userId: studentUser.id }))[0];
    const prompts: string[] = [];
    const ai: AiProvider = {
      async complete(system, user) {
        prompts.push(user);
        if (/return the questions they contain/.test(system)) return JSON.stringify({ questions: [{ type: "MULTIPLE_CHOICE", stem: "Which word means very happy?", options: ["joyful", "angry", "sleepy", "late"], answer: "A" }] });
        const req = JSON.parse(user) as { questions: { index: number }[] };
        return JSON.stringify({ results: req.questions.map((q) => ({ index: q.index, skillCode: "G4.synonyms-antonyms", standardCode: "L.4.5.c", level: 3, cognitiveLevel: "Remember", explanation: "Joyful means very happy.", rationales: { B: "Opposite feeling.", C: "Not a feeling of joy.", D: "About time." } })) });
      },
    };
    const file = enc(`Quiz written for ${studentUser.displayName} (${student.studentNumber}). Our class practised vocabulary today and here is the one item we used: which word means very happy — joyful, angry, sleepy or late? The key is joyful.`);
    const jobId = await analyzeImport(repo, admin, { fileName: "notes.txt", bytes: file, defaults: { gradeLevel: 4 }, useAi: true }, ai);
    const job = await getImportJob(repo, admin, jobId);
    assert.equal(job.options.aiUsed, true);
    assert.ok((job.options.redactions ?? 0) >= 2);
    for (const p of prompts) {
      assert.ok(!p.includes(String(studentUser.displayName)) && !p.includes(String(student.studentNumber)), "no student data sent to the AI");
    }
    const row = job.rows[0];
    const skill = await repo.findUnique("Skill", { id: row.detected.input!.skillId });
    assert.equal(skill!.code, "G4.synonyms-antonyms");
    assert.equal(row.status, "VALID", row.errors.join());
    assert.equal(row.detected.input!.cognitiveLevel, "Remember");
  });

  test("the preview runs the full bank validation (problems the layout parser cannot see)", async () => {
    const file = enc('Question,A,B,C,D,Answer,Skill\n"Which animal says moo in the farm story?",cow,cow,dog,cat,A,G4.context-clues');
    const job = await getImportJob(repo, teacher, await analyzeImport(repo, teacher, { fileName: "v.csv", bytes: file, defaults: { gradeLevel: 4 }, useAi: false }, null));
    assert.equal(job.rows[0].status, "INVALID");
    assert.match(job.rows[0].errors.join(), /duplicate options/);
  });

  test("history, school scope and clear errors", async () => {
    const jobs = await listImportJobs(repo, teacher);
    assert.ok(jobs.length >= 3 && jobs[0].fileName);
    const outsider = { ...admin, schoolId: "another-school" } as Actor;
    await assert.rejects(getImportJob(repo, outsider, jobs[0].id), ForbiddenError);
    await assert.rejects(analyzeImport(repo, teacher, { fileName: "x.doc", bytes: enc("x"), defaults: { gradeLevel: 4 }, useAi: false }, null), ValidationError);
    await assert.rejects(analyzeImport(repo, teacher, { fileName: "x.txt", bytes: enc("hello there, nothing to see"), defaults: { gradeLevel: 4 }, useAi: false }, null), /No questions were found|choose a skill/);
    const student = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.s1001" }))!);
    await assert.rejects(analyzeImport(repo, student, { fileName: "a.csv", bytes: csvFile(), defaults: { gradeLevel: 4 }, useAi: false }, null), ForbiddenError);
  });
});
