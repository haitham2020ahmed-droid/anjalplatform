/**
 * 🗓️ The Diagnostic window (FAKE data only — the Test School): only the school admin opens / closes / schedules the
 * Diagnostic of a grade; students can start it only while it is open (server check, also by direct URL / action);
 * automatic dates; once per school year; next year again only when the admin opens it; results kept per year.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { buildDiagnostic, listDiagnostics, myDiagnostic, schoolYear } from "../src/server/diagnostic/test";
import { diagnosticWindows, myDiagnosticState, setDiagnosticWindow, windowIsOpen, windowStatus } from "../src/server/diagnostic/window";
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";

const ANCHORS = ["RL.1", "RL.2", "RL.3", "RL.5", "RL.6", "RL.9", "RI.1", "RI.2", "RI.3", "RI.5", "RI.6", "RI.8", "L.4", "L.5", "RL.4", "RI.4", "L.1", "L.2"];
const OCT = new Date("2026-10-05T08:00:00Z"), OCT27 = new Date("2027-10-05T08:00:00Z");
const day = (base: Date, n: number) => new Date(base.getTime() + n * 86_400_000);

describe("Pure: the window is open by mode", () => {
  test("MANUAL follows isOpen (this school year only); AUTO follows the dates; Scheduled before the open date", () => {
    assert.equal(windowIsOpen(null, OCT), false, "no window = closed");
    assert.equal(windowIsOpen({ mode: "MANUAL", isOpen: true, schoolYear: "2026-2027" }, OCT), true);
    assert.equal(windowIsOpen({ mode: "MANUAL", isOpen: false, schoolYear: "2026-2027" }, OCT), false);
    assert.equal(windowIsOpen({ mode: "MANUAL", isOpen: true, schoolYear: "2026-2027" }, OCT27), false, "last year's open window is closed");
    const auto = { mode: "AUTO", isOpen: false, opensAt: day(OCT, 1), closesAt: day(OCT, 10), schoolYear: "2026-2027" };
    assert.deepEqual([OCT, day(OCT, 2), day(OCT, 11)].map((n) => windowStatus(auto, n)), ["SCHEDULED", "OPEN", "CLOSED"]);
    assert.equal(schoolYear(new Date("2027-07-31T12:00:00Z")), "2026-2027");
    assert.equal(schoolYear(new Date("2027-08-01T12:00:00Z")), "2027-2028");
  });
});

describe("Diagnostic window · admin-only control, gating, once per school year", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let st: Actor; let other: Actor; let testId = ""; let aid = "";
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  /** answers `max` questions (all) of the student's open Diagnostic, from `at` */
  async function answer(who: Actor, assignmentId: string, at: Date, max = 99): Promise<number> {
    let clock = at.getTime(); let v = await startQuiz(repo, who, assignmentId, new Date(clock)); let i = 0;
    while (v.question && i < max) {
      const it = (await loadQuestionItems(repo, [v.question.questionId]))[0];
      v = (await submitQuizAnswer(repo, who, { assignmentId, questionId: it.questionId, response: it.options!.find((o) => o.correct)!.label }, new Date((clock += 30_000)))).view; i++;
      assert.ok(i <= 70);
    }
    return i;
  }

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    await repo.updateMany("Question", { status: "PUBLISHED" }, { status: "DRAFT" });
    const r = await teacherRoster(repo, teacher);
    st = await student(r[0].students[0].id); other = await student(r[0].students[1].id);
    const made: string[] = [];
    for (const g of [4, 5, 6]) {
      const gr = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: g }))[0];
      const cur = (await repo.findMany("Curriculum", { gradeId: gr.id }))[0];
      const skill = (await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }))[0];
      for (const anchor of ANCHORS) {
        const code = anchor.replace(".", `.${g}.`);
        if (!(await repo.findMany("Standard", { code: `CCSS.ELA-LITERACY.${code}` })).length) await repo.create("Standard", { framework: "CCSS", code: `CCSS.ELA-LITERACY.${code}`, description: code, gradeLevel: g, strand: code.split(".")[0], isActive: true });
        for (const level of [2, 3, 4, 5, 6]) made.push(await createDraft(repo, admin, { skillId: String(skill.id), standardCode: `CCSS.ELA-LITERACY.${code}`, type: "MULTIPLE_CHOICE", stem: `G${g} ${code} level ${level}`, level, whyCorrect: "Because.",
          options: [{ label: "A", text: `right ${code} ${level}`, correct: true, rationale: null }, { label: "B", text: `wrong ${code} ${level}`, correct: false, rationale: "No." }, { label: "C", text: `other ${code} ${level}`, correct: false, rationale: "No." }] } as never));
      }
    }
    await repo.updateMany("Question", { id: { in: made } }, { status: "PUBLISHED" });
    testId = (await buildDiagnostic(repo, admin, { grade: 4 }, OCT)).id;
  });

  test("only the admin toggles: a teacher or a student is forbidden", async () => {
    await assert.rejects(setDiagnosticWindow(repo, teacher, { grade: 4, mode: "MANUAL", isOpen: true }, OCT), ForbiddenError);
    await assert.rejects(setDiagnosticWindow(repo, st, { grade: 4, mode: "MANUAL", isOpen: true }, OCT), ForbiddenError);
    await assert.rejects(diagnosticWindows(repo, teacher, OCT), ForbiddenError);
    assert.equal(await repo.count("DiagnosticWindow", {}), 0, "nothing written");
  });

  test("closed (built, never opened): nothing on the student's side", async () => {
    const rows = await diagnosticWindows(repo, admin, OCT);
    const g4 = rows.find((x) => x.grade === 4)!;
    assert.equal(g4.status, "CLOSED"); assert.equal(g4.testId, testId); assert.equal(g4.finished, 0); assert.ok(g4.students >= 2);
    assert.equal(await myDiagnostic(repo, st, OCT), null);
    assert.equal((await myDiagnosticState(repo, st, OCT)).state, "CLOSED");
  });

  test("open → the student can start; closed again → refused by direct URL and action, progress kept, reopened → resumes", async () => {
    assert.equal((await setDiagnosticWindow(repo, admin, { grade: 4, mode: "MANUAL", isOpen: true }, OCT)).status, "OPEN");
    const mine = (await myDiagnostic(repo, st, OCT))!;
    assert.equal(mine.id, testId); assert.equal(mine.status, "TODO");
    aid = mine.href.split("/")[2];
    assert.equal(await answer(st, aid, OCT, 5), 5);
    await setDiagnosticWindow(repo, admin, { grade: 4, mode: "MANUAL", isOpen: false }, OCT);
    assert.equal(await myDiagnostic(repo, st, OCT), null, "not on My Work while closed");
    await assert.rejects(startQuiz(repo, st, aid, OCT), (e: unknown) => e instanceof ValidationError && /reopen it soon/.test(e.message));
    const v = (await loadQuestionItems(repo, [(await repo.findMany("AssessmentQuestion", {}))[0].questionId as string]))[0];
    await assert.rejects(submitQuizAnswer(repo, st, { assignmentId: aid, questionId: v.questionId, response: "A" }, OCT), ValidationError);
    await assert.rejects(startQuiz(repo, other, aid, OCT), (e: unknown) => e instanceof ValidationError && /not open/.test(e.message), "a student who never started");
    assert.equal((await myDiagnosticState(repo, st, OCT)).state, "PAUSED");
    await setDiagnosticWindow(repo, admin, { grade: 4, mode: "MANUAL", isOpen: true }, OCT);
    const back = await startQuiz(repo, st, aid, OCT);
    assert.equal(back.answered, 5, "the answers were kept");
  });

  test("automatic dates: scheduled, then open by itself, then closed by itself", async () => {
    await assert.rejects(setDiagnosticWindow(repo, admin, { grade: 4, mode: "AUTO", opensAt: day(OCT, 5), closesAt: day(OCT, 1) }, OCT), ValidationError);
    assert.equal((await setDiagnosticWindow(repo, admin, { grade: 4, mode: "AUTO", opensAt: day(OCT, 1), closesAt: day(OCT, 10) }, OCT)).status, "SCHEDULED");
    assert.equal((await diagnosticWindows(repo, admin, OCT)).find((x) => x.grade === 4)!.status, "SCHEDULED");
    assert.equal(await myDiagnostic(repo, other, OCT), null);
    await assert.rejects(startQuiz(repo, other, aid, OCT), ValidationError);
    assert.equal((await myDiagnostic(repo, other, day(OCT, 2)))!.status, "TODO");
    await startQuiz(repo, other, aid, day(OCT, 2));
    assert.equal(await myDiagnostic(repo, other, day(OCT, 11)), null);
    await assert.rejects(startQuiz(repo, other, aid, day(OCT, 11)), ValidationError);
  });

  test("once per school year: finished → cannot open it again", async () => {
    await setDiagnosticWindow(repo, admin, { grade: 4, mode: "MANUAL", isOpen: true }, OCT);
    await answer(st, aid, day(OCT, 1));
    assert.equal(await repo.count("DiagnosticScore", { diagnosticId: testId, studentId: st.studentId }), 1);
    assert.equal((await myDiagnostic(repo, st, OCT))!.status, "DONE", "hidden from My Work (DONE)");
    await assert.rejects(startQuiz(repo, st, aid, day(OCT, 1)), (e: unknown) => e instanceof ValidationError && /finished this year's diagnostic test/.test(e.message));
    assert.equal((await myDiagnosticState(repo, st, OCT)).state, "DONE");
    const g4 = (await diagnosticWindows(repo, admin, OCT)).find((x) => x.grade === 4)!;
    assert.equal(g4.finished, 1, `${g4.finished} of ${g4.students} students finished`);
  });

  test("next school year: closed until the admin opens it, then allowed again; each year's result kept", async () => {
    const next = await buildDiagnostic(repo, admin, { grade: 4 }, OCT27);
    assert.notEqual(next.id, testId);
    assert.equal(await myDiagnostic(repo, st, OCT27), null, "last year's open window does not carry over");
    assert.equal((await diagnosticWindows(repo, admin, OCT27)).find((x) => x.grade === 4)!.status, "CLOSED");
    await setDiagnosticWindow(repo, admin, { grade: 4, mode: "MANUAL", isOpen: true }, OCT27);
    const mine = (await myDiagnostic(repo, st, OCT27))!;
    assert.equal(mine.id, next.id); assert.equal(mine.status, "TODO");
    await answer(st, mine.href.split("/")[2], OCT27);
    const scores = await repo.findMany("DiagnosticScore", { studentId: st.studentId });
    const years = await Promise.all(scores.map(async (x) => String((await repo.findUnique("DiagnosticTest", { id: x.diagnosticId }))!.year)));
    assert.deepEqual(years.sort(), ["2026-2027", "2027-2028"], "one result per year, kept separately");
    const list = (await listDiagnostics(repo, teacher)).filter((x) => x.grade === 4);
    assert.deepEqual([...new Set(list.map((x) => x.year))].sort(), ["2026-2027", "2027-2028"], "teachers see both years to compare");
  });
});
