/**
 * The Diagnostic three times a year (FAKE data only — the Test School): BOY / MOY / EOY periods by date, the MOY focus
 * form weighted toward each student's weak strands, growth across the periods, benchmark categories with the 80%
 * target and reteach links, the Foundational Skills slots, and who may see what.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { buildDiagnostic, closeDiagnostic, designOf, studentDesign, diagnosticPool, diagnosticReadiness, listDiagnostics, myDiagnostic, openDiagnostic, periodOf, periodStart } from "../src/server/diagnostic/test";
import { BENCH_TARGET, benchCategoryOf, benchmarkCategories, classBenchmarkReport, studentBenchmark } from "../src/server/diagnostic/report";
import { classGrowth, studentGrowth, summarizeGrowth } from "../src/server/diagnostic/growth";
import { BLUEPRINT_SIZE, effectiveBlueprint, focusBlueprint, strandOfAnchor } from "../src/server/diagnostic/adaptive";
import { STRAND_QUOTA } from "../src/server/diagnostic/standards";
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";

const ANCHORS = ["RL.1", "RL.2", "RL.3", "RL.5", "RL.6", "RL.9", "RI.1", "RI.2", "RI.3", "RI.5", "RI.6", "RI.8", "L.4", "L.5", "RL.4", "RI.4", "L.1", "L.2"];
const OCT = new Date("2026-10-05T08:00:00Z"), JAN = new Date("2027-01-10T08:00:00Z");
/** the stems are "G4 L.4.1 level 3": grammar & conventions = L.g.1 / L.g.2 */
const isLang = (stem: string) => /\bL\.\d\.[12]\b/.test(stem);

describe("Pure: periods, focus form, Foundational slots, categories, growth", () => {
  test("the period follows the date: Aug–Nov BOY · Dec–Feb MOY · Mar–Jul EOY", () => {
    const at = (iso: string) => periodOf(new Date(iso));
    assert.deepEqual(["2026-08-01", "2026-11-30", "2026-12-01", "2027-02-28", "2027-03-01", "2027-07-31"].map((x) => at(`${x}T12:00:00Z`)), ["BOY", "BOY", "MOY", "MOY", "EOY", "EOY"]);
    assert.equal(periodStart(new Date("2027-01-15T00:00:00Z")).toISOString().slice(0, 10), "2026-12-01");
    assert.equal(periodStart(new Date("2026-10-15T00:00:00Z")).toISOString().slice(0, 10), "2026-08-01");
  });

  test("focus form: only weak strands, Below weighs more than borderline, weak standards first; nothing weak → short check", () => {
    const base = effectiveBlueprint([ANCHORS.flatMap((a) => Array.from({ length: 5 }, () => ({ a, st: strandOfAnchor(a) })))]);
    assert.equal(base.length, BLUEPRINT_SIZE);
    const items = ANCHORS.flatMap((a) => Array.from({ length: 15 }, () => ({ a, st: strandOfAnchor(a) })));
    const f = focusBlueprint(base, items, { on: 60, strands: [{ strand: "LIT", score: 90 }, { strand: "INFO", score: 65 }, { strand: "VOCAB", score: 40 }, { strand: "LANG", score: 80 }], anchors: [{ anchor: "L.5", score: 30 }, { anchor: "RI.2", score: 50 }] });
    assert.deepEqual(f.weakStrands, ["INFO", "VOCAB"]);
    assert.deepEqual(focusBlueprint(base, items, { on: 60, strands: [{ strand: "LIT", score: 95, raw: 90 }, { strand: "LANG", score: 88, raw: 20 }], anchors: [] }).weakStrands, ["LANG"], "adaptive: a strand mostly missed is weak even when its score leans high");
    const n = (st: string) => f.blueprint.filter((a) => strandOfAnchor(a) === st).length;
    assert.equal(f.blueprint.length, 30);
    assert.equal(n("LIT") + n("LANG"), 0, "strong strands are not re-tested");
    assert.ok(n("VOCAB") > n("INFO"), `Below (VOCAB ${n("VOCAB")}) weighs more than borderline (INFO ${n("INFO")})`);
    assert.equal(f.blueprint.filter((a) => strandOfAnchor(a) === "VOCAB")[0], "L.5", "the weakest standard comes first");
    assert.deepEqual(focusBlueprint(base, items, { on: 60, strands: [{ strand: "INFO", score: 65 }, { strand: "VOCAB", score: 40 }], anchors: [{ anchor: "L.5", score: 30 }, { anchor: "RI.2", score: 50 }] }).blueprint, f.blueprint, "deterministic");
    const none = focusBlueprint(base, items, { on: 60, strands: [{ strand: "LIT", score: 95 }], anchors: [] });
    assert.deepEqual(none.blueprint, [...new Set(base)], "nothing weak: every skill once");
  });

  test("Foundational slots: 4 RF.3 slots when every grade has word-study items, fewer when short, none when absent", () => {
    const core = ANCHORS.flatMap((a) => Array.from({ length: 5 }, () => ({ a, st: strandOfAnchor(a) })));
    const rf = (n: number) => Array.from({ length: n }, () => ({ a: "RF.3", st: "FOUND" as const }));
    assert.equal(effectiveBlueprint([core, core]).filter((a) => a === "RF.3").length, 0);
    assert.equal(effectiveBlueprint([[...core, ...rf(9)], [...core, ...rf(6)]]).filter((a) => a === "RF.3").length, 4);
    assert.equal(effectiveBlueprint([[...core, ...rf(9)], [...core, ...rf(2)]]).filter((a) => a === "RF.3").length, 2);
    assert.equal(effectiveBlueprint([[...core, ...rf(9)], core]).filter((a) => a === "RF.3").length, 0, "a grade without word study: skipped");
    assert.equal(effectiveBlueprint([[...core, ...rf(9)]]).length, BLUEPRINT_SIZE + 4);
    assert.equal(STRAND_QUOTA.FOUND, 4);
  });

  test("benchmark categories: raw + %, research & text features, the 80% flag", () => {
    const cells = benchmarkCategories([
      { anchor: "RL.2", strand: "LIT", correct: 9, total: 10 }, { anchor: "RL.3", strand: "LIT", correct: 7, total: 10 },
      { anchor: "RI.2", strand: "INFO", correct: 5, total: 10 }, { anchor: "RI.7", strand: "INFO", correct: 4, total: 4 },
      { anchor: "L.4", strand: "VOCAB", correct: 8, total: 10 }, { anchor: "L.1", strand: "LANG", correct: 3, total: 10 }, { anchor: "RF.3", strand: "FOUND", correct: 1, total: 4 },
    ]);
    assert.deepEqual(cells.map((c) => [c.key, c.correct, c.total, c.pct, c.met]), [
      ["LIT_COMP", 16, 20, 80, true], ["INFO_COMP", 5, 10, 50, false], ["VOCAB", 8, 10, 80, true], ["LANG", 3, 10, 30, false], ["RESEARCH", 4, 4, 100, true], ["FOUND", 1, 4, 25, false],
    ]);
    assert.equal(BENCH_TARGET, 80);
    assert.equal(benchCategoryOf("W.4", "WRITE"), null);
  });

  test("growth: deltas BOY → MOY → EOY, level counts, strand deltas, who did not grow", () => {
    const row = (id: string, period: "BOY" | "MOY" | "EOY", pct: number, level: "BELOW" | "ON" | "ABOVE", lit: number) => ({ studentId: id, name: id, period, pct, level, byStrand: [{ strand: "LIT" as const, correct: lit, total: 10 }], byStandard: [{ anchor: "RL.2", correct: lit, total: 10 }] });
    const g = summarizeGrowth([row("a", "BOY", 50, "BELOW", 4), row("a", "MOY", 62, "ON", 6), row("a", "EOY", 70, "ON", 8), row("b", "BOY", 80, "ON", 8), row("b", "EOY", 75, "ON", 7), row("c", "BOY", 40, "BELOW", 3)]);
    assert.deepEqual(g.periods, ["BOY", "MOY", "EOY"]);
    const a = g.students.find((x) => x.id === "a")!;
    assert.deepEqual(a.deltas, { boyMoy: 12, moyEoy: 8, boyEoy: 20, total: 20 });
    assert.equal(a.levelFrom, "BELOW"); assert.equal(a.levelTo, "ON"); assert.equal(a.grew, true); assert.equal(a.strandDeltas.LIT, 40);
    assert.deepEqual(g.levels.BOY, { ABOVE: 0, ON: 1, BELOW: 2 });
    assert.deepEqual(g.levels.EOY, { ABOVE: 0, ON: 2, BELOW: 0 });
    assert.deepEqual(g.notGrowing.map((x) => x.id), ["b"]);
    assert.equal(g.students.find((x) => x.id === "c")!.grew, null, "one result: no growth yet");
    assert.equal(g.strands[0].delta, 25, "class LIT average 50 → 75");
  });
});

describe("Diagnostic cycle · BOY → MOY focus form → growth and benchmark reports", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor; let classId: string; let roster: { id: string; name: string }[];
  let boyId = ""; let moyId = "";
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  async function take(st: Actor, right: (stem: string) => boolean): Promise<string[]> {
    const mine = (await myDiagnostic(repo, st))!;
    const aid = mine.href.split("/")[2];
    let clock = Date.now() - 3_600_000; let v = await startQuiz(repo, st, aid, new Date(clock)); let i = 0;
    const stems: string[] = [];
    while (v.question) {
      const it = (await loadQuestionItems(repo, [v.question.questionId]))[0];
      stems.push(it.stem);
      v = (await submitQuizAnswer(repo, st, { assignmentId: aid, questionId: it.questionId, response: it.options!.find((o) => o.correct === right(it.stem))!.label }, new Date((clock += 30_000)))).view; i++;
      assert.ok(i <= 60);
    }
    return stems;
  }

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher, other] = await Promise.all(["test.admin", "test.teacher.1", "test.teacher.3"].map(a));
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

  test("BOY by date: the title names the period; no word-study items → no Foundational slots; a teacher cannot build", async () => {
    await assert.rejects(buildDiagnostic(repo, teacher, { grade: 4 }, OCT), ForbiddenError);
    const b = await buildDiagnostic(repo, admin, { grade: 4 }, OCT);
    boyId = b.id;
    assert.equal(b.period, "BOY"); assert.equal(b.form, "full"); assert.equal(b.questions, BLUEPRINT_SIZE);
    const t = (await repo.findUnique("DiagnosticTest", { id: boyId }))!;
    assert.equal(String(t.period), "BOY");
    assert.match(String(t.title), /BOY/);
    assert.ok(!designOf(t)!.blueprint.includes("RF.3"));
    await openDiagnostic(repo, admin, boyId, { above: 85, on: 60 }, OCT);
  });

  test("students take BOY: one weak in grammar & conventions, one strong everywhere", async () => {
    // right only on Grade ≤ 4 questions outside grammar & conventions; every grammar & conventions question wrong
    await take(await student(roster[0].id), (stem) => !isLang(stem) && Number(/^G(\d)/.exec(stem)?.[1]) <= 4);
    await take(await student(roster[1].id), () => true);
    const res = (await repo.findMany("DiagnosticScore", { diagnosticId: boyId })).length;
    assert.equal(res, 2);
    await closeDiagnostic(repo, admin, boyId);
  });

  test("MOY focus form: each student re-tests only their weak strands (strong student: a short check)", async () => {
    const m = await buildDiagnostic(repo, admin, { grade: 4, form: "focus" }, JAN);
    moyId = m.id;
    assert.equal(m.period, "MOY"); assert.equal(m.form, "focus");
    assert.match(String((await repo.findUnique("DiagnosticTest", { id: moyId }))!.title), /MOY.*focus/);
    const list = await listDiagnostics(repo, admin);
    assert.deepEqual(list.filter((x) => x.grade === 4).map((x) => x.period).sort(), ["BOY", "MOY"], "both periods kept");
    await openDiagnostic(repo, admin, moyId, { above: 85, on: 60 }, JAN);
    const weak = await student(roster[0].id);
    const mine = (await myDiagnostic(repo, weak))!;
    assert.equal(mine.id, moyId);
    assert.ok(mine.total < BLUEPRINT_SIZE && mine.total >= 10, `focus form length ${mine.total}`);
    const stems = await take(weak, () => true);
    assert.equal(stems.length, mine.total);
    // the adaptive item choice varies with the ids, so check against the student's own BOY result
    const boy = (await repo.findMany("DiagnosticScore", { diagnosticId: boyId, studentId: roster[0].id }))[0];
    const boyStrands = (typeof boy.byStrand === "string" ? JSON.parse(String(boy.byStrand)) : boy.byStrand) as { strand: "LIT" | "INFO" | "VOCAB" | "LANG"; correct: number; total: number; score: number }[];
    const expect = focusBlueprint(designOf((await repo.findUnique("DiagnosticTest", { id: moyId }))!)!.blueprint, designOf((await repo.findUnique("DiagnosticTest", { id: moyId }))!)!.items, { on: 60, strands: boyStrands.map((x) => ({ strand: x.strand, score: x.score, raw: (100 * x.correct) / x.total })), anchors: [] });
    assert.ok(expect.weakStrands.includes("LANG"), "grammar & conventions (all missed) is weak");
    assert.ok(stems.filter(isLang).length >= 10, "grammar & conventions re-tested");
    const mineBp = (await studentDesign(repo, (await repo.findUnique("DiagnosticTest", { id: moyId }))!, designOf((await repo.findUnique("DiagnosticTest", { id: moyId }))!)!, roster[0].id)).blueprint;
    const retested = new Set(mineBp.map(strandOfAnchor));
    assert.ok(retested.has("LANG"));
    const strongStrands = boyStrands.filter((x) => !retested.has(x.strand)).map((x) => x.strand);
    const strandOfStem = (stem: string) => strandOfAnchor((/\b(RL|RI|L)\.\d\.(\d)/.exec(stem) ?? []).slice(1).join("."));
    assert.ok(stems.every((x) => !strongStrands.includes(strandOfStem(x) as never)), `strong strands (${strongStrands}) are not re-tested`);
    const strong = await student(roster[1].id);
    const s2 = (await myDiagnostic(repo, strong))!;
    assert.equal(s2.total, new Set(designOf((await repo.findUnique("DiagnosticTest", { id: moyId }))!)!.blueprint).size, "nothing weak: every skill once");
    await take(strong, () => false);
    const moy = (await repo.findMany("DiagnosticScore", { diagnosticId: moyId, studentId: roster[0].id }))[0];
    const strands = (typeof moy.byStrand === "string" ? JSON.parse(String(moy.byStrand)) : moy.byStrand) as { strand: string; carried?: boolean }[];
    assert.deepEqual(strands.map((x) => x.strand).sort(), ["INFO", "LANG", "LIT", "VOCAB"], "every strand reported (re-tested or carried from BOY)");
    assert.ok(strands.filter((x) => x.carried).every((x) => strongStrands.includes(x.strand as never)), "only the strong strands are carried");
  });

  test("growth: class panel and the student's own panel", async () => {
    const g = await classGrowth(repo, teacher, { grade: 4, classId });
    assert.deepEqual(g.periods, ["BOY", "MOY"]);
    const w = g.students.find((x) => x.id === roster[0].id)!, s = g.students.find((x) => x.id === roster[1].id)!;
    assert.ok(w.deltas.boyMoy! > 0 && w.grew, `the weak student grew (${w.deltas.boyMoy})`);
    assert.ok((w.strandDeltas.LANG ?? 0) > 0, "grammar & conventions grew");
    const moy = (await repo.findMany("DiagnosticScore", { diagnosticId: moyId, studentId: roster[0].id }))[0];
    const carried = ((typeof moy.byStrand === "string" ? JSON.parse(String(moy.byStrand)) : moy.byStrand) as { strand: "LIT" | "INFO" | "VOCAB" | "LANG"; carried?: boolean }[]).filter((x) => x.carried);
    for (const c of carried) assert.equal(w.strandDeltas[c.strand], undefined, "a carried strand is not a new measure");
    assert.equal(s.grew, false);
    assert.deepEqual(g.notGrowing.map((x) => x.id), [roster[1].id]);
    assert.equal(Object.values(g.levels.BOY!).reduce((a, b) => a + b, 0), 2);
    const mine = (await studentGrowth(repo, teacher, roster[0].id))!;
    assert.equal(mine.deltas.boyMoy, w.deltas.boyMoy);
    assert.equal(await studentGrowth(repo, await student(roster[0].id), roster[0].id), null, "the student sees only shared results");
  });

  test("benchmark categories per test with reteach links to the skill-assign bank panel", async () => {
    const b = await classBenchmarkReport(repo, teacher, boyId, classId);
    const lang = b.categories.find((c) => c.key === "LANG")!;
    assert.ok(lang && !lang.met && lang.belowTarget >= 1, "grammar & conventions under 80%");
    assert.ok(lang.total > 0 && lang.pct === Math.round((1000 * lang.correct) / lang.total) / 10);
    assert.ok(lang.reteach.length >= 1 && lang.reteach.every((r) => r.href.startsWith(`/teacher/skill-assign?skillId=`) && r.href.includes(`classId=${classId}`)), "reteach the weakest grammar skills");
    assert.ok(b.categories.filter((c) => c.met).every((c) => !c.reteach.length));
    const cells = (await studentBenchmark(repo, teacher, roster[1].id, boyId))!;
    assert.ok(cells.every((c) => c.met), "the strong student meets every target");
  });

  test("authorization: other teachers, students and parents are refused", async () => {
    const stA = await student(roster[0].id);
    await assert.rejects(classGrowth(repo, other, { grade: 4, classId }), ForbiddenError);
    await assert.rejects(classGrowth(repo, stA, { grade: 4 }), ForbiddenError);
    await assert.rejects(classBenchmarkReport(repo, stA, boyId), ForbiddenError);
    await assert.rejects(classBenchmarkReport(repo, other, boyId, classId), ForbiddenError);
    await assert.rejects(studentGrowth(repo, stA, roster[1].id), ForbiddenError);
  });

  test("Foundational slots: word-study skills (prefixes …) report as RF.3 and get 4 slots", async () => {
    const made: string[] = [];
    for (const g of [4, 5, 6]) {
      const gr = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: g }))[0];
      const cur = (await repo.findMany("Curriculum", { gradeId: gr.id }))[0];
      const fam = (await repo.findMany("SkillFamily", { code: "prefixes" }))[0];
      const skill = (await repo.findMany("Skill", { curriculumId: cur.id, familyId: fam.id, deletedAt: null }))[0];
      assert.ok(skill, `Grade ${g} has a prefixes skill`);
      for (let i = 0; i < 5; i++) made.push(await createDraft(repo, admin, { skillId: String(skill.id), standardCode: `CCSS.ELA-LITERACY.L.${g}.4`, type: "MULTIPLE_CHOICE", stem: `G${g} RF word study ${i}`, level: 3 + (i % 3), whyCorrect: "Because.",
        options: [{ label: "A", text: `right ${i}`, correct: true, rationale: null }, { label: "B", text: `wrong ${i}`, correct: false, rationale: "No." }] } as never));
    }
    await repo.updateMany("Question", { id: { in: made } }, { status: "PUBLISHED" });
    const pool = await diagnosticPool(repo, admin.schoolId!, 4);
    assert.ok(pool.filter((q) => made.includes(q.id)).every((q) => q.area.strand === "FOUND" && q.area.code === "RF.4.3"));
    const rd = await diagnosticReadiness(repo, admin);
    assert.equal(rd.blueprint.find((x) => x.anchor === "RF.3")?.slots, 4);
  });
});
