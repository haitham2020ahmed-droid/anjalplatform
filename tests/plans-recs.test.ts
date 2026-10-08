import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { createDraft } from "../src/server/admin/questions";
import { assignSkill, teacherRoster } from "../src/server/teacher/assign";
import { createSkillPlan, listSkillPlans, planPlaces, skillPlanForStaff, skillPlanForStudent, studentSkillPlans } from "../src/server/curriculum-map/plans";
import { assignRecommendations, classRecommendations, myRecommendations } from "../src/server/map/recommend";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { assignedSkills } from "../src/server/student/assigned";
import { demoDatabase } from "./helpers/db";

describe("skill plans, MAP recommendations, new students from MAP, Nafs", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId: string; let roster: { id: string; name: string }[];
  const as = async (userId: string) => resolveActor(repo, (await repo.findUnique("User", { id: userId }))!);
  const studentActor = async (studentId: string) => as(String((await repo.findUnique("Student", { id: studentId }))!.userId));
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
    const ids: string[] = [];
    for (const [code, n] of [["G4.U1.TS2.ACS.BELOW", 3], ["G4.U1.TS2.ACS.ON", 3], ["G4.U1.TS2.CV", 2]] as const)
      for (let i = 0; i < n; i++) ids.push(await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `${code} question ${i} about the river trip`, level: 4, whyCorrect: "Because.", mapNodeCode: code,
        options: [{ label: "A", text: `right ${code}${i}`, correct: true, rationale: null }, { label: "B", text: `wrong ${code}${i}`, correct: false, rationale: "No." }] }));
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
  });

  test("Nafs is for Grade 6 classes only", async () => {
    const skill = (await repo.findMany("Skill", {})).find((k) => String(k.code).startsWith("G4."))!;
    await assert.rejects(assignSkill(repo, teacher, { classId, skillId: String(skill.id), track: "NAFS" }), /Nafs is for Grade 6 classes only/);
    // a Grade 6 class and its teacher
    const g6 = (await repo.findMany("Grade", { schoolId: admin.schoolId!, level: 6 }))[0];
    const c6 = (await repo.findMany("Class", { gradeId: g6.id }))[0];
    const t6 = await as(String((await repo.findUnique("Teacher", { id: (await repo.findMany("ClassTeacher", { classId: c6.id }))[0].teacherId }))!.userId));
    const cur6 = (await repo.findMany("Curriculum", { gradeId: g6.id }))[0];
    const s6 = (await repo.findMany("Skill", { curriculumId: cur6.id, isActive: true }))[0];
    const r = await assignSkill(repo, t6, { classId: String(c6.id), skillId: String(s6.id), track: "NAFS" });
    assert.equal(String((await repo.findUnique("Assignment", { id: r.assignmentId }))!.track), "NAFS");
  });

  test("skill plan: places assigned together; the student opens it as a map, each place links to its questions", async () => {
    const places = await planPlaces(repo, admin.schoolId!, 4);
    assert.ok(places.some((g) => g.places.some((p) => p.code === "G4.U1.TS2.ACS" && /adaptive/.test(p.label))));
    const r = await createSkillPlan(repo, teacher, { classId, title: "Unit 1 plan", codes: ["G4.U1.TS2.ACS", "G4.U1.TS2.CV", "G4.U1.TS3.ACS", "G9.NOPE"], maxQuestions: 5 });
    assert.equal(r.items, 2);
    assert.equal(r.skipped.length, 2, "an empty place and an unknown code are skipped with a reason");
    const staff = await skillPlanForStaff(repo, teacher, r.planId);
    assert.deepEqual(staff.places.map((p) => [p.label, p.students?.total]), [["Analyze Craft and Structure (adaptive)", roster.length], ["Concept Vocabulary", roster.length]]);
    assert.equal((await listSkillPlans(repo, teacher))[0].students, roster.length);
    const st = await studentActor(roster[0].id);
    assert.deepEqual((await studentSkillPlans(repo, st)).map((p) => [p.title, p.places, p.done]), [["Unit 1 plan", 2, 0]]);
    const view = await skillPlanForStudent(repo, st, r.planId);
    assert.ok(view.places.every((p) => /^\/quiz\//.test(p.href ?? "")) && view.places[0].unit.startsWith("Unit 1"));
    await assert.rejects(createSkillPlan(repo, teacher, { classId, title: "Empty", codes: ["G4.U2.TS1.ACS"] }), /Nothing could be assigned/);
  });

  test("MAP: new students in the file are added to the class; recommendations follow the scores; assigned work reaches the student", async () => {
    const num = (id: string) => repo.findUnique("Student", { id }).then((s) => String(s!.studentNumber));
    const rows = [[...MAP_TEMPLATE_HEADERS], [await num(roster[1].id), roster[1].name, "", "182", "", "190", ""], [await num(roster[2].id), roster[2].name, "", "214", "", "219", ""], ["NEW-777", "Mariam New", "", "199", "", "205", "760"], ["NEW-778", "", "", "199", "", "205", ""]];
    const r = await importMapScores(repo, teacher, rows, 2026, new Date(), { createInClassId: classId });
    assert.equal(r.imported, 3);
    assert.deepEqual(r.created.map((c) => [c.name, c.username]), [["Mariam New", "new-777"]]);
    assert.ok(r.created[0].password.length >= 8);
    assert.match(r.errors.map((e) => e.message).join(), /NEW-778.*write the Student Name/);
    const mariam = (await repo.findMany("Student", { studentNumber: "NEW-777" }))[0];
    assert.ok((await repo.findMany("ClassMembership", { classId, studentId: mariam.id, leftAt: null })).length, "added to the class");
    const rec = await classRecommendations(repo, teacher, classId);
    assert.equal(rec.rows.length, 3);
    const low = rec.rows[0];
    assert.equal(low.rit, 182, "lowest RIT first");
    assert.ok(low.skills.length > 0 && low.skills.length <= 4);
    const st = await studentActor(low.studentId);
    assert.ok(await myRecommendations(repo, st), "a student with no MAP work sees recommendations");
    const done = await assignRecommendations(repo, teacher, classId, low.skills.slice(0, 2).map((k) => ({ studentId: low.studentId, skillId: k.id })));
    assert.deepEqual([done.assignments, done.students], [2, 1]);
    const mapWork = (await assignedSkills(repo, st)).items.filter((i) => i.track === "MAP");
    assert.equal(mapWork.length, 2);
  });
});
