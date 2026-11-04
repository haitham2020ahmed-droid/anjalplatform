/**
 * ➕ r73 (owner): two new skills with 100 original MAP-style questions each (data/questions/sets/new-skill-sets.json,
 * built by data/questions/src/r73_new_skills.py):
 *   - Complex and Compound-Complex Sentences (Language Usage · Grammar and Usage)
 *   - Point of View: First, Second, Third Limited, Third Omniscient (Reading · Literary Text)
 * The file: 100 per skill, 20 per RIT band (181–190 … 221–230, easiest first), every choice question with distinct
 * options and a valid answer, balanced answer positions, a passage for every question that speaks of one, no duplicate
 * stems (in the file or the other question files), no level words in the question text.
 * The load (demo school in memory): the "New skills" pack creates both skills in Grades 4–6, adds 100 PUBLISHED
 * questions each with their MAP test / area and RIT, Question Check finds nothing, a second run adds nothing; the skills
 * are in the teacher's skill picker and practice serves their questions.
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

const s = (v: unknown) => String(v ?? "");
const SENTENCES = "Complex and Compound-Complex Sentences";
const POV = "Point of View: First, Second, Third Limited, Third Omniscient";
const BANDS = ["181-190", "191-200", "201-210", "211-220", "221-230"];
const LEVEL_DIFF: Record<string, number> = { BELOW: 3, ON: 4, ABOVE: 5 };
const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const typeOf = (q: SetQuestion) => q.type ?? "MULTIPLE_CHOICE";

let sets: SkillSet[] = [];
const bySkill = (name: string) => sets.filter((x) => x.skill === name).flatMap((x) => x.questions);

describe("➕ r73 new skills: the question file", () => {
  before(async () => { sets = await loadSkillSetsFile("new-skill-sets.json"); });

  test("100 questions per skill, 20 per RIT band, easiest band first, Below / On / Above read on the RIT scale", () => {
    assert.deepEqual([...new Set(sets.map((x) => x.skill))], [SENTENCES, POV]);
    for (const name of [SENTENCES, POV]) {
      const qs = bySkill(name);
      assert.equal(qs.length, 100, name);
      const bands = qs.map((q) => (q as SetQuestion & { rit: string }).rit);
      for (const b of BANDS) assert.equal(bands.filter((x) => x === b).length, 20, `${name} ${b}`);
      // in order: the bands never go back
      for (let i = 1; i < bands.length; i++) assert.ok(BANDS.indexOf(bands[i]) >= BANDS.indexOf(bands[i - 1]), `${name}: bands in order`);
      for (const q of qs) {
        const rit = ritOf(LEVEL_DIFF[q.level], q.grade!);
        assert.equal(ritBand(rit).replace("–", "-"), (q as SetQuestion & { rit: string }).rit, `${q.ref}: its level and grade sit in its band`);
        assert.ok([1, 2, 3].includes(q.dok!), q.ref);
      }
      // each band: two (level, grade) slots of 10
      for (const b of BANDS) {
        const slots = new Map<string, number>();
        for (const q of qs.filter((x) => (x as SetQuestion & { rit: string }).rit === b)) slots.set(`${q.level}${q.grade}`, (slots.get(`${q.level}${q.grade}`) ?? 0) + 1);
        assert.deepEqual([...slots.values()], [10, 10], `${name} ${b}`);
      }
    }
    for (const set of sets) {
      assert.equal(set.grade, 5);
      assert.ok(set.ccss && set.domain && set.mapArea, set.skill);
    }
    assert.ok(bySkill(SENTENCES).every((q) => q.mapTest === "Language Usage" && q.mapArea === "Language: Understand, Edit for Grammar, Usage"));
    assert.ok(bySkill(POV).every((q) => q.mapTest === "Reading" && q.mapArea === "Literary Text"));
  });

  test("mostly 4-option multiple choice with 6+ answer types; every answer is valid and every option distinct", () => {
    for (const name of [SENTENCES, POV]) {
      const qs = bySkill(name);
      const types = new Set(qs.map(typeOf));
      assert.ok(types.size >= 6, `${name}: ${[...types].join(", ")}`);
      assert.ok(qs.filter((q) => typeOf(q) === "MULTIPLE_CHOICE").length >= 50, `${name}: mostly multiple choice`);
      for (const q of qs) {
        assert.doesNotThrow(() => typeFields(q), q.ref);
        assert.ok(s(q.why).trim().length > 10, `${q.ref}: an explanation`);
        const t = typeOf(q);
        if (t === "MULTIPLE_CHOICE" || t === "MULTI_SELECT" || t === "DROPDOWN") {
          const n = t === "DROPDOWN" ? 3 : 4;
          assert.equal(q.options!.length, n, `${q.ref}: ${n} options`);
          // distinct as written (punctuation questions differ only by a comma, as Question Check compares them)
          assert.equal(new Set(q.options!.map((o) => o.replace(/\s+/g, " ").trim())).size, n, `${q.ref}: distinct options`);
          const right = s(q.correct).split("");
          assert.equal(right.length, t === "MULTI_SELECT" ? 2 : 1, q.ref);
          for (const l of right) assert.ok(l.charCodeAt(0) - 65 < n, `${q.ref}: the answer is an option`);
          assert.equal(definiteProblem({ stem: q.stem, type: t === "DROPDOWN" ? "DROPDOWN" : t, hasPassage: Boolean(q.passage) }, q.options!.map((o, i) => ({ text: o, isCorrect: right.includes(String.fromCharCode(65 + i)) }))), null, q.ref);
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
        if (t === "TWO_PART") for (const part of [q.twoPart!.partA, q.twoPart!.partB]) {
          assert.equal(part.options.length, 4, q.ref);
          assert.equal(part.options.filter((o) => o.correct).length, 1, q.ref);
          assert.equal(new Set(part.options.map((o) => key(o.text))).size, 4, q.ref);
        }
        if (t === "ERROR_CORRECTION") assert.ok(q.errorIndex! >= 0 && q.errorIndex! < q.segments!.length && s(q.correction).trim(), q.ref);
        if (t === "TRUE_FALSE") assert.equal(typeof q.answer, "boolean", q.ref);
      }
    }
  });

  test("answer positions are balanced (A–D within ±2 of even; true / false within 1)", () => {
    for (const name of [SENTENCES, POV]) {
      const mc = bySkill(name).filter((q) => typeOf(q) === "MULTIPLE_CHOICE");
      const count = (l: string) => mc.filter((q) => q.correct === l).length;
      for (const l of "ABCD") assert.ok(Math.abs(count(l) - mc.length / 4) <= 2, `${name}: ${l} = ${count(l)} of ${mc.length}`);
      const tf = bySkill(name).filter((q) => typeOf(q) === "TRUE_FALSE");
      assert.ok(Math.abs(tf.filter((q) => q.answer).length * 2 - tf.length) <= 1, `${name}: true / false balanced`);
      // the right answer is not the one longest choice every time
      const longest = mc.filter((q) => { const r = q.options![q.correct!.charCodeAt(0) - 65].length; return q.options!.every((o, i) => i === q.correct!.charCodeAt(0) - 65 || o.length < r); }).length;
      assert.ok(longest < mc.length * 0.4, `${name}: the right answer is the longest in ${longest} of ${mc.length}`);
    }
  });

  test("a question that speaks of a passage has one; the others carry their own sentence (never removed as missing a passage)", () => {
    for (const q of sets.flatMap((x) => x.questions)) {
      if (q.passage) { assert.ok(s(q.passage).split(/\s+/).length >= 12 && s(q.passageTitle).trim(), `${q.ref}: a real passage with a title`); continue; }
      assert.equal(missingPassageHit(q.stem), null, `${q.ref}: ${q.stem}`);
      assert.equal(definitelyNeedsPassage(q.stem), false, q.ref);
      assert.doesNotMatch(q.stem, /\b(?:the|this) (?:passage|story|poem|article|text)\b/i, `${q.ref}: speaks of a text it does not have`);
    }
    // a Point of View question about one text always has it (only the general ones and the sort-each-sentence ones have none)
    const own = bySkill(POV).filter((q) => !q.passage);
    assert.ok(own.length <= 16, `${own.length} self-contained Point of View questions`);
    for (const q of own) assert.doesNotMatch(q.stem, /\b(?:the|this) (?:passage|story|scene|letter|text)\b/i, `${q.ref}: ${q.stem}`);
  });

  test("original: no duplicate stems in the file or with the other question files; no level words; school-appropriate", () => {
    const mine = sets.flatMap((x) => x.questions);
    const stems = mine.map((q) => key(q.stem));
    assert.equal(new Set(stems).size, stems.length, "no duplicate stem in the file");
    const refs = mine.map((q) => q.ref);
    assert.equal(new Set(refs).size, refs.length, "unique refs");
    const other = new Set<string>();
    const dir = join(ROOT, "data/questions/sets");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== "new-skill-sets.json")) {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as { sets?: { questions: { stem: string }[] }[]; nodes?: { questions: { stem: string }[] }[] };
      for (const g of [...(raw.sets ?? []), ...(raw.nodes ?? [])]) for (const q of g.questions) other.add(key(s(q.stem)));
    }
    const bank = JSON.parse(readFileSync(join(ROOT, "data/questions/bank.json"), "utf8")) as { items?: { stem?: string }[] };
    for (const it of bank.items ?? []) other.add(key(s(it.stem)));
    assert.ok(other.size > 10_000);
    const dup = mine.filter((q) => other.has(key(q.stem))).map((q) => q.ref);
    assert.deepEqual(dup, [], "no stem already in the bank");
    const text = (q: SetQuestion) => [q.stem, q.passage, ...(q.options ?? []), JSON.stringify(q.hotText ?? q.grid ?? q.twoPart ?? q.segments ?? "")].join(" ");
    for (const q of mine) {
      assert.doesNotMatch(q.stem, /\b(?:below level|on level|above level|grade \d|rit\b|level \d|easy|hard question)/i, `${q.ref}: no level words`);
      assert.doesNotMatch(text(q), /\b(?:pork|pig|bacon|ham|wine|beer|alcohol|girlfriend|boyfriend|dating|kiss|christmas|halloween|valentine)\b/i, q.ref);
    }
  });
});

describe("➕ r73 new skills: loaded into a school", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId = "";
  before(async () => {
    sets = await loadSkillSetsFile("new-skill-sets.json");
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = admin.schoolId!;
  });

  test("the New skills pack creates both skills in Grades 4–6 and adds 100 published questions each; a second run adds nothing", async () => {
    const def = packOf("newSkills")!;
    assert.equal(def.file, "new-skill-sets.json");
    assert.ok(!def.onlyExisting, "the pack creates the skills");
    let next = 0, added = 0, created = 0;
    const errors: string[] = [];
    for (;;) { const w = await runPackChunk(repo, schoolId, def, next); added += w.added; created += w.created; errors.push(...w.errors); next = w.next; if (next >= w.total) break; }
    assert.deepEqual(errors, []);
    assert.equal(added, 200);
    assert.equal(created, 6, "2 skills × Grades 4, 5, 6");
    const idx = await schoolSkillIndex(repo, schoolId);
    for (const name of [SENTENCES, POV]) {
      const ks = [...idx.skillOf.values()].filter((k) => normalizeSkillName(k.name) === normalizeSkillName(name));
      assert.deepEqual(ks.map((k) => k.grade).sort(), [4, 5, 6], name);
      assert.ok(ks.every((k) => k.isActive), name);
      assert.equal(new Set(ks.map((k) => idx.keyOf.get(k.id))).size, 1, `${name}: one question pool across the grades`);
      const home = ks.find((k) => k.grade === 5)!;
      const qs = await repo.findMany("Question", { skillId: home.id, deletedAt: null });
      assert.equal(qs.length, 100, name);
      assert.ok(qs.every((q) => q.status === "PUBLISHED"), `${name}: published`);
      assert.ok(qs.every((q) => s(q.mapTest) === (name === POV ? "Reading" : "Language Usage")), `${name}: MAP test`);
      assert.ok(qs.every((q) => s(q.mapInstructionalArea) === (name === POV ? "Literary Text" : "Language: Understand, Edit for Grammar, Usage")), `${name}: MAP area`);
      // the RIT spread: written for Grades 3–9, kept on the RIT scale (Grade 5 "On" stays a plain level 4)
      const levels = new Set(qs.map((q) => Number(q.difficultyLevel)));
      assert.ok(levels.size >= 4, `${name}: levels ${[...levels].join(",")}`);
      // standards: the skill's own standard in each grade
      const std = await repo.findMany("SkillStandard", { skillId: { in: ks.map((k) => k.id) } });
      assert.equal(std.length, 3, `${name}: one standard per grade`);
      // practice (adaptive / MAP practice) serves the pool from any grade's copy
      const g4 = ks.find((k) => k.grade === 4)!;
      assert.ok((await loadSkillItems(repo, g4.id)).length >= 90, `${name}: practice items`);
    }
    // safe to run again
    let again = 0; next = 0;
    for (;;) { const w = await runPackChunk(repo, schoolId, def, next); again += w.added; next = w.next; if (next >= w.total) break; }
    assert.equal(again, 0);
    // nothing for Question Check to hide
    const all = await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null, skillId: { in: [...idx.skillOf.values()].filter((k) => [SENTENCES, POV].includes(k.name)).map((k) => k.id) } });
    for (const q of all) {
      const opts = await repo.findMany("QuestionOption", { questionId: q.id });
      const type = s((await repo.findUnique("QuestionType", { id: q.typeId }))?.code ?? "MULTIPLE_CHOICE");
      assert.equal(definiteProblem({ stem: q.stem, type, hasPassage: Boolean(q.passageId) }, opts.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))), null, s(q.stem));
    }
  });

  test("both skills are in the teacher's skill picker (Grammar / Reading tabs) with their questions", async () => {
    const rows = await skillPickerList(repo, teacher);
    const sent = rows.find((r) => r.name === SENTENCES), pov = rows.find((r) => r.name === POV);
    assert.ok(sent && pov, "listed");
    assert.equal(sent!.tab, "GRAMMAR");
    assert.equal(pov!.tab, "READING");
    assert.ok(sent!.questions >= 100 && pov!.questions >= 100);
    // the existing near skills stay their own rows
    assert.ok(rows.some((r) => r.name === "Clauses and Complex Sentences" && r.id !== sent!.id));
    assert.ok(rows.some((r) => r.name === "Point of View and Perspective" && r.id !== pov!.id));
  });

  test("addSkillSets straight (the terminal script's path) skips everything already there", async () => {
    const r = await addSkillSets(repo, schoolId, sets);
    assert.equal(r.reduce((n, x) => n + x.added, 0), 0);
    assert.equal(r.reduce((n, x) => n + x.skillsCreated, 0), 0);
  });
});
