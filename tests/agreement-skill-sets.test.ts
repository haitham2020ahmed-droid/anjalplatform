/**
 * ➕ r74 (owner): a new skill, Subject-Verb Agreement with Compound Subjects, with 100 original MAP-style questions
 * (data/questions/sets/agreement-skill-sets.json, built by data/questions/src/r74_agreement.py) and its Learn lesson LN-223.
 * The file: 100 questions, 20 per RIT band (181–190 … 221–230, easiest first), every choice question with distinct
 * options and a valid answer, balanced answer positions, a passage for every question that speaks of one, no duplicate
 * stems (in the file or the other question files), no level words in the question text; every pattern the owner named
 * (and, or, nor, both…and, either…or, neither…nor, not only…but also, as well as / along with / together with,
 * each / every + compound, a compound naming one thing) is asked.
 * The load (demo school in memory): the "agreement" pack creates the skill in Grades 4–6, adds 100 PUBLISHED questions
 * with their MAP test / area and RIT, Question Check finds nothing, a second run adds nothing; the skill is in the
 * teacher's skill picker, practice serves its questions, and LN-223 is its Learn lesson.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { addSkillSets, loadSkillSetsFile, typeFields, type SetQuestion, type SkillSet } from "../src/server/questions/skill-sets";
import { packOf, runPackChunk } from "../src/server/questions/load-packs";
import { ritOf, ritBand } from "../src/server/questions/bank-scope";
import { missingPassageHit } from "../src/lib/missing-passage";
import { definitelyNeedsPassage } from "../src/lib/passage-detect";
import { definiteProblem } from "../src/server/questions/auto-check";
import { normalizeSkillName, schoolSkillIndex } from "../src/server/questions/skill-questions";
import { skillPickerList } from "../src/server/skills/picker";
import { loadSkillItems } from "../src/server/practice/items";
import { lessonCatalog, readLessons, readTopics } from "../src/server/learn/files";
import { lessonsForSkill } from "../src/server/learn/match";
import { loadLessonsInto } from "../src/server/learn/load";

const s = (v: unknown) => String(v ?? "");
const SKILL = "Subject-Verb Agreement with Compound Subjects";
const FILE = "agreement-skill-sets.json";
const BANDS = ["181-190", "191-200", "201-210", "211-220", "221-230"];
const LEVEL_DIFF: Record<string, number> = { BELOW: 3, ON: 4, ABOVE: 5 };
const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const typeOf = (q: SetQuestion) => q.type ?? "MULTIPLE_CHOICE";
const rit = (q: SetQuestion) => (q as SetQuestion & { rit: string }).rit;

let sets: SkillSet[] = [];
const all = () => sets.flatMap((x) => x.questions);

describe("➕ r74 agreement with compound subjects: the question file", () => {
  before(async () => { sets = await loadSkillSetsFile(FILE); });

  test("100 questions, 20 per RIT band, easiest band first, Below / On / Above read on the RIT scale", () => {
    assert.deepEqual([...new Set(sets.map((x) => x.skill))], [SKILL]);
    const qs = all();
    assert.equal(qs.length, 100);
    const bands = qs.map(rit);
    for (const b of BANDS) assert.equal(bands.filter((x) => x === b).length, 20, b);
    for (let i = 1; i < bands.length; i++) assert.ok(BANDS.indexOf(bands[i]) >= BANDS.indexOf(bands[i - 1]), "bands in order");
    for (const q of qs) {
      assert.equal(ritBand(ritOf(LEVEL_DIFF[q.level], q.grade!)).replace("–", "-"), rit(q), `${q.ref}: its level and grade sit in its band`);
      assert.ok([1, 2, 3].includes(q.dok!), q.ref);
      assert.equal(q.mapTest, "Language Usage", q.ref);
      assert.equal(q.mapArea, "Language: Understand, Edit for Grammar, Usage", q.ref);
    }
    for (const b of BANDS) {
      const slots = new Map<string, number>();
      for (const q of qs.filter((x) => rit(x) === b)) slots.set(`${q.level}${q.grade}`, (slots.get(`${q.level}${q.grade}`) ?? 0) + 1);
      assert.deepEqual([...slots.values()], [10, 10], b);
    }
    for (const set of sets) {
      assert.equal(set.grade, 5);
      assert.equal(set.ccss, "L.5.1");
      assert.ok(set.domain && set.mapArea, set.skill);
    }
  });

  test("mostly 4-option multiple choice with 6+ answer types; every answer is valid and every option distinct", () => {
    const qs = all();
    const types = new Set(qs.map(typeOf));
    assert.ok(types.size >= 6, [...types].join(", "));
    assert.ok(qs.filter((q) => typeOf(q) === "MULTIPLE_CHOICE").length >= 50, "mostly multiple choice");
    for (const q of qs) {
      assert.doesNotThrow(() => typeFields(q), q.ref);
      assert.ok(s(q.why).trim().length > 10, `${q.ref}: an explanation`);
      const t = typeOf(q);
      if (t === "MULTIPLE_CHOICE" || t === "MULTI_SELECT" || t === "DROPDOWN") {
        const n = t === "DROPDOWN" ? 3 : 4;
        assert.equal(q.options!.length, n, `${q.ref}: ${n} options`);
        assert.equal(new Set(q.options!.map((o) => key(o))).size, n, `${q.ref}: distinct options`);
        const right = s(q.correct).split("");
        assert.equal(right.length, t === "MULTI_SELECT" ? 2 : 1, q.ref);
        for (const l of right) assert.ok(l.charCodeAt(0) - 65 < n, `${q.ref}: the answer is an option`);
        assert.equal(definiteProblem({ stem: q.stem, type: t, hasPassage: Boolean(q.passage) }, q.options!.map((o, i) => ({ text: o, isCorrect: right.includes(String.fromCharCode(65 + i)) }))), null, q.ref);
      }
      if (t === "HOT_TEXT") {
        const ids = new Set(q.hotText!.segments.map((x) => x.id));
        assert.ok(q.hotText!.correct.length >= 1 && q.hotText!.correct.every((c) => ids.has(c)), q.ref);
        assert.equal(q.hotText!.maxSelect, q.hotText!.correct.length, q.ref);
      }
      if (t === "GRID") {
        const cols = new Set(q.grid!.columns.map((c) => c.id));
        assert.ok(q.grid!.rows.every((r) => cols.has(q.grid!.answer[r.id])), q.ref);
      }
      if (t === "ERROR_CORRECTION") {
        assert.ok(q.errorIndex! >= 0 && q.errorIndex! < q.segments!.length && s(q.correction).trim(), q.ref);
        assert.notEqual(key(q.segments![q.errorIndex!]), key(s(q.correction)), `${q.ref}: the correction changes the text`);
      }
      if (t === "TRUE_FALSE") assert.equal(typeof q.answer, "boolean", q.ref);
    }
  });

  test("answer positions are balanced (A–D within ±2 of even; true / false within 1; right answer not usually the longest)", () => {
    const mc = all().filter((q) => typeOf(q) === "MULTIPLE_CHOICE");
    const count = (l: string) => mc.filter((q) => q.correct === l).length;
    for (const l of "ABCD") assert.ok(Math.abs(count(l) - mc.length / 4) <= 2, `${l} = ${count(l)} of ${mc.length}`);
    const tf = all().filter((q) => typeOf(q) === "TRUE_FALSE");
    assert.ok(Math.abs(tf.filter((q) => q.answer).length * 2 - tf.length) <= 1, "true / false balanced");
    const longest = mc.filter((q) => { const i = q.correct!.charCodeAt(0) - 65, r = q.options![i].length; return q.options!.every((o, j) => j === i || o.length < r); }).length;
    assert.ok(longest < mc.length * 0.4, `the right answer is the longest in ${longest} of ${mc.length}`);
  });

  test("every rule the owner named is asked, easiest first: and → or / nor → both / either / neither → phrases, each / every, one thing → editing", () => {
    const text = (q: SetQuestion) => [q.stem, q.passage, ...(q.options ?? []), JSON.stringify(q.hotText ?? q.grid ?? q.segments ?? "")].join(" ");
    const has = (re: RegExp, band?: string) => all().filter((q) => (!band || rit(q) === band) && re.test(text(q))).length;
    assert.ok(has(/\band\b/, "181-190") >= 18, "band 1: and-subjects");
    assert.ok(has(/\bor\b|\bnor\b/, "191-200") >= 18, "band 2: or / nor");
    for (const re of [/\bboth\b/i, /\beither\b/i, /\bneither\b/i]) assert.ok(has(re, "201-210") >= 3, `band 3: ${re}`);
    assert.ok(has(/\b(?:he|she|they|you)\b/, "201-210") >= 3, "band 3: pronouns");
    for (const re of [/as well as/, /along with/, /together with/, /\bevery\b/i, /\beach\b/i, /not only/i, /macaroni and cheese|Kalila and Dimna/]) assert.ok(has(re, "211-220") >= 1, `band 4: ${re}`);
    assert.ok(all().filter((q) => rit(q) === "221-230" && q.passage).length >= 10, "band 5: editing paragraphs");
    assert.ok(has(/not only/i) >= 4 && has(/neither/i) >= 10 && has(/either/i) >= 15);
  });

  test("a question that speaks of a passage has one; the others carry their own sentence (never removed as missing a passage)", () => {
    for (const q of all()) {
      if (q.passage) { assert.ok(s(q.passage).split(/\s+/).length >= 12 && s(q.passageTitle).trim(), `${q.ref}: a real passage with a title`); continue; }
      assert.equal(missingPassageHit(q.stem), null, `${q.ref}: ${q.stem}`);
      assert.equal(definitelyNeedsPassage(q.stem), false, q.ref);
      assert.doesNotMatch(q.stem, /\b(?:the|this) (?:passage|story|poem|article|text|paragraph)\b/i, `${q.ref}: speaks of a text it does not have`);
    }
  });

  test("original: no duplicate stems in the file or with the other question files; no level words; school-appropriate", () => {
    const mine = all();
    const stems = mine.map((q) => key(q.stem));
    assert.equal(new Set(stems).size, stems.length, "no duplicate stem in the file");
    assert.equal(new Set(mine.map((q) => q.ref)).size, mine.length, "unique refs");
    const other = new Set<string>();
    const dir = join(ROOT, "data/questions/sets");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== FILE)) {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as { sets?: { questions: { stem: string }[] }[]; nodes?: { questions: { stem: string }[] }[] };
      for (const g of [...(raw.sets ?? []), ...(raw.nodes ?? [])]) for (const q of g.questions) other.add(key(s(q.stem)));
    }
    const bank = JSON.parse(readFileSync(join(ROOT, "data/questions/bank.json"), "utf8")) as { items?: { stem?: string }[] };
    for (const it of bank.items ?? []) other.add(key(s(it.stem)));
    assert.ok(other.size > 10_000);
    assert.deepEqual(mine.filter((q) => other.has(key(q.stem))).map((q) => q.ref), [], "no stem already in the bank");
    const text = (q: SetQuestion) => [q.stem, q.passage, ...(q.options ?? []), JSON.stringify(q.hotText ?? q.grid ?? q.segments ?? "")].join(" ");
    for (const q of mine) {
      assert.doesNotMatch(q.stem, /\b(?:below level|on level|above level|grade \d|rit\b|level \d|easy|hard question)/i, `${q.ref}: no level words`);
      assert.doesNotMatch(text(q), /\b(?:pork|pig|bacon|ham|wine|beer|alcohol|girlfriend|boyfriend|dating|kiss|christmas|halloween|valentine)\b/i, q.ref);
    }
  });
});

describe("➕ r74 agreement with compound subjects: the Learn lesson", () => {
  test("LN-223 is a valid lesson file and a planned topic, linked to the skill by name", () => {
    const l = readLessons().valid.get("LN-223");
    assert.ok(l, `LN-223 valid: ${JSON.stringify(readLessons().invalid.filter((x) => x.file === "LN-223.json"))}`);
    assert.deepEqual(l!.skillNames, [SKILL]);
    assert.equal(l!.goalArea, "Grammar and Usage");
    assert.ok(readTopics().some((t) => t.code === "LN-223" && t.skillNames.includes(SKILL)));
    const hit = lessonsForSkill({ name: SKILL, family: null, standards: [] }, lessonCatalog().filter((x) => x.ready));
    assert.equal(hit?.rule, "NAME");
    assert.deepEqual(hit!.codes, ["LN-223"]);
    // the plain skill keeps its own lesson first
    assert.ok(lessonsForSkill({ name: "Subject-Verb Agreement", family: null, standards: [] }, lessonCatalog().filter((x) => x.ready))!.codes.includes("LN-048"));
    // the rules the owner asked for are taught
    const all = JSON.stringify(l!.levels);
    for (const w of ["both", "either", "neither", "nor", "nearer", "as well as", "every", "Macaroni and cheese"]) assert.ok(all.includes(w), w);
  });
});

describe("➕ r74 agreement with compound subjects: loaded into a school", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId = "";
  before(async () => {
    sets = await loadSkillSetsFile(FILE);
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = admin.schoolId!;
  });

  test("the agreement pack creates the skill in Grades 4–6 and adds 100 published questions; a second run adds nothing", async () => {
    const def = packOf("agreement")!;
    assert.equal(def.file, FILE);
    assert.ok(!def.onlyExisting, "the pack creates the skill");
    let next = 0, added = 0, created = 0;
    const errors: string[] = [];
    for (;;) { const w = await runPackChunk(repo, schoolId, def, next); added += w.added; created += w.created; errors.push(...w.errors); next = w.next; if (next >= w.total) break; }
    assert.deepEqual(errors, []);
    assert.equal(added, 100);
    assert.equal(created, 3, "Grades 4, 5, 6");
    const idx = await schoolSkillIndex(repo, schoolId);
    const ks = [...idx.skillOf.values()].filter((k) => normalizeSkillName(k.name) === normalizeSkillName(SKILL));
    assert.deepEqual(ks.map((k) => k.grade).sort(), [4, 5, 6]);
    assert.ok(ks.every((k) => k.isActive));
    assert.equal(new Set(ks.map((k) => idx.keyOf.get(k.id))).size, 1, "one question pool across the grades");
    // the plain Subject-Verb Agreement skill stays its own skill
    const plain = [...idx.skillOf.values()].filter((k) => k.name === "Subject-Verb Agreement");
    assert.ok(plain.length && plain.every((k) => idx.keyOf.get(k.id) !== idx.keyOf.get(ks[0].id)), "not merged with Subject-Verb Agreement");
    const home = ks.find((k) => k.grade === 5)!;
    const qs = await repo.findMany("Question", { skillId: home.id, deletedAt: null });
    assert.equal(qs.length, 100);
    assert.ok(qs.every((q) => q.status === "PUBLISHED"), "published");
    assert.ok(qs.every((q) => s(q.mapTest) === "Language Usage"), "MAP test");
    assert.ok(qs.every((q) => s(q.mapInstructionalArea) === "Language: Understand, Edit for Grammar, Usage"), "MAP area");
    assert.ok(new Set(qs.map((q) => Number(q.difficultyLevel))).size >= 4, "a spread of levels");
    const std = await repo.findMany("SkillStandard", { skillId: { in: ks.map((k) => k.id) } });
    assert.equal(std.length, 3, "one standard per grade (L.4.1 / L.5.1 / L.6.1)");
    const g4 = ks.find((k) => k.grade === 4)!;
    assert.ok((await loadSkillItems(repo, g4.id)).length >= 90, "practice items");
    let again = 0; next = 0;
    for (;;) { const w = await runPackChunk(repo, schoolId, def, next); again += w.added; next = w.next; if (next >= w.total) break; }
    assert.equal(again, 0);
    for (const q of await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null, skillId: { in: ks.map((k) => k.id) } })) {
      const opts = await repo.findMany("QuestionOption", { questionId: q.id });
      const type = s((await repo.findUnique("QuestionType", { id: q.typeId }))?.code ?? "MULTIPLE_CHOICE");
      assert.equal(definiteProblem({ stem: q.stem, type, hasPassage: Boolean(q.passageId) }, opts.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))), null, s(q.stem));
    }
  });

  test("the skill is in the teacher's skill picker (Grammar tab) with its questions", async () => {
    const rows = await skillPickerList(repo, teacher);
    const row = rows.find((r) => r.name === SKILL);
    assert.ok(row, "listed");
    assert.equal(row!.tab, "GRAMMAR");
    assert.ok(row!.questions >= 100);
    assert.ok(rows.some((r) => r.name === "Subject-Verb Agreement" && r.id !== row!.id));
  });

  test("the Learn lesson registers for the school (the Learn lessons pack / first Learn page open)", async () => {
    const r = await loadLessonsInto(repo, schoolId, ["LN-223"]);
    assert.equal(r.added + r.updated + r.skipped, 1);
    const row = (await repo.findMany("LearnLesson", { schoolId, code: "LN-223" }))[0];
    assert.ok(row && !row.hidden);
  });

  test("addSkillSets straight (the terminal script's path) skips everything already there", async () => {
    const r = await addSkillSets(repo, schoolId, sets);
    assert.equal(r.reduce((n, x) => n + x.added, 0), 0);
    assert.equal(r.reduce((n, x) => n + x.skillsCreated, 0), 0);
  });
});
