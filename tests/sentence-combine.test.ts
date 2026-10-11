/**
 * SENTENCE_COMBINE: join 2–4 short sentences into one (normalized exact match), the original sample file,
 * validation, the template import, the editor (and its MANUAL difficulty source), the Grammar workbook's new
 * rows (error correction, sentence order, sentence combining) and adaptive practice end to end.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { toCsv } from "../src/imports/csv";
import { workbookXlsx } from "../src/imports/questions/template-files";
import { combinedMatches, combineGuidance, contentPayload, normalizeCombined, answerValues, scoreResponse, storedParts, validateItem, type BankItem } from "../src/imports/questions/validate";
import { parseTemplateTable, questionTypeFrom, readRow, TEMPLATE_HEADERS } from "../src/imports/questions/template";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { analyzeImport, commitImportChunk, getImportJob } from "../src/server/admin/question-import";
import { createDraft, getQuestion, updateDraft } from "../src/server/admin/questions";
import { ensureGrammarSkills, grammarCode, grammarLibrary, grammarTable, readGrammarWorkbook } from "../src/server/grammar/grammar";
import { attemptMisconception, correctAnswerText, loadQuestionItems, loadSkillItems, studentAnswerText, toClientQuestion, whyChosenWrong, type PracticeItem } from "../src/server/practice/items";
import { normalizeResponse, startPractice, submitAnswer } from "../src/server/practice/session";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions, SENTENCE_COMBINE_ITEMS_FILE, withSentenceCombineItems } from "../src/server/seeding/questions";
import { rightAnswer } from "../src/server/seeding/test-env";
import { demoDatabase, ROOT, seededRandom } from "./helpers/db";

const file = JSON.parse(readFileSync(join(ROOT, SENTENCE_COMBINE_ITEMS_FILE), "utf8")) as { items: BankItem[]; passages: unknown[] };
const standards = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, "data/curriculum/ccss-standards.json"), "utf8")) as Record<string, unknown>));
const skillKeys = new Set<string>();
for (const g of [4, 5, 6]) {
  const cur = JSON.parse(readFileSync(join(ROOT, `data/curriculum/grade-${g}.json`), "utf8")) as { units: { lessons: { skills: { familyCode: string }[] }[]; unitSkills?: { familyCode: string }[] }[] };
  for (const u of cur.units) { for (const l of u.lessons) for (const s of l.skills) skillKeys.add(`G${g}.${s.familyCode}`); for (const s of u.unitSkills ?? []) skillKeys.add(`G${g}.${s.familyCode}`); }
}
const ctx = { skillKeys, standards, passages: new Set<string>() };
const SC = (combine: BankItem["combine"]): BankItem => ({
  ref: "T-SC", grade: 4, family: "compound-sentences", skillKey: "G4.compound-sentences", standard: "CCSS.ELA-LITERACY.L.4.1", level: 4, type: "SENTENCE_COMBINE",
  stem: "Join the two sentences with the joining word.", passage: null, subskill: null, explanation: { whyCorrect: "A comma and but join two complete sentences.", tip: "" },
  estimatedSeconds: 60, irt: { a: 1, b: 0, c: 0 }, combine,
});
const GOOD = SC({ sentences: ["The soup was hot.", "Lina ate it quickly."], connector: "but", hint: "Put a comma before but.", accepted: ["The soup was hot, but Lina ate it quickly."] });

describe("the sentence-combining items file", () => {
  test("20 original items for Grades 4–6 on existing sentence / conjunction skills, every one valid", () => {
    assert.equal(file.items.length, 20);
    for (const g of [4, 5, 6]) assert.ok(file.items.filter((i) => i.grade === g).length >= 5, `grade ${g}`);
    assert.ok(file.items.every((i) => i.type === "SENTENCE_COMBINE"));
    assert.equal(new Set(file.items.map((i) => i.ref)).size, 20, "unique refs");
    const fams = new Set(file.items.map((i) => i.family));
    for (const f of fams) assert.ok(["subjects-predicates", "compound-sentences", "clauses-complex", "combining-sentences", "sentences", "fragments-run-ons"].includes(f), f);
    for (const it of file.items) {
      assert.deepEqual(validateItem(it, ctx), [], it.ref);
      assert.equal(it.skillKey, `G${it.grade}.${it.family}`);
      assert.ok(it.combine!.accepted.length >= 1 && it.combine!.sentences.length >= 2);
      // the model answer is accepted by its own scoring
      assert.equal(scoreResponse(it, it.combine!.accepted[0]), 1, it.ref);
    }
    // several joining words are practised
    assert.ok(new Set(file.items.map((i) => i.combine!.connector)).size >= 6);
  });

  test("the seed loads it only when the file is present, never twice", () => {
    const bank = { passages: [], items: [] as BankItem[] };
    const merged = withSentenceCombineItems(ROOT, bank);
    assert.equal(merged.items.length, 20);
    assert.equal(withSentenceCombineItems(ROOT, merged).items.length, 20);
    assert.equal(withSentenceCombineItems("/nonexistent", bank), bank);
    assert.match(readFileSync(join(ROOT, "prisma/seed/questions.ts"), "utf8"), /withSentenceCombineItems\(/);
  });
});

describe("SENTENCE_COMBINE scoring and validation", () => {
  test("normalized exact match: case, spaces, punctuation spacing, curly quotes, contractions and the end mark do not matter", () => {
    const ok = ["the soup was hot, but lina ate it quickly", "  The soup  was hot ,but Lina ate it quickly . ", "THE SOUP WAS HOT, BUT LINA ATE IT QUICKLY!"];
    for (const t of ok) assert.equal(scoreResponse(GOOD, t), 1, t);
    assert.equal(scoreResponse(GOOD, "The soup was hot but Lina ate it quickly."), 0, "the comma before but matters");
    assert.equal(scoreResponse(GOOD, "Lina ate it quickly, but the soup was hot."), 0);
    assert.equal(scoreResponse(GOOD, ""), 0);
    assert.equal(scoreResponse(GOOD, 42), 0);
    assert.equal(normalizeCombined("We didn’t go, so we can't play."), normalizeCombined("we did not go, so we cannot play"));
    assert.equal(normalizeCombined("It's late."), "it is late");
    assert.ok(combinedMatches("They’re here, and we're ready", ["They are here, and we are ready."]));
    assert.ok(!combinedMatches("They are here and we are ready", ["They are here, and we are ready."]));
  });

  test("guidance after a wrong answer never gives the model answer", () => {
    const c = GOOD.combine!;
    assert.match(combineGuidance(c, "The soup was hot and Lina ate it.")!, /joining word “but”/);
    assert.match(combineGuidance(c, "The soup was hot, but Lina ate.")!, /important words/);
    assert.match(combineGuidance(c, "The soup was hot but Lina ate it quickly.")!, /comma before “but”/);
    assert.equal(combineGuidance(c, "The soup was hot, but Lina ate it quickly"), null);
    for (const t of ["x", "The soup was hot and Lina ate it."]) assert.ok(!combineGuidance(c, t)!.includes(c.accepted[0]));
  });

  test("validation: 2–4 sentences, accepted answers that use the joining word, no copies, no choices", () => {
    const bad = (combine: BankItem["combine"]) => validateItem(SC(combine), ctx).map((x) => x.message).join(" | ");
    assert.deepEqual(validateItem(GOOD, ctx), []);
    assert.match(bad({ sentences: ["One."], accepted: ["One two."] }), /2 to 4 sentences/);
    assert.match(bad({ sentences: ["A b.", "C d.", "E f.", "G h.", "I j."], accepted: ["A b c."] }), /2 to 4 sentences/);
    assert.match(bad({ sentences: ["A b.", "C d."], accepted: [] }), /at least one accepted answer/);
    assert.match(bad({ sentences: ["A b.", "C d."], connector: "because", accepted: ["A b and c d."] }), /does not use the joining word/);
    assert.match(bad({ sentences: ["A b.", "C d."], accepted: ["A b, and c d.", "a b , and c d"] }), /listed twice/);
    assert.match(bad({ sentences: ["A b.", "C d."], accepted: ["A b."] }), /one of the sentences to join/);
    assert.match(bad({ sentences: ["A b.", "C d."], connector: "and!!", accepted: ["A b and!! c d."] }), /letters only/);
    assert.match(bad(undefined), /needs the sentences/);
    assert.match(validateItem({ ...GOOD, options: [{ label: "A", text: "x", correct: true, rationale: null }] }, ctx).map((x) => x.message).join(" "), /no answer choices/);
  });

  test("stored parts: the content holds no key; the key round-trips", () => {
    const content = contentPayload(GOOD);
    assert.deepEqual(content, { sentences: ["The soup was hot.", "Lina ate it quickly."], connector: "but", hint: "Put a comma before but." });
    assert.ok(!JSON.stringify(content).includes("hot, but"), "no accepted answer in the content");
    const [key] = answerValues(GOOD);
    assert.deepEqual(storedParts("SENTENCE_COMBINE", content, key).combine, GOOD.combine);
  });
});

describe("SENTENCE_COMBINE in the import, the editor, the Grammar workbook and practice", () => {
  let repo: SqliteRepo, admin: Actor, teacher: Actor, student: Actor;
  const rng = seededRandom(77);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: withSentenceCombineItems(ROOT, loadBank(ROOT)) });
    const sc = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => /^SC-G4-compound-sentences-/.test(String(q.externalRef)));
    assert.equal(sc.length, 3);
    await repo.updateMany("Question", { id: { in: sc.map((q) => q.id) } }, { status: "PUBLISHED" });
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    student = await actorFor("demo.s1001");
  });

  test("seed: the type exists and is auto-scored; the 20 items are in the bank with their hint", async () => {
    assert.equal((await repo.findUnique("QuestionType", { code: "SENTENCE_COMBINE" }))?.isAutoScored, true);
    const refs = new Set((await repo.findMany("Question", {}, { select: ["externalRef"] })).map((q) => String(q.externalRef)));
    assert.ok(file.items.every((i) => refs.has(i.ref)));
    const q = (await repo.findMany("Question", { externalRef: "SC-G4-compound-sentences-01" }))[0];
    const [it] = await loadQuestionItems(repo, [String(q.id)]);
    assert.equal(it.hint, file.items.find((i) => i.ref === "SC-G4-compound-sentences-01")!.combine!.hint);
    assert.equal(rightAnswer(it), it.combine!.accepted[0]);
  });

  test("import: “Sentences to Combine”, “Joining Word” and several accepted answers", async () => {
    assert.deepEqual(questionTypeFrom("Sentence Combining"), { code: "SENTENCE_COMBINE" });
    const H = [...TEMPLATE_HEADERS, "Sentences to Combine", "Joining Word"];
    const base = { Explanation: "Because tells why.", Grade: "4", Skill: "Complex Sentences", Standard: "L.4.1", "Difficulty Level": "4", "Question Type": "Sentence Combining", "Question Text": "Join the sentences with because." };
    const row = (r: Record<string, string>) => H.map((h) => ({ ...base, ...r } as Record<string, string>)[h] ?? "");
    const cells = (r: Record<string, string>) => { const t = parseTemplateTable([H, row(r)]); assert.ok(t.ok); return t.rows[0].cells; };
    const good = { "Sentences to Combine": "Huda stayed home. | She had a cold.", "Joining Word": "because", "Correct Answer": "Huda stayed home because she had a cold. | Because she had a cold, Huda stayed home." };
    const ok = readRow(cells(good));
    assert.deepEqual(ok.errors, []);
    assert.deepEqual(ok.question!.combine, { sentences: ["Huda stayed home.", "She had a cold."], connector: "because", hint: null, accepted: ["Huda stayed home because she had a cold.", "Because she had a cold, Huda stayed home."] });
    assert.match(readRow(cells({ ...good, "Sentences to Combine": "Only one." })).errors.join(" "), /2 to 4 short sentences/);
    assert.match(readRow(cells({ ...good, "Correct Answer": "" })).errors.join(" "), /Correct Answer is empty/);
    assert.match(readRow(cells({ ...good, "Correct Answer": "Huda stayed home, so she had a cold." })).errors.join(" "), /does not use the Joining Word/);
    const bytes = new TextEncoder().encode(toCsv([H, row(good)]));
    const jobId = await analyzeImport(repo, teacher, { fileName: "combine.csv", bytes });
    const job = await getImportJob(repo, teacher, jobId);
    assert.deepEqual(job.rows.map((r) => [r.status, r.errors]), [["VALID", []]]);
    let last; do last = await commitImportChunk(repo, teacher, jobId); while (!last.done);
    assert.equal(last.counts.imported, 1);
    const q = await getQuestion(repo, admin, (await getImportJob(repo, teacher, jobId)).rows[0].questionId!);
    assert.deepEqual([q.input.type, q.input.combine?.accepted.length, q.input.combine?.connector], ["SENTENCE_COMBINE", 2, "because"]);
  });

  test("editor: create a draft; a bad item is refused; changing the level by hand sets difficultySource MANUAL", async () => {
    const skill = (await repo.findMany("Skill", { code: "G5.compound-sentences" }))[0];
    const input = { skillId: String(skill.id), type: "SENTENCE_COMBINE" as const, stem: "Join the sentences.", level: 4, whyCorrect: "A comma and so.", standardCode: "CCSS.ELA-LITERACY.L.5.1", combine: { sentences: ["It rained.", "We stayed in."], connector: "so", hint: null, accepted: ["It rained, so we stayed in."] } };
    const id = await createDraft(repo, admin, input);
    assert.deepEqual((await getQuestion(repo, admin, id)).input.combine, input.combine);
    await assert.rejects(createDraft(repo, admin, { ...input, combine: { ...input.combine, accepted: ["It rained and we stayed in."] } }), /joining word/);
    // a save that keeps the level does not mark it; a new level does
    await updateDraft(repo, admin, id, { ...input, stem: "Join the two sentences." });
    assert.notEqual((await repo.findUnique("Question", { id }))!.difficultySource, "MANUAL");
    await updateDraft(repo, admin, id, { ...input, level: 5 });
    const q = (await repo.findUnique("Question", { id }))!;
    assert.deepEqual([Number(q.difficultyLevel), q.difficultySource], [5, "MANUAL"]);
  });

  test("Grammar workbook: error_correction, sentence_order and sentence_combine rows import and show in the grammar list", async () => {
    const HEAD = ["grade", "lesson_id", "unit", "week", "skill_id", "type", "level", "question_id", "ccss", "question", "option_A", "option_B", "option_C", "option_D", "answer", "answer_letter", "accepted_answers", "explanation", "segments", "error_index", "correction", "items", "sentences", "connector"];
    const r = (o: Record<string, string>) => HEAD.map((h) => o[h] ?? "");
    const common = { grade: "4", lesson_id: "G4-U2W1", unit: "2", week: "1", skill_id: "G4-U2W1-S1", ccss: "L.4.1f", explanation: "Two complete sentences need a comma and a joining word." };
    const rows = [HEAD,
      r({ ...common, question_id: "Q1", type: "error_correction", level: "On", question: "Which part has a mistake?", segments: "My brother | play football | every Friday.", error_index: "2", correction: "plays football" }),
      r({ ...common, question_id: "Q2", type: "error_correction", level: "Below", question: "Find the mistake, or choose No error.", segments: "We visited | our grandmother | last week.", error_index: "No error" }),
      r({ ...common, question_id: "Q3", type: "sentence_order", level: "On", question: "Put the steps in order.", items: "First, wash the rice. | Next, boil the water. | Then, cook the rice. | Finally, serve it hot." }),
      r({ ...common, question_id: "Q4", type: "sentence_combine", level: "Above", question: "Join the sentences with but.", sentences: "The desert is hot. | The nights are cold.", connector: "but", accepted_answers: "The desert is hot, but the nights are cold." }),
    ];
    const bytes = workbookXlsx([
      { name: "Questions", rows, widths: [10] },
      { name: "Skills", widths: [10], rows: [["grade", "lesson_id", "lesson_title", "skill_id", "skill", "skill_kind", "ccss", "rule_summary"], ["4", "G4-U2W1", "Compound Sentences", "G4-U2W1-S1", "Compound Sentences", "Grammar & Usage", "L.4.1f", "Join two sentences with a comma and and, but, or so."]] },
      { name: "Lessons", widths: [10], rows: [["grade", "lesson_id", "unit", "week", "lesson_number", "title"], ["4", "G4-U2W1", "2", "1", "", "Compound Sentences"]] },
    ]);
    const wb = readGrammarWorkbook(bytes);
    await ensureGrammarSkills(repo, admin, wb, 4);
    const table = grammarTable(wb, 4);
    const col = (h: string) => table[0].indexOf(h);
    assert.deepEqual(table.slice(1).map((x) => x[col("Question Type")]), ["Error Correction", "Error Correction", "Sentence Order", "Sentence Combining"]);
    const jobId = await analyzeImport(repo, admin, { fileName: "Grammar Grade 4.xlsx", bytes: new Uint8Array([1]), target: "BANK", table });
    const job = (await repo.findUnique("ImportJob", { id: jobId }))!;
    assert.deepEqual([Number(job.validRows), Number(job.errorRows)], [4, 0], JSON.stringify((await getImportJob(repo, admin, jobId)).rows.map((x) => [x.status, x.errors])));
    let last; do last = await commitImportChunk(repo, admin, jobId, { publish: true }); while (!last.done);
    assert.equal(last.counts.imported, 4);
    const skillId = String((await repo.findMany("Skill", { code: grammarCode(4, "G4-U2W1-S1") }))[0].id);
    const items = await loadSkillItems(repo, skillId);
    assert.deepEqual(items.map((i) => i.type).sort(), ["ERROR_CORRECTION", "ERROR_CORRECTION", "SENTENCE_COMBINE", "SENTENCE_ORDER"]);
    const ec = items.find((i) => i.type === "ERROR_CORRECTION" && i.segments?.[1] === "play football")!;
    assert.ok(ec, "the parts are kept");
    assert.equal(items.find((i) => i.type === "SENTENCE_ORDER")!.sequence!.length, 4);
    const lib = await grammarLibrary(repo, teacher);
    const row = lib.lessons.find((l) => l.id === skillId)!;
    assert.deepEqual(row.types, { ERROR_CORRECTION: 2, SENTENCE_ORDER: 1, SENTENCE_COMBINE: 1 });
  });

  test("practice end to end: no key in the browser; a wrong join gets guidance then the model answer; a right one scores 1", async () => {
    const st = (await repo.findUnique("Student", { id: student.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
    const sid = String((await repo.findUnique("Skill", { curriculumId: cur.id, code: "G4.compound-sentences" }))!.id);
    const items = await loadSkillItems(repo, sid);
    const sc = items.filter((i) => i.type === "SENTENCE_COMBINE");
    assert.equal(sc.length, 3);
    const T0 = new Date("2026-11-05T08:00:00Z");
    const view = await startPractice(repo, student, sid, T0, rng);
    const q = view.question!;
    assert.equal(q.type, "SENTENCE_COMBINE");
    const item = items.find((i) => i.questionId === q.questionId)! as PracticeItem;
    const payload = JSON.stringify(q);
    assert.ok(!payload.includes(item.combine!.accepted[0]), "the model answer is not sent");
    assert.deepEqual(q.combine!.sentences, item.combine!.sentences);
    assert.ok(q.hasHint);
    assert.deepEqual(toClientQuestion(item, "x").combine, { sentences: item.combine!.sentences, connector: item.combine!.connector ?? null });
    // the comma before the joining word is left out
    const wrong = item.combine!.accepted[0].replace(/,/g, "");
    assert.throws(() => normalizeResponse(item, ""), /could not be read/);
    assert.throws(() => normalizeResponse(item, "x".repeat(401)), /could not be read/);
    const { feedback } = await submitAnswer(repo, student, { sessionId: view.sessionId, questionId: q.questionId, response: wrong }, new Date(T0.getTime() + 40_000), rng);
    assert.deepEqual([feedback.correct, feedback.credit, feedback.correctAnswer, feedback.yourAnswer], [false, 0, item.combine!.accepted[0], wrong]);
    assert.match(feedback.whyYoursIsWrong!, /comma/);
    assert.equal(whyChosenWrong(item, wrong), feedback.whyYoursIsWrong);
    assert.equal(attemptMisconception(item, wrong), "SENTENCE_BOUNDARY");
    assert.equal((await repo.findMany("QuestionAttempt", { sessionId: view.sessionId }))[0].misconception, "SENTENCE_BOUNDARY");
    const next = (await repo.findUnique("PracticeSession", { id: view.sessionId }))!;
    const nextItem = items.find((i) => i.questionId === next.currentQuestionId);
    if (nextItem) {
      const r = await submitAnswer(repo, student, { sessionId: view.sessionId, questionId: nextItem.questionId, response: `  ${nextItem.combine!.accepted[0].toLowerCase()}  ` }, new Date(T0.getTime() + 90_000), rng);
      assert.deepEqual([r.feedback.correct, r.feedback.credit], [true, 1]);
      assert.equal(studentAnswerText(nextItem, " x "), "x");
      assert.equal(correctAnswerText(nextItem), nextItem.combine!.accepted[0]);
    }
  });
});
