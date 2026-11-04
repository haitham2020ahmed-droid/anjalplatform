/**
 * MAP Personal Study Plan → Assign (owner: the single-student plan was missing the Assign button the Group and
 * Whole-class plans already have). Ticked skills become one skill assignment each, to just this one student —
 * the same batched-send pattern as the other plan types (src/server/plans/batch-send.ts).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { assignStudyPlanSkills, studyPlan } from "../src/server/map/map-reports";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { demoDatabase } from "./helpers/db";

describe("Personal Study Plan: Assign ticked skills (one assignment each, to this student only)", () => {
  let repo: SqliteRepo; let teacher: Actor; let otherTeacher: Actor; let classId: string; let studentId: string; let skillId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    otherTeacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.3" }))!);
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    const t = (await repo.findMany("Teacher", { userId: teacher.userId }))[0];
    classId = String((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
    const members = await repo.findMany("ClassMembership", { classId, leftAt: null });
    studentId = String(members[0].studentId);
    // a MAP score, so the Personal Study Plan has skills to tick (no continuum needed: the RIT-range fallback)
    const st = await repo.findUnique("Student", { id: studentId });
    const H = [...MAP_TEMPLATE_HEADERS], c = (h: string) => H.indexOf(h);
    const row = H.map(() => ""); row[0] = String(st!.studentNumber); row[c("Reading Fall RIT")] = "188";
    await importMapScores(repo, admin, [H, row], 2026, new Date(Date.UTC(2026, 8, 15)), { term: { name: "Fall 2026", date: new Date(Date.UTC(2026, 8, 15)) } });
    const d = await studyPlan(repo, teacher, studentId, "READING");
    skillId = d.areas.flatMap((a) => a.stages.flatMap((s) => s.topics.flatMap((x) => x.statements.flatMap((y) => y.skills.map((k) => k.id)))))[0];
    assert.ok(skillId, "the demo student has at least one skill in their plan");
  });

  test("r74: a source is required", async () => {
    await assert.rejects(assignStudyPlanSkills(repo, teacher, { studentId, classId, skillIds: [skillId] }));
  });

  test("at least one ticked skill", async () => {
    await assert.rejects(assignStudyPlanSkills(repo, teacher, { studentId, classId, skillIds: [], source: "MAP" }), ValidationError);
  });

  test("only the class's own teacher may assign", async () => {
    await assert.rejects(assignStudyPlanSkills(repo, otherTeacher, { studentId, classId, skillIds: [skillId], source: "MAP" }), ForbiddenError);
  });

  test("one adaptive assignment per ticked skill, for this one student only", async () => {
    const r = await assignStudyPlanSkills(repo, teacher, { studentId, classId, skillIds: [skillId], source: "MAP" });
    assert.equal(r.skills, 1);
    assert.equal(r.assignmentIds.length, 1);
    const links = await repo.findMany("AssignmentStudent", { assignmentId: r.assignmentIds[0] });
    assert.deepEqual(links.map((l) => String(l.studentId)), [studentId]);
    const a = await repo.findUnique("Assignment", { id: r.assignmentIds[0] });
    assert.equal(String(a!.skillId), skillId);
    assert.equal(String(a!.source), "MAP");
  });
});
