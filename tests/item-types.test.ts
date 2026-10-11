/**
 * Newer item types: TWO_PART (Part A / Part B evidence), GRID (table match), HOT_TEXT (select sentences), and the
 * upgraded ERROR_CORRECTION (several errors, “No error”, typed fix) — scoring, validation, import, editor, practice.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { toCsv } from "../src/imports/csv";
import { answerValues, contentPayload, fixMatches, scoreResponse, validateItem, type BankItem, type BankPassage } from "../src/imports/questions/validate";
import { parseTemplateTable, readRow, TEMPLATE_HEADERS } from "../src/imports/questions/template";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { analyzeImport, commitImportChunk, getImportJob } from "../src/server/admin/question-import";
import { createDraft, getQuestion, updateDraft, type EditorInput } from "../src/server/admin/questions";
import { attemptMisconception, correctAnswerText, loadQuestionItems, loadSkillItems, studentAnswerText, toClientQuestion, whyChosenWrong, type PracticeItem } from "../src/server/practice/items";
import { normalizeResponse, startPractice, submitAnswer } from "../src/server/practice/session";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions, withNewTypeSamples } from "../src/server/seeding/questions";
import { demoDatabase, ROOT, seededRandom } from "./helpers/db";

const samples = JSON.parse(readFileSync(join(ROOT, "data/questions/new-types-samples.json"), "utf8")) as { passages: BankPassage[]; items: BankItem[] };
const bank = loadBank(ROOT);
const byRef = (ref: string) => structuredClone(samples.items.find((i) => i.ref === ref)!);
const TP = () => byRef("NT-G4-theme-TP1");
const TP2 = () => byRef("NT-G5-inference-TP1");
const GR = () => byRef("NT-G5-verb-tenses-GR1");
const HT1 = () => byRef("NT-G4-text-evidence-HT1");
const HT2 = () => byRef("NT-G5-character-HT1");
const EC = () => byRef("NT-G4-capitalization-EC1");
const ctx = {
  skillKeys: new Set([...bank.items, ...samples.items].map((i) => i.skillKey)),
  standards: new Set([...bank.items, ...samples.items].map((i) => i.standard)),
  passages: new Set([...bank.passages, ...samples.passages].map((p) => p.id)),
};
const msgs = (it: BankItem) => validateItem(it, ctx).map((i) => i.message);

describe("the sample file", () => {
  test("14 original items of the new types, all valid, on skills and standards that exist", () => {
    const n = (t: string) => samples.items.filter((i) => i.type === t).length;
    assert.deepEqual([n("TWO_PART"), n("GRID"), n("HOT_TEXT"), n("ERROR_CORRECTION")], [4, 4, 4, 2]);
    for (const it of samples.items) assert.deepEqual(msgs(it), [], it.ref);
    for (const p of samples.passages) { const w = p.text.split(/\s+/).length; assert.ok(w >= 100 && w <= 150, `${p.id}: ${w} words`); }
    // Part B evidence is quoted from the passage
    for (const it of samples.items.filter((i) => i.type === "TWO_PART")) {
      const text = samples.passages.find((p) => p.id === it.passage)!.text.replace(/\s+/g, " ");
      for (const o of it.twoPart!.partB.options) assert.ok(text.includes(o.text.replace(/^“|”$/g, "").replace(/\\"/g, "\"").slice(0, 25)), `${it.ref} ${o.label}`);
    }
    const merged = withNewTypeSamples(ROOT, bank);
    assert.equal(merged.items.length, bank.items.length + samples.items.length);
    assert.equal(withNewTypeSamples(ROOT, merged).items.length, merged.items.length, "never added twice");
    assert.equal(withNewTypeSamples("/nonexistent", bank), bank, "no file, no change");
  });
});

describe("scoring", () => {
  test("TWO_PART: half a point per part; right answer + wrong evidence is EVIDENCE_MISMATCH", () => {
    const it = TP();
    assert.equal(scoreResponse(it, { a: "A", b: "C" }), 1);
    assert.equal(scoreResponse(it, { a: "A", b: "B" }), 0.5);
    assert.equal(attemptMisconception(it, { a: "A", b: "B" }), "EVIDENCE_MISMATCH");
    assert.equal(scoreResponse(it, { a: "B", b: "C" }), 0.5, "each part is scored on its own");
    assert.equal(attemptMisconception(it, { a: "B", b: "C" }), "EVENT_NOT_THEME", "a wrong Part A gives its option's misconception");
    assert.equal(scoreResponse(it, { a: "D", b: "A" }), 0);
    assert.equal(scoreResponse(it, null), 0);
    assert.equal(attemptMisconception(it, { a: "A", b: "C" }), null);
    // Part B “choose two”: partial credit inside Part B, any wrong sentence removes it
    const two = TP2();
    assert.equal(scoreResponse(two, { a: "A", b: ["B", "C"] }), 1);
    assert.equal(scoreResponse(two, { a: "A", b: ["B"] }), 0.75);
    assert.equal(scoreResponse(two, { a: "A", b: ["B", "C", "D"] }), 0.5);
    assert.equal(attemptMisconception(two, { a: "A", b: ["B"] }), "EVIDENCE_MISMATCH");
  });

  test("GRID: one point shared by the rows; HOT_TEXT: exact for one sentence, partial for several", () => {
    const g = GR();
    const right = g.grid!.answer;
    assert.equal(scoreResponse(g, right), 1);
    assert.equal(scoreResponse(g, { ...right, r2: "c3" }), 0.75);
    assert.equal(scoreResponse(g, { r1: right.r1 }), 0.25);
    assert.equal(scoreResponse(g, "nonsense"), 0);
    assert.equal(scoreResponse(HT1(), ["s5"]), 1);
    assert.equal(scoreResponse(HT1(), ["s3"]), 0);
    const h = HT2();
    assert.equal(scoreResponse(h, ["s2", "s4"]), 1);
    assert.equal(scoreResponse(h, ["s2"]), 0.5);
    assert.equal(scoreResponse(h, ["s2", "s3"]), 0, "a wrong sentence takes back a right one");
  });

  test("ERROR_CORRECTION: several errors, typed fixes (tap = half, fix = full), “No error”, error kind", () => {
    const it = EC(); // parts 0 and 2 are wrong; the student types the fix
    assert.equal(scoreResponse(it, { picks: [0, 2], fixes: { 0: "Last summer", 2: "to Lake Tahoe." } }), 1);
    assert.equal(scoreResponse(it, { picks: [0, 2], fixes: { 0: "Last", 2: "Lake Tahoe" } }), 1, "the changed words alone are accepted");
    assert.equal(scoreResponse(it, { picks: [0, 2], fixes: { 0: "last summer", 2: "to lake tahoe" } }), 0.5, "the capital letters are the fix, so case counts here");
    assert.equal(scoreResponse(it, { picks: [0, 2] }), 0.5);
    assert.equal(scoreResponse(it, { picks: [0], fixes: { 0: "Last summer" } }), 0.5);
    assert.equal(scoreResponse(it, { picks: [0, 1], fixes: { 0: "Last summer" } }), 0, "a part with no error takes a share back");
    assert.equal(scoreResponse(it, { none: true }), 0);
    assert.equal(attemptMisconception(it, { picks: [0] }), "CAPITALIZATION");
    assert.equal(attemptMisconception(it, { picks: [0, 2], fixes: { 0: "Last summer", 2: "to Lake Tahoe" } }), null);
    // without the typing step every found error earns its full share
    assert.equal(scoreResponse({ ...it, typeCorrection: false }, { picks: [2] }), 0.5);
    // an item with no error
    const clean: BankItem = { ...it, errorIndexes: [], corrections: [], errorIndex: undefined, correction: undefined };
    assert.deepEqual(msgs(clean), []);
    assert.equal(scoreResponse(clean, { none: true }), 1);
    assert.equal(scoreResponse(clean, { picks: [1] }), 0);
    // punctuation and case only count when they are the mistake
    assert.ok(fixMatches("however, the", "However, the", "However the"));
    assert.ok(!fixMatches("However the", "However, the", "However the"));
    assert.ok(fixMatches("its", "it's|it is", "its") === false && fixMatches("it is", "it's|it is", "its"));
    assert.ok(fixMatches("FED THE SHEEP", "fed the sheep", "fed the sheeps") && fixMatches("sheep", "fed the sheep", "fed the sheeps"));
  });

  test("old one-error items keep their stored shape, payload and scoring", () => {
    const old = structuredClone(bank.items.find((i) => i.type === "ERROR_CORRECTION")!);
    assert.deepEqual(answerValues(old), [{ errorIndex: old.errorIndex, correction: old.correction }]);
    assert.deepEqual(contentPayload(old), { segments: old.segments });
    assert.equal(scoreResponse(old, old.errorIndex), 1);
    assert.equal(scoreResponse(old, (old.errorIndex! + 1) % old.segments!.length), 0);
    assert.equal(scoreResponse(old, { picks: [old.errorIndex] }), 1);
    for (const it of bank.items.filter((i) => i.type === "ERROR_CORRECTION")) assert.deepEqual(msgs(it), [], it.ref);
    const p = { ...old, questionId: "q", passageText: null, passageTitle: null, hint: null, image: null } as PracticeItem;
    assert.equal(toClientQuestion(p, "s").errorMode, undefined, "the player shows the classic one-tap item");
    assert.equal(normalizeResponse(p, old.errorIndex), old.errorIndex);
    assert.equal(normalizeResponse(p, { picks: [old.errorIndex] }), old.errorIndex);
    assert.throws(() => normalizeResponse(p, { none: true }), /could not be read/);
    assert.equal(correctAnswerText(p), `“${old.segments![old.errorIndex!]}” should be “${old.correction}”`);
  });
});

describe("validation", () => {
  test("clear messages for broken items of each type", () => {
    const tp = TP();
    tp.twoPart!.partA.options[1].correct = true;
    tp.twoPart!.partB.options = tp.twoPart!.partB.options.slice(2, 3);
    assert.deepEqual(msgs(tp), ["Part A: must have exactly one correct option (has 2)", "Part B: needs at least 2 options"]);
    const tp2 = TP2();
    tp2.twoPart!.partB.options.forEach((o) => (o.correct = o.label === "B"));
    assert.match(msgs(tp2).join(), /Part B: “choose more than one” needs 2\+ correct options \(has 1\)/);
    const g = GR();
    delete g.grid!.answer.r3;
    g.grid!.columns = g.grid!.columns.slice(0, 1);
    assert.deepEqual(msgs(g), ["grid needs at least 2 columns", "grid: the answer of row “Omar has visited the museum three times.” is not a column (c2)", "grid: row “By next June, I will have learned forty new songs.” has no answer"]);
    const h = HT2();
    h.hotText!.maxSelect = 1;
    assert.deepEqual(msgs(h), ["hot text: maxSelect must be a whole number from 2 to 5"]);
    h.hotText!.correct = ["s9"];
    h.hotText!.maxSelect = 1;
    assert.deepEqual(msgs(h), ["hot text: a correct sentence is not in the excerpt"]);
    const e = EC();
    e.corrections = ["Last summer"];
    e.errorKind = "NOPE";
    assert.deepEqual(msgs(e), ["every error needs its correction (2 errors, 1 corrections)", "unknown error kind NOPE"]);
    const e2 = EC();
    e2.errorIndexes = [];
    e2.noErrorOption = false;
    assert.deepEqual(msgs(e2), ["error correction needs at least one error part (or the “No error” choice)"]);
    const old = structuredClone(bank.items.find((i) => i.type === "ERROR_CORRECTION")!);
    assert.deepEqual(msgs({ ...old, errorIndex: 99 }), ["invalid error index"]);
    assert.deepEqual(msgs({ ...old, correction: "" }), ["missing correction"]);
  });
});

describe("import template: the new types' columns", () => {
  const H = [...TEMPLATE_HEADERS, "Part B Question", "Part B Options", "Part B Answer", "Grid Rows", "Hot Text", "Sentence Parts", "Correction"];
  const base = { Explanation: "Because the text says so.", Grade: "4", Skill: "Theme", Standard: "RL.4.2", "Difficulty Level": "4" };
  const cells = (r: Record<string, string>) => {
    const t = parseTemplateTable([H, H.map((h) => ({ ...base, ...r })[h] ?? "")]);
    assert.ok(t.ok);
    return t.rows[0].cells;
  };
  const TWO = { "Question Text": "What lesson does Layla learn?", "Question Type": "Two-Part", "Option A": "Grow fewer plants and care for them", "Option B": "Beans grow fast", "Correct Answer": "A", "Part B Options": "Her small garden was full. | She wanted the biggest garden. | He knocked on the gate.", "Part B Answer": "A" };
  const GRID = { "Question Text": "Fact or opinion?", "Question Type": "Grid", "Option A": "Fact", "Option B": "Opinion", "Grid Rows": "Water boils at 100 °C. | Pizza is the best food. | Cairo is in Egypt.", "Correct Answer": "A, B, A" };
  const HOT = { "Question Text": "Which sentence shows that Rana is patient?", "Question Type": "Hot Text", "Hot Text": "Rana waited quietly. The bus was late. Her friend ran off.", "Correct Answer": "1" };
  const ERR = { "Question Text": "Find the mistakes and type them correctly.", "Question Type": "Error Correction (type the fix)", "Sentence Parts": "my brother | and i | went to the park.", "Correct Answer": "1, 2", Correction: "My brother | and I" };

  test("each row is read from its own columns; mistakes name the column", () => {
    const tp = readRow(cells(TWO));
    assert.deepEqual(tp.errors, []);
    assert.equal(tp.question!.twoPart!.partA.stem, TWO["Question Text"]);
    assert.deepEqual(tp.question!.twoPart!.partB.options.map((o) => [o.label, o.correct]), [["A", true], ["B", false], ["C", false]]);
    assert.match(tp.warnings.join(), /Part B Question was empty/);
    assert.deepEqual(readRow(cells({ ...TWO, "Part B Answer": "" })).errors, ["Part B Answer is empty: write the letter(s) of the Part B answer, e.g. C."]);
    assert.deepEqual(readRow(cells({ ...TWO, "Part B Options": "Only one" })).errors, ["Two-Part needs at least 2 Part B choices in “Part B Options”, separated by |."]);
    const gr = readRow(cells(GRID));
    assert.deepEqual(gr.errors, []);
    assert.deepEqual(gr.question!.grid!.answer, { r1: "c1", r2: "c2", r3: "c1" });
    assert.deepEqual(readRow(cells({ ...GRID, "Correct Answer": "A, B" })).errors, ["Correct Answer gives 2 letters but there are 3 rows: write one column letter per row."]);
    const ht = readRow(cells(HOT));
    assert.deepEqual(ht.errors, []);
    assert.deepEqual(ht.question!.hotText!.segments.map((s) => s.text), ["Rana waited quietly.", "The bus was late.", "Her friend ran off."], "one block of text is split into sentences");
    assert.deepEqual(readRow(cells({ ...HOT, "Correct Answer": "7" })).errors, ["Correct Answer 7 is not a sentence number (there are 3 sentences)."]);
    const er = readRow(cells(ERR));
    assert.deepEqual(er.errors, []);
    assert.deepEqual([er.question!.errorIndexes, er.question!.corrections, er.question!.typeCorrection, er.question!.noErrorOption], [[0, 1], ["My brother", "and I"], true, true]);
    assert.deepEqual(readRow(cells({ ...ERR, Correction: "My brother" })).errors, ["Correction gives 1 corrected part for 2 mistakes: write one per mistake, separated by |."]);
    assert.deepEqual(readRow(cells({ ...ERR, "Correct Answer": "No error", Correction: "" })).question!.errorIndexes, []);
  });

  let repo: SqliteRepo, admin: Actor, teacher: Actor, student: Actor;
  const rng = seededRandom(77);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: withNewTypeSamples(ROOT, bank) });
    // only the new samples are published: each of their skills serves them first
    const nt = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("NT-"));
    assert.equal(nt.length, samples.items.length);
    await repo.updateMany("Question", { id: { in: nt.map((q) => q.id) } }, { status: "PUBLISHED" });
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    student = await actorFor("demo.s1001");
  });

  test("seed: the three types exist as rows of the QuestionType table", async () => {
    for (const code of ["TWO_PART", "GRID", "HOT_TEXT"]) assert.equal((await repo.findUnique("QuestionType", { code }))?.isAutoScored, true, code);
  });

  test("round trip: CSV → import → bank → editor and practice read the same item", async () => {
    const bytes = new TextEncoder().encode(toCsv([H, ...[TWO, GRID, HOT, ERR].map((r) => H.map((h) => ({ ...base, ...r } as Record<string, string>)[h] ?? ""))]));
    const jobId = await analyzeImport(repo, teacher, { fileName: "new-types.csv", bytes });
    const job = await getImportJob(repo, teacher, jobId);
    assert.deepEqual(job.rows.map((r) => [r.status, r.errors]), [["VALID", []], ["VALID", []], ["VALID", []], ["VALID", []]]);
    let last;
    do last = await commitImportChunk(repo, teacher, jobId); while (!last.done);
    assert.equal(last.counts.imported, 4);
    const ids = (await getImportJob(repo, teacher, jobId)).rows.sort((a, b) => a.rowNumber - b.rowNumber).map((r) => r.questionId!);
    const [two, grid, hot, err] = await Promise.all(ids.map((id) => getQuestion(repo, admin, id)));
    assert.deepEqual([two.input.type, grid.input.type, hot.input.type, err.input.type], ["TWO_PART", "GRID", "HOT_TEXT", "ERROR_CORRECTION"]);
    assert.equal(two.input.twoPart!.partB.options[0].text, "Her small garden was full.");
    assert.deepEqual(grid.input.grid!.answer, { r1: "c1", r2: "c2", r3: "c1" });
    assert.deepEqual(hot.input.hotText!.correct, ["s1"]);
    assert.deepEqual([err.input.errorIndexes, err.input.corrections, err.input.typeCorrection], [[0, 1], ["My brother", "and I"], true]);
    // practice reads them the same way (teacher sets / quiz load by question id)
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
    const items = await loadQuestionItems(repo, ids);
    assert.deepEqual(items.map((i) => i.type), ["TWO_PART", "GRID", "HOT_TEXT", "ERROR_CORRECTION"]);
    assert.equal(scoreResponse(items[0], { a: "A", b: "A" }), 1);
    assert.equal(scoreResponse(items[1], { r1: "c1", r2: "c2", r3: "c1" }), 1);
    assert.equal(scoreResponse(items[2], ["s1"]), 1);
    assert.equal(scoreResponse(items[3], { picks: [0, 1], fixes: { 0: "My brother", 1: "and I" } }), 1);
    const q0 = toClientQuestion(items[0], "seed");
    assert.equal(q0.parts!.a.stem, "", "Part A's question is the question text, not repeated");
  });

  test("question editor: create and edit a grid; errors are specific", async () => {
    const skill = (await repo.findMany("Skill", { code: "G4.point-of-view" }))[0];
    const input: EditorInput = {
      skillId: String(skill.id), type: "GRID", stem: "First or third person?", level: 3, whyCorrect: "Look at the pronouns.",
      grid: { rows: [{ id: "r1", text: "I ran home." }, { id: "r2", text: "She ran home." }], columns: [{ id: "c1", text: "First person" }, { id: "c2", text: "Third person" }], answer: { r1: "c1", r2: "c2" } },
    };
    const id = await createDraft(repo, admin, input);
    const d = await getQuestion(repo, admin, id);
    assert.deepEqual(d.input.grid, input.grid);
    await assert.rejects(updateDraft(repo, admin, id, { ...input, grid: { ...input.grid!, answer: { r1: "c1" } } }), /grid: row “She ran home\.” has no answer/);
    await assert.rejects(createDraft(repo, admin, { ...input, type: "HOT_TEXT", grid: undefined, hotText: { segments: [{ id: "s1", text: "One." }, { id: "s2", text: "Two." }], correct: [], maxSelect: 1 } }), /hot text needs at least one correct sentence/);
    await updateDraft(repo, admin, id, { ...input, type: "TWO_PART", grid: undefined, stem: "Answer both parts.", twoPart: { partA: { stem: "Who tells it?", options: [{ label: "A", text: "Mina", correct: true, rationale: null }, { label: "B", text: "Omar", correct: false, rationale: "No." }] }, partB: { stem: "Which words show it?", options: [{ label: "A", text: "I ran", correct: true, rationale: null }, { label: "B", text: "She ran", correct: false, rationale: null }] } } });
    const d2 = await getQuestion(repo, admin, id);
    assert.deepEqual([d2.input.type, d2.input.twoPart!.partA.options[0].correct, d2.input.options], ["TWO_PART", true, undefined]);
  });

  test("practice end to end: a two-part item, right answer with wrong evidence", async () => {
    const st = (await repo.findUnique("Student", { id: student.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
    const sid = String((await repo.findUnique("Skill", { curriculumId: cur.id, code: "G4.cause-effect" }))!.id);
    const T0 = new Date("2026-11-03T08:00:00Z");
    const view = await startPractice(repo, student, sid, T0, rng);
    const q = view.question!;
    assert.equal(q.type, "TWO_PART");
    const payload = JSON.stringify(q);
    for (const leak of ["correct", "rationale", "misconception"]) assert.ok(!payload.includes(`"${leak}"`), `leaked ${leak}`);
    assert.equal(q.parts!.b.options.length, 4);
    await assert.rejects(submitAnswer(repo, student, { sessionId: view.sessionId, questionId: q.questionId, response: { a: "A" } }, new Date(T0.getTime() + 20_000), rng), /could not be read/);
    const { feedback } = await submitAnswer(repo, student, { sessionId: view.sessionId, questionId: q.questionId, response: { a: "A", b: "A" } }, new Date(T0.getTime() + 60_000), rng);
    assert.deepEqual([feedback.correct, feedback.credit], [false, 0.5]);
    assert.match(feedback.yourAnswer, /^Part A: A\. The bug spray .* Part B: A\. “For years/);
    assert.match(feedback.correctAnswer, /Part B: B\. “Without bees/);
    assert.ok(feedback.tutor, "the tutor speaks first");
    const item = (await loadSkillItems(repo, sid)).find((i) => i.questionId === q.questionId)!;
    const evidence = item.twoPart!.partB.options.find((o) => o.correct)!.text;
    assert.ok(![feedback.tutor!.message, feedback.tutor!.guidingQuestion, feedback.tutor!.hint].join(" ").includes(evidence.slice(1, 30)), "the tutor does not give the evidence away");
    const attempt = (await repo.findMany("QuestionAttempt", { sessionId: view.sessionId }))[0];
    assert.deepEqual([attempt.isCorrect, Number(attempt.partialCredit), attempt.misconception], [false, 0.5, "EVIDENCE_MISMATCH"]);
    assert.match(whyChosenWrong(item, { a: "A", b: "A" })!, /before the problem/);
    assert.equal(studentAnswerText(item, { a: "A", b: "C" }).includes("Part B: C."), true);
  });

  test("practice end to end: several errors with typed fixes", async () => {
    const st = (await repo.findUnique("Student", { id: student.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
    const sid = String((await repo.findUnique("Skill", { curriculumId: cur.id, code: "G4.capitalization" }))!.id);
    const T0 = new Date("2026-11-04T08:00:00Z");
    const view = await startPractice(repo, student, sid, T0, rng);
    const q = view.question!;
    assert.deepEqual([q.type, q.errorMode], ["ERROR_CORRECTION", { noError: true, typeFix: true, multiple: true }]);
    assert.ok(!JSON.stringify(q).includes("Lake Tahoe"), "the corrections stay on the server");
    const { feedback } = await submitAnswer(repo, student, { sessionId: view.sessionId, questionId: q.questionId, response: { picks: [2, 0], fixes: { 0: "Last summer", 2: "to Lake Tahoe" } } }, new Date(T0.getTime() + 60_000), rng);
    assert.deepEqual([feedback.correct, feedback.credit], [true, 1]);
    assert.equal(feedback.correctAnswer, "“last summer” should be “Last summer”; “to lake tahoe” should be “to Lake Tahoe”");
    assert.match(feedback.yourAnswer, /“last summer” → “Last summer”/);
  });

  test("grid and hot text in a teacher set: shapes are checked, extra selections refused", async () => {
    const qs = await repo.findMany("Question", { externalRef: { in: ["NT-G5-verb-tenses-GR1", "NT-G5-character-HT1"] } });
    const items = await loadQuestionItems(repo, qs.map((x) => String(x.id)));
    const g = items.find((i) => i.type === "GRID")!, h = items.find((i) => i.type === "HOT_TEXT")!;
    assert.deepEqual(toClientQuestion(g, "x").grid!.columns.map((c) => c.text), ["Past perfect", "Present perfect", "Future perfect"]);
    assert.throws(() => normalizeResponse(g, { r1: "c9" }), /could not be read/);
    assert.throws(() => normalizeResponse(h, ["s1", "s2", "s4"]), /Choose no more than 2 sentences/);
    assert.deepEqual(normalizeResponse(h, ["s2", "s2", "s4"]), ["s2", "s4"]);
    assert.equal(correctAnswerText(h), "“Rana sighed, climbed down, and checked the knots again.” “She tied on a longer tail and ran into the wind once more.”");
  });
});
