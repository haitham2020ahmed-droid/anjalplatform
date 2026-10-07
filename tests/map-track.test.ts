import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { assignQuestions, assignSkill, teacherCurriculum, weeklyAssignments } from "../src/server/teacher/assign";
import { assignedSkills } from "../src/server/student/assigned";
import { demoDatabase } from "./helpers/db";

describe("📘 Curriculum and 🗺️ MAP areas", () => {
  let repo: SqliteRepo;
  let teacher: Actor, student: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, student] = await Promise.all(["test.teacher.1", "test.student.005"].map(a));
  });

  test("the teacher sees the grade's skills grouped by MAP goal area", async () => {
    const view = (await teacherCurriculum(repo, teacher))!;
    assert.ok(view.mapAreas.length >= 3, "several MAP goal areas");
    const inUnits = new Set(view.units.flatMap((u) => u.skills.map((k) => k.id)));
    for (const a of view.mapAreas) {
      assert.ok(a.skills.length > 0 && a.name.length > 0);
      for (const k of a.skills) assert.ok(inUnits.has(k.id), "MAP skills are the grade's own skills");
    }
    const ids = view.mapAreas.flatMap((a) => a.skills.map((k) => k.id));
    assert.equal(new Set(ids).size, ids.length, "each skill sits in one goal area");
    // every skill in a goal area really belongs to it (skill → family → goal area)
    const area = view.mapAreas[0];
    const k = (await repo.findUnique("Skill", { id: area.skills[0].id }))!;
    const fam = (await repo.findUnique("SkillFamily", { id: k.familyId }))!;
    assert.equal(String((await repo.findUnique("MapGoalArea", { id: fam.mapGoalAreaId }))!.code), area.code);
  });

  test("assigning from MAP or Curriculum is kept and shown to the student and the teacher", async () => {
    const view = (await teacherCurriculum(repo, teacher))!;
    const mapSkill = view.mapAreas[0].skills[0].id;
    const curSkill = view.units[0].skills.find((k) => k.id !== mapSkill)!.id;
    const m = await assignSkill(repo, teacher, { classId: view.classId, skillId: mapSkill, studentIds: [student.studentId!], track: "MAP" });
    const c = await assignSkill(repo, teacher, { classId: view.classId, skillId: curSkill, studentIds: [student.studentId!] });
    const qs = (await repo.findMany("Question", { skillId: mapSkill, status: "PUBLISHED" })).slice(0, 2).map((q) => String(q.id));
    const set = await assignQuestions(repo, teacher, { classId: view.classId, questionIds: qs, studentIds: [student.studentId!], track: "MAP" });
    const tracks = new Map((await repo.findMany("Assignment", { id: { in: [m.assignmentId, c.assignmentId, set.assignmentId] } })).map((a) => [String(a.id), a.track]));
    assert.deepEqual([tracks.get(m.assignmentId), tracks.get(c.assignmentId), tracks.get(set.assignmentId)], ["MAP", "CURRICULUM", "MAP"]);
    const items = new Map((await assignedSkills(repo, student)).items.map((i) => [i.assignmentId, i.track]));
    assert.deepEqual([items.get(m.assignmentId), items.get(c.assignmentId), items.get(set.assignmentId)], ["MAP", "CURRICULUM", "MAP"]);
    const week = new Map((await weeklyAssignments(repo, teacher, new Date(Date.now() - 86_400_000))).map((r) => [r.id, r.track]));
    assert.deepEqual([week.get(m.assignmentId), week.get(c.assignmentId)], ["MAP", "CURRICULUM"]);
  });
});
