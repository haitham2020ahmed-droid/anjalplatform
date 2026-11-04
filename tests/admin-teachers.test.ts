/**
 * 🧑‍🏫 Admin → Teachers (teacher follow-up, src/server/insights/teacher-followup.ts): classes, students, last
 * sign-in, assignments made, at-risk students helped, warnings driven by the school's (editable) rules.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { assignSkill } from "../src/server/teacher/assign";
import { DEFAULT_FOLLOWUP, followupRules, isSystemAssignment, setFollowupRules, teacherFollowup } from "../src/server/insights/teacher-followup";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

describe("admin · teachers (follow-up)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacherA: Actor; let student: Actor; let schoolId: string; let classA: string;
  const now = new Date("2026-10-20T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacherA = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
    const tA = await repo.findUnique("Teacher", { userId: teacherA.userId });
    classA = s((await repo.findMany("ClassTeacher", { teacherId: tA!.id }))[0].classId);
  });

  test("default follow-up rules, then saved and read back; invalid values are refused", async () => {
    assert.deepEqual(await followupRules(repo, schoolId), DEFAULT_FOLLOWUP);
    await assert.rejects(setFollowupRules(repo, admin, { noLoginDays: 0 }, now), ValidationError);
    await assert.rejects(setFollowupRules(repo, admin, { atRiskDays: 91 }, now), ValidationError);
    const saved = await setFollowupRules(repo, admin, { noLoginDays: 3, noAssignmentDays: 10 }, now);
    assert.deepEqual(saved, { noLoginDays: 3, noAssignmentDays: 10, atRiskDays: DEFAULT_FOLLOWUP.atRiskDays });
    assert.deepEqual(await followupRules(repo, schoolId), saved);
  });

  test("isSystemAssignment: curriculum-plan places, Weekly Checks, re-checks, reteach and Diagnostic tests are the platform's own work, not the teacher's", () => {
    assert.equal(isSystemAssignment({ curriculumPlanId: "abc" }), true);
    assert.equal(isSystemAssignment({ title: "Weekly Check: Reading" }), true);
    assert.equal(isSystemAssignment({ title: "Re-check: theme" }), true);
    assert.equal(isSystemAssignment({ note: "Extra practice on this skill, then a short re-check." }), true);
    assert.equal(isSystemAssignment({ title: "Diagnostic Test" }), true);
    assert.equal(isSystemAssignment({ title: "Theme practice" }), false);
  });

  test("a teacher with no recent sign-in and no new assignment gets both warnings; one with fresh activity gets none", async () => {
    await setFollowupRules(repo, admin, { noLoginDays: 7, noAssignmentDays: 14, atRiskDays: 7 }, now);
    // teacherA: no sign-in ever, no assignment ever, but has students → both warnings
    const { rows } = await teacherFollowup(repo, admin, now);
    const a = rows.find((r) => r.userId === teacherA.userId)!;
    assert.ok(a.students >= 1);
    assert.equal(a.lastLogin, null);
    assert.ok(a.warnings.some((w) => /No sign-in/.test(w)));
    assert.ok(a.warnings.some((w) => /No new assignment/.test(w)));

    // teacherA signs in and assigns work now → both warnings clear next time
    await repo.updateMany("User", { id: teacherA.userId }, { lastLoginAt: now });
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const published = await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["skillId"] });
    const skills = await repo.findMany("Skill", { curriculumId: cur.id }, { select: ["id"] });
    const skillId = s(published.find((q) => skills.some((k) => k.id === q.skillId))!.skillId);
    await assignSkill(repo, teacherA, { classId: classA, skillId, source: "CURRICULUM" }, now);
    const after = (await teacherFollowup(repo, admin, now)).rows.find((r) => r.userId === teacherA.userId)!;
    assert.equal(after.lastLogin, now.toISOString());
    assert.equal(after.warnings.some((w) => /No sign-in|No new assignment/.test(w)), false);
    assert.equal(after.assignments30, 1);
  });

  test("permission gate: a teacher cannot see the school-wide follow-up (needs analytics:school, which they don't have) nor change the rules", async () => {
    await assert.rejects(teacherFollowup(repo, teacherA, now), ForbiddenError);
    await assert.rejects(teacherFollowup(repo, student, now), ForbiddenError);
    await assert.rejects(setFollowupRules(repo, teacherA, { noLoginDays: 5 }, now), ForbiddenError);
    await assert.rejects(setFollowupRules(repo, student, { noLoginDays: 5 }, now), ForbiddenError);
  });
});
