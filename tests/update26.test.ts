/**
 * Update 26 (FAKE data only — the Test School): the beginning-of-year Diagnostic Test (build, review, open, take
 * without feedback, result by standard, level), its class and student reports, sharing with the family.
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
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { buildDiagnostic, diagnosticQuestions, myDiagnostic, openDiagnostic, pickDiagnostic, swapDiagnosticQuestion, levelForPct, type PoolQuestion } from "../src/server/diagnostic/test";
import { classDiagnosticReport, shareDiagnosticResults, studentDiagnosticReport } from "../src/server/diagnostic/report";
import { areaOfStandard } from "../src/server/diagnostic/standards";
import { demoDatabase } from "./helpers/db";

describe("Update 26 · the Diagnostic Test", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId: string; let roster: { id: string; name: string }[]; let testId = "";
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, admin] = await Promise.all(["test.teacher.1", "test.admin"].map(a));
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
    // 64 questions over 8 standards of Grade 4
    const g = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    const skill = (await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }))[0];
    const codes = ["RL.4.1", "RL.4.2", "RL.4.3", "RI.4.2", "RI.4.3", "RI.4.5", "L.4.4", "L.4.1"];
    for (const code of codes) if (!(await repo.findMany("Standard", { code: `CCSS.ELA-LITERACY.${code}` })).length) await repo.create("Standard", { framework: "CCSS", code: `CCSS.ELA-LITERACY.${code}`, description: code, gradeLevel: 4, strand: code.split(".")[0], isActive: true });
    // only this test's multiple-choice questions in Grade 4 (simple to answer right or wrong)
    await repo.updateMany("Question", { status: "PUBLISHED" }, { status: "DRAFT" });
    const ids: string[] = [];
    for (const code of codes) for (let i = 0; i < 8; i++) {
      ids.push(await createDraft(repo, admin, { skillId: String(skill.id), standardCode: `CCSS.ELA-LITERACY.${code}`, type: "MULTIPLE_CHOICE", stem: `${code} question ${i} about the text`, level: 2 + (i % 5), whyCorrect: "Because.",
        options: [{ label: "A", text: `right ${code} ${i}`, correct: true, rationale: null }, { label: "B", text: `wrong ${code} ${i}`, correct: false, rationale: "No." }, { label: "C", text: `other ${code} ${i}`, correct: false, rationale: "No." }] } as never));
    }
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
  });

  test("areas and picking: every standard represented, strands in their share, a stable order", () => {
    assert.deepEqual(areaOfStandard("CCSS.ELA-LITERACY.L.4.4.a"), { code: "L.4.4", label: "Word Meaning (Context Clues, Roots, Affixes)", strand: "VOCAB", anchor: "L.4" });
    assert.equal(areaOfStandard("RI.4.4")!.strand, "VOCAB");
    const pool: PoolQuestion[] = [];
    for (const [code, n] of [["RL.4.2", 30], ["RL.4.3", 30], ["RI.4.2", 30], ["L.4.4", 20], ["L.4.1", 20]] as const) for (let i = 0; i < n; i++) pool.push({ id: `${code}-${i}`, area: areaOfStandard(code)!, level: 1 + (i % 7), passageId: null, placement: false });
    const ids = pickDiagnostic(pool, 50);
    assert.equal(ids.length, 50);
    assert.equal(new Set(ids).size, 50);
    const count = (p: string) => ids.filter((x) => x.startsWith(p)).length;
    assert.ok(count("RL.4.2") >= 7 && count("RL.4.3") >= 7, "both Literature standards");
    assert.deepEqual(pickDiagnostic(pool, 50), ids, "same pool → same test");
    assert.deepEqual([levelForPct(90), levelForPct(70), levelForPct(40)], ["ABOVE", "ON", "BELOW"]);
  });

  test("admin builds, reviews and swaps; a teacher cannot build", async () => {
    await assert.rejects(buildDiagnostic(repo, teacher, { grade: 4 }), ForbiddenError);
    const b = await buildDiagnostic(repo, admin, { grade: 4, size: 40 });
    testId = b.id;
    assert.equal(b.questions, 40);
    const v = await diagnosticQuestions(repo, admin, testId);
    assert.equal(v.questions.length, 40);
    assert.ok(v.byStandard.length >= 8, "every standard of the bank is in the test");
    const first = v.questions[0].id;
    const replaced = await swapDiagnosticQuestion(repo, admin, testId, first);
    assert.notEqual(replaced, first);
    assert.equal((await diagnosticQuestions(repo, admin, testId)).questions[0].area.code, v.questions[0].area.code, "swapped for the same standard");
  });

  test("open → every class gets it; the student takes it without feedback; the result sets the level", async () => {
    const r = await openDiagnostic(repo, admin, testId, { above: 85, on: 65 });
    assert.ok(r.classes >= 1);
    await assert.rejects(buildDiagnostic(repo, admin, { grade: 4 }), ValidationError, "an open test cannot be rebuilt");
    const st = await student(roster[0].id);
    const mine = (await myDiagnostic(repo, st))!;
    assert.equal(mine.status, "TODO");
    const aid = mine.href.split("/")[2];
    let clock = Date.now() - 3_600_000;
    let v = await startQuiz(repo, st, aid, new Date(clock));
    assert.equal(v.testMode, true);
    let i = 0;
    while (v.question) {
      const it = (await loadQuestionItems(repo, [v.question.questionId]))[0];
      const right = i % 10 < 7;   // 70%
      const out = await submitQuizAnswer(repo, st, { assignmentId: aid, questionId: it.questionId, response: it.options!.find((o) => o.correct === right)!.label }, new Date((clock += 30_000)));
      assert.equal(out.feedback.correctAnswer, "", "no answer is revealed during the test");
      v = out.view; i++;
    }
    assert.equal(i, 40);
    const res = (await repo.findMany("DiagnosticScore", { studentId: roster[0].id }))[0];
    assert.deepEqual([Number(res.correct), Number(res.pct), String(res.level)], [28, 70, "ON"]);
    assert.equal(String((await repo.findUnique("StudentLevel", { studentId: roster[0].id }))!.level), "ON");
    assert.equal((await myDiagnostic(repo, st))!.status, "DONE");
  });

  test("class report: summary, master table, not taken, tiers, standards, support plan, items", async () => {
    // two more students: one strong, one who needs support
    for (const [k, rate] of [[1, 10], [2, 3]] as const) {
      const st = await student(roster[k].id);
      const aid = (await myDiagnostic(repo, st))!.href.split("/")[2];
      let clock = Date.now() - 3_600_000; let v = await startQuiz(repo, st, aid, new Date(clock)); let i = 0;
      while (v.question) { const it = (await loadQuestionItems(repo, [v.question.questionId]))[0]; v = (await submitQuizAnswer(repo, st, { assignmentId: aid, questionId: it.questionId, response: it.options!.find((o) => o.correct === (i % 10 < rate))!.label }, new Date((clock += 30_000)))).view; i++; }
    }
    const rep = await classDiagnosticReport(repo, teacher, testId, classId);
    assert.equal(rep.summary.assessed, 3);
    assert.equal(rep.summary.notStarted, rep.summary.roster - 3);
    assert.deepEqual([rep.summary.max, rep.summary.min, rep.summary.median], [100, 30, 70]);
    assert.deepEqual(rep.students.map((x) => x.pct), [100, 70, 30], "sorted by score");
    assert.deepEqual(rep.summary.levels, { ABOVE: 1, ON: 1, BELOW: 1 });
    assert.equal(rep.tiers.find((t) => t.key === "INTENSIVE")!.students.length, 1);
    assert.ok(rep.standards.length >= 8 && rep.standards.every((x) => x.objective && x.activities.length));
    assert.equal(rep.supportPlan.length, 8);
    assert.equal(rep.supportPlan[7].code, "REVIEW");
    assert.ok(rep.supportPlan[0].students.some((x) => x.id === roster[2].id));
    assert.equal(rep.items.length, 40);
    assert.equal(rep.notTaken.length, rep.summary.roster - 3);
    await assert.rejects(classDiagnosticReport(repo, await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.3" }))!), testId, classId), ForbiddenError);
  });

  test("student report: hidden from the family until shared; then strengths, needs and class comparison", async () => {
    const st = await student(roster[2].id);
    assert.equal(await studentDiagnosticReport(repo, st, roster[2].id), null, "not shared yet");
    const staff = (await studentDiagnosticReport(repo, teacher, roster[2].id))!;
    assert.equal(staff.level, "BELOW");
    assert.ok(staff.needs.length > 0 && staff.standards.every((x) => x.classPct !== null));
    await shareDiagnosticResults(repo, teacher, { testId, studentIds: [roster[2].id], shared: true, note: "Great effort — we will work on main idea together." });
    const mine = (await studentDiagnosticReport(repo, st, roster[2].id))!;
    assert.equal(mine.note, "Great effort — we will work on main idea together.");
    await assert.rejects(studentDiagnosticReport(repo, st, roster[1].id), ForbiddenError, "not another student's report");
  });
});
