/**
 * 👥 Admin → Weak skill overlap (src/server/admin/skill-overlap.ts): a skill weak (isWeakForClass) in 2+ classes
 * of the school at once, most-shared first. School-wide, admin only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignSkill } from "../src/server/teacher/assign";
import { skillKeyIndex } from "../src/server/skills/status";
import { MIN_OVERLAP_CLASSES, weakSkillOverlap } from "../src/server/admin/skill-overlap";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");

describe("admin · weak skill overlap", () => {
  let repo: SqliteRepo; let admin: Actor; let teacherA: Actor; let teacherB: Actor; let student: Actor;
  let schoolId: string; let classA: string; let classB: string; let skillId: string; let skillId2: string;
  const now = new Date("2026-10-20T08:00:00Z");

  const star = async (studentId: string, key: string, mastered: boolean, skId: string) =>
    repo.create("SkillStatus", {
      studentId, skillKey: key, level: 1, status: mastered ? "MASTERED" : "IN_PROGRESS", skillId: skId,
      answered: mastered ? 34 : 50, correct: mastered ? 30 : 6, score: mastered ? 100 : 12,
      startedAt: now, masteredAt: mastered ? now : null, reviewDueAt: mastered ? new Date(now.getTime() + 17 * 86_400_000) : null,
      needsSupportAt: mastered ? null : now, // flagged "needs support" (isSupportStar) so weakStudents counts it
      createdAt: now, updatedAt: now, history: [{ at: now.toISOString(), status: "IN_PROGRESS", why: "seed" }],
    });

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 4 }));
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacherA = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    teacherB = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4b" }))!);
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);

    const tA = await repo.findUnique("Teacher", { userId: teacherA.userId });
    const tB = await repo.findUnique("Teacher", { userId: teacherB.userId });
    classA = s((await repo.findMany("ClassTeacher", { teacherId: tA!.id }))[0].classId);
    classB = s((await repo.findMany("ClassTeacher", { teacherId: tB!.id }))[0].classId);

    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id, isActive: true, deletedAt: null }, { select: ["id", "code"] });
    const published = await repo.findMany("Question", { skillId: { in: skills.map((k) => s(k.id)) }, status: "PUBLISHED" }, { select: ["skillId"] });
    const withQuestions = [...new Set(published.map((q) => s(q.skillId)))];
    assert.ok(withQuestions.length >= 2, "the seeded Grade 4 bank publishes at least two distinct skills");
    skillId = withQuestions[0]; skillId2 = withQuestions[1];

    await assignSkill(repo, teacherA, { classId: classA, skillId, source: "CURRICULUM" }, now);
    await assignSkill(repo, teacherB, { classId: classB, skillId, source: "CURRICULUM" }, now);
    await assignSkill(repo, teacherA, { classId: classA, skillId: skillId2, source: "CURRICULUM" }, now);

    const idsA = (await repo.findMany("ClassMembership", { classId: classA, leftAt: null })).map((m) => s(m.studentId));
    const idsB = (await repo.findMany("ClassMembership", { classId: classB, leftAt: null })).map((m) => s(m.studentId));
    assert.equal(idsA.length, 4); assert.equal(idsB.length, 4);
    const ix = await skillKeyIndex(repo, schoolId);
    const key = ix.keyOf.get(skillId)!;
    const key2 = ix.keyOf.get(skillId2)!;
    // skillId: only 1 of 4 mastered in EACH class → weak in both → an overlap
    for (const [i, id] of idsA.entries()) await star(id, key, i === 0, skillId);
    for (const [i, id] of idsB.entries()) await star(id, key, i === 0, skillId);
    // skillId2: 3 of 4 mastered in classA only → not weak, and only one class anyway
    for (const [i, id] of idsA.entries()) await star(id, key2, i < 3, skillId2);
  });

  test("a skill weak in two classes at once is reported, most-shared first, with per-class weak-student counts", async () => {
    const rows = await weakSkillOverlap(repo, admin);
    assert.equal(rows.length, 1, "only the skill that is weak in BOTH classes qualifies");
    const r = rows[0];
    assert.ok(r.key && r.name);
    assert.equal(r.classes.length, MIN_OVERLAP_CLASSES);
    assert.ok(r.classes.every((c) => c.weakStudents === 3 && c.totalStudents === 4), "3 of 4 did not master it in each class");
    assert.ok(r.classes.some((c) => c.classId === classA) && r.classes.some((c) => c.classId === classB));
    assert.ok(r.classes.every((c) => c.teacherName && c.teacherName !== "—"));
  });

  test("a higher minClasses filters it out; raising the bar above what exists returns nothing", async () => {
    assert.equal((await weakSkillOverlap(repo, admin, { minClasses: 3 })).length, 0);
  });

  test("permission gate: only school/platform admins see the school-wide overlap", async () => {
    await assert.rejects(weakSkillOverlap(repo, teacherA), ForbiddenError);
    await assert.rejects(weakSkillOverlap(repo, student), ForbiddenError);
  });
});
