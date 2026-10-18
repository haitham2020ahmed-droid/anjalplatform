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
import type { Row } from "../src/server/seeding/repo";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignSkill } from "../src/server/teacher/assign";
import { cancelAssignment } from "../src/server/teacher/assigned";
import { assignedSkills } from "../src/server/student/assigned";
import { adminFindStudents, adminStudentSkills, adminFindAssignedSkills, adminCancelSkillEverywhere, adminCancelAllAssignedSkills, adminClasses, adminFindAssignedSkillsInClass, adminCancelSkillInClass, adminCancelAllAssignedSkillsInClass } from "../src/server/admin/cancel-skill";

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

describe("admin: cancel a skill everywhere, or every skill in the school (bulk override)", () => {
  let repo: SqliteRepo;
  let teacher: Actor; let admin: Actor; let teacher2: Actor;
  let classId = ""; let classId2 = ""; let sid1 = ""; let sid2 = ""; let student1: Actor; let student2: Actor;
  let skillA = ""; let skillB = ""; let titleA = ""; let assignA1 = ""; let assignA2 = ""; let assignB1 = "";
  const now = new Date("2026-10-18T09:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    teacher2 = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4b" }))!);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const tid = s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id);
    const tid2 = s((await repo.findUnique("Teacher", { userId: teacher2.userId }))!.id);
    classId = s((await repo.findMany("ClassTeacher", { teacherId: tid }))[0].classId);
    classId2 = s((await repo.findMany("ClassTeacher", { teacherId: tid2 }))[0].classId);
    assert.notEqual(classId, classId2, "two different grade 4 classes (classesPerGrade: 2 by default)");

    sid1 = s((await repo.findMany("ClassMembership", { classId, leftAt: null }))[0].studentId);
    sid2 = s((await repo.findMany("ClassMembership", { classId: classId2, leftAt: null }))[0].studentId);
    student1 = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid1 }))!.userId }))!);
    student2 = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid2 }))!.userId }))!);

    const g = (await repo.findUnique("Student", { id: sid1 }))!.gradeId;
    const cur = (await repo.findMany("Curriculum", { gradeId: g }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id }, { select: ["id", "name"] });
    const withQuestions: Row[] = [];
    for (const k of skills) {
      if ((await repo.findMany("Question", { skillId: k.id, status: "PUBLISHED" }, { select: ["id"], take: 1 })).length) withQuestions.push(k);
      if (withQuestions.length >= 2) break;
    }
    assert.ok(withQuestions.length >= 2, "the demo bank needs at least 2 skills with questions");
    skillA = s(withQuestions[0].id); titleA = s(withQuestions[0].name);
    skillB = s(withQuestions[1].id);
    // skillA assigned to BOTH classes (two different students); skillB only to class 1
    assignA1 = (await assignSkill(repo, teacher, { classId, skillId: skillA, source: "CURRICULUM" }, now)).assignmentId;
    assignA2 = (await assignSkill(repo, teacher2, { classId: classId2, skillId: skillA, source: "CURRICULUM" }, now)).assignmentId;
    assignB1 = (await assignSkill(repo, teacher, { classId, skillId: skillB, source: "CURRICULUM" }, now)).assignmentId;
  });

  test("adminFindAssignedSkills groups the same skill across every class/grade of the school", async () => {
    const groups = await adminFindAssignedSkills(repo, admin, titleA.slice(0, 6));
    const g = groups.find((x) => x.title === titleA);
    assert.ok(g, "the skill is found by (part of) its name");
    assert.equal(g!.students, 6, "every student of both classes (assigned to the whole class, 3 each) is counted");
    assert.ok(g!.itemIds.includes(assignA1) && g!.itemIds.includes(assignA2));
  });

  test("adminFindAssignedSkills: an empty search returns nothing (never the whole school's list by accident)", async () => {
    assert.deepEqual(await adminFindAssignedSkills(repo, admin, "   "), []);
  });

  test("adminClasses lists every class of the school, with its grade", async () => {
    const list = await adminClasses(repo, admin);
    assert.ok(list.find((c) => c.id === classId)?.grade === 4 && list.find((c) => c.id === classId2)?.grade === 4);
  });

  test("adminFindAssignedSkillsInClass: scoped to ONE class only, not the whole school", async () => {
    const inClass1 = await adminFindAssignedSkillsInClass(repo, admin, classId);
    const inClass2 = await adminFindAssignedSkillsInClass(repo, admin, classId2);
    assert.ok(inClass1.find((g) => g.title === titleA)!.students === 3, "only class 1's 3 students, not both classes' 6");
    assert.ok(inClass2.some((g) => g.title === titleA), "class 2 has skillA too");
    assert.ok(!inClass2.some((g) => g.itemIds.includes(assignB1)), "class 2 never had skillB: not listed there");
  });

  test("adminCancelSkillInClass cancels skillA for class 1 only; class 2's copy survives", async () => {
    const n = await adminCancelSkillInClass(repo, admin, "SKILL", titleA, classId);
    assert.equal(n, 1, "only class 1's one assignment of it");
    assert.ok(!(await assignedSkills(repo, student1, now)).items.some((i) => i.assignmentId === assignA1), "gone for class 1's student");
    assert.ok((await assignedSkills(repo, student2, now)).items.some((i) => i.assignmentId === assignA2), "class 2's copy is untouched");
    assert.ok((await assignedSkills(repo, student1, now)).items.some((i) => i.assignmentId === assignB1), "class 1's other skill (skillB) is untouched");
    // idempotent
    assert.equal(await adminCancelSkillInClass(repo, admin, "SKILL", titleA, classId), 0);
    // skillA still lives for class 2 (restore it for the next tests, which expect it)
    const { restoreAssignment } = await import("../src/server/teacher/assigned");
    await restoreAssignment(repo, admin, "SKILL", assignA1, null, now);
  });

  test("adminCancelAllAssignedSkillsInClass clears class 1 only; class 2 is untouched", async () => {
    const n = await adminCancelAllAssignedSkillsInClass(repo, admin, classId);
    assert.ok(n >= 2, "both of class 1's live items (skillA restored above, and skillB) are cancelled");
    assert.ok(!(await assignedSkills(repo, student1, now)).items.some((i) => i.assignmentId === assignB1 || i.assignmentId === assignA1));
    assert.ok((await assignedSkills(repo, student2, now)).items.some((i) => i.assignmentId === assignA2), "class 2's skillA survives a class-1-only cancel");
    assert.equal(await adminCancelAllAssignedSkillsInClass(repo, admin, classId), 0, "idempotent");
    // restore class 1's items so the whole-school bulk tests below see the original fixture
    const { restoreAssignment } = await import("../src/server/teacher/assigned");
    await restoreAssignment(repo, admin, "SKILL", assignA1, null, now);
    await restoreAssignment(repo, admin, "SKILL", assignB1, null, now);
  });

  test("a teacher cannot cancel in a class outside their own, and a different school's admin cannot reach this class at all", async () => {
    await assert.rejects(adminFindAssignedSkillsInClass(repo, teacher, classId2), ForbiddenError);
    await assert.rejects(adminCancelSkillInClass(repo, teacher, "SKILL", titleA, classId2), ForbiddenError);
    const other = await repo.create("School", { code: "OTHER-ADM-3", name: "Other School 3" });
    const otherAdmin = await resolveActor(repo, await repo.create("User", { username: "other.cancel.admin3", displayName: "Other Admin 3", role: "SCHOOL_ADMIN", schoolId: other.id }));
    await assert.rejects(adminFindAssignedSkillsInClass(repo, otherAdmin, classId2), ForbiddenError);
    await assert.rejects(adminCancelAllAssignedSkillsInClass(repo, otherAdmin, classId2), ForbiddenError);
  });

  test("adminCancelSkillEverywhere cancels every assignment of that exact title, in every class, leaving other skills alone", async () => {
    const n = await adminCancelSkillEverywhere(repo, admin, "SKILL", titleA);
    assert.equal(n, 2, "both classes' assignment of the skill are cancelled");
    const after1 = await assignedSkills(repo, student1, now);
    const after2 = await assignedSkills(repo, student2, now);
    assert.ok(!after1.items.some((i) => i.assignmentId === assignA1), "gone for student 1");
    assert.ok(!after2.items.some((i) => i.assignmentId === assignA2), "gone for student 2");
    assert.ok(after1.items.some((i) => i.assignmentId === assignB1), "the untouched skill (class 1) is still there");
    // idempotent: nothing left of that title to cancel again
    assert.equal(await adminCancelSkillEverywhere(repo, admin, "SKILL", titleA), 0);
  });

  test("adminCancelAllAssignedSkills clears every remaining skill, every class/grade of the school", async () => {
    const n = await adminCancelAllAssignedSkills(repo, admin);
    assert.ok(n >= 1, "at least the still-live skillB assignment is cancelled");
    const after1 = await assignedSkills(repo, student1, now);
    assert.ok(!after1.items.some((i) => i.assignmentId === assignB1), "the last live assignment is gone too");
    assert.equal(await adminCancelAllAssignedSkills(repo, admin), 0, "idempotent: nothing left the second time");
  });

  test("a teacher (non-admin) cannot use either bulk override", async () => {
    await assert.rejects(adminFindAssignedSkills(repo, teacher, titleA), ForbiddenError);
    await assert.rejects(adminCancelSkillEverywhere(repo, teacher, "SKILL", titleA), ForbiddenError);
    await assert.rejects(adminCancelAllAssignedSkills(repo, teacher), ForbiddenError);
  });

  test("an admin from a different school cannot reach another school's assignments", async () => {
    const other = await repo.create("School", { code: "OTHER-ADM-2", name: "Other School 2" });
    const otherAdmin = await resolveActor(repo, await repo.create("User", { username: "other.cancel.admin2", displayName: "Other Admin 2", role: "SCHOOL_ADMIN", schoolId: other.id }));
    assert.deepEqual(await adminFindAssignedSkills(repo, otherAdmin, titleA), []);
    assert.equal(await adminCancelAllAssignedSkills(repo, otherAdmin), 0);
  });

});
