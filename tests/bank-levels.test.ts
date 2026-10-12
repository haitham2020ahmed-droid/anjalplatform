/**
 * 🏦 The Question Bank by skill + level, not grade (Update 54) — demo school in memory, never a real database:
 *   - levels on one RIT scale: a Grade 4 "On" question is easier for a Grade 6 student (its difficulty moves down)
 *   - Curriculum Map questions are not bank questions: not in practice pools, not in bank counts or lists
 *   - a finished Curriculum Map lesson continues with bank practice of its skill in the same assignment
 *   - the gap question file: 58 skills × 9 questions, Below / On / Above, loaded idempotently; Grade 7–12 questions
 *     keep their real difficulty
 *   - Question Check lists bank questions without a level
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { levelFor, ritOf, thetaShift, mapLinkedQuestionIds } from "../src/server/questions/bank-scope";
import { loadSkillItems } from "../src/server/practice/items";
import { countQuestionsOfSkills, questionsOfSkill } from "../src/server/questions/skill-questions";
import { addSkillSets, loadSkillSetsFile } from "../src/server/questions/skill-sets";
import { listBankPage } from "../src/server/admin/questions-list";
import { questionsWithoutLevel } from "../src/server/questions/bank-levels";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("🏦 bank by skill + level", () => {
  test("one RIT scale: Grade 4 'On' is easier for Grade 6, harder for Grade 3; levels for a student's grade", () => {
    assert.ok(thetaShift(4, 6) < 0, "a Grade 4 question moves down for a Grade 6 student");
    assert.ok(thetaShift(6, 4) > 0, "a Grade 6 question moves up for a Grade 4 student");
    assert.equal(thetaShift(5, 5), 0);
    assert.equal(levelFor(ritOf(4, 4), 6), "BELOW");
    assert.equal(levelFor(ritOf(4, 6), 6), "ON");
    assert.equal(levelFor(ritOf(6, 6), 4), "ABOVE");
  });

  let repo: SqliteRepo; let admin: Actor; let schoolId = ""; let g4 = ""; let g6 = ""; let mapQ = ""; let bankQ = "";
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = admin.schoolId!;
    const grade = async (level: number) => (await repo.findMany("Grade", { schoolId, level }))[0];
    const cur = async (level: number) => (await repo.findMany("Curriculum", { gradeId: (await grade(level)).id }))[0];
    const fam = s((await repo.upsert("SkillFamily", { code: "school.reading.comprehension" }, { name: "reading · comprehension", domain: "READING", category: "COMPREHENSION" })).id);
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const mkSkill = async (level: number) => s((await repo.create("Skill", { curriculumId: (await cur(level)).id, familyId: fam, code: `BL.G${level}.zz`, name: "Zephyr Gist Finding", domain: "READING", category: "COMPREHENSION", sequence: 9400, isActive: true })).id);
    g4 = await mkSkill(4); g6 = await mkSkill(6);
    const mkQ = async (skillId: string, stem: string) => {
      const q = await repo.create("Question", { skillId, typeId: mc, stem, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
      for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `${stem} ${o}`, isCorrect: i === 0, order: i });
      return s(q.id);
    };
    bankQ = await mkQ(g4, "Bank question for the gist?");
    await mkQ(g6, "Grade 6 bank question for the gist?");
    mapQ = await mkQ(g4, "Lesson question about the story's gist?");
    const node = (await repo.findMany("CurriculumMapNode", {}, { take: 1 }))[0]
      ?? await repo.create("CurriculumMapNode", { gradeId: (await grade(4)).id, kind: "CATEGORY", code: "G4.U9.TS9.CV", title: "Concept Vocabulary", acceptsQuestions: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
    await repo.create("QuestionMapLink", { questionId: mapQ, nodeId: node.id });
  });

  test("a Grade 6 student's pool: Grade 4 'On' questions are easier; Curriculum Map questions are left out", async () => {
    const items = await loadSkillItems(repo, g6);
    const ids = items.map((i) => i.questionId);
    assert.ok(ids.includes(bankQ));
    assert.ok((await mapLinkedQuestionIds(repo)).has(mapQ), "the lesson question is linked to the map");
    {
      assert.ok(!ids.includes(mapQ), "the lesson's question is not a bank question");
      assert.equal((await countQuestionsOfSkills(repo, schoolId, [g6])).get(g6), 2, "the bank count leaves the lesson question out");
      assert.ok(!(await questionsOfSkill(repo, schoolId, g6)).some((q) => q.id === mapQ));
      const bank = await listBankPage(repo, admin, { skillId: g4, status: "ALL" });
      assert.ok(!bank.rows.some((r) => r.id === mapQ), "the bank list leaves it out");
      const map = await listBankPage(repo, admin, { skillId: g4, status: "ALL", source: "MAP" });
      assert.ok(map.rows.some((r) => r.id === mapQ && r.onMap), "the Curriculum Map tab shows it");
    }
    const g4item = items.find((i) => i.questionId === bankQ)!, g6item = items.find((i) => i.grade === 6)!;
    assert.ok(g4item.irt.b < g6item.irt.b, "the Grade 4 question sits below the Grade 6 one for this student");
    const fromG4 = (await loadSkillItems(repo, g4)).find((i) => i.grade === 6)!;
    assert.ok(fromG4.irt.b > 0, "and a Grade 6 question is harder for a Grade 4 student");
  });

  test("Question Check → No level lists bank questions without a level", async () => {
    const id = s((await repo.create("Question", { skillId: g4, typeId: s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id), stem: "No level here?", content: {}, difficultyLevel: 0, irtB: 0, status: "DRAFT", createdAt: new Date(), updatedAt: new Date() })).id);
    assert.ok((await questionsWithoutLevel(repo, admin)).some((r) => r.id === id));
  });

  test("the gap file: 71 skills, 9 questions each (3 Below, 3 On, 3 Above), 4 options and a key", async () => {
    const sets = await loadSkillSetsFile("gap-skill-sets.json");
    assert.equal(sets.length, 71);
    for (const set of sets) {
      assert.equal(set.questions.length, 9, set.skill);
      for (const lv of ["Below", "On", "Above"]) assert.equal(set.questions.filter((q) => q.level === lv).length, 3, `${set.skill} ${lv}`);
      for (const q of set.questions) { assert.equal(q.options!.length, 4); assert.match(q.correct!, /^[ABCD]$/); assert.ok(q.options![("ABCD").indexOf(q.correct!)]); }
    }
    const keys = new Set(sets.flatMap((x) => x.questions.map((q) => q.correct)));
    assert.equal(keys.size, 4, "the correct answer is not always in the same position");
  });

  test("loading two gap sets: skills in Grades 4–6, questions published; a Grade 9 question keeps its difficulty; idempotent", async () => {
    const sets = (await loadSkillSetsFile("gap-skill-sets.json")).filter((x) => ["Text Structure: Chronology", "Parallel Structure"].includes(x.skill));
    const r = await addSkillSets(repo, schoolId, sets);
    for (const x of r) { assert.deepEqual(x.errors, []); assert.equal(x.added, 9); assert.ok(x.skillsCreated >= 1); }
    const par = (await repo.findMany("Skill", { name: "Parallel Structure" }));
    assert.ok(par.length >= 1);
    const qs = await repo.findMany("Question", { skillId: { in: par.map((k) => k.id) } }, { select: ["irtB", "difficultyLevel", "status", "mapInstructionalArea"] });
    assert.equal(qs.length, 9);
    assert.ok(qs.every((q) => q.status === "PUBLISHED"));
    assert.ok(qs.some((q) => Number(q.irtB) > 0.5), "Grade 9 questions are harder than Grade 6 On level");
    assert.ok(qs.every((q) => q.mapInstructionalArea === "Language: Understand, Edit for Grammar, Usage"));
    const again = await addSkillSets(repo, schoolId, sets);
    for (const x of again) { assert.equal(x.added, 0); assert.equal(x.skillsCreated, 0); }
  });

  test("Update 55 sets: a Grade 1 picture skill and a Speaking & Listening skill load, searchable by skill name; Grade 1 questions are the easiest", async () => {
    const sets = (await loadSkillSetsFile("gap-skill-sets.json")).filter((x) => ["Matching a Picture to a Definition", "A Speaker's Reasons and Evidence"].includes(x.skill));
    assert.equal(sets.length, 2);
    for (const x of await addSkillSets(repo, schoolId, sets)) { assert.deepEqual(x.errors, []); assert.equal(x.added, 9); }
    const pic = await repo.findMany("Skill", { name: "Matching a Picture to a Definition" });
    const qs = await repo.findMany("Question", { skillId: { in: pic.map((k) => k.id) } }, { select: ["irtB", "difficultyLevel", "status"] });
    assert.equal(qs.length, 9);
    assert.ok(qs.every((q) => Number(q.irtB) < -1 && Number(q.difficultyLevel) <= 2), "Grade 1 questions sit well below Grade 4 On level");
    const bank = await listBankPage(repo, admin, { q: "speaker's reasons", status: "ALL" });
    assert.ok(bank.rows.length >= 9 && bank.rows.every((r) => r.skill === "A Speaker's Reasons and Evidence"), "searching the skill's name lists its questions");
  });
});
