/**
 * 🎯 Admin → School goals: weekly minutes/parts targets and unit targets (src/server/admin/school-goals.ts),
 * each class's progress against them, and sending the full curriculum plan to a grade.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { DEFAULT_GOALS, goalProgress, saveSchoolGoals, schoolGoals, sendPlanToGrade } from "../src/server/admin/school-goals";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin · school goals", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let schoolId: string;
  const now = new Date("2026-10-20T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("defaults before anything is saved", async () => {
    assert.deepEqual(await schoolGoals(repo, schoolId), DEFAULT_GOALS);
  });

  test("validation: minutes, parts and unit targets are range-checked", async () => {
    await assert.rejects(saveSchoolGoals(repo, admin, { weeklyMinutes: 5, weeklyParts: 3, units: [] }, now), ValidationError);
    await assert.rejects(saveSchoolGoals(repo, admin, { weeklyMinutes: 60, weeklyParts: 0, units: [] }, now), ValidationError);
    await assert.rejects(saveSchoolGoals(repo, admin, { weeklyMinutes: 60, weeklyParts: 3, units: [{ grade: 4, unit: "Unit 1", pct: 80, by: "not-a-date" }] }, now), ValidationError);
    await assert.rejects(saveSchoolGoals(repo, admin, { weeklyMinutes: 60, weeklyParts: 3, units: [{ grade: 4, unit: "Unit 1", pct: 5, by: "2026-11-15" }] }, now), ValidationError);
  });

  test("save and read back; a unit with no name is dropped silently", async () => {
    await saveSchoolGoals(repo, admin, { weeklyMinutes: 90, weeklyParts: 4, units: [{ grade: 4, unit: "Unit 1", pct: 80, by: "2026-11-15" }, { grade: 5, unit: "   ", pct: 50, by: "2026-11-01" }] }, now);
    const g = await schoolGoals(repo, schoolId);
    assert.deepEqual(g, { weeklyMinutes: 90, weeklyParts: 4, units: [{ grade: 4, unit: "Unit 1", pct: 80, by: "2026-11-15" }] });
  });

  test("goal progress: one row per class, with students counted and (for now) no practice this week", async () => {
    const classes = await repo.findMany("Class", { schoolId, deletedAt: null });
    assert.ok(classes.length >= 2);
    const { goals, rows } = await goalProgress(repo, admin, classes, now);
    assert.equal(goals.weeklyMinutes, 90);
    assert.equal(rows.length, classes.length);
    const g4 = rows.find((r) => r.grade === 4)!;
    assert.ok(g4.students >= 1);
    assert.equal(g4.minutes, 0, "no practice attempts seeded yet");
    // the Grade 4 unit target is carried onto its classes; Grade 5's row has none (the unit was dropped above)
    assert.equal(g4.units.length, 1);
    assert.equal(g4.units[0].unit, "Unit 1");
    assert.ok(g4.units[0].daysLeft > 0);
    const g5 = rows.find((r) => r.grade === 5)!;
    assert.equal(g5.units.length, 0);
  });

  test("send the curriculum plan to a grade: no Curriculum Map places yet → every class is skipped, nothing thrown", async () => {
    await assert.rejects(sendPlanToGrade(repo, admin, 99, 25), ValidationError, "grade does not exist");
    const r = await sendPlanToGrade(repo, admin, 4, 25);
    assert.ok(r.classes >= 1);
    assert.equal(r.created, 0);
    assert.equal(r.skipped.length, r.classes);
    assert.match(r.skipped[0], /no Curriculum Map places/);
  });

  test("permission gate: teachers and students are refused; sending a grade plan is admin-only even though a teacher has assignments:create", async () => {
    await assert.rejects(saveSchoolGoals(repo, teacher, { weeklyMinutes: 60, weeklyParts: 3, units: [] }, now), ForbiddenError);
    await assert.rejects(saveSchoolGoals(repo, student, { weeklyMinutes: 60, weeklyParts: 3, units: [] }, now), ForbiddenError);
    await assert.rejects(sendPlanToGrade(repo, teacher, 4, 25), ForbiddenError);
    await assert.rejects(sendPlanToGrade(repo, student, 4, 25), ForbiddenError);
    await assert.rejects(goalProgress(repo, student, [], now), ForbiddenError);
  });
});
