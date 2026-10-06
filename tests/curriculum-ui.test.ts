import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { addLesson, addPrerequisite, getUnitEditor, linkSkillToLesson, linkStandard, unlinkSkillFromLesson, updateUnit, wouldCreateCycle } from "../src/server/curriculum-admin";
import { getStudentCurriculum, getUnitSkillCards } from "../src/server/queries/student-curriculum";
import { seedQuestions } from "../src/server/seeding/questions";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { demoDatabase, ROOT } from "./helpers/db";

let repo: SqliteRepo;
let studentId: string;
const user = async (u: string) => (await repo.findUnique("User", { username: u }))!;

before(async () => {
  ({ repo } = await demoDatabase());
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  // publish the Grade 4 bank so skills become practisable
  const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
  await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
  studentId = String((await repo.findUnique("Student", { userId: (await user("demo.s1001")).id }))!.id);
});

describe("student learning flow", () => {
  test("grade → book → six units, each with lessons and skills", async () => {
    const c = await getStudentCurriculum(repo, studentId);
    assert.equal(c.grade, 4);
    assert.equal(c.bookTitle, "Wonders");
    assert.equal(c.edition, "2023");
    assert.equal(c.units.length, 6);
    assert.ok(c.units.every((u) => u.lessons.length >= 3 && u.skills > 5));
    assert.equal(c.units.filter((u) => u.isCurrent).length, 1);
    assert.equal(c.units[0].isCurrent, true, "a new student starts in Unit 1");
  });

  test("skill cards show every field the brief asks for", async () => {
    const c = await getStudentCurriculum(repo, studentId);
    const { cards } = await getUnitSkillCards(repo, studentId, c.units[0].unitId);
    assert.ok(cards.length > 5);
    for (const k of cards) {
      for (const f of ["name", "category", "mastery", "bandLabel", "attempts", "isMastered", "recommended", "canPractice"] as const) assert.ok(f in k, f);
      assert.equal(k.accuracy, null, "no accuracy before any attempt");
    }
    const compare = cards.find((k) => k.name.startsWith("Text Structure: Compare"));
    assert.ok(compare && compare.taughtIn.length > 0, "cards say which lessons teach the skill");
  });

  test("only skills with published questions can be practised; recommendations point to practisable skills", async () => {
    const c = await getStudentCurriculum(repo, studentId);
    // make one skill question-less for this check (the bank grows, so no skill is guaranteed to be empty)
    const before = (await getUnitSkillCards(repo, studentId, c.units[0].unitId)).cards;
    const emptied = before.find((k) => k.canPractice)!;
    const ids = (await repo.findMany("Question", { skillId: emptied.skillId, status: "PUBLISHED" })).map((q) => q.id);
    await repo.updateMany("Question", { id: { in: ids } }, { status: "ARCHIVED" });
    try {
      const { cards } = await getUnitSkillCards(repo, studentId, c.units[0].unitId);
      assert.ok(cards.some((k) => k.canPractice) && cards.some((k) => !k.canPractice));
      assert.equal(cards.find((k) => k.skillId === emptied.skillId)!.canPractice, false);
      for (const k of cards.filter((x) => x.recommended)) assert.ok(k.canPractice && k.recommendedReason);
      assert.ok(cards.filter((k) => k.recommended).length <= 3);
    } finally {
      await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
    }
  });

  test("mastery, attempts and accuracy come from the student's own record; mastered skills are not recommended", async () => {
    const c = await getStudentCurriculum(repo, studentId);
    const { cards } = await getUnitSkillCards(repo, studentId, c.units[0].unitId);
    const target = cards.find((k) => k.canPractice)!;
    await repo.upsert("StudentSkillMastery", { studentId, skillId: target.skillId }, { score: 93, band: "MASTERED", attempts: 22, correct: 18, isMastered: true, maxLevelCorrect: 6, lastPracticedAt: new Date() });
    const after = (await getUnitSkillCards(repo, studentId, c.units[0].unitId)).cards.find((k) => k.skillId === target.skillId)!;
    assert.equal(after.mastery, 93);
    assert.equal(after.bandLabel, "Mastered");
    assert.equal(after.attempts, 22);
    assert.equal(after.accuracy, 82);
    assert.equal(after.recommended, false);
  });

  test("unit progress counts Proficient-or-better skills", async () => {
    const c = await getStudentCurriculum(repo, studentId);
    assert.ok(c.units[0].proficientOrBetter >= 1 && c.units[0].mastered >= 1);
    assert.ok(c.units[0].progressPct > 0);
  });

  test("a unit from another grade is refused", async () => {
    const g5 = (await repo.findMany("Grade", { level: 5 }))[0];
    const cur5 = (await repo.findMany("Curriculum", { gradeId: g5.id }))[0];
    const unit5 = (await repo.findMany("Unit", { curriculumId: cur5.id }))[0];
    await assert.rejects(getUnitSkillCards(repo, studentId, String(unit5.id)), /not part of the student's curriculum/);
  });
});

describe("curriculum editor", () => {
  const g4Unit1 = async () => {
    const st = (await repo.findUnique("Student", { id: studentId }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
    return (await repo.findUnique("Unit", { curriculumId: cur.id, number: 1 }))!;
  };

  test("teachers cannot edit the curriculum without a grant; admins can, and edits are audited", async () => {
    const unit = await g4Unit1();
    const teacher = await resolveActor(repo, await user("demo.teacher.4a"));
    await assert.rejects(updateUnit(repo, teacher, String(unit.id), { title: "Hacked" }), /Missing permission/);
    const admin = await resolveActor(repo, await user("demo.admin"));
    const u = await updateUnit(repo, admin, String(unit.id), { title: "  Unit 1:   Making Choices  " });
    assert.equal(u.title, "Unit 1: Making Choices");
    assert.ok((await repo.count("AuditLog", { action: "curriculum.unit.update" })) >= 1);
  });

  test("an admin cannot edit another school's curriculum", async () => {
    const other = await repo.create("School", { code: "OTHER-2", name: "Other" });
    const otherAdminUser = await repo.create("User", { username: "other.admin", displayName: "x", role: "SCHOOL_ADMIN", schoolId: other.id });
    const otherAdmin = await resolveActor(repo, otherAdminUser);
    const unit = await g4Unit1();
    await assert.rejects(updateUnit(repo, otherAdmin, String(unit.id), { title: "x" }), /another school/);
  });

  test("lessons can be added; skill links appear in the unit and can be removed", async () => {
    const admin = await resolveActor(repo, await user("demo.admin"));
    const unit = await g4Unit1();
    const lesson = await addLesson(repo, admin, String(unit.id), { title: "Review Week" });
    const ed = await getUnitEditor(repo, admin, String(unit.id));
    const skill = ed.skillPool.find((s) => s.name === "Theme")!;
    await linkSkillToLesson(repo, admin, String(lesson.id), skill.id, "COMPREHENSION_SKILL");
    await linkSkillToLesson(repo, admin, String(lesson.id), skill.id, "COMPREHENSION_SKILL"); // idempotent
    const ed2 = await getUnitEditor(repo, admin, String(unit.id));
    assert.equal(ed2.lessons.find((l) => l.id === lesson.id)!.skills.length, 1);
    assert.ok((await repo.count("UnitSkill", { unitId: unit.id, skillId: skill.id })) === 1);
    await unlinkSkillFromLesson(repo, admin, String(lesson.id), skill.id);
    assert.equal((await getUnitEditor(repo, admin, String(unit.id))).lessons.find((l) => l.id === lesson.id)!.skills.length, 0);
  });

  test("a skill from another grade cannot be linked to a lesson", async () => {
    const admin = await resolveActor(repo, await user("demo.admin"));
    const unit = await g4Unit1();
    const lesson = (await repo.findMany("Lesson", { unitId: unit.id }))[0];
    const g6skill = (await repo.findMany("Skill", { code: "G6.theme" }))[0];
    await assert.rejects(linkSkillToLesson(repo, admin, String(lesson.id), String(g6skill.id), "COMPREHENSION_SKILL"), /not part of this grade/);
  });

  test("prerequisites: loops are refused (direct, indirect and self)", async () => {
    const admin = await resolveActor(repo, await user("demo.admin"));
    const cur = (await g4Unit1()).curriculumId;
    const sk = async (code: string) => String((await repo.findUnique("Skill", { curriculumId: cur, code }))!.id);
    const nouns = await sk("G4.nouns");
    const subj = await sk("G4.subjects-predicates");
    const sentences = await sk("G4.sentences");
    // seeded chain: sentences → subjects-predicates → nouns
    assert.equal(await wouldCreateCycle(repo, nouns, sentences), true, "nouns cannot depend on sentences (indirect loop)");
    await assert.rejects(addPrerequisite(repo, admin, nouns, sentences), /loop/);
    await assert.rejects(addPrerequisite(repo, admin, subj, subj), /loop/);
    const adjectives = await sk("G4.adjectives");
    await addPrerequisite(repo, admin, adjectives, nouns, 0.4, 55);
    assert.equal(await repo.count("SkillPrerequisite", { skillId: adjectives, prerequisiteSkillId: nouns }), 1);
  });

  test("standards can be linked by official code; unknown codes are refused", async () => {
    const admin = await resolveActor(repo, await user("demo.admin"));
    const cur = (await g4Unit1()).curriculumId;
    const skill = String((await repo.findUnique("Skill", { curriculumId: cur, code: "G4.theme" }))!.id);
    await linkStandard(repo, admin, skill, "CCSS.ELA-LITERACY.RL.4.9");
    await assert.rejects(linkStandard(repo, admin, skill, "CCSS.ELA-LITERACY.RL.4.99"), /Unknown standard/);
  });
});
