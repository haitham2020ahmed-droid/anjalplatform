/**
 * 🧰 Admin override (school ELA lead's request, translated): "a tool for the admin that lets them cancel any skill
 * from a student's My Work, at any grade level too" — a safety valve outside a teacher's own Assigned page.
 *
 * Reuses, never duplicates: the lookup reads assignedWorkOfClasses (teacher/assigned.ts, the r78 "ONE source of what
 * was assigned") and the cancel itself calls cancelAssignment with a studentId — the exact per-student "Remove" a
 * teacher's own Assigned page already has. No second cancel mechanism exists.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignSkill } from "../src/server/teacher/assign";
import { cancelAssignment } from "../src/server/teacher/assigned";
import { assignedSkills } from "../src/server/student/assigned";
import { adminFindStudents, adminStudentSkills } from "../src/server/admin/cancel-skill";

const s = (v: unknown) => String(v ?? "");

describe("admin: cancel a skill from any student's My Work", () => {
  let repo: SqliteRepo;
  let teacher: Actor; let admin: Actor; let teacherActor2: Actor;
  let classId = ""; let sid = ""; let studentActor: Actor; let u: Record<string, unknown>;
  let skillA = ""; let skillB = ""; let assignA = ""; let assignB = "";
  const now = new Date("2026-10-18T09:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacherActor2 = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.5a" }))!);
    const tid = s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id);
    classId = s((await repo.findMany("ClassTeacher", { teacherId: tid }))[0].classId);
    const members = await repo.findMany("ClassMembership", { classId, leftAt: null });
    sid = s(members[0].studentId);
    u = (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!;
    studentActor = await resolveActor(repo, u);

    const g = (await repo.findUnique("Student", { id: sid }))!.gradeId;
    const cur = (await repo.findMany("Curriculum", { gradeId: g }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id }, { select: ["id"] });
    const withQuestions: string[] = [];
    for (const k of skills) {
      if ((await repo.findMany("Question", { skillId: k.id, status: "PUBLISHED" }, { select: ["id"], take: 1 })).length) withQuestions.push(s(k.id));
      if (withQuestions.length >= 2) break;
    }
    assert.ok(withQuestions.length >= 2, "the demo bank needs at least 2 skills with questions");
    [skillA, skillB] = withQuestions;
    assignA = (await assignSkill(repo, teacher, { classId, skillId: skillA, source: "CURRICULUM" }, now)).assignmentId;
    assignB = (await assignSkill(repo, teacher, { classId, skillId: skillB, source: "CURRICULUM" }, now)).assignmentId;
  });

  test("admin finds the student (any grade/class of the school) by name or student number", async () => {
    const number = s((await repo.findUnique("Student", { id: sid }))!.studentNumber);
    const byNumber = await adminFindStudents(repo, admin, number);
    assert.ok(byNumber.some((x) => x.id === sid), "found by student number");
    const byName = await adminFindStudents(repo, admin, s(u.displayName).slice(0, 3));
    assert.ok(byName.some((x) => x.id === sid), "found by (part of) their name");
  });

  test("admin sees the student's currently-assigned skills, across any class/grade in the school", async () => {
    const v = await adminStudentSkills(repo, admin, sid);
    assert.equal(v.student.id, sid);
    const ids = v.skills.map((x) => x.id);
    assert.ok(ids.includes(assignA), "skill A is listed");
    assert.ok(ids.includes(assignB), "skill B is listed");
    assert.ok(v.skills.every((x) => x.kind === "SKILL" || x.kind === "PROGRESS_CHECK"));
  });

  test("admin cancelling one skill removes it from the student's My Work at once; the other stays", async () => {
    const before1 = await assignedSkills(repo, studentActor, now);
    assert.ok(before1.items.some((i) => i.assignmentId === assignA));
    assert.ok(before1.items.some((i) => i.assignmentId === assignB));

    const picked = await adminStudentSkills(repo, admin, sid);
    const row = picked.skills.find((x) => x.id === assignA)!;
    await cancelAssignment(repo, admin, row.kind, row.id, sid, now);

    const after1 = await assignedSkills(repo, studentActor, now);
    assert.ok(!after1.items.some((i) => i.assignmentId === assignA), "cancelled skill is gone from My Work");
    assert.ok(after1.items.some((i) => i.assignmentId === assignB), "the other skill is untouched");

    const after2 = await adminStudentSkills(repo, admin, sid);
    assert.ok(!after2.skills.some((x) => x.id === assignA), "gone from the admin tool's own list too");
    assert.ok(after2.skills.some((x) => x.id === assignB));
  });

  test("a teacher (non-admin) cannot use the admin override tool", async () => {
    await assert.rejects(adminStudentSkills(repo, teacher, sid), ForbiddenError);
    await assert.rejects(adminFindStudents(repo, teacher, "a"), ForbiddenError);
  });

  test("an admin from a different school cannot see or act on a student outside their school", async () => {
    const other = await repo.create("School", { code: "OTHER-ADM", name: "Other School" });
    const otherAdmin = await resolveActor(repo, await repo.create("User", { username: "other.cancel.admin", displayName: "Other Admin", role: "SCHOOL_ADMIN", schoolId: other.id }));
    await assert.rejects(adminStudentSkills(repo, otherAdmin, sid), ForbiddenError);
    // even with the real kind/id in hand, the cancel itself is scoped to the actor's own school's classes
    await assert.rejects(cancelAssignment(repo, otherAdmin, "SKILL", assignB, sid, now), ForbiddenError);
    // nothing changed for the real student
    const still = await adminStudentSkills(repo, admin, sid);
    assert.ok(still.skills.some((x) => x.id === assignB));
  });

  test("teacherActor2 (a teacher of a different class) is unaffected — sanity: the fixture school has more than one teacher", () => {
    assert.notEqual(teacherActor2.userId, teacher.userId);
  });
});
