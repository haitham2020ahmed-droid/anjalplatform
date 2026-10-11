/**
 * Audit fixes of the question import: no guessed answer key (1), generic stems with other choices are not
 * duplicates (2), stricter choice rules and duplicate refs (5). Uses the fake demo school only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { toCsv } from "../src/imports/csv";
import { DuplicateIndex, TEMPLATE_HEADERS, parseTemplateTable, readRow, type ColumnKey } from "../src/imports/questions/template";
import { duplicateRefs, validateItem, type BankItem } from "../src/imports/questions/validate";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { analyzeImport, checkInput, commitImportChunk, getImportJob, loadCurriculumIndex } from "../src/server/admin/question-import";
import { publishQuestions, type EditorInput } from "../src/server/admin/questions";
import { saveCompletion } from "../src/server/ai/complete";
import { questionContent } from "../src/server/ai/tools";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const enc = (s: string) => new TextEncoder().encode(s);
type RowSpec = Partial<Record<string, string>>;
const cells = (r: RowSpec): Partial<Record<ColumnKey, string>> => {
  const t = parseTemplateTable([[...TEMPLATE_HEADERS], TEMPLATE_HEADERS.map((h) => r[h] ?? "")]);
  if (!t.ok) throw new Error(t.errors.join());
  return t.rows[0].cells;
};
const MC: RowSpec = { "Question Text": "What is the theme of the story?", "Question Type": "Multiple Choice", "Option A": "Be kind", "Option B": "Run fast", "Option C": "Eat well", "Option D": "Sleep early", "Correct Answer": "A", Explanation: "The story shows kindness.", Grade: "4", "Difficulty Level": "4" };
const NO_OPTS: RowSpec = { "Option A": "", "Option B": "", "Option C": "", "Option D": "" };

describe("audit 1: a blank Correct Answer is never guessed (pure)", () => {
  test("no choice is marked correct, no True/False value, no fill-in answer; the AI is asked for it", () => {
    const mc = readRow(cells({ ...MC, "Correct Answer": "" }));
    assert.deepEqual([mc.errors, mc.needs.includes("answer")], [[], true]);
    assert.deepEqual(mc.question!.options!.map((o) => o.correct), [false, false, false, false], "option A is NOT the default");
    const ms = readRow(cells({ ...MC, "Question Type": "Multi Select", "Correct Answer": "" }));
    assert.deepEqual(ms.question!.options!.map((o) => o.correct), [false, false, false, false]);
    const tf = readRow(cells({ ...MC, ...NO_OPTS, "Question Type": "True/False", "Correct Answer": "" }));
    assert.deepEqual([tf.errors, tf.question!.answer, tf.needs.includes("answer")], [[], undefined, true]);
    const fb = readRow(cells({ ...MC, ...NO_OPTS, "Question Text": "The cat sat on the ____.", "Question Type": "Fill in the Blank", "Correct Answer": "" }));
    assert.deepEqual([fb.errors, fb.question!.answers, fb.needs.includes("answer")], [[], [], true], "no “?” answer");
  });
});

describe("audit 2: duplicates need the same choices when the question text is generic (pure)", () => {
  const STEM = "Which word is spelled correctly?";
  test("same generic stem, completely different choices: a stem-only note, not a duplicate", () => {
    const ix = new DuplicateIndex();
    ix.add("q1", STEM, ["becuase", "because", "becaus", "beacause"]);
    const hit = ix.find(STEM, ["freind", "friend", "frend", "fiend"]);
    assert.ok(hit, "still reported");
    assert.equal(hit!.stemOnly, true);
    assert.equal(hit!.exact, false);
  });
  test("genuine duplicates are still found", () => {
    const ix = new DuplicateIndex();
    ix.add("q1", STEM, ["becuase", "because", "becaus", "beacause"]);
    assert.deepEqual(ix.find(STEM.toUpperCase(), ["Becuase", "because", "becaus", "beacause"]), { id: "q1", score: 1, exact: true });
    const most = ix.find(STEM, ["becuase", "because", "becaus", "becawse"]); // 3 of 4 choices the same
    assert.ok(most && !most.stemOnly && !most.exact);
    const ix2 = new DuplicateIndex();
    ix2.add("t1", "Is the sentence “She run fast.” correct?", []);
    const tf = ix2.find("Is the sentence “She run fast” correct", []);
    assert.ok(tf && !tf.stemOnly, "no choices on either side: the text decides, as before");
    const similar = new DuplicateIndex();
    similar.add("s1", "What is the main idea of the passage about the busy honey bees in the garden?", ["Bees work hard", "Gardens are big", "Honey is sweet", "Flowers are red"]);
    const s = similar.find("What is the main idea of the passage about the busy honey bees in the big garden?", ["Bees work hard", "Gardens are big", "Honey is sweet", "Flowers are red"]);
    assert.ok(s && !s.stemOnly && s.score >= 0.8);
  });
  test("the index stays fast on a 10,000-row file (inverted index, not n²)", () => {
    const ix = new DuplicateIndex();
    const words = Array.from({ length: 3000 }, (_, i) => `w${i.toString(36)}x`);
    const pick = (i: number, k: number) => words[(i * 7919 + k * 104729) % words.length];
    const t0 = Date.now();
    for (let i = 0; i < 10_000; i++) {
      const stem = `Which sentence about the ${pick(i, 1)} ${pick(i, 2)} uses the word ${pick(i, 3)} correctly in the text?`;
      const opts = [0, 1, 2, 3].map((k) => `${pick(i, k + 4)} ${pick(i, k + 8)}`);
      ix.find(stem, opts);
      ix.add(`r${i}`, stem, opts);
    }
    assert.ok(Date.now() - t0 < 10_000, `took ${Date.now() - t0} ms`);
  });
});

describe("audit 5: choice rules and duplicate refs (pure)", () => {
  test("Multi Select needs a wrong choice; option questions need 2+ choices", () => {
    assert.match(readRow(cells({ ...MC, "Question Type": "Multi Select", "Correct Answer": "A, B, C, D" })).errors.join(), /at least one wrong answer choice/);
    assert.deepEqual(readRow(cells({ ...MC, "Question Type": "Multi Select", "Correct Answer": "A, C" })).errors, []);
    const base: BankItem = { ref: "x1", grade: 4, family: "", skillKey: "k", standard: "S", level: 4, type: "MULTI_SELECT", stem: "Pick the nouns.", passage: null, subskill: null, explanation: { whyCorrect: "Nouns name things.", tip: "" }, estimatedSeconds: 45, irt: { a: 1, b: 0, c: 0 } };
    const ctx = { skillKeys: new Set(["k"]), standards: new Set(["S"]), passages: new Set<string>() };
    const allRight = validateItem({ ...base, options: [{ label: "A", text: "cat", correct: true, rationale: null }, { label: "B", text: "dog", correct: true, rationale: null }] }, ctx);
    assert.match(allRight.map((i) => i.message).join(), /at least one wrong option/);
    const one = validateItem({ ...base, type: "MULTIPLE_CHOICE", options: [{ label: "A", text: "cat", correct: true, rationale: null }] }, ctx);
    assert.match(one.map((i) => i.message).join(), /at least 2 options/);
    assert.deepEqual(duplicateRefs([{ ref: "a" }, { ref: "b" }, { ref: "a" }]), [{ ref: "a", message: "duplicate ref in this batch" }]);
  });
});

describe("audit 1, 2, 5 through the importer (database, fake school)", () => {
  let repo: SqliteRepo; let admin: Actor;
  let skill: { name: string; code: string; std: string };
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const idx = await loadCurriculumIndex(repo, admin);
    const sk = idx.grades.get(4)!.find((s) => s.standards.length)!;
    skill = { name: sk.name, code: sk.code, std: sk.standards[0].code.replace(/^CCSS\.ELA-LITERACY\./, "") };
  });
  const csv = (rows: RowSpec[]) => enc(toCsv([[...TEMPLATE_HEADERS], ...rows.map((r) => TEMPLATE_HEADERS.map((h) => ({ ...r, Skill: skill.code, Standard: skill.std })[h] ?? ""))]));

  test("a question without an answer is saved with NO key, as a draft; publishing is refused until the AI fills it", async () => {
    const jobId = await analyzeImport(repo, admin, { fileName: "no-key.csv", bytes: csv([
      { ...MC, "Question Text": "Which choice best states the lesson of the fable about the ant?", "Correct Answer": "" },
      { ...MC, ...NO_OPTS, "Question Text": "The ant saved food for the winter.", "Question Type": "True/False", "Correct Answer": "" },
    ]) });
    const job = await getImportJob(repo, admin, jobId);
    assert.deepEqual(job.rows.map((r) => r.status), ["VALID", "VALID"], JSON.stringify(job.rows.map((r) => r.errors)));
    let last; do { last = await commitImportChunk(repo, admin, jobId, { publish: true }); } while (!last.done);
    const done = await getImportJob(repo, admin, jobId);
    const [mc, tf] = await Promise.all(done.rows.map((r) => repo.findUnique("Question", { id: r.questionId! })));
    for (const q of [mc!, tf!]) {
      assert.equal(q.status, "DRAFT");
      assert.ok((q.tags as { aiNeeds?: string[] }).aiNeeds?.includes("answer"));
    }
    const opts = await repo.findMany("QuestionOption", { questionId: mc!.id });
    assert.equal(opts.length, 4);
    assert.ok(opts.every((o) => !o.isCorrect), "no option is correct (not a guessed A)");
    assert.equal(await repo.count("QuestionAnswer", { questionId: tf!.id }), 0, "no True/False value stored");
    const refused = await publishQuestions(repo, admin, [String(mc!.id), String(tf!.id)]);
    assert.deepEqual(refused.published, [], "publishing a question with no correct answer is refused");
    assert.equal(refused.skipped.length, 2);
    // the AI fills the answer: the question can now be published (after a person checks it)
    const [qi] = await questionContent(repo, [String(mc!.id)]);
    await saveCompletion(repo, String(admin.schoolId), qi, ["answer"], { id: qi.id, correctLabels: ["A"] }, [], new Date());
    const after = await repo.findMany("QuestionOption", { questionId: mc!.id });
    assert.deepEqual(after.sort((a, b) => Number(a.order) - Number(b.order)).map((o) => Boolean(o.isCorrect)), [true, false, false, false]);
    assert.deepEqual((await publishQuestions(repo, admin, [String(mc!.id)])).published, [String(mc!.id)]);
  });

  test("checkInput: no correct answer is an error unless the AI is asked for it; Multi Select all correct is refused", async () => {
    const idx = await loadCurriculumIndex(repo, admin);
    const sk = idx.grades.get(4)!.find((s) => s.code === skill.code)!;
    const input: EditorInput = { skillId: sk.id, type: "MULTIPLE_CHOICE", stem: "Pick one.", level: 4, standardCode: skill.std, whyCorrect: "Because.", tip: null,
      options: ["a", "b", "c"].map((t, i) => ({ label: "ABC"[i], text: t, correct: false, rationale: "No." })) } as EditorInput;
    assert.match(checkInput(idx, input, { allowUnlinkedStandard: true }).join(), /No correct answer/);
    assert.deepEqual(checkInput(idx, { ...input, aiNeeds: ["answer"] }, { allowUnlinkedStandard: true }), []);
    const ms = { ...input, type: "MULTI_SELECT", options: input.options!.map((o) => ({ ...o, correct: true, rationale: null })) } as EditorInput;
    assert.match(checkInput(idx, ms, { allowUnlinkedStandard: true }).join(), /at least one wrong answer choice/);
    assert.match(checkInput(idx, { ...input, options: [input.options![0]], aiNeeds: ["answer"] }, {}).join(), /at least 2 answer choices/);
  });

  test("the generic stem with other choices is imported (IMPORT), not skipped as a duplicate", async () => {
    const STEM = "Which word is spelled correctly in this audit check?";
    const jobId = await analyzeImport(repo, admin, { fileName: "generic.csv", bytes: csv([
      { ...MC, "Question Text": STEM, "Option A": "becuase", "Option B": "because", "Option C": "becaus", "Option D": "beacause", "Correct Answer": "B" },
      { ...MC, "Question Text": STEM, "Option A": "freind", "Option B": "friend", "Option C": "frend", "Option D": "fiend", "Correct Answer": "B" },
      { ...MC, "Question Text": STEM, "Option A": "becuase", "Option B": "because", "Option C": "becaus", "Option D": "beacause", "Correct Answer": "B" },
    ]) });
    const job = await getImportJob(repo, admin, jobId);
    assert.deepEqual(job.rows.map((r) => [r.status, r.decision]), [["VALID", "IMPORT"], ["VALID", "IMPORT"], ["DUPLICATE", "SKIP"]]);
    assert.match(job.rows[1].warnings.join(" "), /Same wording as row 2 in this file, but with different answer choices/);
  });
});
