import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Row } from "../src/server/seeding/repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { assignQuestions } from "../src/server/teacher/assign";
import { buildSkillSet, difficultyTargets, findQuestionsForSkill, pickSpread, typicalLevel } from "../src/server/curriculum/question-finder";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("🔎 Curriculum → Question Bank: questions for a curriculum skill", () => {
  let repo: SqliteRepo;
  let teacher: Actor, grade5Teacher: Actor, otherSchoolTeacher: Actor, student: Actor;
  let classId: string, skillId: string, otherSkillId: string, lessonId: string, emptyLessonId: string, otherCurLessonId: string;
  let gradeSkillIds: Set<string>;
  let qDirect: string, qMapped: string, qExtra: string, qDraft: string, qDeleted: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, grade5Teacher, otherSchoolTeacher, student] = await Promise.all(["test.teacher.1", "test.teacher.3", "demo.teacher.4a", "test.student.005"].map(a));
    const klass = (await repo.findMany("Class", { name: "TEST 4A" }))[0];
    classId = s(klass.id);
    const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null });
    gradeSkillIds = new Set(skills.map((k) => s(k.id)));
    const links = await repo.findMany("SkillStandard", { skillId: { in: [...gradeSkillIds] } });
    const qs = await repo.findMany("Question", { skillId: { in: [...gradeSkillIds] } });
    const types = await repo.findMany("QuestionType", {});
    const auto = new Set(types.filter((t) => t.code !== "SHORT_ANSWER" && t.isAutoScored !== false).map((t) => s(t.id)));
    const qOf = (k: string) => qs.filter((q) => s(q.skillId) === k && auto.has(s(q.typeId)));
    // a skill with ≥5 auto-marked questions sharing a standard with another skill of the grade that has questions
    let found: { k: string; k2: string; std: string } | null = null;
    for (const l of links) {
      if (qOf(s(l.skillId)).length < 6) continue;
      const peer = links.find((x) => x.standardId === l.standardId && x.skillId !== l.skillId && qOf(s(x.skillId)).length >= 3);
      if (peer) { found = { k: s(l.skillId), k2: s(peer.skillId), std: s(l.standardId) }; break; }
    }
    assert.ok(found, "the seed has two Grade 4 skills sharing a standard");
    skillId = found.k; otherSkillId = found.k2;
    // a lesson that teaches the skill (and one that has no questions)
    const units = await repo.findMany("Unit", { curriculumId: cur.id });
    const lessons = await repo.findMany("Lesson", { unitId: { in: units.map((u) => u.id) } });
    const teaching = new Set((await repo.findMany("LessonSkill", { skillId })).map((x) => s(x.lessonId)));
    const lesson = lessons.find((l) => teaching.has(s(l.id))) ?? lessons[0];
    if (!teaching.has(s(lesson.id))) await repo.create("LessonSkill", { lessonId: lesson.id, skillId, role: "FOCUS", label: "Focus" });
    lessonId = s(lesson.id);
    emptyLessonId = s(lessons.find((l) => l.id !== lesson.id)!.id);
    const otherCur = (await repo.findMany("Curriculum", {})).find((c) => c.id !== cur.id)!;
    const otherUnits = await repo.findMany("Unit", { curriculumId: otherCur.id });
    otherCurLessonId = s((await repo.findMany("Lesson", { unitId: { in: otherUnits.map((u) => u.id) } }))[0].id);

    const mine = qOf(skillId).sort((x, y) => s(x.id).localeCompare(s(y.id)));
    qDirect = s(mine[0].id); qMapped = s(mine[1].id); qDraft = s(mine[2].id); qDeleted = s(mine[3].id);
    // spread the difficulty so a set can be balanced
    for (const [i, q] of mine.entries()) await repo.updateMany("Question", { id: q.id }, { difficultyLevel: [2, 3, 4, 5, 6, 4, 3, 5][i % 8] });
    await repo.updateMany("Question", { id: qDirect }, { lessonId });                         // linked through Question.lessonId
    await repo.updateMany("Question", { id: qDraft }, { status: "DRAFT" });
    await repo.updateMany("Question", { id: qDeleted }, { deletedAt: new Date() });
    // linked through the lesson's place on the Curriculum Map (G4-U1-TS1 → G4.U1.TS1.ACS.ON)
    const node = await repo.create("CurriculumMapNode", { gradeId: klass.gradeId, kind: "LEVEL", code: `${s(lesson.code).replace(/-/g, ".")}.ACS.ON`, title: "On Level", level: "ON", acceptsQuestions: true, sortOrder: 1 });
    await repo.create("QuestionMapLink", { questionId: qMapped, nodeId: node.id });
    // another skill's question tagged with the skill's standard and placed on the lesson → lesson group too
    qExtra = s(qOf(otherSkillId)[0].id);
    await repo.updateMany("Question", { id: qExtra }, { lessonId, standardId: found.std });
  });

  test("groups: linked to the lesson, same skill, same standard (revision); drafts and deleted excluded", async () => {
    const r = await findQuestionsForSkill(repo, teacher, { skillId, lessonId, classId });
    const ids = (g: "lesson" | "skill" | "standard") => r.groups[g].map((q) => q.id);
    assert.ok(ids("lesson").includes(qDirect), "Question.lessonId");
    assert.ok(ids("lesson").includes(qMapped), "QuestionMapLink on the lesson's map node");
    assert.ok(ids("lesson").includes(qExtra), "same standard + same lesson");
    assert.ok(r.groups.lesson.every((q) => q.lessonLinked));
    assert.ok(!ids("skill").some((id) => ids("lesson").includes(id)), "skill group does not repeat lesson questions");
    assert.ok(ids("skill").length >= 2 && r.groups.skill.every((q) => q.skillId === skillId && !q.lessonLinked));
    assert.ok(ids("standard").length >= 1 && r.groups.standard.every((q) => q.skillId !== skillId && gradeSkillIds.has(q.skillId)), "revision: other skills of the same grade AND school");
    assert.ok(!ids("standard").includes(qExtra));
    assert.ok(r.groups.standard.some((q) => q.skillId === otherSkillId));
    const every = [...ids("lesson"), ...ids("skill"), ...ids("standard")];
    assert.ok(!every.includes(qDraft) && !every.includes(qDeleted), "only published, not deleted");
    assert.equal(r.total, every.length);
    assert.equal(r.skill.grade, 4);
    assert.ok(r.skill.standards.length >= 1);
    assert.ok(r.lessons.some((l) => l.id === lessonId));
    assert.equal(r.byDifficulty.reduce((n, x) => n + x.count, 0), r.groups.lesson.length + r.groups.skill.length);
    assert.ok(r.gaps.some((g) => /^Only \d+ questions for this skill \(20\+ recommended\)/.test(g)));
    assert.ok(r.gaps.some((g) => /DOK 3/.test(g)));
    assert.ok(r.gaps.some((g) => /No questions at difficulty level/.test(g)), "levels 1 and 7 are missing");
    assert.ok(!r.gaps.some((g) => /linked to this lesson/.test(g)));
    assert.ok(r.groups.skill.every((q) => q.stem.length <= 140));
  });

  test("no lesson: everything of the skill is in the skill group; an empty lesson is reported as fine", async () => {
    const r = await findQuestionsForSkill(repo, teacher, { skillId });
    assert.equal(r.groups.lesson.length, 0);
    assert.ok(r.groups.skill.some((q) => q.id === qDirect) && r.groups.skill.some((q) => q.id === qMapped));
    assert.ok(r.groups.standard.some((q) => q.id === qExtra), "without the lesson it is ordinary revision");
    const e = await findQuestionsForSkill(repo, teacher, { skillId, lessonId: emptyLessonId });
    assert.ok(e.gaps.includes("No questions linked to this lesson (fine — skill questions are used)."));
    await assert.rejects(findQuestionsForSkill(repo, teacher, { skillId, lessonId: otherCurLessonId }), ValidationError);
  });

  test("DOK 3 present → no DOK gap", async () => {
    await repo.updateMany("Question", { id: qMapped }, { dok: 3 });
    const r = await findQuestionsForSkill(repo, teacher, { skillId });
    assert.ok(!r.gaps.some((g) => /DOK 3/.test(g)));
    assert.equal(r.byDok.find((x) => x.dok === 3)?.count, 1);
    assert.equal(r.grid[`${r.groups.skill.find((q) => q.id === qMapped)!.difficultyLevel}|3`], 1);
  });

  test("other school's teacher, another class's teacher and students are refused", async () => {
    await assert.rejects(findQuestionsForSkill(repo, otherSchoolTeacher, { skillId }), ForbiddenError);
    await assert.rejects(buildSkillSet(repo, otherSchoolTeacher, { skillId }), ForbiddenError);
    await assert.rejects(findQuestionsForSkill(repo, grade5Teacher, { skillId, classId }), ForbiddenError);
    await assert.rejects(findQuestionsForSkill(repo, student, { skillId }), ForbiddenError);
  });

  test("pure helpers: typical level, spread targets, picking", () => {
    assert.equal(typicalLevel([]), 4);
    assert.equal(typicalLevel([0, 0]), 2);
    assert.equal(typicalLevel([100]), 6);
    assert.equal(typicalLevel([50]), 4);
    assert.deepEqual(difficultyTargets(5, 4), [2, 3, 4, 5, 6]);
    assert.deepEqual(difficultyTargets(3, 6), [4, 6, 7]);
    const mk = (id: string, d: number) => ({ id, difficultyLevel: d });
    const picked = pickSpread([2, 4, 6], [[mk("l1", 4)], [mk("a", 2), mk("b", 6), mk("c", 4)]]);
    assert.deepEqual(picked.map((q) => q.id), ["a", "l1", "b"], "lesson item takes its slot; the skill fills the rest");
  });

  test("buildSkillSet: lesson-linked first, spread across difficulty, revision only when ticked", async () => {
    const plain = await buildSkillSet(repo, teacher, { skillId, lessonId, classId, n: 5 });
    assert.equal(plain.target.from, "DEFAULT");
    assert.equal(plain.target.level, 4);
    assert.ok(plain.questionIds.includes(qDirect) && plain.questionIds.includes(qMapped), "lesson-linked questions come first");
    assert.ok(plain.items.every((q) => q.group !== "standard"), "no revision unless asked");
    assert.ok(new Set(plain.items.map((q) => q.difficultyLevel)).size >= 3, "spread across difficulty");
    assert.ok(!plain.questionIds.includes(qDraft) && !plain.questionIds.includes(qDeleted));
    const withRev = await buildSkillSet(repo, teacher, { skillId, lessonId, classId, n: 10, includeRevision: true });
    const rev = withRev.items.filter((q) => q.group === "standard");
    assert.ok(rev.length >= 1 && rev.length <= 2, "1–2 revision items");
    assert.ok(rev.every((q) => q.skillId !== skillId && gradeSkillIds.has(q.skillId)));
    assert.equal(new Set(withRev.questionIds).size, withRev.questionIds.length, "no duplicates");
    const small = await buildSkillSet(repo, teacher, { skillId, n: 5, includeRevision: true });
    assert.equal(small.items.filter((q) => q.group === "standard").length, 1, "a short set gets one revision item");
    assert.equal(small.items.length, 5);
  });

  test("the class's mastery moves the centre of the set; the set can be assigned", async () => {
    const members = await repo.findMany("ClassMembership", { classId });
    await repo.createMany("StudentSkillMastery", members.slice(0, 5).map((m) => ({ studentId: m.studentId, skillId, score: 100, attempts: 8, correct: 8 })));
    const set = await buildSkillSet(repo, teacher, { skillId, classId, n: 3 });
    assert.deepEqual(set.target, { level: 6, from: "CLASS_MASTERY" });
    const easy = await buildSkillSet(repo, teacher, { skillId, n: 3 });
    const avg = (x: typeof set) => x.items.reduce((n, q) => n + q.difficultyLevel, 0) / x.items.length;
    assert.ok(avg(set) > avg(easy), "a strong class gets a harder set");
    assert.ok(!set.questionIds.includes(qDirect), "the easiest question (level 2) is left out for a strong class");
    const r = await assignQuestions(repo, teacher, { classId, questionIds: set.questionIds, title: "Ready set" });
    assert.equal(r.questions, set.questionIds.length);
  });

  test("no question needs a lesson: bank questions without lessonId are found and assignable", async () => {
    const r = await findQuestionsForSkill(repo, teacher, { skillId });
    const noLesson: Row[] = await repo.findMany("Question", { id: { in: r.groups.skill.map((q) => q.id) }, lessonId: null }, { select: ["id"] });
    assert.ok(noLesson.length >= 2);
  });
});
