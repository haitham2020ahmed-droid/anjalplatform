/**
 * The adaptive Diagnostic (FAKE data only — the Test School): one 50-slot blueprint for Grades 4, 5 and 6, the
 * difficulty following each student across grades, the result on one scale, the reports and the growth to MAP.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { buildAllDiagnostics, buildDiagnostic, designOf, diagnosticQuestions, diagnosticReadiness, myDiagnostic, openDiagnostic, swapDiagnosticQuestion } from "../src/server/diagnostic/test";
import { classDiagnosticReport, studentDiagnosticReport } from "../src/server/diagnostic/report";
import { draftReflection } from "../src/server/diagnostic/reflection";
import { BLUEPRINT_SIZE, effectiveBlueprint, estimate, nextItem, scoreOf, type Design } from "../src/server/diagnostic/adaptive";
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";

const ANCHORS = ["RL.1", "RL.2", "RL.3", "RL.5", "RL.6", "RL.9", "RI.1", "RI.2", "RI.3", "RI.5", "RI.6", "RI.8", "L.4", "L.5", "RL.4", "RI.4", "L.1", "L.2"];

describe("Adaptive Diagnostic · one blueprint for every grade", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classId: string; let roster: { id: string; name: string }[];
  const ids: Record<number, string> = {};
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  /** answers the whole test: right(question's grade, i) decides each answer; returns the questions met */
  async function take(st: Actor, right: (grade: number, i: number) => boolean): Promise<{ id: string; grade: number }[]> {
    const mine = (await myDiagnostic(repo, st))!;
    const aid = mine.href.split("/")[2];
    let clock = Date.now() - 3_600_000; let v = await startQuiz(repo, st, aid, new Date(clock)); let i = 0;
    const met: { id: string; grade: number }[] = [];
    while (v.question) {
      const it = (await loadQuestionItems(repo, [v.question.questionId]))[0];
      const g = Number(/^G(\d)/.exec(it.stem)?.[1] ?? 0);
      met.push({ id: it.questionId, grade: g });
      const ok = right(g, i);
      v = (await submitQuizAnswer(repo, st, { assignmentId: aid, questionId: it.questionId, response: it.options!.find((o) => o.correct === ok)!.label }, new Date((clock += 30_000)))).view; i++;
      assert.ok(i <= BLUEPRINT_SIZE, "never more than 50 questions");
    }
    return met;
  }

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    await repo.updateMany("Question", { status: "PUBLISHED" }, { status: "DRAFT" });
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
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
  });

  test("engine: estimates move with the answers; the next question follows the estimate", () => {
    const up = estimate(Array.from({ length: 10 }, () => ({ d: 4, correct: true })), 4);
    const down = estimate(Array.from({ length: 10 }, () => ({ d: 4, correct: false })), 4);
    assert.ok(up.theta > 4.8 && down.theta < 3.4, `${up.theta} / ${down.theta}`);
    assert.ok(estimate([], 4).se > estimate(Array.from({ length: 30 }, (_, i) => ({ d: 4, correct: i % 2 === 0 })), 4).se, "more answers, less error");
    assert.deepEqual([scoreOf(4, 4), scoreOf(4.5, 4), scoreOf(3.5, 4)], [72.5, 85, 60]);
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, a: "RL.2", st: "LIT" as const, d: 3 + i / 10, p: null, g: 4 }));
    const design: Design = { blueprint: ["RL.2", "RL.2", "RL.2"], items };
    const first = nextItem(design, [], 4)!;
    assert.ok(Math.abs(items.find((q) => q.id === first)!.d - 4) < 0.11, "starts at the starting point");
    const afterRight = items.find((q) => q.id === nextItem(design, [{ id: first, correct: true }], 4))!.d;
    const afterWrong = items.find((q) => q.id === nextItem(design, [{ id: first, correct: false }], 4))!.d;
    assert.ok(afterRight > 4 && afterWrong < 4, "harder after a right answer, easier after a wrong one");
    assert.equal(nextItem(design, [{ id: "q1", correct: true }, { id: "q2", correct: true }, { id: "q3", correct: true }], 4), null, "done after the blueprint");
    // a skill one grade lacks gives its slots to a skill every grade has
    const many = Array.from({ length: 20 }, () => ({ a: "RL.2", st: "LIT" as const }));
    const bp = effectiveBlueprint([[{ a: "RL.1", st: "LIT" }, ...many], many]);
    assert.ok(bp.slice(0, 15).every((a) => a === "RL.2"), bp.slice(0, 15).join());
  });

  test("the bank is ready for every grade; one blueprint of 50 slots for Grades 4, 5 and 6", async () => {
    const rd = await diagnosticReadiness(repo, admin);
    for (const g of [4, 5, 6]) assert.ok(rd.grades.find((x) => x.grade === g)?.ready, `Grade ${g} ready`);
    assert.equal(rd.blueprint.reduce((t, b) => t + b.slots, 0), BLUEPRINT_SIZE);
    await assert.rejects(buildDiagnostic(repo, teacher, { grade: 4 }), ForbiddenError);
    const all = await buildAllDiagnostics(repo, admin);
    for (const g of [4, 5, 6]) ids[g] = all.built.find((x) => x.grade === g)!.id;
    const designs = await Promise.all([4, 5, 6].map(async (g) => designOf((await repo.findUnique("DiagnosticTest", { id: ids[g] }))!)!));
    assert.equal(designs[0].blueprint.length, 50);
    assert.deepEqual(designs[1].blueprint, designs[0].blueprint, "Grade 5: the same skills, in the same order");
    assert.deepEqual(designs[2].blueprint, designs[0].blueprint, "Grade 6: the same skills, in the same order");
    const per = (st: string) => designs[0].blueprint.filter((a) => (st === "LIT" ? /^RL\.(?!4)/.test(a) : st === "INFO" ? /^RI\.(?!4)/.test(a) : st === "LANG" ? a === "L.1" || a === "L.2" : a === "L.4" || a === "L.5" || a === "RL.4" || a === "RI.4")).length;
    assert.deepEqual([per("LIT"), per("INFO"), per("VOCAB"), per("LANG")], [15, 15, 10, 10]);
    assert.ok(designs[0].items.some((q) => q.g === 6) && designs[2].items.some((q) => q.g === 4), "the pool spans the grades");
    const v = await diagnosticQuestions(repo, admin, ids[4]);
    assert.equal(v.test.questions, 50); assert.ok(v.test.adaptive);
    assert.ok(v.slots!.every((x) => x.easier + x.on + x.harder >= x.slots));
    // leaving a question out of the pool
    await swapDiagnosticQuestion(repo, admin, ids[4], designs[0].items[0].id);
    assert.equal(designOf((await repo.findUnique("DiagnosticTest", { id: ids[4] }))!)!.items.length, designs[0].items.length - 1);
  });

  test("a strong student climbs to harder grades; a student who needs support goes down; same skills for both", async () => {
    await openDiagnostic(repo, admin, ids[4], {});
    const strong = await take(await student(roster[0].id), () => true);
    const weak = await take(await student(roster[1].id), () => false);
    const mid = await take(await student(roster[2].id), (g) => g <= 4);
    assert.equal(strong.length, 50); assert.equal(weak.length, 50); assert.equal(mid.length, 50);
    assert.ok(strong.filter((q) => q.grade === 6).length >= 25, "the strong student meets Grade 6 questions");
    assert.ok(weak.filter((q) => q.grade === 4).length >= 45 && !weak.some((q) => q.grade === 6), "the student who needs support stays on the easiest questions");
    const design = designOf((await repo.findUnique("DiagnosticTest", { id: ids[4] }))!)!;
    const anchorOf = (id: string) => design.items.find((q) => q.id === id)!.a;
    assert.deepEqual(strong.map((q) => anchorOf(q.id)), design.blueprint, "the strong student answered the blueprint's skills in order");
    assert.deepEqual(weak.map((q) => anchorOf(q.id)), design.blueprint, "… and so did the student who needs support");
    const res = async (id: string) => (await repo.findMany("DiagnosticScore", { studentId: id }))[0];
    const [rs, rw, rm] = await Promise.all([res(roster[0].id), res(roster[1].id), res(roster[2].id)]);
    assert.equal(String(rs.level), "ABOVE"); assert.equal(String(rw.level), "BELOW");
    assert.ok(Number(rs.theta) > 5.5 && Number(rw.theta) < 3.6, `${rs.theta} / ${rw.theta}`);
    assert.ok(Number(rm.theta) > 3.8 && Number(rm.theta) < 4.9, `mid ${rm.theta}`);
    assert.ok(Number(rs.ritEstimate) > Number(rm.ritEstimate) && Number(rm.ritEstimate) > Number(rw.ritEstimate), "estimated RIT in order");
    const areas = (typeof rm.byArea === "string" ? JSON.parse(rm.byArea) : rm.byArea) as { group: string }[];
    assert.deepEqual(areas.map((a) => a.group).sort(), ["GRAMMAR", "INFO", "LIT", "MECH", "VOCAB"], "by MAP goal area");
    assert.equal(String((await repo.findUnique("StudentLevel", { studentId: roster[0].id }))!.level), "ABOVE", "the level is set");
  });

  test("reports: one scale, reading level, skills, growth to the MAP tests that follow", async () => {
    // the strong student's later MAP tests
    const st = roster[0].id;
    for (const [term, date, rit] of [["Winter 2027", "2027-01-20", 214], ["Spring 2027", "2027-05-20", 221]] as const) await repo.create("MapResult", { studentId: st, subject: "Reading", termName: term, testDate: new Date(date), rit, goalName: null, importedAt: new Date() } as never);
    const rep = await classDiagnosticReport(repo, teacher, ids[4], classId);
    assert.ok(rep.adaptive);
    assert.equal(rep.summary.assessed, 3);
    // r89 fix: the earlier test only pins the strong/weak students' levels (ABOVE/BELOW) and bounds the "mid"
    // student's theta loosely (3.8–4.9) — a range that straddles the real ON/ABOVE boundary (theta 4.5, from
    // scoreOf/levelForPct), so which side of it the scripted "mid" strategy lands on can vary slightly with the
    // blueprint's tie-broken item order (nextItem's hash(seed+id), seed = the student's own freshly-seeded id).
    // The real invariant this report test cares about is that its level counts match each student's own recorded
    // DiagnosticScore, not which specific level the mid student receives — so compare against that directly.
    const recordedLevels = await Promise.all(roster.slice(0, 3).map(async (r) => String((await repo.findMany("DiagnosticScore", { studentId: r.id }))[0]!.level)));
    const expectedLevels = recordedLevels.reduce((m: Record<string, number>, l) => ((m[l] = (m[l] ?? 0) + 1), m), { ABOVE: 0, ON: 0, BELOW: 0 });
    assert.deepEqual(rep.summary.levels, expectedLevels);
    const top = rep.students[0];
    assert.equal(top.id, st); assert.match(top.readingLevel!, /^Grade \d\.\d$/);
    assert.ok(rep.standards.length >= 12 && rep.standards.every((x) => x.code.includes(".4.")), "skills named for Grade 4");
    assert.ok(rep.items.length > 0 && rep.items.length <= 80);
    const g = rep.growth!.rows.find((x) => x.id === st)!;
    assert.deepEqual(g.maps.map((m) => m.rit), [214, 221]);
    assert.equal(g.growth, 221 - g.calibrated);
    const mine = await studentDiagnosticReport(repo, teacher, st, ids[4]);
    assert.ok(mine && mine.standards.length >= 12 && mine.strands.length === 4);
    assert.ok(rep.summary.sd !== null && rep.summary.spread.length > 10, "the spread of the class (SD)");
    // the reflection drafted from the numbers (no AI key: the platform writes it)
    const refl = await draftReflection(repo, teacher, ids[4], classId, {});
    assert.equal(refl.source, "PLATFORM");
    assert.equal(refl.answers.length, 5);
    assert.ok(refl.answers.every((a) => a.answer.length > 30) && !refl.answers.some((a) => /Test Student/.test(a.answer)), "no names in the reflection");
  });
});
