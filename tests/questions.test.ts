import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planCurriculum, type GradeFile, type Taxonomy } from "../src/imports/curriculum/plan";
import { scoreResponse, validateItem, type BankItem, type BankPassage } from "../src/imports/questions/validate";
import { analyzeText, platformReadingLevel, platformReadingLevelFor } from "../src/reading/prl";

const root = join(__dirname, "..");
const tax = JSON.parse(readFileSync(join(root, "data/curriculum/taxonomy.json"), "utf8")) as Taxonomy;
const official = JSON.parse(readFileSync(join(root, "data/curriculum/ccss-standards.json"), "utf8")) as Record<string, string>;
const bank = JSON.parse(readFileSync(join(root, "data/questions/bank.json"), "utf8")) as { passages: BankPassage[]; items: BankItem[] };
const plans = [4, 5, 6].map((g) => planCurriculum(tax, JSON.parse(readFileSync(join(root, `data/curriculum/grade-${g}.json`), "utf8")) as GradeFile));
const skillKeys = new Set(plans.flatMap((p) => p.skills.map((s) => s.key)));
const ctx = { skillKeys, standards: new Set(Object.keys(official)), passages: new Set(bank.passages.map((p) => p.id)) };

test("every bank item passes the import validator (skills, official standards, keys, feedback)", () => {
  const issues = bank.items.flatMap((it) => validateItem(it, ctx));
  assert.deepEqual(issues, []);
  assert.ok(bank.items.length >= 200);
});

test("every item's standard belongs to the item's grade", () => {
  for (const it of bank.items) assert.equal(Number(it.standard.split(".")[3]), it.grade, it.ref);
});

test("the bank spans all seven difficulty levels in every grade", () => {
  for (const g of [4, 5, 6]) {
    const levels = new Set(bank.items.filter((i) => i.grade === g).map((i) => i.level));
    for (let l = 1; l <= 7; l++) assert.ok(levels.has(l), `G${g} missing level ${l}`);
  }
});

test("answer keys are balanced across positions (no 'always B' pattern)", () => {
  const counts: Record<string, number> = {};
  for (const it of bank.items.filter((i) => i.type === "MULTIPLE_CHOICE")) {
    const k = it.options!.find((o) => o.correct)!.label;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const v = Object.values(counts);
  assert.ok(Math.max(...v) - Math.min(...v) <= 6, JSON.stringify(counts));
});

test("passage reading level rises with grade (internal PRL)", () => {
  const avg = (g: number) => {
    const ps = bank.passages.filter((p) => p.grade === g && p.genre !== "Poetry" && p.genre !== "Drama");
    return ps.reduce((a, p) => a + platformReadingLevel(analyzeText(p.text)), 0) / ps.length;
  };
  const [a4, a5, a6] = [avg(4), avg(5), avg(6)];
  assert.ok(a4 < a6, `G4 ${a4} vs G6 ${a6}`);
  assert.ok(a4 >= 300 && a6 <= 1000, `range G4 ${a4}, G6 ${a6}`);
});

test("PRL is not computed for poetry or drama", () => {
  const poem = bank.passages.find((p) => p.genre === "Poetry")!;
  assert.equal(platformReadingLevelFor(poem.text, poem.genre), null);
});

test("headings count as sentence boundaries (no inflated levels for texts with headings)", () => {
  const withHeadings = "Building a Dam\nBeavers pile sticks across a stream.\n\nWhy It Matters\nThe pond keeps them safe.";
  assert.equal(analyzeText(withHeadings).sentenceCount, 4);
});

test("scoring: multi-select gives no credit for choosing everything", () => {
  const ms = bank.items.find((i) => i.type === "MULTI_SELECT")!;
  const all = ms.options!.map((o) => o.label);
  const correct = ms.options!.filter((o) => o.correct).map((o) => o.label);
  assert.equal(scoreResponse(ms, all), 0);
  assert.equal(scoreResponse(ms, correct), 1);
});

test("scoring: fill-in is case/space-insensitive; ordering must be exact", () => {
  const fill = bank.items.find((i) => i.type === "FILL_BLANK")!;
  assert.equal(scoreResponse(fill, "  " + fill.answers![0].toUpperCase() + " "), 1);
  const ord = bank.items.find((i) => i.type === "SENTENCE_ORDER")!;
  assert.equal(scoreResponse(ord, ord.sequence), 1);
  assert.equal(scoreResponse(ord, [...ord.sequence!].reverse()), 0);
});

// ---- curriculum regressions found while building the bank
test("regression: pronouns and adverbs are not filed under nouns/verbs", () => {
  const g4 = plans[0];
  const pron = g4.lessonSkills.filter((l) => /pronoun/i.test(l.label) && !/homophone|possessive nouns|capitalization/i.test(l.label));
  assert.ok(pron.length > 0 && pron.every((l) => l.skillKey === "G4.pronouns"), JSON.stringify(pron.map((p) => [p.label, p.skillKey])));
  const adv = g4.lessonSkills.filter((l) => /adverb/i.test(l.label));
  assert.ok(adv.length > 0 && adv.every((l) => l.skillKey === "G4.adverbs"));
});

test("regression: all taxonomy standards exist verbatim in the official CCSS document", () => {
  for (const s of tax.standards) assert.ok(official[s.code], s.code);
});
