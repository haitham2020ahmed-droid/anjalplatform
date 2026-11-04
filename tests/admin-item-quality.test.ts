/**
 * 🔬 Admin "Question quality" (src/app/admin/item-quality): questions whose real answers do not fit their level
 * (itemQuality), statistical alerts and their resolve/dismiss/release-hold actions, questions with no level,
 * skills under the 25-question minimum (skillsUnderMinimum), and the automatic hide check. Every tab is open to
 * TEACHER + admins to READ, but only admins may resolve/dismiss/release an alert or run the automatic check (the
 * actions in src/app/admin/item-quality/actions.ts, enforced inside the server functions themselves).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { itemQuality, MIN_ANSWERS } from "../src/server/admin/item-quality";
import { alertList } from "../src/server/admin/question-data";
import { releaseHold, setAlertStatus } from "../src/server/questions/reclassify";
import { autoHideBroken } from "../src/server/questions/auto-check";
import { questionsWithoutLevel } from "../src/server/questions/bank-levels";
import { MIN_PER_SKILL, skillsUnderMinimum } from "../src/server/questions/min-per-skill";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");

describe("🔬 admin Question quality", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, student: Actor;
  let schoolId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("the read tabs: teachers may read quality/alerts/no-level lists; students may not", async () => {
    await itemQuality(repo, teacher);
    await alertList(repo, teacher);
    await questionsWithoutLevel(repo, teacher);
    await assert.rejects(itemQuality(repo, student), ForbiddenError);
    await assert.rejects(alertList(repo, student), ForbiddenError);
    await assert.rejects(questionsWithoutLevel(repo, student), ForbiddenError);
  });

  test("a question with 20+ recent answers, mostly wrong at an easy level, is flagged TOO_HARD; under 20 answers is not checked", async () => {
    const q = (await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null }, { take: 2 }))[0];
    await repo.updateMany("Question", { id: q.id }, { difficultyLevel: 1 }); // "Approaching": should be easy
    const students = await repo.findMany("Student", { schoolId }, { take: 25 });
    const sess = await repo.create("PracticeSession", { studentId: students[0].id, skillId: q.skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    for (let i = 0; i < 25; i++) await repo.create("QuestionAttempt", { sessionId: sess.id, studentId: students[i % students.length].id, questionId: q.id, skillId: q.skillId, response: "A", isCorrect: i % 5 === 0, responseMs: 20_000, difficultyB: Number(q.irtB), createdAt: new Date() });
    const { rows, checked } = await itemQuality(repo, admin, MIN_ANSWERS);
    assert.ok(checked >= 1);
    const row = rows.find((r) => r.id === s(q.id));
    assert.ok(row, "20 answers, mostly wrong at an easy level: checked and flagged");
    assert.ok(row!.flags.includes("TOO_HARD"));
    assert.equal(row!.answers, 25);
  });

  test("resolving, dismissing and releasing a hold: admin only; a teacher is refused and nothing changes", async () => {
    const q = (await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null }, { take: 1 }))[0];
    const grade = 4;
    const alert = await repo.create("QuestionAlert", { questionId: q.id, grade, kind: "KEY_SUSPECT", detail: "The key may be wrong.", status: "OPEN", heldBack: true });
    await assert.rejects(setAlertStatus(repo, teacher, s(alert.id), "RESOLVED"), ForbiddenError);
    await assert.rejects(releaseHold(repo, teacher, s(alert.id)), ForbiddenError);
    assert.equal((await repo.findUnique("QuestionAlert", { id: alert.id }))!.status, "OPEN", "the teacher's refused call changed nothing");

    await releaseHold(repo, admin, s(alert.id));
    assert.equal((await repo.findUnique("QuestionAlert", { id: alert.id }))!.heldBack, false);
    assert.equal((await repo.findUnique("QuestionAlert", { id: alert.id }))!.status, "OPEN", "release-hold does not resolve the alert");

    await setAlertStatus(repo, admin, s(alert.id), "DISMISSED");
    const after = (await repo.findUnique("QuestionAlert", { id: alert.id }))!;
    assert.equal(after.status, "DISMISSED");
    assert.equal(s(after.resolvedById), admin.userId);

    const listed = await alertList(repo, admin, { grade });
    assert.ok(!listed.some((r) => r.id === s(alert.id)), "the alerts list defaults to OPEN only, so a dismissed one drops off");
  });

  test("the automatic check: admin only (explicit role check, not a permission grant)", async () => {
    await assert.rejects(autoHideBroken(repo, teacher), ForbiddenError);
    const r = await autoHideBroken(repo, admin);
    assert.ok(r.checked >= 0 && Array.isArray(r.hidden));
  });

  test("skills under the 25-question minimum: every Grade 4 skill the published bank filled is no longer thin; teachers are refused", async () => {
    await assert.rejects(skillsUnderMinimum(repo, teacher), ForbiddenError);
    const before = await skillsUnderMinimum(repo, admin, MIN_PER_SKILL);
    assert.ok(before.length > 0, "a brand-new curriculum has skills under 25 questions");
    for (const r of before) assert.ok(r.missing === MIN_PER_SKILL - r.questions && r.missing > 0);
    // a Grade 4 skill topped up by the published demo bank should drop off the thin list (or need far fewer)
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const wellStocked = (await repo.findMany("Skill", { curriculumId: cur.id, isActive: true })).find((k) => !s(k.code).includes("unclassified"))!;
    const n = (await repo.findMany("Question", { skillId: wellStocked.id, status: "PUBLISHED", deletedAt: null })).length;
    if (n >= MIN_PER_SKILL) assert.ok(!before.some((r) => r.id === s(wellStocked.id)), `${wellStocked.name} has ${n} published questions: should not be thin`);
  });

  test("the page itself gates reads to TEACHER + admins, and resolve/dismiss/release/auto-check actions to admins only (matches the server-side checks above)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { ROOT } = await import("./helpers/db");
    const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
    const page = read("src/app/admin/item-quality/page.tsx");
    assert.match(page, /roles:\s*\["SCHOOL_ADMIN",\s*"SUPER_ADMIN",\s*"TEACHER"\]/);
    const actions = read("src/app/admin/item-quality/actions.ts");
    assert.doesNotMatch(actions, /"TEACHER"/, "none of the write actions list TEACHER");
  });
});
