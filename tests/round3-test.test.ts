/**
 * Round 3 · the Diagnostic Test flow (FAKE data only — the Test School): a test never counts as practice or changes a
 * star, never pays coins; a question unpublished after the build never ends the test without a result; a lost result
 * is recovered; only the served question is accepted; rapid guesses weigh nothing; the window's dates follow Riyadh
 * time and reach the assignments; swapping keeps the focus form; reset is checked; progress is out of the real length.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { createDraft } from "../src/server/admin/questions";
import { refreshQuestionSets, teacherRoster } from "../src/server/teacher/assign";
import { buildAllDiagnostics, buildDiagnostic, designOf, diagnosticNext, myDiagnostic, openDiagnostic, periodOf, periodStart, resetDiagnosticAttempt, schoolYear, swapDiagnosticQuestion } from "../src/server/diagnostic/test";
import { estimate, nextItem, type Design } from "../src/server/diagnostic/adaptive";
import { setDiagnosticWindow } from "../src/server/diagnostic/window";
import { DIAGNOSTIC_NOT_SERVED, startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { practiceSessionIds } from "../src/server/skills/status";
import { levelUps, testAssignments } from "../src/server/motivation/sync";
import { recordLevel } from "../src/server/curriculum-map/student-level";
import { loadQuestionItems } from "../src/server/practice/items";
import { endOfDay, startOfDay } from "../src/lib/assign-dates";
import { demoDatabase } from "./helpers/db";

const ANCHORS = ["RL.1", "RL.2", "RL.3", "RL.5", "RL.6", "RL.9", "RI.1", "RI.2", "RI.3", "RI.5", "RI.6", "RI.8", "L.4", "L.5", "RL.4", "RI.4", "L.1", "L.2"];

describe("Round 3 · Diagnostic Test flow", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let roster: { id: string; name: string }[];
  const ids: Record<number, string> = {};
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  const answer = async (st: Actor, aid: string, questionId: string, right: boolean, at: Date) => {
    const it = (await loadQuestionItems(repo, [questionId]))[0];
    return submitQuizAnswer(repo, st, { assignmentId: aid, questionId, response: it.options!.find((o) => o.correct === right)!.label }, at);
  };

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    await repo.updateMany("Question", { status: "PUBLISHED" }, { status: "DRAFT" });
    roster = (await teacherRoster(repo, teacher))[0].students;
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
    const all = await buildAllDiagnostics(repo, admin);
    for (const g of [4, 5, 6]) ids[g] = all.built.find((x) => x.grade === g)!.id;
  });

  test("item 4: a rapid guess weighs nothing in the estimate or the next question", () => {
    const base = estimate([{ d: 4, correct: true }], 4);
    assert.deepEqual(estimate([{ d: 4, correct: true }, { d: 3, correct: false, weight: 0 }], 4), base, "weight 0 leaves the answer out");
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, a: "RL.2", st: "LIT" as const, d: 3 + i / 10, p: null, g: 4 }));
    const design: Design = { blueprint: ["RL.2", "RL.2", "RL.2"], items };
    assert.equal(nextItem(design, [{ id: "q5", correct: false, rapid: true }], 4), nextItem(design, [{ id: "q5", correct: true, rapid: true }], 4), "a rapid guess, right or wrong, moves nothing");
  });

  test("item 5: Riyadh calendar for the period and the school year", () => {
    // 31 Jul 22:00 UTC = 1 Aug 01:00 in Riyadh: already the new school year and BOY
    const r = new Date("2026-07-31T22:00:00Z");
    assert.equal(schoolYear(r), "2026-2027");
    assert.equal(periodOf(r), "BOY");
    assert.equal(periodStart(new Date("2026-10-15T00:00:00Z")).toISOString(), "2026-07-31T21:00:00.000Z", "Aug 1, 00:00 Riyadh");
    assert.equal(startOfDay("2026-11-05")!.toISOString(), "2026-11-04T21:00:00.000Z");
    assert.equal(endOfDay("2026-11-05")!.toISOString(), "2026-11-05T20:59:59.000Z");
  });

  test("item 6: swapping a question keeps the focus form", async () => {
    const now = new Date();
    const moy = await buildDiagnostic(repo, admin, { grade: 5, period: periodOf(now) === "MOY" ? "EOY" : "MOY", form: "focus" }, now);
    const t = (await repo.findUnique("DiagnosticTest", { id: moy.id }))!;
    const ds = designOf(t)!;
    assert.equal(ds.form, "focus");
    await swapDiagnosticQuestion(repo, admin, moy.id, ds.items[0].id);
    const after = designOf((await repo.findUnique("DiagnosticTest", { id: moy.id }))!)!;
    assert.equal(after.form, "focus", "the focus form survives the swap");
    assert.equal(after.items.length, ds.items.length - 1);
  });

  test("items 1, 2, 3, 7, 9: the Diagnostic is a test (no stars, no mastery, no coins), only the served question, live questions only, progress out of the test", async () => {
    await openDiagnostic(repo, admin, ids[4], {});
    const st = await student(roster[0].id);
    const mine = (await myDiagnostic(repo, st))!;
    const aid = mine.href.split("/")[2];
    let clock = Date.now() - 3_600_000;
    let v = await startQuiz(repo, st, aid, new Date(clock));
    const ses = (await repo.findMany("PracticeSession", { studentId: roster[0].id, assignmentId: aid, mode: "TEACHER_QUIZ" }))[0];
    // item 7: another question of the pool is refused
    const design = designOf((await repo.findUnique("DiagnosticTest", { id: ids[4] }))!)!;
    const other = design.items.find((q) => q.id !== v.question!.questionId)!.id;
    await assert.rejects(answer(st, aid, other, true, new Date((clock += 30_000))), (e: Error) => e.message === DIAGNOSTIC_NOT_SERVED);
    // item 2: the question about to be served is unpublished → another, live, question is served instead
    const next = v.question!.questionId;
    await repo.updateMany("Question", { id: next }, { status: "DRAFT" });
    const dg = (await diagnosticNext(repo, String((await repo.findUnique("DiagnosticTest", { id: ids[4] }))!.assessmentId), String(ses.id), roster[0].id))!;
    assert.ok(dg.nextId && dg.nextId !== next, "an unpublished question is never served");
    v = await startQuiz(repo, st, aid, new Date(clock));
    assert.equal(v.question!.questionId, dg.nextId);
    // a few answers: item 9 — progress is out of the real test length (50), not the whole pool
    for (let i = 0; i < 5; i++) v = (await answer(st, aid, v.question!.questionId, true, new Date((clock += 30_000)))).view;
    await refreshQuestionSets(repo, [(await repo.findUnique("Assignment", { id: aid }))!], [roster[0].id], new Date(clock));
    const row = (await repo.findMany("AssignmentStudent", { assignmentId: aid, studentId: roster[0].id }))[0];
    assert.equal(Number(row.progress), 0.1, `5 of 50 (pool ${design.items.length})`);
    while (v.question) v = (await answer(st, aid, v.question.questionId, true, new Date((clock += 30_000)))).view;
    const score = (await repo.findMany("DiagnosticScore", { studentId: roster[0].id }))[0];
    assert.ok(score, "the result is saved although a question of the design was unpublished");
    // item 1: no skill mastery / ability / star from the test, and the session never counts as practice
    assert.equal(await repo.count("StudentSkillMastery", { studentId: roster[0].id }), 0, "no mastery written");
    assert.equal((await repo.findMany("StudentAbility", { studentId: roster[0].id })).filter((x) => String(x.scope).startsWith("SKILL:")).length, 0, "no skill ability written");
    assert.equal((await practiceSessionIds(repo, [String(ses.id)])).size, 0, "the Diagnostic session is not skill practice");
    // … even an older Diagnostic assignment's session (only its Assessment type marks it)
    assert.equal((await practiceSessionIds(repo, [String(ses.id)])).has(String(ses.id)), false);
    // item 3: no coins for finishing; a PLACEMENT level change is no level-up
    assert.ok((await testAssignments(repo, [aid])).has(aid), "the Diagnostic assignment is a test");
    const { syncRewards } = await import("../src/server/motivation/sync");
    await syncRewards(repo, roster[0].id, new Date(), { force: true });
    assert.equal(await repo.count("CoinLedger", { studentId: roster[0].id, reason: "work", refId: aid }), 0, "no 'work finished' coins");
    assert.equal(await repo.count("CoinLedger", { studentId: roster[0].id, reason: "levelup" }), 0, "no level-up coins from the placement");
    assert.deepEqual(levelUps([{ id: "x", createdAt: new Date(), before: { level: "BELOW" }, after: { level: "ABOVE", source: "PLACEMENT", outcome: "CHANGED" } }]), []);
    assert.equal(levelUps([{ id: "y", createdAt: new Date(), before: { level: "BELOW" }, after: { level: "ABOVE", source: "ADAPTIVE", outcome: "CHANGED" } }]).length, 1);
  });

  test("item 2: an ended sitting without a result is scored when the student's Diagnostic is read again", async () => {
    const id = roster[0].id;
    const before = (await repo.findMany("DiagnosticScore", { studentId: id }))[0];
    await repo.deleteMany("DiagnosticScore", { id: before.id }); // as if the scoring had failed after the last answer
    const st = await student(id);
    const mine = (await myDiagnostic(repo, st))!;
    assert.equal(mine.status, "DONE");
    assert.equal(await repo.count("DiagnosticScore", { studentId: id }), 1, "recovered once");
    await myDiagnostic(repo, st);
    assert.equal(await repo.count("DiagnosticScore", { studentId: id }), 1, "idempotent");
  });

  test("item 3: a placement never replaces the level a teacher set by hand", async () => {
    const id = roster[3].id;
    await recordLevel(repo, { studentId: id, level: "ON", source: "TEACHER", setById: teacher.userId, now: new Date() });
    assert.equal(await recordLevel(repo, { studentId: id, level: "ABOVE", source: "PLACEMENT", answers: 50, now: new Date() }), "KEPT_TEACHER");
    assert.equal(String((await repo.findUnique("StudentLevel", { studentId: id }))!.level), "ON");
  });

  test("item 5: the window's dates reach the Diagnostic assignments", async () => {
    const opensAt = startOfDay("2026-11-05")!, closesAt = endOfDay("2026-11-20")!;
    await setDiagnosticWindow(repo, admin, { grade: 4, mode: "AUTO", opensAt, closesAt });
    const t = (await repo.findUnique("DiagnosticTest", { id: ids[4] }))!;
    const as = await repo.findMany("Assignment", { assessmentId: t.assessmentId, deletedAt: null });
    assert.ok(as.length > 0);
    for (const a of as) {
      assert.equal(new Date(String(a.startAt instanceof Date ? a.startAt.toISOString() : a.startAt)).getTime(), opensAt.getTime());
      assert.equal(new Date(String(a.dueAt instanceof Date ? a.dueAt.toISOString() : a.dueAt)).getTime(), closesAt.getTime());
    }
    await setDiagnosticWindow(repo, admin, { grade: 4, mode: "MANUAL", isOpen: true });
    for (const a of await repo.findMany("Assignment", { assessmentId: t.assessmentId, deletedAt: null })) assert.ok(!a.startAt && !a.dueAt, "manual: the window alone decides");
  });

  test("item 8: reset only for the test's school and the actor's own students", async () => {
    const id = roster[0].id;
    const outsider = { ...admin, schoolId: "another-school" } as Actor;
    await assert.rejects(resetDiagnosticAttempt(repo, outsider, ids[4], id), ForbiddenError);
    const t2 = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.2" }))!);
    const theirs = new Set((await teacherRoster(repo, t2)).flatMap((c) => c.students.map((x) => x.id)));
    if (!theirs.has(id)) await assert.rejects(resetDiagnosticAttempt(repo, t2, ids[4], id), ForbiddenError);
    await resetDiagnosticAttempt(repo, teacher, ids[4], id);
    assert.equal(await repo.count("DiagnosticScore", { studentId: id, diagnosticId: ids[4] }), 0);
  });
});
