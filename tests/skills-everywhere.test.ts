/**
 * 🔎 Every platform skill (/tmp/qs/allskills.json → tests/fixtures/all-skills.json, 148 names; r73 added Complex and Compound-Complex Sentences and Point of View: First, Second, Third Limited, Third Omniscient; r74 Subject-Verb Agreement with Compound Subjects) is findable everywhere,
 * on the demo school after the gap sets are loaded: the Question Bank search (a skill's name lists that skill's
 * questions) and its skill filter, the teacher test builder's skill picker and search, the assign lists (Assignments →
 * New, Curriculum by grade, Assign a skill), the Skills page — whatever the case, "&" / "and" or apostrophe.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { addSkillSets, loadSkillSetsFile } from "../src/server/questions/skill-sets";
import { countQuestionsOfSkills, normalizeSkillName, schoolSkillIndex, skillsMatching } from "../src/server/questions/skill-questions";
import { familiesMatching, familyOptions, listBankPage } from "../src/server/admin/questions-list";
import { builderSkills } from "../src/server/tests/assessments";
import { masterSkills } from "../src/server/skills/master";
import { teacherCurriculum } from "../src/server/teacher/assign";
import { skillPool } from "../src/server/teacher/skill-assign";
import { createDraft } from "../src/server/admin/questions";

const s = (v: unknown) => String(v ?? "");
const NAMES: string[] = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/all-skills.json"), "utf8"));
/** what a teacher may type: "and" for "&", the curly apostrophe, another case */
const variants = (n: string) => [...new Set([n, n.replace(/&/g, "and"), n.replace(/'/g, "’"), n.toLowerCase(), n.toUpperCase()])];

describe("🔎 every skill is findable everywhere", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId = "";
  let present: { name: string; ids: string[]; grades: number[]; key: string }[] = [];
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = admin.schoolId!;
    // the gap sets (2 questions each keep the test quick: the skills are created all the same)
    // the gap sets + the r73 / r74 new skills (2 questions each keep the test quick: the skills are created all the same)
    const gap = [...await loadSkillSetsFile("gap-skill-sets.json"), ...await loadSkillSetsFile("new-skill-sets.json"), ...await loadSkillSetsFile("agreement-skill-sets.json")].map((x) => ({ ...x, questions: x.questions.slice(0, 2) }));
    const r = await addSkillSets(repo, schoolId, gap);
    assert.deepEqual(r.flatMap((x) => x.errors), []);
    const idx = await schoolSkillIndex(repo, schoolId);
    present = NAMES.map((name) => {
      const ks = [...idx.skillOf.values()].filter((k) => normalizeSkillName(k.name) === normalizeSkillName(name) && !k.code.endsWith(".curriculum-map-unclassified"));
      return { name, ids: ks.map((k) => k.id), grades: ks.map((k) => k.grade), key: ks.length ? idx.keyOf.get(ks[0].id)! : "" };
    }).filter((x) => x.ids.length);
    // one published question for every skill pool that has none yet (so the search has something to list)
    const counts = await countQuestionsOfSkills(repo, schoolId, present.map((x) => x.ids[0]));
    for (const x of present) if (!(counts.get(x.ids[0]) ?? 0)) {
      const id = await createDraft(repo, admin, { skillId: x.ids[0], stem: `Practice for ${x.name}: which word fits?`, level: 4, type: "MULTIPLE_CHOICE", whyCorrect: "It fits.", options: [{ label: "A", text: "one", correct: true }, { label: "B", text: "two", correct: false, rationale: "Read again." }] } as never);
      await repo.updateMany("Question", { id }, { status: "PUBLISHED", publishedAt: new Date() });
      counts.set(x.ids[0], 1);
    }
  });

  test("the 148 names; those the demo school has (all but the two school-supplied MAP sets) are active", async () => {
    assert.equal(NAMES.length, 148);
    const missing = NAMES.filter((n) => !present.some((x) => x.name === n));
    assert.deepEqual(missing.sort(), ["Persuasive Techniques", "Rhetorical Questions"], "only the school-supplied sets are not in the demo school");
    const idx = await schoolSkillIndex(repo, schoolId);
    for (const x of present) for (const id of x.ids) assert.ok(idx.skillOf.get(id)!.isActive, `${x.name} is active`);
  });

  test("Question Bank search: a skill's name (any spelling) lists that skill's questions; skills matching finds it", async () => {
    const idx = await schoolSkillIndex(repo, schoolId);
    for (const x of present) for (const q of variants(x.name)) {
      const page = await listBankPage(repo, admin, { q, status: "ALL" });
      assert.ok(page.rows.length > 0, `search "${q}" lists questions`);
      assert.ok(page.rows.every((r) => idx.keyOf.get(r.skillId) === x.key), `search "${q}" lists only that skill's questions`);
      const m = await skillsMatching(repo, schoolId, q);
      assert.ok(m.some((k) => (k.familySkillIds ?? [k.id]).some((id) => x.ids.includes(id))), `skills matching "${q}"`);
    }
  });

  test("Question Bank skill filter: every name is an option (also the second name of a shared pool) and quick links find it", async () => {
    const opts = await familyOptions(repo, admin);
    for (const x of present) {
      const o = opts.find((f) => f.key === x.key);
      assert.ok(o && o.names.some((n) => normalizeSkillName(n) === normalizeSkillName(x.name)), `filter has ${x.name}`);
      assert.ok(o!.name.includes(o!.names[0]));
      for (const q of variants(x.name)) assert.ok((await familiesMatching(repo, admin, q)).some((f) => f.key === x.key), `quick link for "${q}"`);
    }
  });

  test("teacher test builder: every skill is in the picker and its search finds it", async () => {
    const all = await builderSkills(repo, teacher);
    for (const x of present) {
      // one row per shared pool (the teacher's grade copy stands for every grade's copy)
      for (const id of x.ids) assert.ok(all.some((b) => b.skillIds.includes(id)), `picker has ${x.name} (${id})`);
      for (const q of variants(x.name)) assert.ok((await builderSkills(repo, teacher, { q })).some((b) => b.skillIds.some((id) => x.ids.includes(id))), `builder search "${q}"`);
    }
  });

  test("assign: Assignments → New list, the Curriculum page of each grade (Assign button) and Assign a skill", async () => {
    const master = await masterSkills(repo, schoolId);
    const byGrade = new Map<number, Set<string>>();
    for (const g of [...new Set(present.flatMap((x) => x.grades))]) {
      const view = await teacherCurriculum(repo, teacher, undefined, { grade: g });
      byGrade.set(g, new Set(view!.units.flatMap((u) => u.skills.map((k) => k.id))));
    }
    for (const x of present) x.ids.forEach((id, i) => {
      assert.ok(master.some((m) => m.id === id), `Skills page / Assignments → New has ${x.name}`);
      assert.ok(byGrade.get(x.grades[i])!.has(id), `Curriculum (Grade ${x.grades[i]}) lists ${x.name}`);
    });
    for (const x of present) {
      const pool = await skillPool(repo, schoolId, x.ids[0]);
      assert.equal(pool.skill.name.length > 0, true);
      assert.ok(pool.byLevel.BELOW.length + pool.byLevel.ON.length + pool.byLevel.ABOVE.length > 0, `Assign a skill: ${x.name} has questions`);
    }
  });

  test("a set named with '&' or another apostrophe goes to the skill that exists (no copy is made)", async () => {
    const x = present.find((p) => p.name === "Character Traits & Development")!;
    assert.ok(x, "the demo school has Character Traits & Development");
    const before = (await schoolSkillIndex(repo, schoolId)).ids.size;
    const [r] = await addSkillSets(repo, schoolId, [{ skill: "character traits and development", questions: [{ ref: "T1", level: "ON", stem: "Which word tells how the girl changes by the end?", options: ["braver", "taller", "older", "louder"], correct: "A", why: "She faces her fear." }] }], undefined, new Date(), { onlyExisting: true });
    assert.deepEqual(r.errors, []); assert.equal(r.added, 1);
    assert.equal((await schoolSkillIndex(repo, schoolId)).ids.size, before, "no new skill");
    const q = (await repo.findMany("Question", { stem: "Which word tells how the girl changes by the end?" }))[0];
    assert.ok(x.ids.includes(s(q.skillId)));
  });
});
