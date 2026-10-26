/**
 * Update 56 — one bank for every grade, MAP-style answer types (demo school in memory, never a real database):
 *   every type a set can carry (MC, Multi-select, Drop-down, Two-part, Hot text, Grid, Matching, Order, Error
 *   correction, True/False) is added to an existing skill, PUBLISHED, shown to students and scored right.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { addSkillSets, loadSkillSetsFile, type SetQuestion, type SkillSet } from "../src/server/questions/skill-sets";
import { addMapSets, loadMapSetsFile } from "../src/server/questions/map-sets";
import { attachmentNodes } from "../src/server/curriculum-map/questions";
import { readFileSync } from "node:fs";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { loadQuestionItems, toClientQuestion } from "../src/server/practice/items";
import { answerValues, scoreResponse } from "../src/imports/questions/validate";

const s = (v: unknown) => String(v ?? "");
const P = "The town library opened a seed shelf last spring. Readers could borrow a packet of seeds, grow the plants, and return new seeds in the fall. By October, the shelf held twice as many packets as it had in April. The librarian said the idea worked because people liked sharing what they had grown.";
const base = { anchor: "CCRA.R.2", level: "ON", passageTitle: "The Seed Shelf", passage: P, why: "The passage says so.", grade: 8, dok: 2, mapTest: "Reading", mapArea: "Informational Text" };
const opt = (label: string, text: string, correct: boolean) => ({ label, text, correct, rationale: null });

export const SAMPLE: SetQuestion[] = [
  { ...base, ref: "t-mc", stem: "What is the central idea of the passage?", options: ["A seed shelf grew because people shared.", "Libraries sell seeds.", "Seeds grow best in April.", "The librarian likes October."], correct: "A" },
  { ...base, ref: "t-ms", type: "MULTI_SELECT", stem: "Which TWO details support the central idea? Choose two.", options: ["The shelf held twice as many packets by October.", "People liked sharing what they had grown.", "The library has a blue door.", "Spring is a season."], correct: "AB" },
  { ...base, ref: "t-dd", type: "DROPDOWN", passage: null, passageTitle: null, stem: "Choose the word that best completes the sentence: The plan ____ because readers returned seeds.", options: ["succeeded", "succeed", "succeeding"], correct: "A" },
  { ...base, ref: "t-tp", type: "TWO_PART", stem: "Answer Part A, then Part B.", twoPart: {
    partA: { stem: "Part A: Why did the seed shelf work?", options: [opt("A", "People liked sharing.", true), opt("B", "Seeds were free forever.", false), opt("C", "It rained a lot.", false)] },
    partB: { stem: "Part B: Which sentence supports the answer to Part A?", options: [opt("A", "The librarian said the idea worked because people liked sharing what they had grown.", true), opt("B", "The town library opened a seed shelf last spring.", false), opt("C", "Readers could borrow a packet of seeds.", false)] } } },
  { ...base, ref: "t-ht", type: "HOT_TEXT", stem: "Select the sentence that shows the shelf grew.", hotText: { segments: [{ id: "s1", text: "The town library opened a seed shelf last spring." }, { id: "s2", text: "By October, the shelf held twice as many packets as it had in April." }, { id: "s3", text: "Readers could borrow a packet of seeds." }], correct: ["s2"], maxSelect: 1 } },
  { ...base, ref: "t-gr", type: "GRID", stem: "Is each statement a fact from the passage or an opinion?", grid: { rows: [{ id: "r1", text: "The shelf opened last spring." }, { id: "r2", text: "Seed shelves are the best idea ever." }], columns: [{ id: "f", text: "Fact" }, { id: "o", text: "Opinion" }], answer: { r1: "f", r2: "o" } } },
  { ...base, ref: "t-mt", type: "MATCHING", passage: null, passageTitle: null, stem: "Match each word to its meaning.", pairs: [{ left: "borrow", right: "take and give back" }, { left: "return", right: "bring back" }, { left: "share", right: "give part to others" }] },
  { ...base, ref: "t-so", type: "SENTENCE_ORDER", stem: "Put the events in order.", sequence: ["The library opened a seed shelf.", "Readers grew the plants.", "Readers returned new seeds.", "The shelf held twice as many packets."] },
  { ...base, ref: "t-ec", type: "ERROR_CORRECTION", passage: null, passageTitle: null, stem: "Find the error in the sentence.", segments: ["The readers", "was happy", "to share", "their seeds."], errorIndex: 1, correction: "were happy" },
  { ...base, ref: "t-tf", type: "TRUE_FALSE", stem: "True or false: The shelf had fewer packets in October than in April.", answer: false },
];

describe("Update 56 · MAP-style answer types in skill sets", () => {
  let repo: SqliteRepo; let schoolId = ""; let skill = "";
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    schoolId = s((await repo.findMany("School", {}))[0].id);
    const g5 = (await repo.findMany("Grade", { schoolId })).find((g) => Number(g.level) === 5)!;
    const cur = (await repo.findMany("Curriculum", { gradeId: g5.id }))[0];
    skill = s((await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }))[0].name);
  });

  test("every type is added, published, shown to students and scored right; running again adds nothing", async () => {
    const set: SkillSet = { skill, questions: SAMPLE };
    const [r] = await addSkillSets(repo, schoolId, [set], undefined, new Date(), { onlyExisting: true });
    assert.deepEqual(r.errors, []);
    assert.equal(r.added, SAMPLE.length);
    const qs = await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null }, { select: ["id", "stem"] });
    const mine = qs.filter((q) => SAMPLE.some((x) => x.stem === q.stem));
    assert.equal(mine.length, SAMPLE.length);
    const items = await loadQuestionItems(repo, mine.map((q) => s(q.id)));
    assert.equal(items.length, SAMPLE.length);
    for (const it of items) {
      const want = SAMPLE.find((x) => x.stem === it.stem)!;
      assert.equal(it.type, want.type ?? "MULTIPLE_CHOICE");
      if (want.passage) assert.match(s(it.passageText), /seed shelf/);
      toClientQuestion(it, "seed");
      const right: unknown = it.type === "MULTIPLE_CHOICE" || it.type === "DROPDOWN" ? it.options!.find((o) => o.correct)!.label
        : it.type === "MULTI_SELECT" ? it.options!.filter((o) => o.correct).map((o) => o.label)
        : it.type === "TWO_PART" ? { a: "A", b: "A" }
        : it.type === "MATCHING" ? Object.fromEntries(it.pairs!.map((p) => [p.left, p.right]))
        : it.type === "ERROR_CORRECTION" ? 1
        : answerValues(it)[0];
      assert.equal(scoreResponse(it, right), 1, `${it.type} scores the right answer`);
    }
    const [again] = await addSkillSets(repo, schoolId, [set], undefined, new Date(), { onlyExisting: true });
    assert.equal(again.added, 0);
  });
});

describe("Update 56 · data files: 30 per skill, Curriculum Map Concept Vocabulary + Review", () => {
  let repo: SqliteRepo; let schoolId = "";
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    schoolId = s((await repo.findMany("School", {}))[0].id);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId });
  });

  test("every skill has 30 questions (5 per grade 2, 5, 7, 8, 10, 12) with 6+ answer types; shared passages come back", async () => {
    const sets = await loadSkillSetsFile("span-skill-sets.json");
    assert.ok(sets.length >= 140);
    for (const set of sets) {
      assert.equal(set.questions.length, 30, set.skill);
      assert.ok(new Set(set.questions.map((q) => q.type ?? "MULTIPLE_CHOICE")).size >= 6, set.skill);
      assert.deepEqual([...new Set(set.questions.map((q) => q.grade))].sort((a, b) => a! - b!), [2, 5, 7, 8, 10, 12]);
      for (const q of set.questions) if (q.passageRef) assert.ok(q.passage && q.passageTitle, q.ref);
    }
    // one set into an existing skill of the demo school
    const g5 = (await repo.findMany("Grade", { schoolId })).find((g) => Number(g.level) === 5)!;
    const cur = (await repo.findMany("Curriculum", { gradeId: g5.id }))[0];
    const names = new Set((await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null })).map((k) => s(k.name)));
    const one = sets.find((x) => names.has(x.skill) && x.questions.some((q) => q.passage))!;
    const [r] = await addSkillSets(repo, schoolId, [one], undefined, new Date(), { onlyExisting: true });
    assert.deepEqual(r.errors, []);
    assert.equal(r.added + r.skipped, 30);
    assert.equal((await addSkillSets(repo, schoolId, [one], undefined, new Date(), { onlyExisting: true }))[0].added, 0);
  });

  test("🔁 every Text Set / Selection gets a Review section after its last category; CV and Review sets load onto their places", async () => {
    const nodes = await attachmentNodes(repo, schoolId);
    const rev = nodes.filter((n) => n.category === "REVIEW");
    const sets = new Set(nodes.map((n) => `${n.grade}.${n.unit}.${n.setNumber}`));
    // r92: Grade 6 Unit 1's "The Lost Island" lesson added one more Text Set/Selection (59 → 60; see r79-plan-links.test.ts)
    // "Mother to Son" (U2) and "Shakespeare in Harlem" (U3) added two more (60 → 62); their Concept Vocabulary / Review
    // content is now authored in data/questions/sets/map-vocab-review-sets.json (file counts below are 62).
    assert.equal(rev.length, 62, "one Review per Text Set / Selection");
    assert.equal(rev.length, sets.size);
    for (const n of rev) assert.match(n.code, /\.REV$/);
    const file = await loadMapSetsFile();
    assert.equal(file.filter((n) => n.code.endsWith(".REV")).length, 62);
    assert.equal(file.filter((n) => n.code.endsWith(".CV")).length, 62);
    // 🩹 (Oct 2026) "Mother to Son" and "Shakespeare in Harlem" were low on vocabulary/review questions — their
    // CV and REV nodes were topped up from 10 to 30 questions per level (30 → 90 total each); every other
    // Text Set / Selection still carries the original 30.
    const EXPANDED = new Set(["G6.U2.SEL4.CV", "G6.U2.SEL4.REV", "G6.U3.SEL3.CV", "G6.U3.SEL3.REV"]);
    for (const n of file) assert.equal(n.questions.length, EXPANDED.has(n.code) ? 90 : 30, n.code);
    for (const code of EXPANDED) {
      const n = file.find((x) => x.code === code)!;
      assert.ok(n, code);
      for (const lvl of ["BELOW", "ON", "ABOVE"] as const) {
        assert.equal(n.questions.filter((q) => q.level === lvl).length, 30, `${code}: ${lvl}`);
      }
    }
    const pick = [file.find((n) => n.code.endsWith(".CV"))!, file.find((n) => n.code.endsWith(".REV"))!];
    const res = await addMapSets(repo, schoolId, pick);
    for (const r of res) { assert.deepEqual(r.errors, [], r.code); assert.equal(r.added, 30, r.code); }
    const place = nodes.find((n) => n.code === pick[1].code)!;
    assert.equal((await repo.findMany("QuestionMapLink", { nodeId: place.id })).length, 30);
    assert.equal((await addMapSets(repo, schoolId, pick)).reduce((a, r) => a + r.added, 0), 0, "safe to run again");
  });
});

describe("Update 57 · grammar extras: all 12 tenses by name (80) and active/passive in every tense (50)", () => {
  test("the file has 80 + 50 MAP-style questions in 6+ answer types and loads into the existing skills", async () => {
    const { repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 });
    const schoolId = s((await repo.findMany("School", {}))[0].id);
    const sets = await loadSkillSetsFile("grammar-extra-sets.json");
    assert.deepEqual(sets.map((x) => [x.skill, x.questions.length]), [["Verb Tenses (Simple, Progressive, Perfect)", 80], ["Active and Passive Voice", 50]]);
    for (const set of sets) assert.ok(new Set(set.questions.map((q) => q.type ?? "MULTIPLE_CHOICE")).size >= 6);
    const tenses = sets[0].questions.map((q) => q.stem.toLowerCase()).join(" ");
    for (const name of ["past perfect progressive", "future perfect", "present progressive", "past simple"]) assert.ok(tenses.includes(name), name);
    const res = await addSkillSets(repo, schoolId, sets, undefined, new Date(), { onlyExisting: true });
    for (const r of res) if (!r.errors.some((e) => /not on this school/.test(e))) assert.deepEqual(r.errors, [], r.skill);
  });
});

