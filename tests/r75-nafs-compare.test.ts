/**
 * 🇸🇦 r75 NAFS → Reports → COMPARE (fictional demo school, in-memory database) with KNOWN results:
 *   Test A (10 Jan: S01 + S04 + S05) · Ministry booklet B (10 Feb: S04 + S05 + S07) · Test C (1 Mar: S05 + S07, st1 only)
 *   st1–st3 in DEMO 6A, st4–st6 in DEMO 6B; st6 took only Test A.
 *   Adaptive practice in March: period 1 = 1–14 Mar, period 2 = 18–31 Mar (with rapid guesses and an Unreliable run).
 *   One student in each of the four "All" cases (st1 Excellent · st2 not used to the test · st3 practising less ·
 *   st4 needs support), st5 the same, st6 too early.
 * Every number, arrow, the ±5 rule, the shared-standard change, the warning, the practice numbers, the All cases, the
 * summary sentences and the action buttons are asserted.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { teacherRoster } from "../src/server/teacher/assign";
import { ensureNafsFramework } from "../src/server/nafs/framework";
import { nafsBankChanged, saveNafsQuestion } from "../src/server/nafs/bank";
import { nafsClasses, saveNafsTest } from "../src/server/nafs/tests";
import { createNafsPractice, newRunState } from "../src/server/nafs/practice";
import { centerRedirect, REPORT_VIEWS } from "../src/server/nafs/center";
import {
  ARROW_NAME, ARROW_RULE, arrowOf, COMPARE_TIPS as TIPS, CASES, caseOf, COMPARE_MODES, compareHref, comparePractice, compareTests, MOVE_POINTS, nafsCompareAll, nafsComparePractice, nafsCompareTests, pickPair, practicePeriods, type Take,
} from "../src/server/nafs/compare";
import { compareAllDoc, compareTestsDoc, exportNafsCompare } from "../src/server/nafs/compare-export";
import { C, CA, compareAllSummary, comparePracticeSummary, compareTestsSummary, oneLineAll, oneLineUpDown, plainLine } from "../src/lib/nafs-compare-summary";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && Boolean((ar as Record<string, string>)[x]);

let repo: SqliteRepo;
let admin: Actor, teacherA: Actor, student: Actor;
let classA = "", classB = "";
let st: { id: string; name: string }[] = [];
const Q: Record<string, string[]> = { S01: [], S04: [], S05: [], S07: [] };
let testA = "", bookletB = "", testC = "";
const JAN10 = new Date("2026-01-10T09:00:00Z"), FEB10 = new Date("2026-02-10T09:00:00Z"), MAR01 = new Date("2026-03-01T09:00:00Z");
const RANGE = { from: "2026-03-01", to: "2026-03-31" };

/** answers: per standard group of 4, the first k right (choice 1 = the key), the rest wrong (choice 0) */
const ans = (...rights: number[]) => rights.flatMap((k) => [0, 1, 2, 3].map((i) => (i < k ? 1 : 0)));
async function result(testId: string, classId: string, studentId: string, answers: number[], at: Date) {
  await repo.create("NafsResult", { testId, classId, studentId, source: "TYPED", answers, correct: answers.filter((a) => a === 1).length, points: 0, maxPoints: answers.length, submittedAt: at, updatedAt: at });
}
/** one practice run with its answers: [difficulty, right, day of March, ms (default 20 s)] */
async function run(practiceId: string, classId: string, studentId: string, list: [number, boolean, number, number?][]) {
  const r = await repo.create("NafsPracticeRun", { practiceId, studentId, classId, state: newRunState(["MOE.S04"]), asked: list.length, correct: list.filter((x) => x[1]).length, seconds: 60, startedAt: new Date("2026-03-01T08:00:00Z"), updatedAt: new Date("2026-03-31T08:00:00Z") });
  let k = 0;
  for (const [dif, right, dayN, ms] of list) await repo.create("NafsPracticeAnswer", { runId: r.id, practiceId, studentId, questionId: Q.S04[k % 4], target: "MOE.S04", difficulty: dif, choice: right ? 1 : 0, correct: right, ms: ms ?? 20_000, at: new Date(Date.UTC(2026, 2, dayN, 9, k++)) });
}

before(async () => {
  ({ repo } = await demoDatabase());
  const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  admin = await as("demo.admin");
  const classes = await nafsClasses(repo, admin);
  assert.ok(classes.length >= 2 && classes.every((c) => c.students.length >= 3), "the demo school has two Grade 6 classes of 3");
  classA = classes[0].id; classB = classes[1].id;
  st = [...classes[0].students.slice(0, 3), ...classes[1].students.slice(0, 3)];
  const teachers = await Promise.all((await repo.findMany("User", { role: "TEACHER" })).map((u) => resolveActor(repo, u)));
  for (const a of teachers) if ((await teacherRoster(repo, a)).some((c) => c.id === classA)) teacherA = a;
  student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: st[0].id }))!.userId }))!);

  await ensureNafsFramework(repo);
  const code = { S01: "NAFS.V.SYNANT", S04: "NAFS.RC.MAIN", S05: "NAFS.RC.DETAIL", S07: "NAFS.IAE.INFER" } as const;
  for (const std of ["S01", "S04", "S05", "S07"] as const) for (let k = 0; k < 4; k++) {
    Q[std].push((await saveNafsQuestion(repo, admin, { nafsCode: code[std], standard: `MOE.${std}`, difficulty: (k % 3) + 1, stem: `Compare ${std} question ${k + 1}?`, options: [`one ${std}${k}`, `two ${std}${k}`, `three ${std}${k}`, `four ${std}${k}`], correct: 1 })).id);
  }
  nafsBankChanged(repo, admin.schoolId!);
  testA = await saveNafsTest(repo, admin, { title: "Simulation A", mode: "MANUAL", questionIds: [...Q.S01, ...Q.S04, ...Q.S05], timeLimitMin: 30 });
  bookletB = await saveNafsTest(repo, admin, { title: "NB-T1 · Model booklet", mode: "MINISTRY", questionIds: [...Q.S04, ...Q.S05, ...Q.S07], timeLimitMin: 45, settings: { booklet: "NB-T1", whole: true } });
  testC = await saveNafsTest(repo, admin, { title: "Simulation C", mode: "MANUAL", questionIds: [...Q.S05, ...Q.S07], timeLimitMin: 30 });
  const [s1, s2, s3, s4, s5, s6] = st.map((x) => x.id);
  // Test A: S01 · S04 · S05 (of 4 each)
  await result(testA, classA, s1, ans(4, 2, 2), JAN10); // shared 4/8 = 50 · whole 8/12 = 67
  await result(testA, classA, s2, ans(0, 4, 4), JAN10); // shared 100 · whole 67
  await result(testA, classA, s3, ans(4, 1, 1), JAN10); // shared 25 · whole 50
  await result(testA, classB, s4, ans(2, 3, 3), JAN10); // shared 75 · whole 67
  await result(testA, classB, s5, ans(0, 2, 2), JAN10); // shared 50 · whole 33
  await result(testA, classB, s6, ans(4, 4, 0), JAN10); // only A: 67
  // Booklet B: S04 · S05 · S07
  await result(bookletB, classA, s1, ans(4, 3, 0), FEB10); // shared 7/8 = 88 · whole 7/12 = 58
  await result(bookletB, classA, s2, ans(3, 1, 4), FEB10); // shared 50 · whole 67
  await result(bookletB, classA, s3, ans(4, 2, 2), FEB10); // shared 75 · whole 67
  await result(bookletB, classB, s4, ans(2, 1, 1), FEB10); // shared 3/8 = 38 · whole 33
  await result(bookletB, classB, s5, ans(2, 2, 4), FEB10); // shared 50 · whole 67
  // Test C: S05 · S07 (st1 only)
  await result(testC, classA, s1, ans(4, 4), MAR01);
  // adaptive practice in March (period 1 = 1–14, period 2 = 18–31)
  const pA = (await createNafsPractice(repo, admin, { title: "S04 practice A", targets: ["MOE.S04"], classId: classA })).id;
  const pB = (await createNafsPractice(repo, admin, { title: "S04 practice B", targets: ["MOE.S04"], classId: classB })).id;
  await run(pA, classA, s1, [[1, true, 2], [2, false, 3], [1, true, 4], [2, false, 5], [2, true, 16], /* (16 Mar: in neither period) */ [2, true, 20], [3, true, 21], [3, true, 22], [3, false, 23], [3, true, 24]]);
  await run(pA, classA, s2, [[2, false, 2], [1, false, 3], [1, true, 4], [2, false, 5], [2, true, 20], [3, false, 21], [2, true, 22], [3, true, 23]]);
  await run(pA, classA, s3, [[2, true, 2], [3, true, 3], [3, true, 4], [3, true, 5], [3, false, 20], [2, true, 21], [3, false, 22], [2, true, 23]]);
  await run(pB, classB, s4, [[2, true, 2], [3, false, 3], [2, true, 4], [2, false, 20], [1, true, 21], [2, false, 22], [2, true, 23, 1000] /* a rapid guess */]);
  await run(pB, classB, s5, [[2, true, 2], [3, false, 3], [2, true, 4], [3, false, 5], [2, true, 20], [3, false, 21], [2, true, 22], [3, false, 23]]);
  await run(pB, classB, s6, [[2, true, 20, 900], [2, true, 21, 800], [2, true, 22], [2, true, 23], [2, true, 24]]); // 2 of 5 guesses → Unreliable
});

describe("the ±5 rule and the cases (pure)", () => {
  test("arrows: +5 or more up, −5 or less down, else the same", () => {
    assert.equal(MOVE_POINTS, 5);
    assert.equal(arrowOf(5), "UP"); assert.equal(arrowOf(38), "UP"); assert.equal(arrowOf(4), "SAME"); assert.equal(arrowOf(0), "SAME");
    assert.equal(arrowOf(-4), "SAME"); assert.equal(arrowOf(-5), "DOWN"); assert.equal(arrowOf(null), null);
    assert.equal(ARROW_RULE, "Went up = 5 points or more higher. Went down = 5 points or more lower. Anything in between = the same.");
  });
  test("the owner-approved wording of the four cases", () => {
    assert.deepEqual(CASES.map((c) => [c.name, c.action]), [
      ["Excellent 🌟", "Give a bigger challenge"],
      ["Understands, but not used to the test yet", "Practise the test format and timing"],
      ["Practising less", "Encourage more practice"],
      ["Needs support ⚠️", "Small group + contact parent"],
      ["Same level", "Keep the usual plan"],
      ["Too early to judge", "Collect more results first"],
    ]);
    assert.equal(caseOf("UP", "UP"), "EXCELLENT"); assert.equal(caseOf("DOWN", "UP"), "NOT_USED");
    assert.equal(caseOf("UP", "DOWN"), "LESS_PRACTICE"); assert.equal(caseOf("DOWN", "DOWN"), "SUPPORT");
    assert.equal(caseOf("SAME", "UP"), "SAME"); assert.equal(caseOf("UP", null), "TOO_EARLY"); assert.equal(caseOf(null, null), "TOO_EARLY");
  });
  test("periods: first 2 weeks vs last 2 weeks · a short range in halves · last month vs this month", () => {
    assert.deepEqual(practicePeriods(RANGE), { a: { from: "2026-03-01", to: "2026-03-14" }, b: { from: "2026-03-18", to: "2026-03-31" }, range: RANGE, preset: "edges" });
    const short = practicePeriods({ from: "2026-03-10", to: "2026-03-01" });
    assert.deepEqual([short.a, short.b], [{ from: "2026-03-01", to: "2026-03-05" }, { from: "2026-03-06", to: "2026-03-10" }]);
    const m = practicePeriods({ preset: "month", now: new Date("2026-10-14T10:00:00Z") });
    assert.deepEqual([m.a, m.b, m.preset], [{ from: "2026-09-01", to: "2026-09-30" }, { from: "2026-10-01", to: "2026-10-14" }, "month"]);
    const data = practicePeriods({ dataFrom: Date.parse("2026-02-01T10:00:00Z"), dataTo: Date.parse("2026-03-30T10:00:00Z") });
    assert.deepEqual([data.a.from, data.b.to], ["2026-02-01", "2026-03-30"], "the range defaults to the data's dates");
  });
  test("a boundary student: +5 → up, +4 → same (fixture of pure takes)", () => {
    const tk = (id: string, right: number): Take => ({ studentId: id, classId: "c", perStd: { "MOE.S04": { sum: right, n: 100 } }, overall: { sum: right, n: 100 } });
    const students = [{ id: "x", name: "X", classId: "c", className: "C" }, { id: "y", name: "Y", classId: "c", className: "C" }, { id: "z", name: "Z", classId: "c", className: "C" }];
    const r = compareTests({ a: null, b: null, takesA: [tk("x", 50), tk("y", 50), tk("z", 50)], takesB: [tk("x", 55), tk("y", 54), tk("z", 45)], students, classes: [{ id: "c", name: "C" }] });
    assert.deepEqual(r.rows.map((x) => [x.name, x.change, x.arrow]), [["Z", -5, "DOWN"], ["Y", 4, "SAME"], ["X", 5, "UP"]]);
    assert.deepEqual([r.improved, r.same, r.dropped], [1, 1, 1]);
    assert.equal(oneLineUpDown({ improved: 3, dropped: 1, rows: [1] }).key, C.oneUp);
    assert.equal(oneLineUpDown({ improved: 1, dropped: 3, rows: [1] }).key, C.oneDown);
    assert.equal(oneLineUpDown({ improved: 0, dropped: 0, rows: [] }).key, C.oneNone);
  });
});

describe("1. Tests & Booklets", () => {
  test("one list of tests and booklets; default = the first and the latest", async () => {
    const r = await nafsCompareTests(repo, admin);
    assert.deepEqual(r.options.map((x) => [x.title, x.kind, x.taken]), [["Simulation A", "TEST", 6], ["NB-T1 · Model booklet", "BOOKLET", 5], ["Simulation C", "TEST", 1]]);
    assert.deepEqual([r.a?.id, r.b?.id], [testA, testC]);
    // A vs C: only S05 is shared (1 of 4 standards) → the warning
    assert.deepEqual(r.shared, ["MOE.S05"]); assert.equal(r.fewShared, true); assert.equal(r.basis, "SHARED");
    assert.deepEqual(r.rows.map((x) => [x.id, x.before, x.after, x.change, x.arrow]), [[st[0].id, 50, 100, 50, "UP"]]);
    assert.equal(r.onlyOne.length, 5);
    assert.deepEqual(pickPair(r.options, testC, testC).b?.id, bookletB, "the same assessment twice → the latest other one");
  });

  test("A vs booklet B: every number, arrow, shared and whole change", async () => {
    const r = await nafsCompareTests(repo, admin, { a: testA, b: bookletB });
    assert.deepEqual(r.shared, ["MOE.S04", "MOE.S05"]); assert.deepEqual(r.onlyA, ["MOE.S01"]); assert.deepEqual(r.onlyB, ["MOE.S07"]);
    assert.equal(r.fewShared, false, "2 of 4 standards shared = half: no warning");
    const row = (i: number) => r.rows.find((x) => x.id === st[i].id)!;
    // [before, after, change, arrow, whole before, whole after, whole change]
    const got = (i: number) => { const x = row(i); return [x.before, x.after, x.change, x.arrow, x.wholeBefore, x.wholeAfter, x.wholeChange]; };
    assert.deepEqual(got(0), [50, 88, 38, "UP", 67, 58, -9], "st1: up on the shared standards although the whole test fell");
    assert.deepEqual(got(1), [100, 50, -50, "DOWN", 67, 67, 0]);
    assert.deepEqual(got(2), [25, 75, 50, "UP", 50, 67, 17]);
    assert.deepEqual(got(3), [75, 38, -37, "DOWN", 67, 33, -34]);
    assert.deepEqual(got(4), [50, 50, 0, "SAME", 33, 67, 34]);
    assert.deepEqual(r.rows.map((x) => x.id), [st[1].id, st[3].id, st[4].id, st[0].id, st[2].id], "lowest change first");
    assert.deepEqual([r.avgBefore, r.avgAfter, r.improved, r.same, r.dropped], [60, 60, 2, 1, 2]);
    assert.deepEqual(r.onlyOne.map((x) => [x.id, x.took, x.pct]), [[st[5].id, "A", 67]]);
    assert.deepEqual(r.standards.map((x) => [x.short, x.before, x.after, x.change, x.arrow]), [["S04", 60, 75, 15, "UP"], ["S05", 60, 45, -15, "DOWN"]]);
    assert.equal(r.mostImproved?.short, "S04"); assert.equal(r.mostDropped?.short, "S05");
    // classes side by side (the admin's view)
    assert.deepEqual(r.classes.map((c) => [c.classId, c.compared, c.before, c.after, c.improved, c.same, c.dropped]), [[classA, 3, 58, 71, 2, 0, 1], [classB, 2, 63, 44, 0, 1, 1]]);
  });

  test("the summary sentences and the action plan", async () => {
    const r = await nafsCompareTests(repo, admin, { a: testA, b: bookletB });
    const n = (i: number) => st[i].name;
    const sum = compareTestsSummary(r, { classId: null, admin: true });
    assert.deepEqual(sum.lines.map(plainLine), [
      "2 went up, 1 stayed the same and 2 went down (of 5 compared).",
      `Went down: ${n(1)}, ${n(3)}.`,
      "Biggest drop: S05 (60% → 45%).",
      `Took only one of the two: ${n(5)}.`,
      "Next step: meet the 2 students who went down in a small group and follow up with them.",
    ]);
    assert.deepEqual(sum.actions.map((a) => a.kind), ["group", "parent", "reteach", "practice", "open"]);
    assert.deepEqual(sum.actions.map((a) => a.label), [CA.group, CA.parent, CA.reteach, CA.challenge, CA.makeup]);
    const [group, parent, reteach, challenge, makeup] = sum.actions;
    const cid = [classA, classB].sort()[0];
    assert.ok(group.href.startsWith("/teacher/intervention/groups?") && group.href.includes(cid) && group.href.includes(cid === classA ? st[1].id : st[3].id));
    assert.deepEqual(group.vars, { n: 1 });
    assert.equal(parent.href, `/teacher/students/${st[1].id}#comments`); assert.deepEqual(parent.vars, { name: n(1) });
    assert.ok(reteach.href.includes("target=MOE.S05") && reteach.href.includes(`class=${classA}`)); assert.deepEqual(reteach.vars, { std: "S05" });
    assert.ok(challenge.href.includes(`sid=${st[0].id}`) && challenge.href.includes(`sid=${st[2].id}`)); assert.deepEqual(challenge.vars, { n: 2 });
    assert.equal(makeup.href, `/teacher/nafs/tests/${bookletB}`); assert.deepEqual(makeup.vars, { n: 1 });
    assert.equal(plainLine(oneLineUpDown(r)), "As many students went up as down: 2 up, 2 down.");
    // the warning sentence when few standards are shared
    const ac = await nafsCompareTests(repo, admin, { a: testA, b: testC });
    assert.ok(compareTestsSummary(ac, { classId: null }).lines.some((l) => plainLine(l) === "Careful: the two share only 1 of 4 standards, so the change uses those 1 only."));
  });

  test("a teacher sees her class only; students and other classes are refused", async () => {
    const r = await nafsCompareTests(repo, teacherA, { a: testA, b: bookletB });
    assert.deepEqual(r.rows.map((x) => x.id).sort(), [st[0].id, st[1].id, st[2].id].sort());
    assert.equal(r.onlyOne.length, 0);
    await assert.rejects(nafsCompareTests(repo, teacherA, { classId: classB }), ForbiddenError);
    await assert.rejects(nafsCompareTests(repo, student), ForbiddenError);
    await assert.rejects(nafsComparePractice(repo, student), ForbiddenError);
  });
});

describe("2. Practice", () => {
  test("accuracy, hardest level, mastered, arrows — rapid guesses and Unreliable practices left out", async () => {
    const r = await nafsComparePractice(repo, admin, RANGE);
    assert.deepEqual([r.a, r.b], [{ from: "2026-03-01", to: "2026-03-14" }, { from: "2026-03-18", to: "2026-03-31" }]);
    const got = (i: number) => { const x = r.rows.find((y) => y.id === st[i].id)!; return [x.a.answers, x.a.pct, x.b.answers, x.b.pct, x.change, x.arrow, x.a.best, x.b.best, x.a.mastered, x.b.mastered]; };
    assert.deepEqual(got(0), [4, 50, 5, 80, 30, "UP", 1, 3, 0, 1], "st1 (the 16 Mar answer is in neither period)");
    assert.deepEqual(got(1), [4, 25, 4, 75, 50, "UP", 1, 3, 0, 0]);
    assert.deepEqual(got(2), [4, 100, 4, 50, -50, "DOWN", 3, 2, 0, 0]);
    assert.deepEqual(got(3), [3, 67, 3, 33, -34, "DOWN", 2, 1, 0, 0], "st4: the rapid guess is left out");
    assert.deepEqual(got(4), [4, 50, 4, 50, 0, "SAME", 2, 2, 0, 0]);
    assert.equal(r.rows.find((y) => y.id === st[3].id)!.b.guesses, 1);
    assert.deepEqual(r.tooFew.map((x) => [x.id, x.a.answers, x.b.answers, x.b.guesses]), [[st[5].id, 0, 0, 5]], "st6's Unreliable practice does not count");
    assert.deepEqual([r.guesses, r.unreliable], [3, 3]);
    assert.deepEqual([r.avgBefore, r.avgAfter, r.improved, r.same, r.dropped], [58, 58, 2, 1, 2]);
    assert.deepEqual(r.classes.map((c) => [c.compared, c.improved, c.same, c.dropped]), [[3, 2, 0, 1], [2, 0, 1, 1]]);
    const sum = comparePracticeSummary(r, { classId: null });
    const n = (i: number) => st[i].name;
    assert.deepEqual(sum.lines.map(plainLine), [
      "2 went up, 1 stayed the same and 2 went down (of 5 compared).",
      "Practice accuracy went from 58% to 58% (careful answers only).",
      `Went down: ${n(2)}, ${n(3)}.`,
      `Not enough practice to compare yet: ${n(5)}.`,
      "Next step: meet the 2 students who went down in a small group and follow up with them.",
    ]);
    assert.deepEqual(sum.actions.map((a) => a.kind), ["group", "parent", "practice", "practice"]);
    assert.deepEqual(sum.actions.map((a) => a.label), [CA.group, CA.parent, CA.challenge, CA.encourage]);
  });

  test("the default range comes from the data; 'last month vs this month'", async () => {
    const d = await nafsComparePractice(repo, admin, {});
    assert.deepEqual(d.range, RANGE);
    const m = await nafsComparePractice(repo, admin, { preset: "month" }, new Date("2026-04-10T10:00:00Z"));
    assert.deepEqual([m.a.from, m.a.to, m.b.from, m.b.to], ["2026-03-01", "2026-03-31", "2026-04-01", "2026-04-10"]);
    assert.equal(m.rows.length, 0, "nothing in April: nobody compared");
  });

  test("pure: an Unreliable run is left out entirely", () => {
    const students = [{ id: "x", name: "X", classId: "c", className: "C" }];
    const at = (d: number) => Date.UTC(2026, 2, d, 9);
    const answers = [2, 3, 4, 20, 21, 22].map((d, i) => ({ studentId: "x", runId: "r", target: "MOE.S04", difficulty: 2, correct: true, ms: i < 2 ? 500 : 20_000, at: at(d) }));
    const r = comparePractice({ answers, periods: practicePeriods(RANGE), students, classes: [{ id: "c", name: "C" }] });
    assert.deepEqual([r.rows.length, r.tooFew.length, r.guesses, r.unreliable], [0, 1, 2, 4]);
  });
});

describe("3. All", () => {
  test("one student in each case, counts, groups and the summary", async () => {
    const r = await nafsCompareAll(repo, admin, { a: testA, b: bookletB, ...RANGE });
    const caseOfSt = (i: number) => r.rows.find((x) => x.id === st[i].id)!.case;
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(caseOfSt), ["EXCELLENT", "NOT_USED", "LESS_PRACTICE", "SUPPORT", "SAME", "TOO_EARLY"]);
    assert.deepEqual(r.counts, { EXCELLENT: 1, NOT_USED: 1, LESS_PRACTICE: 1, SUPPORT: 1, SAME: 1, TOO_EARLY: 1 });
    assert.deepEqual(r.groups.map((g) => [g.key, g.rows.map((x) => x.id)]), [["EXCELLENT", [st[0].id]], ["NOT_USED", [st[1].id]], ["LESS_PRACTICE", [st[2].id]], ["SUPPORT", [st[3].id]], ["SAME", [st[4].id]], ["TOO_EARLY", [st[5].id]]]);
    const one = r.rows.find((x) => x.id === st[1].id)!;
    assert.deepEqual([one.tests, one.testChange, one.practice, one.practiceChange], ["DOWN", -50, "UP", 50]);
    assert.deepEqual(r.classes.map((c) => [c.classId, c.cases.EXCELLENT, c.cases.NOT_USED, c.cases.LESS_PRACTICE, c.cases.SUPPORT, c.cases.TOO_EARLY]), [[classA, 1, 1, 1, 0, 0], [classB, 0, 0, 0, 1, 1]]);
    const n = (i: number) => st[i].name;
    assert.equal(plainLine(oneLineAll(r)), "1 excellent, 1 need support, 4 in between or too early to judge.");
    const sum = compareAllSummary(r, { classId: null });
    assert.deepEqual(sum.lines.map(plainLine), [
      `Needs support: ${n(3)}.`,
      `Understands, but not used to the test yet: ${n(1)}.`,
      `Practising less: ${n(2)}.`,
      `Excellent: ${n(0)}.`,
      `Next step: meet ${n(3)} in a small group and contact their parents.`,
    ]);
    assert.deepEqual(sum.actions.map((a) => [a.kind, a.label]), [["group", CA.group], ["parent", CA.parent], ["practice", CA.practise], ["practice", CA.encourage], ["practice", CA.challenge]]);
    assert.ok(sum.actions[0].href.includes(classB) && sum.actions[0].href.includes(st[3].id));
    assert.ok(sum.actions[2].href.startsWith("/teacher/nafs/tests/new?") && sum.actions[2].href.includes("MOE.S04%2CMOE.S05"));
    assert.ok(sum.actions[3].href.includes(`sid=${st[2].id}`)); assert.ok(sum.actions[4].href.includes(`sid=${st[0].id}`));
  });
});

describe("files, page and words", () => {
  test("Excel and PDF (same access, audited)", async () => {
    const pdf = { render: async (html: string) => new TextEncoder().encode(html), close: async () => {} };
    const deps = { repo, pdf, fontDir: join(ROOT, "assets/fonts"), brandingDir: mkdtempSync(join(tmpdir(), "nc-")) };
    const x = await exportNafsCompare(deps, admin, { mode: "tests", a: testA, b: bookletB, format: "xlsx" });
    assert.equal(Buffer.from(x.bytes).subarray(0, 2).toString(), "PK");
    assert.match(x.filename, /^nafs_compare_tests_.*\.xlsx$/);
    const p = await exportNafsCompare(deps, admin, { mode: "all", a: testA, b: bookletB, ...RANGE, format: "pdf" });
    const html = new TextDecoder().decode(p.bytes);
    assert.match(html, /NAFS compare: tests and practice/); assert.match(html, /In one line/); assert.ok(html.includes(st[3].name));
    assert.ok((await repo.count("AuditLog", { action: "report.export", entityType: "NafsCompare" })) >= 2);
    await assert.rejects(exportNafsCompare(deps, student, { mode: "practice", format: "xlsx" }), ForbiddenError);
    const base = { branding: { schoolName: "Demo" } as never, generatedAt: new Date(), generatedBy: "T" };
    const doc = compareTestsDoc(await nafsCompareTests(repo, admin, { a: testA, b: bookletB }), "All", base, { classId: null, admin: true });
    const students = doc.sections.find((s) => s.type === "table" && s.id === "students");
    assert.ok(students && students.type === "table" && students.columns.length <= 6, "≤ 6 columns");
    assert.deepEqual(students.type === "table" && students.rows[0], { name: st[1].name, before: 100, after: 50, change: -50, arrow: "⬇️ Went down", whole: 0 });
    const all = compareAllDoc(await nafsCompareAll(repo, admin, { a: testA, b: bookletB, ...RANGE }), "All", base, { classId: null, admin: true });
    assert.ok(all.sections.some((s) => s.type === "kpis" && s.items.length === 4));
    assert.ok(read("src/app/api/nafs/compare/route.ts").includes("exportNafsCompare"));
  });

  test("the sub-tab under Reports, the toggle, and the report kit on the page", () => {
    assert.deepEqual(REPORT_VIEWS.map((x) => x.key), ["", "detail", "compare"]);
    assert.deepEqual(COMPARE_MODES.map((m) => m.label), ["Tests & Booklets", "Practice", "All"]);
    assert.equal(centerRedirect({ tab: "reports", sub: "compare", mode: "all" }), "/teacher/nafs?tab=reports&view=compare&mode=all");
    assert.equal(centerRedirect({ tab: "reports", view: "compare" }), null);
    assert.equal(compareHref({ mode: "practice", classId: "k1", preset: "month" }), "/teacher/nafs?tab=reports&view=compare&mode=practice&class=k1&preset=month");
    const page = read("src/components/nafs/compare-tab.tsx");
    for (const x of ["<ReportIntro", "<ReportSummary", "<InfoTip", "\"In one line\"", "<AtAGlance", "@page { size: A4", "print:hidden", "More details", "data-testid=\"few-shared\""]) assert.ok(page.includes(x), x);
    assert.ok(read("src/components/nafs/overall-tab.tsx").includes("<CompareView"));
  });

  test("every new word has its Arabic (no duplicates)", () => {
    const words = [
      ...Object.values(C), ...Object.values(CA), ...Object.values(TIPS), ...CASES.flatMap((c) => [c.name, c.action]), ...Object.values(ARROW_NAME),
      ...COMPARE_MODES.map((m) => m.label), ...REPORT_VIEWS.map((x) => x.label),
    ];
    const page = read("src/components/nafs/compare-tab.tsx");
    for (const m of page.matchAll(/\bt\("([^"]+)"/g)) words.push(m[1]);
    for (const m of page.matchAll(/(?:label|meaning|text)="([^"]+)"/g)) if (!/^\{/.test(m[1])) words.push(m[1]);
    const missing = [...new Set(words)].filter((w) => !hasAr(w));
    assert.deepEqual(missing, []);
    const all = UI_STRINGS as readonly string[];
    assert.equal(all.length, new Set(all).size, "no duplicate UI strings");
  });
});
