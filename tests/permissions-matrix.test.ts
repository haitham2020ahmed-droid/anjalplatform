import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, ROLE_PERMISSIONS, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { createGrade, createSkill, createStandard, createUnit, deleteSkill, curriculumTree } from "../src/server/curriculum-manage";
import { assignSkill, assignmentDetail, teacherCurriculum, weeklyAssignments } from "../src/server/teacher/assign";
import { assignedSkills, assignmentReport, isAssignedSkill, setPlacementRequired } from "../src/server/student/assigned";
import { openNotification, listNotifications } from "../src/server/notifications";
import { archiveQuestions, deleteQuestions } from "../src/server/admin/question-delete";
import { getQuestion, listQuestions, updateDraft } from "../src/server/admin/questions";
import { saveQuestionImage } from "../src/server/admin/question-images";
import { analyzeImport } from "../src/server/admin/question-import";
import { demoDatabase } from "./helpers/db";

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64"));

/** Every page file and the access its requireActor(...) call allows. */
function pages(dir: string): { file: string; opts: string }[] {
  const out: { file: string; opts: string }[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pages(p));
    else if (name === "page.tsx") {
      const src = readFileSync(p, "utf8");
      const m = src.match(/requireActor\((\{[^)]*\})?\)/);
      out.push({ file: p.replace(process.cwd() + "/", ""), opts: m ? m[1] ?? "{}" : "NONE" });
    }
  }
  return out;
}
const studentPerms = ROLE_PERMISSIONS.STUDENT;
const allowsStudent = (opts: string) => {
  const roles = opts.match(/roles:\s*\[([^\]]*)\]/)?.[1];
  if (roles) return /"STUDENT"/.test(roles);
  const perm = opts.match(/permission:\s*"([^"]+)"/)?.[1];
  return perm ? studentPerms.has(perm as never) : true; // a session alone lets anyone in
};

describe("page access (static check of every page file)", () => {
  test("no Admin or Teacher page lets a student in; every Student page requires the STUDENT role", () => {
    const admin = pages(join(process.cwd(), "src/app/admin")), teacher = pages(join(process.cwd(), "src/app/teacher")), student = pages(join(process.cwd(), "src/app/student"));
    assert.ok(admin.length > 15 && teacher.length > 5 && student.length > 3);
    const bad = [...admin, ...teacher].filter((p) => p.opts === "NONE" || allowsStudent(p.opts)).map((p) => `${p.file}: ${p.opts}`);
    assert.deepEqual(bad, []);
    const notStudentOnly = student.filter((p) => !/roles:\s*\["STUDENT"\]/.test(p.opts)).map((p) => `${p.file}: ${p.opts}`);
    assert.deepEqual(notStudentOnly, []);
  });
});

describe("permission matrix (server-side, with the 200-student Test School)", () => {
  let repo: SqliteRepo;
  let admin: Actor, t1: Actor, t2: Actor, s1: Actor, s2: Actor, otherSchoolTeacher: Actor;
  let classOfT1: string, classOfT2: string, studentOfT2: string, skillT1: string, assignmentT1: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, t1, t2, s1, s2, otherSchoolTeacher] = await Promise.all(["test.admin", "test.teacher.1", "test.teacher.2", "test.student.001", "test.student.040", "demo.teacher.4a"].map(a));
    const v1 = (await teacherCurriculum(repo, t1))!, v2 = (await teacherCurriculum(repo, t2))!;
    classOfT1 = v1.classId; classOfT2 = v2.classId; studentOfT2 = v2.students[0].id; skillT1 = v1.units[0].skills[0].id;
    assignmentT1 = (await assignSkill(repo, t1, { classId: classOfT1, skillId: skillT1 })).assignmentId;
  });

  test("teachers: only their own classes and students", async () => {
    await assert.rejects(teacherCurriculum(repo, t1, classOfT2), ForbiddenError);
    await assert.rejects(assignSkill(repo, t1, { classId: classOfT2, skillId: skillT1 }), ForbiddenError);
    await assert.rejects(assignSkill(repo, t1, { classId: classOfT1, skillId: skillT1, studentIds: [studentOfT2] }), ForbiddenError);
    await assert.rejects(assignmentDetail(repo, t2, assignmentT1), ForbiddenError);
    await assert.rejects(assignmentReport(repo, t2, assignmentT1, s1.studentId!), ForbiddenError);
    assert.ok((await weeklyAssignments(repo, t2, new Date(Date.now() - 86_400_000))).every((r) => r.className !== "TEST 4A"));
    await assert.rejects(assignSkill(repo, otherSchoolTeacher, { classId: classOfT1, skillId: skillT1 }), ForbiddenError, "another school");
  });

  test("teachers cannot do admin-only things", async () => {
    await assert.rejects(createGrade(repo, t1, { level: 9 }), ForbiddenError);
    await assert.rejects(createUnit(repo, t1, { gradeId: "x", title: "x" }), ForbiddenError);
    await assert.rejects(createStandard(repo, t1, { framework: "SCHOOL_OBJECTIVE", code: "X.1" }), ForbiddenError);
    await assert.rejects(curriculumTree(repo, t1), ForbiddenError);
    const q = (await listQuestions(repo, admin, { status: "PUBLISHED", limit: 1 })).items[0].id;
    await assert.rejects(deleteQuestions(repo, t1, [q]), ForbiddenError);
    await assert.rejects(archiveQuestions(repo, t1, [q], "x"), ForbiddenError);
    await assert.rejects(updateDraft(repo, t1, q, (await getQuestion(repo, admin, q)).input), ForbiddenError);
    await assert.rejects(setPlacementRequired(repo, t1, true), ForbiddenError);
  });

  test("students: own data only, no curriculum, no editing, no teacher or admin functions", async () => {
    await assert.rejects(assignSkill(repo, s1, { classId: classOfT1, skillId: skillT1 }), ForbiddenError);
    await assert.rejects(teacherCurriculum(repo, s1), ForbiddenError);
    await assert.rejects(weeklyAssignments(repo, s1, new Date()), ForbiddenError);
    await assert.rejects(curriculumTree(repo, s1), ForbiddenError);
    await assert.rejects(createSkill(repo, s1, { gradeId: "x", name: "x", domain: "READING", category: "LITERATURE" }), ForbiddenError);
    await assert.rejects(deleteSkill(repo, s1, "x"), ForbiddenError);
    await assert.rejects(listQuestions(repo, s1, {}), ForbiddenError);
    await assert.rejects(saveQuestionImage(repo, s1, PNG), ForbiddenError);
    await assert.rejects(analyzeImport(repo, s1, { fileName: "x.csv", bytes: new Uint8Array([65]) }), ForbiddenError);
    await assert.rejects(assignmentReport(repo, s2, assignmentT1), ForbiddenError, "another student's report");
    await assert.rejects(assignmentReport(repo, s1, assignmentT1, s2.studentId!), ForbiddenError);
    const mine = (await listNotifications(repo, s1))[0];
    await assert.rejects(openNotification(repo, s2, mine.id), ForbiddenError, "another student's notification");
    const s2Home = await assignedSkills(repo, s2);
    const notMine = (await teacherCurriculum(repo, t1))!.units.flatMap((u) => u.skills).find((k) => !s2Home.items.some((i) => i.skillId === k.id))!;
    assert.equal(await isAssignedSkill(repo, s2, notMine.id), false, "practice is refused for skills not assigned to you");
    const home = await assignedSkills(repo, s1);
    const allowed = new Set((await repo.findMany("AssignmentStudent", { studentId: s1.studentId! })).map((r) => String(r.assignmentId)));
    assert.ok(home.items.length > 0 && home.items.every((i) => allowed.has(i.assignmentId)), "the home page lists only work assigned to this student");
  });
});
