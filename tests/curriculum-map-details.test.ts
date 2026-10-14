/**
 * Curriculum Map lesson details (data/curriculum-map/lesson-details.json) and the Send-the-plan action.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { allLessonDetails, curriculumLessons, lessonDetail, outlineOf, studentCurriculumLessons } from "../src/server/curriculum-map/lesson-details";
import { sendMapPlan, sendTargets } from "../src/server/curriculum-map/send-plan";
import { studentSkillPlans } from "../src/server/curriculum-map/plans";
import { demoDatabase } from "./helpers/db";

const details = allLessonDetails();

describe("Curriculum Map lesson details (the school's own summary)", () => {
  test("18 / 18 / 23 lessons for Grades 4 / 5 / 6, and every name is on the map", () => {
    assert.deepEqual(["4", "5", "6"].map((g) => Object.keys(details[g]).length), [18, 18, 23]);
    const map = parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8"));
    for (const g of map) {
      const names = g.units.flatMap((u) => u.sets.map((s) => (s.sharedRead ?? s.title).replace(/^“|”$/g, "")));
      assert.deepEqual(names.filter((n) => !details[String(g.level)][n]), [], `Grade ${g.level}: names match source.txt`);
    }
  });

  test("Grades 4 and 5 have a Text Idea, vocabulary words, a vocabulary skill and reading skills", () => {
    for (const g of ["4", "5"]) for (const l of Object.values(details[g])) {
      assert.ok(l.textIdea && l.textIdea.length > 40, `${g} ${l.name}: Text Idea`);
      assert.ok(l.genre, `${g} ${l.name}: genre`);
      assert.ok(l.vocabularySkill, `${g} ${l.name}: vocabulary skill`);
      assert.ok(l.readingSkills.length >= 2, `${g} ${l.name}: reading skills`);
      // the school's summary gives no words for this one selection ("Not provided")
      if (l.name !== "Sadie’s Game") assert.ok(l.vocabulary.length >= 5, `${g} ${l.name}: vocabulary`);
    }
    assert.deepEqual(details["4"]["A World of Change"].vocabulary.slice(0, 3), ["alter", "collapse", "crisis"]);
  });

  test("Grade 6: name, genre, skills and the booklets' vocabulary (no Text Idea)", () => {
    for (const l of Object.values(details["6"])) {
      assert.equal(l.textIdea, null);
      // the school booklets have no vocabulary box for this one selection
      if (l.name !== "Who Is the Real Hero?") assert.ok(l.vocabulary.length >= 4, `6 ${l.name}: vocabulary`);
      assert.ok(l.readingSkills.length >= 1, l.name);
    }
  });

  test("Cocoon is spelled right everywhere (the old spelling still finds it)", () => {
    assert.ok(details["6"]["Cocoon"]);
    const json = readFileSync("data/curriculum-map/lesson-details.json", "utf8");
    assert.ok(!json.includes("Cacoon"));
    assert.ok(!readFileSync("data/curriculum-map/source.txt", "utf8").includes("Cacoon"));
    assert.equal(lessonDetail(6, "Cacoon")?.name, "Cocoon");
    assert.equal(lessonDetail(4, "“The Talent Show”")?.genre, "Realistic Fiction");
  });

  test("no “Wonders” in the Curriculum Map pages and components", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(p)) files.push(p); } };
    ["src/app/admin/curriculum-map", "src/components/curriculum-map", "src/app/student/curriculum"].forEach(walk);
    assert.ok(files.length >= 5);
    for (const f of files) assert.ok(!/Wonders/i.test(readFileSync(f, "utf8")), f);
  });
});

describe("Send the curriculum plan", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId: string; let otherClassId: string; let students: string[];
  before(async () => {
    ({ repo } = await demoDatabase());
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, admin] = await Promise.all(["demo.teacher.4a", "demo.admin"].map(a));
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const ids: string[] = [];
    for (const lv of ["BELOW", "ON", "ABOVE"]) for (let i = 0; i < 3; i++) ids.push(await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `${lv} q ${i}`, level: 4, whyCorrect: "Because.", mapNodeCode: `G4.U1.TS1.ACS.${lv}`, options: [{ label: "A", text: `r${lv}${i}`, correct: true, rationale: null }, { label: "B", text: `w${lv}${i}`, correct: false, rationale: "No." }] } as never));
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
    const r = await teacherRoster(repo, teacher);
    classId = r[0].id; students = r[0].students.map((x: { id: string }) => x.id);
    const mine = new Set(r.map((c: { id: string }) => c.id));
    otherClassId = String((await repo.findMany("Class", { schoolId: admin.schoolId })).find((c) => !mine.has(String(c.id)))!.id);
  });

  test("lesson cards merge the details; sections are Ready only with questions", async () => {
    const v = await curriculumLessons(repo, teacher, 4);
    assert.deepEqual(v.grades, [4], "Update 55: a teacher sees the Curriculum Map of their own grade only");
    assert.deepEqual((await curriculumLessons(repo, admin, 4)).grades, [4, 5, 6], "admins see every grade");
    const l = v.units[0].lessons[0];
    assert.equal(l.name, "A World of Change");
    assert.ok(l.textIdea && l.vocabulary.includes("hazard"));
    assert.deepEqual(l.sections.map((s) => [s.kind, s.ready]), [["CONCEPT_VOCABULARY", false], ["ANALYZE_CRAFT_AND_STRUCTURE", true], ["RESPOND_TO_READING", false], ["REVIEW", false]]);
    const g6 = await curriculumLessons(repo, admin, 6);
    assert.equal(g6.units[0].lessons[2].name, "Cocoon");
    assert.equal(outlineOf(v.units).length, 18);
  });

  test("a teacher sends only to their own classes and their own students", async () => {
    const targets = await sendTargets(repo, teacher);
    assert.ok(targets.length && !targets.some((c) => c.id === otherClassId));
    await assert.rejects(sendMapPlan(repo, teacher, { grade: 4, unitCode: "G4.U1", classId: otherClassId }), ForbiddenError);
    const stranger = String((await repo.findMany("ClassMembership", { classId: otherClassId }))[0].studentId);
    await assert.rejects(sendMapPlan(repo, teacher, { grade: 4, unitCode: "G4.U1", classId, studentIds: [stranger] }), ForbiddenError);
    const sid = students[0];
    const before = await repo.count("Assignment", {});
    const r = await sendMapPlan(repo, teacher, { grade: 4, unitCode: "G4.U1", classId, studentIds: [sid] });
    assert.equal(r.parts, 1, "only parts with questions are sent");
    assert.equal(r.students, 1);
    const made = (await repo.findMany("Assignment", {})).slice(before);
    assert.ok(made.length >= 1 && made.every((a) => a.program === "CURRICULUM" && a.curriculumPlanId === r.planId));
    const rows = await repo.findMany("AssignmentStudent", { assignmentId: { in: made.map((a) => a.id) } });
    assert.deepEqual([...new Set(rows.map((x) => String(x.studentId)))], [sid]);
    // the student sees it among their Curriculum items
    const st = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    assert.ok((await studentSkillPlans(repo, st)).some((p) => p.id === r.planId));
    const sv = await studentCurriculumLessons(repo, st);
    assert.equal(sv.units.length, 6);
    // an admin may send to any class of the school
    const ra = await sendMapPlan(repo, admin, { grade: 4, unitCode: null, classId: otherClassId });
    assert.equal(ra.parts, 1);
  });
});
