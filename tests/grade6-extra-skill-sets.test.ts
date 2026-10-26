/**
 * ➕ Grade 6 extras (data/questions/sets/grade6-extra-skill-sets.json): two new Grade 6 skills with 100 original
 * questions each — "Analyzing Figurative, Connotative, and Technical Language" (for the "Mother to Son" lesson, plus
 * a 20-question topup from "The Weight of Silence") and "Analyzing Informational Text Elements" (for the
 * "Shakespeare in Harlem" lesson, plus a 20-question topup from "The Woman Who Mapped the Ocean Floor") — and a
 * 20-question topup for the existing "Cite Text Evidence" skill (from "The Repair"). The file: every choice question
 * has distinct options and a valid answer, a passage for every question that speaks of one, no duplicate stems (in
 * the file or the other question files). The load (demo school in memory): the "gradeSixExtras" pack creates the two
 * new skills in Grades 4–6, tops up the existing "Cite Text Evidence" skill, adds all published questions, and a
 * second run adds nothing.
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
import { definiteProblem } from "../src/server/questions/auto-check";
import { missingPassageHit } from "../src/lib/missing-passage";
import { definitelyNeedsPassage } from "../src/lib/passage-detect";
import { normalizeSkillName, schoolSkillIndex } from "../src/server/questions/skill-questions";
import { skillPickerList } from "../src/server/skills/picker";

const s = (v: unknown) => String(v ?? "");
const FILE = "grade6-extra-skill-sets.json";
const FIG = "Analyzing Figurative, Connotative, and Technical Language";
const INFO = "Analyzing Informational Text Elements";
const EVIDENCE = "Cite Text Evidence";
const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const typeOf = (q: SetQuestion) => q.type ?? "MULTIPLE_CHOICE";

let sets: SkillSet[] = [];
const bySkill = (name: string) => sets.filter((x) => x.skill === name).flatMap((x) => x.questions);

describe("➕ Grade 6 extras: the question file", () => {
  before(async () => { sets = await loadSkillSetsFile(FILE); });

  test("three sets: 100 questions each for the two new skills, 20 for the Cite Text Evidence topup", () => {
    assert.deepEqual([...new Set(sets.map((x) => x.skill))].sort(), [EVIDENCE, FIG, INFO].sort());
    assert.equal(bySkill(FIG).length, 100);
    assert.equal(bySkill(INFO).length, 100);
    assert.equal(bySkill(EVIDENCE).length, 20);
    for (const set of sets) { assert.equal(set.grade, 6, set.skill); assert.ok(set.ccss && set.domain, set.skill); }
  });

  test("mostly multiple choice; every answer is valid and every option distinct", () => {
    for (const q of sets.flatMap((x) => x.questions)) {
      assert.doesNotThrow(() => typeFields(q), q.ref);
      assert.ok(s(q.why).trim().length > 5, `${q.ref}: an explanation`);
      assert.ok(["BELOW", "ON", "ABOVE"].includes(q.level), `${q.ref}: a real level`);
      const t = typeOf(q);
      if (t === "MULTIPLE_CHOICE" || t === "MULTI_SELECT" || t === "DROPDOWN") {
        const n = t === "DROPDOWN" ? 3 : 4;
        assert.ok(q.options && q.options.length >= 2, `${q.ref}: options`);
        assert.equal(new Set(q.options!.map((o) => key(o))).size, q.options!.length, `${q.ref}: distinct options`);
        const right = s(q.correct).split("");
        assert.ok(right.length >= 1, q.ref);
        for (const l of right) assert.ok(l.charCodeAt(0) - 65 < q.options!.length, `${q.ref}: the answer is an option`);
        assert.equal(definiteProblem({ stem: q.stem, type: t, hasPassage: Boolean(q.passage) }, q.options!.map((o, i) => ({ text: o, isCorrect: right.includes(String.fromCharCode(65 + i)) }))), null, q.ref);
      }
      if (t === "TRUE_FALSE") assert.equal(typeof q.answer, "boolean", q.ref);
      if (t === "MATCHING") assert.ok(q.pairs && q.pairs.length >= 2, q.ref);
    }
  });

  test("a question that speaks of a passage has one; the others carry their own sentence", () => {
    for (const q of sets.flatMap((x) => x.questions)) {
      if (q.passage) { assert.ok(s(q.passage).split(/\s+/).length >= 8 && s(q.passageTitle).trim(), `${q.ref}: a real passage with a title`); continue; }
      assert.equal(missingPassageHit(q.stem), null, `${q.ref}: ${q.stem}`);
      assert.equal(definitelyNeedsPassage(q.stem), false, q.ref);
    }
  });

  test("original: no duplicate stems in the file or with the other question files", () => {
    const mine = sets.flatMap((x) => x.questions);
    const stems = mine.map((q) => key(q.stem));
    assert.equal(new Set(stems).size, stems.length, "no duplicate stem in the file");
    const refs = mine.map((q) => q.ref);
    assert.equal(new Set(refs).size, refs.length, "unique refs");
    const other = new Set<string>();
    const dir = join(ROOT, "data/questions/sets");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== FILE)) {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as { sets?: { questions: { stem: string }[] }[]; nodes?: { questions: { stem: string }[] }[] };
      for (const g of [...(raw.sets ?? []), ...(raw.nodes ?? [])]) for (const q of g.questions) other.add(key(s(q.stem)));
    }
    const bank = JSON.parse(readFileSync(join(ROOT, "data/questions/bank.json"), "utf8")) as { items?: { stem?: string }[] };
    for (const it of bank.items ?? []) other.add(key(s(it.stem)));
    assert.deepEqual(mine.filter((q) => other.has(key(q.stem))).map((q) => q.ref), [], "no stem already in the bank");
  });
});

describe("➕ Grade 6 extras: loaded into a school", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId = "";
  before(async () => {
    sets = await loadSkillSetsFile(FILE);
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = admin.schoolId!;
  });

  test("the gradeSixExtras pack creates the two new skills in Grades 4–6, tops up Cite Text Evidence, and adds every question; a second run adds nothing", async () => {
    const def = packOf("gradeSixExtras")!;
    assert.equal(def.file, FILE);
    assert.ok(!def.onlyExisting, "the pack creates the new skills");
    let next = 0, added = 0, created = 0;
    const errors: string[] = [];
    for (;;) { const w = await runPackChunk(repo, schoolId, def, next); added += w.added; created += w.created; errors.push(...w.errors); next = w.next; if (next >= w.total) break; }
    assert.deepEqual(errors, []);
    assert.equal(added, 220, "100 + 100 + 20");
    // the two new skills already exist in Grade 6 (seeded from the curriculum map's own taxonomy family), so only
    // Grades 4 and 5 are created here; Cite Text Evidence already exists in all three grades.
    assert.equal(created, 4, "2 new skills × Grades 4, 5 (Grade 6 already seeded by the curriculum)");
    const idx = await schoolSkillIndex(repo, schoolId);
    for (const name of [FIG, INFO]) {
      const ks = [...idx.skillOf.values()].filter((k) => normalizeSkillName(k.name) === normalizeSkillName(name));
      assert.deepEqual(ks.map((k) => k.grade).sort(), [4, 5, 6], name);
      const home = ks.find((k) => k.grade === 6)!;
      const qs = await repo.findMany("Question", { skillId: home.id, deletedAt: null });
      assert.equal(qs.length, 100, name);
      assert.ok(qs.every((q) => q.status === "PUBLISHED"), `${name}: published`);
    }
    const evidence = [...idx.skillOf.values()].find((k) => normalizeSkillName(k.name) === normalizeSkillName(EVIDENCE) && k.grade === 6)!;
    assert.ok(evidence, "Cite Text Evidence Grade 6 already existed");
    // safe to run again
    let again = 0; next = 0;
    for (;;) { const w = await runPackChunk(repo, schoolId, def, next); again += w.added; next = w.next; if (next >= w.total) break; }
    assert.equal(again, 0, "safe to run again");
  });

  test("both new skills are in the teacher's skill picker with their questions", async () => {
    const def = packOf("gradeSixExtras")!;
    let next = 0;
    for (;;) { const w = await runPackChunk(repo, schoolId, def, next); next = w.next; if (next >= w.total) break; }
    const rows = await skillPickerList(repo, teacher);
    for (const name of [FIG, INFO]) {
      const row = rows.find((r) => r.name === name);
      assert.ok(row, `${name}: listed`);
      assert.ok(row!.questions >= 100, name);
    }
  });

  test("addSkillSets straight (the terminal script's path) skips everything already there", async () => {
    const def = packOf("gradeSixExtras")!;
    let next = 0;
    for (;;) { const w = await runPackChunk(repo, schoolId, def, next); next = w.next; if (next >= w.total) break; }
    const r = await addSkillSets(repo, schoolId, sets);
    assert.equal(r.reduce((n, x) => n + x.added, 0), 0);
  });
});
