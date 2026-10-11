/**
 * Word study: the DICTATION item type (scoring, pattern diagnosis, validation, import, editor, practice end to end)
 * and the original word-study items file (data/questions/word-study-items.json).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { toCsv } from "../src/imports/csv";
import { answerValues, contentPayload, scoreResponse, storedParts, validateItem, type BankItem } from "../src/imports/questions/validate";
import { parseTemplateTable, readRow, TEMPLATE_HEADERS } from "../src/imports/questions/template";
import { MISCONCEPTION_BY_CODE } from "../src/insights/misconceptions";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { analyzeImport, commitImportChunk, getImportJob } from "../src/server/admin/question-import";
import { createDraft, getQuestion } from "../src/server/admin/questions";
import { answerTexts, attemptMisconception, correctAnswerText, loadSkillItems, studentAnswerText, toClientQuestion, whyChosenWrong, type PracticeItem } from "../src/server/practice/items";
import { normalizeResponse, startPractice, submitAnswer } from "../src/server/practice/session";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions, withNewTypeSamples, withWordStudyItems } from "../src/server/seeding/questions";
import { diagnoseSpelling } from "../src/server/word-study/spelling-diagnosis";
import { decodeSpeech, encodeSpeech } from "../src/server/word-study/speech-code";
import { demoDatabase, ROOT, seededRandom } from "./helpers/db";

const file = JSON.parse(readFileSync(join(ROOT, "data/questions/word-study-items.json"), "utf8")) as { items: BankItem[]; passages: unknown[] };
const bank = loadBank(ROOT);
const standards = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, "data/curriculum/ccss-standards.json"), "utf8")) as Record<string, unknown>));
const skillKeys = new Set<string>();
for (const g of [4, 5, 6]) {
  const cur = JSON.parse(readFileSync(join(ROOT, `data/curriculum/grade-${g}.json`), "utf8")) as { units: { lessons: { skills: { familyCode: string }[] }[]; unitSkills?: { familyCode: string }[] }[] };
  for (const u of cur.units) { for (const l of u.lessons) for (const s of l.skills) skillKeys.add(`G${g}.${s.familyCode}`); for (const s of u.unitSkills ?? []) skillKeys.add(`G${g}.${s.familyCode}`); }
}
const ctx = { skillKeys, standards, passages: new Set<string>() };
const DICT = (word: string, sentence: string | null = null): BankItem => ({
  ref: "T-D", grade: 4, family: "spelling", skillKey: "G4.spelling", standard: "CCSS.ELA-LITERACY.L.4.2.d", level: 3, type: "DICTATION", stem: "Type the word you hear.",
  passage: null, subskill: null, explanation: { whyCorrect: "Because.", tip: "" }, estimatedSeconds: 30, irt: { a: 1, b: 0, c: 0 }, dictation: { word, sentence },
});

describe("the word-study items file", () => {
  test("120 original items, 40 per grade, 30 dictation; every item valid on existing skills and standards", () => {
    assert.equal(file.items.length, 120);
    for (const g of [4, 5, 6]) assert.equal(file.items.filter((i) => i.grade === g).length, 40, `grade ${g}`);
    assert.equal(file.items.filter((i) => i.type === "DICTATION").length, 30);
    assert.ok(file.items.some((i) => i.type === "GRID"));
    for (const it of file.items) assert.deepEqual(validateItem(it, ctx), [], it.ref);
    const fams = new Set(file.items.map((i) => i.family));
    assert.deepEqual([...fams].sort(), ["greek-latin-roots", "homographs-homophones", "prefixes", "spelling", "suffixes"]);
    // the spelling standards asked for: RF.4.3a / RF.5.3a / L.x.2 / L.x.4b
    for (const code of ["RF.4.3.a", "RF.5.3.a", "L.4.2.d", "L.5.2.e", "L.6.2.b", "L.4.4.b", "L.5.4.b", "L.6.4.b"]) assert.ok(file.items.some((i) => i.standard === `CCSS.ELA-LITERACY.${code}`), code);
  });

  test("every wrong option has a rationale and a misconception code that exists", () => {
    for (const it of file.items) for (const o of it.options ?? []) {
      if (o.correct) continue;
      assert.ok(o.rationale && o.rationale.length > 10, `${it.ref} ${o.label}: rationale`);
      assert.ok(o.misconception && MISCONCEPTION_BY_CODE.has(o.misconception), `${it.ref} ${o.label}: ${o.misconception}`);
    }
  });

  test("refs are unique (and new to the bank); no near-duplicates; dictation tips never say the word", () => {
    const refs = file.items.map((i) => i.ref);
    assert.equal(new Set(refs).size, refs.length);
    const bankRefs = new Set(bank.items.map((i) => i.ref));
    assert.deepEqual(refs.filter((r) => bankRefs.has(r)), []);
    const words = (i: BankItem) => new Set([i.stem, ...(i.options ?? []).map((o) => o.text), i.dictation?.word ?? "", i.dictation?.sentence ?? "", ...(i.grid?.rows ?? []).map((r) => r.text)].join(" ").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));
    const sets = file.items.map((i) => [i.ref, words(i)] as const);
    const near: string[] = [];
    for (let a = 0; a < sets.length; a++) for (let b = a + 1; b < sets.length; b++) {
      let inter = 0;
      for (const w of sets[a][1]) if (sets[b][1].has(w)) inter++;
      if (inter / (sets[a][1].size + sets[b][1].size - inter) >= 0.6) near.push(`${sets[a][0]} ~ ${sets[b][0]}`);
    }
    assert.deepEqual(near, []);
    for (const it of file.items.filter((i) => i.type === "DICTATION")) {
      const w = it.dictation!.word.toLowerCase();
      assert.ok(!it.explanation.tip.toLowerCase().includes(w), `${it.ref}: the tip (shown as a hint) gives the word away`);
      assert.ok(!it.stem.toLowerCase().includes(w), `${it.ref}: the stem gives the word away`);
    }
  });

  test("loaded by the seed only when the file exists; kept out of the test school (test-env loads the bank only)", () => {
    const merged = withWordStudyItems(ROOT, bank);
    assert.equal(merged.items.length, bank.items.length + file.items.length);
    assert.equal(withWordStudyItems(ROOT, merged).items.length, merged.items.length, "never added twice");
    assert.equal(withWordStudyItems("/nonexistent", bank), bank);
    assert.ok(!readFileSync(join(ROOT, "src/server/seeding/test-env.ts"), "utf8").includes("withWordStudyItems"));
    assert.match(readFileSync(join(ROOT, "prisma/seed/questions.ts"), "utf8"), /withWordStudyItems\(/);
  });
});

describe("DICTATION scoring and pattern diagnosis", () => {
  test("exact spelling, case-insensitive and trimmed; anything else scores 0", () => {
    const it = DICT("hopping", "The rabbit kept hopping.");
    assert.equal(scoreResponse(it, "hopping"), 1);
    assert.equal(scoreResponse(it, "  Hopping "), 1);
    assert.equal(scoreResponse(it, "HOPPING"), 1);
    assert.equal(scoreResponse(it, "hoping"), 0);
    assert.equal(scoreResponse(it, "hop ping"), 0);
    assert.equal(scoreResponse(it, null), 0);
    assert.equal(scoreResponse(it, ["hopping"]), 0);
    assert.equal(scoreResponse(DICT("don't"), "don’t"), 1, "a curly apostrophe counts as a straight one");
  });

  test("the missed pattern becomes a misconception code that exists", () => {
    const cases: [string, string, string][] = [
      ["carried", "carryed", "Y_TO_I"], ["played", "plaied", "Y_TO_I"], ["hopping", "hoping", "DOUBLING_RULE"], ["shining", "shinning", "DOUBLING_RULE"],
      ["making", "makeing", "DROP_E"], ["hopeful", "hopful", "DROP_E"], ["knee", "nee", "L1_SILENT_LETTER"], ["light", "lite", "L1_SILENT_LETTER"],
      ["cake", "cak", "L1_SILENT_LETTER"], ["rain", "rane", "VOWEL_TEAM"], ["seed", "sead", "VOWEL_TEAM"], ["bird", "burd", "R_CONTROLLED"],
      ["pet", "bet", "L1_P_B"], ["van", "fan", "L1_V_F"], ["lid", "led", "L1_SHORT_VOWEL"], ["street", "sitreet", "L1_CLUSTER"], ["blend", "bled", "L1_CLUSTER"],
      ["jumped", "jumpt", "SPELLING"], ["careful", "carefull", "SPELLING"],
      // the file's own dictation words, with typical misspellings
      ["smiling", "smileing", "DROP_E"], ["cried", "cryed", "Y_TO_I"], ["brightest", "britest", "L1_SILENT_LETTER"], ["thirsty", "thursty", "R_CONTROLLED"],
      ["kneel", "neel", "L1_SILENT_LETTER"], ["toaster", "toster", "VOWEL_TEAM"], ["shrimp", "srimp", "L1_CLUSTER"], ["bravely", "bravly", "DROP_E"], ["spoiled", "spoyled", "VOWEL_TEAM"],
      ["beginning", "begining", "DOUBLING_RULE"], ["happiness", "happyness", "Y_TO_I"], ["wrinkle", "rinkle", "L1_SILENT_LETTER"], ["thoughtful", "thotful", "L1_SILENT_LETTER"],
      ["explorer", "exploror", "R_CONTROLLED"], ["valuable", "valueable", "DROP_E"], ["applied", "applyed", "Y_TO_I"], ["shoulder", "sholder", "VOWEL_TEAM"], ["fountain", "fowntain", "VOWEL_TEAM"],
      ["receive", "recieve", "VOWEL_TEAM"], ["occurred", "occured", "DOUBLING_RULE"], ["separate", "seperate", "L1_SHORT_VOWEL"], ["knowledge", "nowledge", "L1_SILENT_LETTER"],
      ["rhythm", "rythm", "L1_SILENT_LETTER"], ["temperature", "temprature", "L1_SHORT_VOWEL"], ["dissatisfied", "disatisfied", "SPELLING"], ["bicycle", "bicicle", "SPELLING"], ["achievement", "acheivement", "VOWEL_TEAM"],
    ];
    const got = cases.map(([w, t]) => [w, t, diagnoseSpelling(w, t)?.code ?? null]);
    assert.deepEqual(got, cases);
    for (const [, , code] of cases) assert.ok(MISCONCEPTION_BY_CODE.has(code), code);
    assert.equal(diagnoseSpelling("Rain", " rain "), null);
    assert.equal(diagnoseSpelling("rain", "")?.code, "SPELLING");
    // the student sees the pattern, never the word
    for (const [w, t] of cases.filter(([w]) => w.length >= 6)) assert.ok(!diagnoseSpelling(w, t)!.message.toLowerCase().includes(w), w);
  });

  test("validation: one word, a sentence that uses it, no answer choices", () => {
    const msgs = (it: BankItem) => validateItem(it, { skillKeys: new Set(["G4.spelling"]), standards: new Set(["CCSS.ELA-LITERACY.L.4.2.d"]), passages: new Set() }).map((x) => x.message);
    assert.deepEqual(msgs(DICT("hopping", "The rabbit kept hopping.")), []);
    assert.deepEqual(msgs(DICT("hopping")), []);
    assert.deepEqual(msgs(DICT("")), ["dictation needs the word to say"]);
    assert.deepEqual(msgs(DICT("two words")), ["dictation: “two words” must be one word (letters only, up to 40)"]);
    assert.deepEqual(msgs(DICT("hopping", "The rabbit kept jumping.")), ["dictation: the sentence must use the word “hopping”"]);
    assert.deepEqual(msgs({ ...DICT("hop"), options: [{ label: "A", text: "hop", correct: true, rationale: null }] }), ["dictation has no answer choices"]);
  });

  test("stored shape: the sentence in content, the word as the key; read back the same way", () => {
    const it = DICT("hopping", "The rabbit kept hopping.");
    assert.deepEqual(contentPayload(it), { sentence: "The rabbit kept hopping." });
    assert.deepEqual(answerValues(it), ["hopping"]);
    assert.deepEqual(storedParts("DICTATION", contentPayload(it), "hopping"), { dictation: { word: "hopping", sentence: "The rabbit kept hopping." } });
    assert.deepEqual(storedParts("DICTATION", {}, "hop"), { dictation: { word: "hop", sentence: null } });
  });

  test("the browser payload: the word travels scrambled (decoded only to be spoken); feedback names the pattern", () => {
    const p = { ...DICT("thirsty", "We were thirsty after the walk."), questionId: "q-1", passageText: null, passageTitle: null, hint: null, image: null } as PracticeItem;
    const q = toClientQuestion(p, "seed");
    assert.equal(q.type, "DICTATION");
    assert.equal(q.dictation!.hasSentence, true);
    assert.ok(!JSON.stringify(q).toLowerCase().includes("thirsty"), "no plain word in the payload");
    assert.deepEqual(decodeSpeech(q.dictation!.say, "q-1"), { w: "thirsty", s: "We were thirsty after the walk." });
    assert.equal(decodeSpeech(q.dictation!.say, "another-question"), null, "the key is the question");
    assert.equal(decodeSpeech(encodeSpeech("ünïcode", "k"), "k"), "ünïcode");
    assert.equal(correctAnswerText(p), "thirsty");
    assert.equal(studentAnswerText(p, " thursty "), "thursty");
    assert.equal(attemptMisconception(p, "thursty"), "R_CONTROLLED");
    assert.equal(attemptMisconception(p, "thirsty"), null);
    assert.match(whyChosenWrong(p, "thursty")!, /vowel \+ r/);
    assert.ok(answerTexts(p).includes("thirsty"), "the tutor is checked against the word");
    assert.equal(normalizeResponse(p, "  thursty "), "thursty");
    assert.throws(() => normalizeResponse(p, ""), /could not be read/);
    assert.throws(() => normalizeResponse(p, 3), /could not be read/);
    assert.throws(() => normalizeResponse(p, "x".repeat(61)), /could not be read/);
  });
});

describe("DICTATION in the import, the editor and practice", () => {
  let repo: SqliteRepo, admin: Actor, teacher: Actor, student: Actor;
  const rng = seededRandom(31);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: withWordStudyItems(ROOT, withNewTypeSamples(ROOT, bank)) });
    // only the Grade 4 dictation items are published: the G4 spelling skill serves them
    const ws = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => /^WS-G4-spelling-D/.test(String(q.externalRef)));
    assert.equal(ws.length, 10);
    await repo.updateMany("Question", { id: { in: ws.map((q) => q.id) } }, { status: "PUBLISHED" });
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    student = await actorFor("demo.s1001");
  });

  test("seed: the DICTATION type exists and is auto-scored; all 120 items are in the bank", async () => {
    assert.equal((await repo.findUnique("QuestionType", { code: "DICTATION" }))?.isAutoScored, true);
    const refs = new Set((await repo.findMany("Question", {}, { select: ["externalRef"] })).map((q) => String(q.externalRef)));
    assert.ok(file.items.every((i) => refs.has(i.ref)));
  });

  test("import: the “Dictation Word” column (or Correct Answer) makes a dictation question", async () => {
    const H = [...TEMPLATE_HEADERS, "Dictation Word", "Dictation Sentence"];
    const base = { Explanation: "Drop the e before -ing.", Grade: "4", Skill: "Spelling", Standard: "L.4.2.d", "Difficulty Level": "3", "Question Type": "Dictation", "Question Text": "Type the word you hear." };
    const row = (r: Record<string, string>) => H.map((h) => ({ ...base, ...r } as Record<string, string>)[h] ?? "");
    const cells = (r: Record<string, string>) => { const t = parseTemplateTable([H, row(r)]); assert.ok(t.ok); return t.rows[0].cells; };
    const ok = readRow(cells({ "Dictation Word": "skating", "Dictation Sentence": "We went skating on the lake." }));
    assert.deepEqual([ok.errors, ok.question!.dictation], [[], { word: "skating", sentence: "We went skating on the lake." }]);
    assert.deepEqual(readRow(cells({ "Correct Answer": "skating" })).question!.dictation, { word: "skating", sentence: null });
    assert.deepEqual(readRow(cells({})).errors, ["Dictation Word is empty: write the word the platform should say (or put it in Correct Answer)."]);
    assert.deepEqual(readRow(cells({ "Dictation Word": "skating", "Dictation Sentence": "We went to the lake." })).errors, ["Dictation Sentence must use the word “skating”."]);
    assert.deepEqual(readRow(cells({ "Dictation Word": "ice skating" })).errors, ["Dictation Word “ice skating” must be one word (letters only, up to 40)."]);
    const bytes = new TextEncoder().encode(toCsv([H, row({ "Dictation Word": "skating", "Dictation Sentence": "We went skating on the lake." })]));
    const jobId = await analyzeImport(repo, teacher, { fileName: "dictation.csv", bytes });
    const job = await getImportJob(repo, teacher, jobId);
    assert.deepEqual(job.rows.map((r) => [r.status, r.errors]), [["VALID", []]]);
    let last;
    do last = await commitImportChunk(repo, teacher, jobId); while (!last.done);
    assert.equal(last.counts.imported, 1);
    const id = (await getImportJob(repo, teacher, jobId)).rows[0].questionId!;
    const q = await getQuestion(repo, admin, id);
    assert.deepEqual([q.input.type, q.input.dictation], ["DICTATION", { word: "skating", sentence: "We went skating on the lake." }]);
  });

  test("editor: create a dictation draft; a bad word is refused with a clear message", async () => {
    const skill = (await repo.findMany("Skill", { code: "G5.spelling" }))[0];
    const id = await createDraft(repo, admin, { skillId: String(skill.id), type: "DICTATION", stem: "Listen and type the word.", level: 4, whyCorrect: "Drop the e.", standardCode: "CCSS.ELA-LITERACY.L.5.2.e", dictation: { word: "writing", sentence: "Writing every day helps." } });
    const d = await getQuestion(repo, admin, id);
    assert.deepEqual(d.input.dictation, { word: "writing", sentence: "Writing every day helps." });
    await assert.rejects(createDraft(repo, admin, { skillId: String(skill.id), type: "DICTATION", stem: "Listen.", level: 4, whyCorrect: "x", standardCode: "CCSS.ELA-LITERACY.L.5.2.e", dictation: { word: "two words" } }), /must be one word/);
  });

  test("practice end to end: hear, type, get the pattern; the tutor does not give the word away", async () => {
    const st = (await repo.findUnique("Student", { id: student.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
    const sid = String((await repo.findUnique("Skill", { curriculumId: cur.id, code: "G4.spelling" }))!.id);
    const T0 = new Date("2026-11-05T08:00:00Z");
    const view = await startPractice(repo, student, sid, T0, rng);
    const q = view.question!;
    assert.equal(q.type, "DICTATION");
    const items = await loadSkillItems(repo, sid);
    const item = items.find((i) => i.questionId === q.questionId)!;
    const word = item.dictation!.word;
    const payload = JSON.stringify(q);
    assert.ok(!payload.toLowerCase().includes(word), "the word is not in plain text");
    for (const leak of ["correct", "rationale", "misconception", "answer"]) assert.ok(!payload.includes(`"${leak}"`), `leaked ${leak}`);
    assert.equal((decodeSpeech(q.dictation!.say, q.questionId) as { w: string }).w, word, "the browser can say it");
    // a typical misspelling: double the last letter, or leave one of a double out
    const wrong = /([a-z])\1/.test(word) ? word.replace(/([a-z])\1/, "$1") : word.slice(0, -1) + word.slice(-1) + word.slice(-1);
    const { feedback } = await submitAnswer(repo, student, { sessionId: view.sessionId, questionId: q.questionId, response: ` ${wrong} ` }, new Date(T0.getTime() + 30_000), rng);
    assert.deepEqual([feedback.correct, feedback.credit, feedback.correctAnswer, feedback.yourAnswer], [false, 0, word, wrong]);
    assert.ok(feedback.whyYoursIsWrong, "the pattern that was missed is explained");
    assert.ok(feedback.tutor);
    assert.ok(!` ${[feedback.tutor!.message, feedback.tutor!.guidingQuestion, feedback.tutor!.hint].join(" ").toLowerCase()} `.includes(` ${word} `), "the tutor does not say the word");
    const attempt = (await repo.findMany("QuestionAttempt", { sessionId: view.sessionId }))[0];
    assert.equal(attempt.misconception, diagnoseSpelling(word, wrong)!.code);
    assert.ok(MISCONCEPTION_BY_CODE.has(String(attempt.misconception)));
    // the next one, answered right (case does not matter)
    const next = (await repo.findUnique("PracticeSession", { id: view.sessionId }))!;
    const nextItem = items.find((i) => i.questionId === next.currentQuestionId);
    if (nextItem) {
      const r = await submitAnswer(repo, student, { sessionId: view.sessionId, questionId: nextItem.questionId, response: nextItem.dictation!.word.toUpperCase() }, new Date(T0.getTime() + 60_000), rng);
      assert.deepEqual([r.feedback.correct, r.feedback.credit], [true, 1]);
    }
  });
});
