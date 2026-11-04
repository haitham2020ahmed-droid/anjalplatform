/**
 * 🏫 Admin → Department (src/server/insights/department.ts departmentSummary): every class side by side this
 * week, the hardest skills of each grade, and the school totals (each student counted once). Open to admins and
 * to teachers who coordinate at least one grade (src/server/teacher/coordinators.ts).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { departmentSummary, weakestSkills } from "../src/server/insights/department";
import { setCoordinators } from "../src/server/teacher/coordinators";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin · department week", () => {
  let repo: SqliteRepo; let admin: Actor; let teacherA: Actor; let teacherB: Actor; let student: Actor; let schoolId: string;
  const now = new Date("2026-10-20T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 3 }));
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacherA = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    teacherB = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.5a" }))!);
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("admin: every class of every grade is listed, each student counted once in the totals", async () => {
    const d = await departmentSummary(repo, admin, now);
    const classCount = await repo.count("Class", { schoolId, deletedAt: null });
    assert.equal(d.classes.length, classCount);
    const studentCount = await repo.count("Student", { schoolId, deletedAt: null });
    assert.equal(d.totals.students, studentCount, "a student in only one class, so the per-class and school totals agree here");
    assert.ok(d.weakest.length >= 1);
    assert.equal(d.totals.active, 0, "nobody has practised yet");
    assert.equal(d.totals.alertsOpen, 0);
  });

  test("weakestSkills: only skills with 20+ careful (non-rapid-guess) answers in the window are reported, worst accuracy first", async () => {
    const ids = (await repo.findMany("Student", { schoolId }, { select: ["id"] })).slice(0, 2).map((x) => s(x.id));
    const type = (await repo.findMany("QuestionType", {}))[0] ?? (await repo.create("QuestionType", { code: "MULTIPLE_CHOICE", name: "Multiple choice" }));
    const skills = (await repo.findMany("Skill", { isActive: true, deletedAt: null }, { select: ["id"] })).slice(0, 2).map((x) => s(x.id));
    const q = async (skillId: string) => s((await repo.create("Question", { skillId, typeId: type.id, stem: "stem", content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: now, updatedAt: now })).id);
    const [qA, qB] = [await q(skills[0]), await q(skills[1])];
    const ses = await repo.create("PracticeSession", { studentId: ids[0], mode: "ADAPTIVE_PRACTICE", startedAt: now });
    const attempt = (over: Record<string, unknown>) => repo.create("QuestionAttempt", { sessionId: ses.id, response: "A", responseMs: 20_000, difficultyB: 0, createdAt: now, ...over });
    // skill A: 20 careful answers, half wrong → reported; skill B: 10 answers only → too few, not reported;
    // a rapid guess on skill A is never counted towards its 20
    for (let i = 0; i < 20; i++) await attempt({ studentId: ids[0], questionId: qA, skillId: skills[0], isCorrect: i % 2 === 0, rapidGuess: false });
    await attempt({ studentId: ids[0], questionId: qA, skillId: skills[0], isCorrect: false, rapidGuess: true });
    for (let i = 0; i < 10; i++) await attempt({ studentId: ids[1], questionId: qB, skillId: skills[1], isCorrect: true, rapidGuess: false });
    const weak = await weakestSkills(repo, ids, now);
    assert.equal(weak.length, 1);
    assert.equal(weak[0].skillId, skills[0]);
    assert.equal(weak[0].answers, 20);
    assert.equal(weak[0].accuracy, 50);
    assert.equal(weak[0].students, 1);
  });

  test("a teacher who coordinates a grade can see the department summary for that grade's work; one with no coordination cannot", async () => {
    await assert.rejects(departmentSummary(repo, teacherA, now), ForbiddenError, "not yet a coordinator");
    await setCoordinators(repo, admin, [{ userId: teacherA.userId, grades: [4] }], now);
    const d = await departmentSummary(repo, teacherA, now);
    assert.ok(d.classes.length >= 1);
    await assert.rejects(departmentSummary(repo, teacherB, now), ForbiddenError, "teacherB coordinates nothing");
  });

  test("permission gate: students are always refused", async () => {
    await assert.rejects(departmentSummary(repo, student, now), ForbiddenError);
  });
});
