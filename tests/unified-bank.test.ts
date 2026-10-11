/**
 * ONE question bank without grade classification (demo school, in memory; no real data):
 *   - the same skill of Grade 4 and Grade 5 (a skill FAMILY: same normalized name + kind) reads one pool
 *   - Concept Vocabulary stays with its grade (not pooled)
 *   - the level filter applies to the pool exactly as before
 *   - mastery and attempts stay on the skill the student opened
 *   - the search (skillsMatching) shows one entry per family with the pooled count
 *   - a teacher's chosen question ids are used alone, in order
 *   - the question picker is for teachers and admins only
 *   - the family report is read only
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedQuestions } from "../src/server/seeding/questions";
import { loadBank } from "../src/server/seeding/load-files";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import {
  countQuestionsOfSkill, countQuestionsOfSkills, familyKeyOf, isGradeBoundSkill, normalizeSkillName, ownSkillIdForStudent, questionsOfSkill,
  selectSkillQuestions, skillFamilyIds, skillFamilyReport, skillsMatching,
} from "../src/server/questions/skill-questions";
import { listSkillQuestionsForTeacher } from "../src/server/questions/skill-picker";
import { loadSkillItems } from "../src/server/practice/items";
import { startPractice, submitAnswer } from "../src/server/practice/session";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase, ROOT, seededRandom } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("one question bank · skill families across grades", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let schoolId: string;
  const grade: Record<number, string> = {};
  const cur: Record<number, string> = {};
  const id: Record<string, string> = {};
  let mcType = "";
  let familyId = "";

  const mkSkill = async (g: number, name: string, code: string, domain = "READING", category = "COMPREHENSION") =>
    s((await repo.create("Skill", { curriculumId: cur[g], familyId, code, name, domain, category, sequence: 9000, isActive: true })).id);
  const mkQ = async (skillId: string, stem: string, level: number) => {
    const q = await repo.create("Question", { skillId, typeId: mcType, stem, content: {}, difficultyLevel: level, irtB: (level - 4) * 0.6, status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
    for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Choice ${o} for ${stem.slice(-8)}`, isCorrect: i === 0, order: i });
    return s(q.id);
  };

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    await repo.updateMany("Question", { deletedAt: null }, { status: "PUBLISHED" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = s(admin.schoolId);
    for (const g of [4, 5, 6]) {
      grade[g] = s((await repo.findMany("Grade", { schoolId, level: g }))[0].id);
      cur[g] = s((await repo.findMany("Curriculum", { gradeId: grade[g] }))[0].id);
    }
    const st = (await repo.findMany("Student", { gradeId: grade[4] }))[0];
    student = await resolveActor(repo, (await repo.findUnique("User", { id: st.userId }))!);
    mcType = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    familyId = s((await repo.upsert("SkillFamily", { code: "school.reading.comprehension" }, { name: "reading · comprehension", domain: "READING", category: "COMPREHENSION" })).id);

    // “Main Idea” in Grade 4 (no questions of its own) and Grade 5 (questions at three levels)
    id.g4 = await mkSkill(4, "Main Idea", "G4.ub-main-idea");
    id.g5 = await mkSkill(5, "main  idea.", "G5.ub-main-idea");
    id.qBelow = await mkQ(id.g5, "UB main idea below 1", 2);
    id.qOn1 = await mkQ(id.g5, "UB main idea on 1", 4);
    id.qOn2 = await mkQ(id.g5, "UB main idea on 2", 4);
    id.qAbove = await mkQ(id.g5, "UB main idea above 1", 5);
    id.qOn3 = await mkQ(id.g5, "UB main idea on 3", 4);
    id.qOn4 = await mkQ(id.g5, "UB main idea on 4", 4);
    // Concept Vocabulary of Grades 4 and 5: the words of each grade's texts — never pooled
    id.cv4 = await mkSkill(4, "Concept Vocabulary", "G4.ub-concept-vocabulary", "VOCABULARY", "VOCABULARY");
    id.cv5 = await mkSkill(5, "Concept Vocabulary", "G5.ub-concept-vocabulary", "VOCABULARY", "VOCABULARY");
    id.cvQ4 = await mkQ(id.cv4, "UB cv grade four word", 4);
    id.cvQ5 = await mkQ(id.cv5, "UB cv grade five word", 4);
  });

  test("the family key: same normalized name and kind; Concept Vocabulary is grade-bound", () => {
    assert.equal(normalizeSkillName("Author’s Purpose (Grade 4)"), normalizeSkillName("authors   purpose"));
    assert.equal(familyKeyOf({ id: "a", name: "Main Idea", domain: "READING" }), familyKeyOf({ id: "b", name: "main idea!", domain: "READING" }));
    assert.notEqual(familyKeyOf({ id: "a", name: "Commas", domain: "GRAMMAR" }), familyKeyOf({ id: "b", name: "Commas", domain: "READING" }));
    assert.equal(familyKeyOf({ id: "a", name: "Commas", domain: "GRAMMAR" }), familyKeyOf({ id: "b", name: "Commas", domain: "LANGUAGE" }));
    assert.ok(isGradeBoundSkill({ name: "Concept Vocabulary", code: "G4.cv" }));
    assert.ok(isGradeBoundSkill({ name: "Vocabulary: Text Set 2", code: "G5.x" }));
    assert.ok(familyKeyOf({ id: "a", name: "Concept Vocabulary", domain: "VOCABULARY" }).startsWith("solo:"));
  });

  test("Grade 4 and Grade 5 Main Idea read one pool (same questions, same count)", async () => {
    const fam = await skillFamilyIds(repo, id.g4);
    assert.equal(fam[0], id.g4);
    assert.ok(fam.includes(id.g5));
    assert.deepEqual(new Set(await skillFamilyIds(repo, id.g5)), new Set(fam));
    const a = (await questionsOfSkill(repo, schoolId, id.g4)).map((q) => q.id).sort();
    const b = (await questionsOfSkill(repo, schoolId, id.g5)).map((q) => q.id).sort();
    assert.deepEqual(a, b);
    for (const q of [id.qBelow, id.qOn1, id.qAbove]) assert.ok(a.includes(q));
    assert.equal(await countQuestionsOfSkill(repo, schoolId, id.g4), 6);
    assert.equal(await countQuestionsOfSkill(repo, schoolId, id.g5), 6);
    // the own (not pooled) count stays per row
    assert.equal((await countQuestionsOfSkills(repo, schoolId, [id.g4], { own: true })).get(id.g4), 0);
    // practice items of the Grade 4 skill: the pool, tagged with the Grade 4 skill
    const items = await loadSkillItems(repo, id.g4);
    assert.equal(items.length, 6);
    assert.ok(items.every((i) => i.skillKey === id.g4));
  });

  test("Concept Vocabulary does not pool", async () => {
    assert.deepEqual(await skillFamilyIds(repo, id.cv4), [id.cv4]);
    assert.deepEqual((await questionsOfSkill(repo, schoolId, id.cv4)).map((q) => q.id), [id.cvQ4]);
    assert.deepEqual((await questionsOfSkill(repo, schoolId, id.cv5)).map((q) => q.id), [id.cvQ5]);
    assert.equal(await countQuestionsOfSkill(repo, schoolId, id.cv4), 1);
    assert.deepEqual((await loadSkillItems(repo, id.cv5)).map((i) => i.questionId), [id.cvQ5]);
  });

  test("the level filter still applies to the pool", async () => {
    const on = await questionsOfSkill(repo, schoolId, id.g4, { level: "ON" });
    assert.equal(on.length, 4);
    assert.ok(on.every((q) => q.difficultyLevel === 4));
    assert.deepEqual((await questionsOfSkill(repo, schoolId, id.g4, { level: "BELOW" })).map((q) => q.id), [id.qBelow]);
    assert.deepEqual((await questionsOfSkill(repo, schoolId, id.g4, { level: "ABOVE" })).map((q) => q.id), [id.qAbove]);
    assert.equal(await countQuestionsOfSkill(repo, schoolId, id.g4, { level: "ON" }), 4);
  });

  test("mastery and attempts are recorded on the skill the student opened (Grade 4), not the question's row", async () => {
    const rng = seededRandom(7);
    let view = await startPractice(repo, student, id.g4, new Date("2026-09-01T08:00:00Z"), rng);
    assert.ok(view.question);
    const qid = view.question!.questionId;
    ({ view } = await submitAnswer(repo, student, { sessionId: view.sessionId, questionId: qid, response: "A" }, new Date("2026-09-01T08:00:40Z"), rng));
    await afterResponseSettled();
    const att = await repo.findMany("QuestionAttempt", { studentId: student.studentId, questionId: qid });
    assert.equal(att.length, 1);
    assert.equal(s(att[0].skillId), id.g4);
    assert.ok(await repo.findUnique("StudentSkillMastery", { studentId: student.studentId, skillId: id.g4 }));
    assert.equal(await repo.findUnique("StudentSkillMastery", { studentId: student.studentId, skillId: id.g5 }), null);
    // the helper: a pooled question of another grade's copy → the student's own grade's copy
    assert.equal(await ownSkillIdForStudent(repo, schoolId, s(student.studentId), id.g5), id.g4);
    assert.equal(await ownSkillIdForStudent(repo, schoolId, s(student.studentId), id.cv5), id.cv5);
  });

  test("skillsMatching returns one entry per family, with the pooled count", async () => {
    const all = (await skillsMatching(repo, schoolId, "main idea")).filter((m) => m.familySkillIds?.includes(id.g4));
    assert.equal(all.length, 1);
    assert.equal(all[0].questions, 6);
    assert.ok(all[0].familySkillIds!.includes(id.g5));
    assert.ok(all[0].familyKey);
    // no grade asked: the nearest (lowest) grade that has questions of its own → Grade 5
    assert.equal(all[0].id, id.g5);
    // the asked grade's copy stands for the family
    const g4 = (await skillsMatching(repo, schoolId, "main idea", { grade: 4 })).filter((m) => m.familySkillIds?.includes(id.g4));
    assert.equal(g4.length, 1);
    assert.equal(g4[0].id, id.g4);
    assert.equal(g4[0].questions, 6);
    // a grade-bound skill is listed for its own grade only
    const cv = await skillsMatching(repo, schoolId, "concept vocabulary", { grade: 4 });
    assert.ok(cv.some((m) => m.id === id.cv4));
    assert.ok(!cv.some((m) => m.id === id.cv5));
    // no duplicates across the whole result
    const keys = (await skillsMatching(repo, schoolId, "idea")).map((m) => m.familyKey);
    assert.equal(new Set(keys).size, keys.length);
  });

  test("explicit question ids are used alone and in order; otherwise automatic at the level", async () => {
    const chosen = await selectSkillQuestions(repo, schoolId, id.g4, { questionIds: [id.qAbove, id.qBelow, "nope", id.qBelow] });
    assert.deepEqual(chosen.map((q) => q.id), [id.qAbove, id.qBelow]);
    const auto = await selectSkillQuestions(repo, schoolId, id.g4, { level: "ON" });
    assert.equal(auto.length, 4);
    const items = await loadSkillItems(repo, id.g4, { questionIds: [id.qOn2, id.qOn1] });
    assert.deepEqual(items.map((i) => i.questionId), [id.qOn2, id.qOn1]);
    assert.ok(items.every((i) => i.skillKey === id.g4));
  });

  test("the question picker: teachers and admins only, pooled, level and search filters, limit ≤ 200", async () => {
    await assert.rejects(listSkillQuestionsForTeacher(repo, student, id.g4), ForbiddenError);
    const r = await listSkillQuestionsForTeacher(repo, teacher, id.g4, { limit: 500 });
    assert.equal(r.skill.id, id.g4);
    assert.equal(r.total, 6);
    assert.equal(r.questions.length, 6);
    const q = r.questions.find((x) => x.id === id.qOn1)!;
    assert.equal(q.level, "ON");
    assert.equal(q.type, "MULTIPLE_CHOICE");
    assert.equal(q.choices.length, 3);
    assert.match(q.correctAnswer, /^A\./);
    assert.equal(q.skillId, id.g5);
    const on = await listSkillQuestionsForTeacher(repo, admin, id.g5, { level: "ON", search: "on 2" });
    assert.deepEqual(on.questions.map((x) => x.id), [id.qOn2]);
    const two = await listSkillQuestionsForTeacher(repo, teacher, id.g4, { limit: 2 });
    assert.equal(two.questions.length, 2);
    // a skill of no school the actor belongs to is refused
    await assert.rejects(listSkillQuestionsForTeacher(repo, { ...teacher, schoolId: "other-school" }, id.g4), ForbiddenError);
  });

  test("the family report is read only: name variants and empty skills of a family with questions", async () => {
    const before = await repo.count("Skill", {});
    const r = await skillFamilyReport(repo, schoolId);
    const fam = r.nameVariants.find((f) => f.skills.some((k) => k.id === id.g4));
    assert.ok(fam);
    assert.deepEqual(new Set(fam!.names), new Set(["Main Idea", "main  idea."]));
    assert.ok(r.emptyInFamily.some((e) => e.skill.id === id.g4 && e.familyQuestions === 6));
    assert.ok(!r.emptyInFamily.some((e) => e.skill.id === id.cv4));
    assert.equal(await repo.count("Skill", {}), before);
    assert.equal(s((await repo.findUnique("Skill", { id: id.g5 }))!.name), "main  idea.");
  });
});
