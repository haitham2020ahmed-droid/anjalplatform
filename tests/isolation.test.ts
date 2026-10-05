/**
 * Phase 12: tenant isolation (IDOR) suite.
 *
 * A second school (B) is seeded in the same database with its own admin, class,
 * teacher, student, parent, question, curriculum, alert and import job. Every
 * service that takes an id is then called by school A's admin, teacher, parent and
 * student with school B's ids. Each call must be refused with a permission or
 * validation error (never succeed, never crash), and school B's data must be unchanged.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolvePeriod } from "../src/analytics/periods";
import { resolveActor } from "../src/server/auth/actor";
import { resetPassword } from "../src/server/auth/passwords-admin";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError, addLesson, updateSkill, updateUnit, getUnitEditor, addPrerequisite } from "../src/server/curriculum-admin";
import { classComparison, standardsReport, studentAnalytics } from "../src/server/analytics/reports";
import { mapComparison } from "../src/server/analytics/map-compare";
import { classOverview, masteryGrid, studentDetail } from "../src/server/teacher/queries";
import { assertClassAccess, classAssignments, createAssignment } from "../src/server/teacher/assignments";
import { resolveAlert } from "../src/server/teacher/interventions";
import { startPractice } from "../src/server/practice/session";
import { cancelImport, confirmImport, errorReportCsv } from "../src/server/imports/pipeline";
import { exportReport } from "../src/server/reports/service";
import { parentChildren } from "../src/server/queries/parent";
import { createUser, linkParent, manageableUser, moveStudent, setTeacherClasses, unlinkParent, updateUser } from "../src/server/admin/users";
import { archiveClass, createClass, renameClass, saveAcademicYear } from "../src/server/admin/settings";
import { archiveQuestion, createDraft, getQuestion, reviewQuestion, reviseQuestion, submitForReview, updateDraft, type EditorInput } from "../src/server/admin/questions";
import { seedCurriculum } from "../src/server/seeding/curriculum";
import { loadCurriculumInput } from "../src/server/seeding/load-files";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";

const now = new Date("2026-10-04T08:00:00Z");

describe("tenant isolation: school A can never reach school B", () => {
  let repo: SqliteRepo;
  let A: Record<"admin" | "teacher" | "parent" | "student", Actor>;
  const B = {} as Record<"school" | "adminUser" | "teacherUser" | "studentUser" | "parentUser" | "studentId" | "classId" | "skillId" | "unitId" | "lessonId" | "questionId" | "alertId" | "jobId", string>;
  let bAdmin: Actor;

  before(async () => {
    ({ repo } = await demoDatabase());
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    A = { admin: await actorFor("demo.admin"), teacher: await actorFor("demo.teacher.4a"), parent: await actorFor("demo.p1001"), student: await actorFor("demo.s1001") };

    // school B, built with the real seeders and services
    await seedCurriculum(repo, loadCurriculumInput(ROOT, "OTHER", "Other School"));
    B.school = String((await repo.findUnique("School", { code: "OTHER" }))!.id);
    B.adminUser = String((await repo.create("User", { username: "b.admin", displayName: "B Admin", role: "SCHOOL_ADMIN", schoolId: B.school, isActive: true })).id);
    bAdmin = await resolveActor(repo, (await repo.findUnique("User", { id: B.adminUser }))!);
    await saveAcademicYear(repo, bAdmin, { name: "B 2026-2027", start: "2026-08-30", end: "2027-06-20", isCurrent: true, terms: [{ name: "Term 1", start: "2026-08-30", end: "2026-12-10" }] }, now);
    B.classId = await createClass(repo, bAdmin, { name: "4X", gradeLevel: 4 }, now);
    B.teacherUser = (await createUser(repo, bAdmin, { role: "TEACHER", username: "b.teacher", displayName: "B Teacher" }, now)).userId;
    await setTeacherClasses(repo, bAdmin, B.teacherUser, [B.classId], now);
    B.studentUser = (await createUser(repo, bAdmin, { role: "STUDENT", username: "b.student", displayName: "B Student", studentNumber: "B-1", gradeLevel: 4, classId: B.classId }, now)).userId;
    B.studentId = String((await repo.findUnique("Student", { userId: B.studentUser }))!.id);
    B.parentUser = (await createUser(repo, bAdmin, { role: "PARENT", username: "b.parent", displayName: "B Parent" }, now)).userId;
    await linkParent(repo, bAdmin, B.parentUser, B.studentUser, "mother", now);
    const g4 = (await repo.findMany("Grade", { schoolId: B.school, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    B.skillId = String((await repo.findUnique("Skill", { curriculumId: cur.id, code: "G4.theme" }))!.id);
    B.unitId = String((await repo.findMany("Unit", { curriculumId: cur.id }))[0].id);
    B.lessonId = String((await repo.findMany("Lesson", { unitId: B.unitId }))[0]?.id ?? "");
    B.questionId = await createDraft(repo, bAdmin, mc(B.skillId), now);
    B.alertId = String((await repo.create("InterventionAlert", { studentId: B.studentId, ruleCode: "LOW_ACCURACY", message: "B alert", evidence: {} })).id);
    B.jobId = String((await repo.create("ImportJob", { kind: "MAP_RESULTS", fileName: "b.csv", uploadedById: B.adminUser, schoolId: B.school, status: "AWAITING_CONFIRMATION" }).catch(() => repo.create("ImportJob", { kind: "MAP_RESULTS", fileName: "b.csv", uploadedById: B.adminUser, status: "AWAITING_CONFIRMATION" }))).id);
  });

  const mc = (skillId: string): EditorInput => ({
    skillId, type: "MULTIPLE_CHOICE", stem: "What is the theme?", level: 4, whyCorrect: "Because.",
    options: [{ label: "A", text: "Honesty", correct: true, rationale: null }, { label: "B", text: "Rain", correct: false, rationale: "Setting." }, { label: "C", text: "Farm", correct: false, rationale: "Detail." }],
  });
  const term = () => resolvePeriod("LAST_30_DAYS", { year: null, terms: [] }, now);

  test("every cross-school call is refused with a permission or validation error", async () => {
    type Attack = [string, () => Promise<unknown>];
    const attacks: Attack[] = [];
    for (const [who, a] of Object.entries(A)) {
      attacks.push(
        [`${who}: studentAnalytics(B student)`, () => studentAnalytics(repo, a, B.studentId, term())],
        [`${who}: studentDetail(B student)`, () => studentDetail(repo, a, B.studentId)],
        [`${who}: mapComparison(B student)`, () => mapComparison(repo, a, B.studentId)],
        [`${who}: classOverview(B class)`, () => classOverview(repo, a, B.classId, term())],
        [`${who}: classComparison(B class)`, () => classComparison(repo, a, B.classId, term())],
        [`${who}: standardsReport(B class)`, () => standardsReport(repo, a, { classId: B.classId }, term())],
        [`${who}: masteryGrid(B class)`, () => masteryGrid(repo, a, B.classId, B.unitId)],
        [`${who}: assertClassAccess(B class)`, () => assertClassAccess(repo, a, B.classId)],
        [`${who}: classAssignments(B class)`, () => classAssignments(repo, a, B.classId, now)],
        [`${who}: createAssignment(B class)`, () => createAssignment(repo, a, { classId: B.classId, skillId: B.skillId, title: "x", dueAt: new Date("2026-10-20") } as never, now)],
        [`${who}: resolveAlert(B alert)`, () => resolveAlert(repo, a, B.alertId, "x")],
        [`${who}: exportReport student(B)`, () => exportReport({ repo, fontDir: "", brandingDir: "", now: () => now }, a, { kind: "student", studentId: B.studentId, format: "csv", locale: "en", period: "TERM" })],
        [`${who}: exportReport class(B)`, () => exportReport({ repo, fontDir: "", brandingDir: "", now: () => now }, a, { kind: "class", classId: B.classId, format: "csv", locale: "en", period: "TERM" })],
        [`${who}: resetPassword(B student)`, () => resetPassword(repo, a, B.studentUser)],
        [`${who}: resetPassword(B admin)`, () => resetPassword(repo, a, B.adminUser)],
        [`${who}: manageableUser(B teacher)`, () => manageableUser(repo, a, B.teacherUser)],
        [`${who}: updateUser(B teacher)`, () => updateUser(repo, a, B.teacherUser, { displayName: "hacked", isActive: false })],
        [`${who}: moveStudent(B student → A class)`, async () => moveStudent(repo, a, B.studentUser, String((await repo.findMany("ClassMembership", { studentId: A.student.studentId! }))[0].classId))],
        [`${who}: setTeacherClasses(B teacher)`, () => setTeacherClasses(repo, a, B.teacherUser, [])],
        // pulling school B's class into school A's own records
        [`${who}: moveStudent(A student → B class)`, () => moveStudent(repo, a, A.student.userId, B.classId)],
        [`${who}: setTeacherClasses(A teacher → B class)`, () => setTeacherClasses(repo, a, A.teacher.userId, [B.classId])],
        [`${who}: createUser(student in B class)`, () => createUser(repo, a, { role: "STUDENT", username: `x.${who}`, displayName: "X", studentNumber: `X-${who}`, gradeLevel: 4, classId: B.classId })],
        [`${who}: linkParent(B parent → A student)`, () => linkParent(repo, a, B.parentUser, A.student.userId, null)],
        [`${who}: linkParent(A parent → B student)`, () => linkParent(repo, a, A.parent.userId, B.studentUser, null)],
        [`${who}: unlinkParent(B parent, B student)`, () => unlinkParent(repo, a, B.parentUser, B.studentUser)],
        [`${who}: renameClass(B class)`, () => renameClass(repo, a, B.classId, "pwned")],
        [`${who}: archiveClass(B class)`, () => archiveClass(repo, a, B.classId)],
        [`${who}: getQuestion(B)`, () => getQuestion(repo, a, B.questionId)],
        [`${who}: updateDraft(B)`, () => updateDraft(repo, a, B.questionId, mc(B.skillId))],
        [`${who}: submitForReview(B)`, () => submitForReview(repo, a, B.questionId)],
        [`${who}: reviewQuestion(B)`, () => reviewQuestion(repo, a, B.questionId, "approve", null)],
        [`${who}: archiveQuestion(B)`, () => archiveQuestion(repo, a, B.questionId, "x")],
        [`${who}: reviseQuestion(B)`, () => reviseQuestion(repo, a, B.questionId)],
        [`${who}: createDraft(in B skill)`, () => createDraft(repo, a, mc(B.skillId))],
        [`${who}: updateUnit(B unit)`, () => updateUnit(repo, a, B.unitId, { title: "pwned" })],
        [`${who}: getUnitEditor(B unit)`, () => getUnitEditor(repo, a, B.unitId)],
        [`${who}: addLesson(B unit)`, () => addLesson(repo, a, B.unitId, { title: "pwned" })],
        [`${who}: updateSkill(B skill)`, () => updateSkill(repo, a, B.skillId, { name: "pwned" })],
        [`${who}: addPrerequisite(B skill)`, () => addPrerequisite(repo, a, B.skillId, B.skillId)],
        [`${who}: startPractice(B skill)`, () => startPractice(repo, a, B.skillId, now)],
        [`${who}: confirmImport(B job)`, () => confirmImport(repo, a, B.jobId)],
        [`${who}: cancelImport(B job)`, () => cancelImport(repo, a, B.jobId)],
        [`${who}: errorReportCsv(B job)`, () => errorReportCsv(repo, a, B.jobId)],
      );
    }
    const problems: string[] = [];
    for (const [name, fn] of attacks) {
      try {
        await fn();
        problems.push(`ALLOWED  ${name}`);
      } catch (e) {
        const ok = e instanceof ForbiddenError || e instanceof ValidationError || (e as { status?: number }).status === 403 || (e as { status?: number }).status === 404 || (e as { status?: number }).status === 422;
        if (!ok) problems.push(`CRASHED  ${name}: ${(e as Error).constructor.name}: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    assert.ok(attacks.length >= 170, `${attacks.length} attacks`);
    assert.deepEqual(problems, []);
  });

  test("school B's data is unchanged afterwards", async () => {
    assert.equal((await repo.findUnique("User", { id: B.teacherUser }))!.displayName, "B Teacher");
    assert.equal((await repo.findUnique("User", { id: B.teacherUser }))!.isActive, true);
    assert.equal((await repo.findUnique("Class", { id: B.classId }))!.name, "4X");
    assert.equal((await repo.findUnique("Class", { id: B.classId }))!.deletedAt ?? null, null);
    assert.equal((await repo.findUnique("Question", { id: B.questionId }))!.status, "DRAFT");
    assert.equal((await repo.findUnique("Skill", { id: B.skillId }))!.name !== "pwned", true);
    assert.equal((await repo.findMany("ClassMembership", { studentId: B.studentId, leftAt: null }))[0].classId, B.classId);
    assert.equal((await repo.findMany("ParentStudent", { studentId: B.studentId })).length, 1);
    assert.deepEqual((await parentChildren(repo, A.parent)).map((c) => c.studentId), [A.student.studentId]);
  });

  test("defence in depth: even a wrongly created cross-school teaching assignment grants nothing", async () => {
    const t = (await repo.findUnique("Teacher", { userId: A.teacher.userId }))!;
    await repo.create("ClassTeacher", { classId: B.classId, teacherId: t.id }); // simulates a data error, bypassing the services
    try {
      const teacher = await resolveActor(repo, (await repo.findUnique("User", { id: A.teacher.userId }))!);
      for (const fn of [() => assertClassAccess(repo, teacher, B.classId), () => classOverview(repo, teacher, B.classId, term()), () => studentDetail(repo, teacher, B.studentId)])
        await assert.rejects(fn(), (e: Error) => e instanceof ForbiddenError || (e as { status?: number }).status === 403);
    } finally {
      await repo.deleteMany("ClassTeacher", { classId: B.classId, teacherId: t.id });
    }
  });

  test("school B's own admin works normally (the isolation is not just 'everything fails')", async () => {
    await getQuestion(repo, bAdmin, B.questionId);
    await classOverview(repo, bAdmin, B.classId, term());
    await studentDetail(repo, bAdmin, B.studentId);
    await assert.rejects(studentDetail(repo, bAdmin, A.student.studentId!), (e: Error) => e instanceof ForbiddenError || (e as { status?: number }).status === 403);
  });
});
