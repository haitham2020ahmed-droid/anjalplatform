/**
 * 🇸🇦 NAFS center reorganisation (owner r69; fictional demo school only, in-memory database):
 *  1. the tabs in the owner's order — Adaptive · NAFS test · Ministry booklets · Reports · Suggested plan (then Question
 *     bank, Marking) — each tool with its OWN report inside, one place each; every old URL redirects
 *  2. Adaptive → Report: per class, student, standard / skill — level reached, accuracy, mastery, time, trend
 *  3. Ministry booklets: list, OPEN one (passage + every question + the answers), assign ONE or SEVERAL (online / print,
 *     each booklet one school test, never duplicated), a Report per booklet
 *  4. Reports: the overall picture (the Dashboard merged in) — strengths / weaknesses per student
 *  5. Suggested plan: the weakest standards per class / group / student, one-click assign
 *  + light: bounded reads, the swept caches, nothing on the student's path
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { teacherRoster } from "../src/server/teacher/assign";
import { ensureNafsFramework } from "../src/server/nafs/framework";
import { nafsBankChanged, saveNafsQuestion } from "../src/server/nafs/bank";
import { nafsClasses, saveNafsTest } from "../src/server/nafs/tests";
import { createNafsPractice, newRunState } from "../src/server/nafs/practice";
import { loadNafsBooklets, useBookletDir } from "../src/server/nafs/booklets";
import { CENTER_TABS, centerHref, centerRedirect, OLD_TABS, SUB_TABS, subOf } from "../src/server/nafs/center";
import { buildAdaptiveReport, nafsAdaptiveReport, WORK_ON_BELOW } from "../src/server/nafs/adaptive-report";
import { assignBooklets, bookletList, bookletReportTest, ensureBookletTests, MAX_ASSIGN_BOOKLETS, openBookletView, wholeBookletOf } from "../src/server/nafs/booklet-center";
import { nafsDashboard, nafsDashboardCached, WEAK_BELOW } from "../src/server/nafs/dashboard";
import { strengthsOf, suggestedPlan } from "../src/server/nafs/suggested-plan";
import { nafsTestReport } from "../src/server/nafs/reports";
import { cacheSizes } from "../src/server/cache/idle";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && Boolean((ar as Record<string, string>)[x]);
const walk = (d: string): string[] => readdirSync(join(ROOT, d)).flatMap((f) => { const p = `${d}/${f}`; return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : []; });
const s = (v: unknown) => String(v ?? "");

let repo: SqliteRepo;
let g6: Actor, admin: Actor, other: Actor;
let klassId = "", s1 = "", s2 = "", s3 = "";
const Q: Record<string, string[]> = { S01: [], S04: [], S05: [] };
let testA = "", practiceId = "";
const JAN10 = new Date("2026-01-10T09:00:00Z"), JAN20 = new Date("2026-01-20T09:00:00Z");
const ans = (right: boolean[], wrong = 0) => right.map((r) => (r ? 1 : wrong));
const R4 = [true, true, true, true], W4 = [false, false, false, false];
let bookletDir = "";

before(async () => {
  ({ repo } = await demoDatabase());
  const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  admin = await as("demo.admin");
  const teachers = await Promise.all((await repo.findMany("User", { role: "TEACHER" })).map((u) => resolveActor(repo, u)));
  const grades = await Promise.all(teachers.map(async (a) => (await teacherRoster(repo, a)).map((c) => c.grade)));
  other = teachers[grades.findIndex((g) => g.length > 0 && !g.includes(6))];
  let i = grades.findIndex((g) => g.includes(6));
  if (i < 0) {
    i = teachers.findIndex((a) => a !== other);
    const g = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 6 }))[0];
    const k = (await repo.findMany("Class", { gradeId: g.id, deletedAt: null }))[0];
    await repo.create("ClassTeacher", { classId: k.id, teacherId: (await repo.findUnique("Teacher", { userId: teachers[i].userId }))!.id });
  }
  g6 = teachers[i];
  const klass = (await nafsClasses(repo, g6))[0];
  klassId = klass.id;
  [s1, s2, s3] = klass.students.map((x) => x.id);
  await ensureNafsFramework(repo);
  const code = { S01: "NAFS.V.SYNANT", S04: "NAFS.RC.MAIN", S05: "NAFS.RC.DETAIL" } as const;
  for (const std of ["S01", "S04", "S05"] as const) for (let k = 0; k < 4; k++) {
    Q[std].push((await saveNafsQuestion(repo, g6, { nafsCode: code[std], standard: `MOE.${std}`, difficulty: (k % 3) + 1, stem: `Reorg ${std} question ${k + 1}?`, options: [`one ${std}${k}`, `two ${std}${k}`, `three ${std}${k}`, `four ${std}${k}`], correct: 1 })).id);
  }
  nafsBankChanged(repo, admin.schoolId!);
  testA = await saveNafsTest(repo, g6, { title: "Simulation A", mode: "MANUAL", questionIds: [...Q.S01, ...Q.S04, ...Q.S05], timeLimitMin: 30 });
  const result = async (studentId: string, answers: number[]) => repo.create("NafsResult", { testId: testA, classId: klassId, studentId, source: "TYPED", answers, correct: answers.filter((a) => a === 1).length, points: 0, maxPoints: 12, submittedAt: JAN10, updatedAt: JAN10 });
  // s1 strong everywhere · s2 weak on S04 and S05 · s3 weak on S05
  await result(s1, ans([...R4, ...R4, ...R4]));
  await result(s2, ans([...R4, ...W4, ...W4]));
  await result(s3, ans([...R4, ...R4, ...W4], 3));
  // adaptive practice on S04 for s2: 4 answers, 2 right, reached Medium, not mastered
  practiceId = (await createNafsPractice(repo, g6, { title: "S04 practice", targets: ["MOE.S04"], classId: klassId, studentIds: [s2] })).id;
  await repo.create("NafsPracticeRun", { practiceId, studentId: s2, classId: klassId, state: { ...newRunState(["MOE.S04"]), targets: { "MOE.S04": { level: 2, n: 4, right: 2, last: [], mastered: false, reached: 2, ms: 60000 } } }, asked: 4, correct: 2, seconds: 120, startedAt: JAN20, updatedAt: JAN20, finishedAt: JAN20 });
  // the model booklets: two fixture booklets
  bookletDir = mkdtempSync(join(tmpdir(), "nafs-reorg-booklets-"));
  for (const f of ["NB-901.json", "NB-902.json"]) copyFileSync(join(ROOT, "tests", "fixtures", "nafs-booklets", f), join(bookletDir, f));
  useBookletDir(bookletDir);
  await loadNafsBooklets(repo, admin.schoolId!, admin.userId);
});
after(() => useBookletDir(null));

describe("1. the tabs, one place each, old URLs", () => {
  test("tabs in the owner's order with their sub-tabs; every label translated", () => {
    assert.deepEqual(CENTER_TABS.map((x) => x.label), ["Adaptive", "NAFS test", "Ministry booklets", "Reports", "Suggested plan", "Question bank", "Marking"]);
    assert.deepEqual(SUB_TABS.adaptive!.map((x) => x.label), ["Practice", "Report"]);
    assert.deepEqual(SUB_TABS.test!.map((x) => x.label), ["Create", "Report"]);
    assert.deepEqual(SUB_TABS.booklets!.map((x) => x.label), ["Booklets", "Report"]);
    for (const x of [...CENTER_TABS, ...Object.values(SUB_TABS).flat()]) assert.ok(hasAr(x!.label), x!.label);
    assert.equal(subOf("adaptive", "report"), "report"); assert.equal(subOf("adaptive", "zzz"), "practice"); assert.equal(subOf("reports", "x"), "");
    assert.equal(centerHref("booklets", { sub: "report", book: "NB-901", none: null }), "/teacher/nafs?tab=booklets&sub=report&book=NB-901");
  });

  test("every old link redirects to the one place (parameters kept); current links are not redirected", () => {
    const go = (sp: Record<string, string | string[]>) => { const r = centerRedirect(sp); return r ? new URL(r, "http://x") : null; };
    const home = go({ tab: "home" })!; assert.equal(home.searchParams.get("tab"), "reports");
    const dash = go({ tab: "dashboard", class: "k1", from: "2026-01-01" })!;
    assert.deepEqual([dash.searchParams.get("tab"), dash.searchParams.get("view"), dash.searchParams.get("class"), dash.searchParams.get("from")], ["reports", "detail", "k1", "2026-01-01"]);
    const pr = go({ tab: "practice", class: "k1", target: ["MOE.S01", "MOE.S04"] })!;
    assert.deepEqual([pr.searchParams.get("tab"), pr.searchParams.get("sub"), pr.searchParams.getAll("target")], ["adaptive", null, ["MOE.S01", "MOE.S04"]]);
    const op = go({ tab: "practice", open: "p1" })!; assert.deepEqual([op.searchParams.get("tab"), op.searchParams.get("sub"), op.searchParams.get("open")], ["adaptive", "report", "p1"]);
    assert.equal(go({ tab: "tests" })!.searchParams.get("tab"), "test");
    assert.equal(go({ tab: "create" })!.searchParams.get("tab"), "test");
    const sh = centerRedirect({ tab: "sheets", test: "t1" })!; assert.match(sh, /tab=marking/); assert.match(sh, /#sheets$/);
    for (const view of ["test", "across", "trend", "student"]) { const u = go({ tab: "reports", view, student: "x" })!; assert.deepEqual([u.searchParams.get("tab"), u.searchParams.get("sub"), u.searchParams.get("view")], ["test", "report", view], view); }
    const byTest = go({ tab: "reports", test: "t9", class: "k" })!; assert.deepEqual([byTest.searchParams.get("tab"), byTest.searchParams.get("sub"), byTest.searchParams.get("test")], ["test", "report", "t9"]);
    const ap = go({ tab: "reports", view: "practice", practice: "p7" })!; assert.deepEqual([ap.searchParams.get("tab"), ap.searchParams.get("sub"), ap.searchParams.get("open"), ap.searchParams.get("view")], ["adaptive", "report", "p7", null]);
    for (const tab of ["adaptive", "test", "booklets", "reports", "plan", "bank", "marking", "about", "skills"]) assert.equal(centerRedirect({ tab }), null, tab);
    assert.equal(centerRedirect({ tab: "reports", view: "detail" }), null);
    assert.equal(OLD_TABS.sheets, "marking");
    assert.match(read("src/app/teacher/nafs/page.tsx"), /centerRedirect\(sp\)/);
  });

  test("no capability twice: each tool's report lives inside it; no old link left in the code", () => {
    assert.match(read("src/components/nafs/adaptive-tab.tsx"), /<PracticeReportView /);
    assert.doesNotMatch(read("src/components/nafs/reports-tab.tsx"), /PracticeReportView|view === "practice"/, "adaptive results are not in the test report");
    assert.match(read("src/components/nafs/nafs-test-tab.tsx"), /<ReportsTab /);
    assert.match(read("src/components/nafs/booklets-tab.tsx"), /<TestReport /, "the booklet report reuses the test report (one copy of the code)");
    assert.match(read("src/components/nafs/overall-tab.tsx"), /<DashboardTab /, "the Dashboard is merged into Reports (Full detail)");
    assert.ok(!existsSync(join(ROOT, "src/components/nafs/home-tab.tsx")), "Home merged into Reports");
    for (const f of [...walk("src/components/nafs"), ...walk("src/app/teacher/nafs"), ...walk("src/server/nafs").filter((x) => !x.endsWith("center.ts")), "src/components/nav-items.ts", "src/components/teacher/report-catalog.ts"]) {
      assert.doesNotMatch(read(f), /\/teacher\/nafs\?tab=(?:home|dashboard|practice|tests|create|sheets)\b|tab=reports&(?:view=(?:test|across|trend|student|practice)|test=)/, `${f}: an old center link`);
    }
  });
});

describe("2. Adaptive → Report", () => {
  test("per standard / skill, per student, per class: level reached, accuracy, mastery, time, trend", async () => {
    const r = await nafsAdaptiveReport(repo, g6, klassId);
    assert.deepEqual([r.summary.practices, r.summary.students, r.summary.answers, r.summary.pct, r.summary.mastered, r.summary.targetRuns, r.summary.seconds], [1, 1, 4, 50, 0, 1, 120]);
    const t = r.targets.find((x) => x.code === "MOE.S04")!;
    assert.deepEqual([t.students, t.answers, t.pct, t.mastered, t.reached[2], t.secPerAnswer], [1, 4, 50, 0, 1, 15]);
    const st = r.students.find((x) => x.id === s2)!;
    assert.deepEqual([st.practices, st.answers, st.pct, st.mastered, st.tried, st.best, st.trend], [1, 4, 50, 0, 1, 2, [50]]);
    assert.deepEqual(st.workOn, ["MOE.S04"], `under ${WORK_ON_BELOW}%`);
    const c = r.classes.find((x) => x.id === klassId)!;
    assert.deepEqual([c.practised, c.answers, c.pct, c.masteryPct], [1, 4, 50, 0]);
    await assert.rejects(nafsAdaptiveReport(repo, other, null), ForbiddenError);
  });
  test("pure: mastery, the best level per student, trend in practice order", () => {
    const P = [{ id: "p1", createdAt: "2026-01-01" }, { id: "p2", createdAt: "2026-02-01" }];
    const run = (practiceId: string, studentId: string, n: number, right: number, mastered: boolean, reached: number) => ({ practiceId, studentId, classId: "k", asked: n, correct: right, seconds: 60, state: { targets: { "MOE.S01": { n, right, mastered, reached, ms: n * 10_000, level: 2, last: [] } } }, finishedAt: "x" });
    const r = buildAdaptiveReport(P, [run("p2", "a", 5, 5, true, 3), run("p1", "a", 5, 2, false, 1), run("p1", "b", 4, 1, false, 0)], [{ id: "k", name: "6A", students: [{ id: "a", name: "Ali" }, { id: "b", name: "Badr" }] }], null);
    const a = r.students.find((x) => x.id === "a")!;
    assert.deepEqual(a.trend, [40, 100], "date order of the practices");
    assert.deepEqual([a.mastered, a.best, a.strengths], [1, 3, ["MOE.S01"]]);
    const t = r.targets[0];
    assert.deepEqual([t.students, t.mastered, t.reached[3], t.reached[0]], [2, 1, 1, 1]);
    assert.equal(r.classes[0].practised, 2);
  });
});

describe("3. Ministry booklets", () => {
  test("the list (filters), open one: passage + every question + the answers", async () => {
    const all = await bookletList(repo, g6);
    assert.deepEqual(all.map((b) => b.code), ["NB-901", "NB-902"]);
    assert.ok(all.every((b) => b.tests.length === 0 && b.results === 0));
    assert.deepEqual((await bookletList(repo, g6, { q: "nb-902" })).map((b) => b.code), ["NB-902"]);
    const o = await openBookletView(repo, g6, "NB-901");
    assert.ok(o.passage && o.passage.paragraphs.length >= 2);
    assert.equal(o.questions.length, 35);
    assert.deepEqual(o.questions.map((q) => q.n), Array.from({ length: 35 }, (_x, i) => i + 1));
    assert.ok(o.questions.every((q) => (q.kind === "WRITTEN" ? q.model.length > 0 && q.rubric.length === 3 : q.correct >= 0 && q.options.length === 4)), "every answer shown");
    assert.ok(o.questions.every((q) => q.standard));
    await assert.rejects(openBookletView(repo, g6, "NB-777"), ValidationError);
    await assert.rejects(bookletList(repo, other), ForbiddenError);
  });

  test("assign ONE or SEVERAL: each booklet is one school test (whole, its order), never made twice; online to the class", async () => {
    const made = await ensureBookletTests(repo, g6, ["NB-901", "NB-902"]);
    assert.deepEqual(made.map((m) => [m.code, m.created]), [["NB-901", true], ["NB-902", true]]);
    const again = await ensureBookletTests(repo, g6, ["NB-902", "NB-901"]);
    assert.deepEqual(again.map((m) => m.created), [false, false], "the same test is reused");
    assert.equal(again.find((m) => m.code === "NB-901")!.testId, made[0].testId);
    const t = await repo.findUnique("NafsTest", { id: made[0].testId });
    assert.equal(wholeBookletOf(t!), "NB-901");
    assert.equal(Number(t!.timeLimitMin), 45);
    const r = await assignBooklets(repo, g6, { codes: ["NB-901", "NB-902"], classId: klassId, studentIds: [s1, s2], minutes: 50 });
    assert.equal(r.booklets, 2); assert.equal(r.students, 2);
    for (const id of r.tests) { const g = await repo.findUnique("NafsTestClass", { testId: id, classId: klassId }); assert.equal(Number(g!.timeLimitMin), 50); }
    await assert.rejects(ensureBookletTests(repo, g6, []), ValidationError);
    await assert.rejects(ensureBookletTests(repo, g6, Array.from({ length: MAX_ASSIGN_BOOKLETS + 1 }, (_x, i) => `NB-${900 + i}`)), ValidationError);
    const list = await bookletList(repo, g6);
    assert.ok(list.every((b) => b.tests.length === 1));
  });

  test("a Report per booklet: the booklet's test with the most results, read by the NAFS test report", async () => {
    const id = (await ensureBookletTests(repo, g6, ["NB-902"]))[0].testId;
    const ids = (await repo.findUnique("NafsTest", { id }))!.questionIds as unknown;
    const n = (typeof ids === "string" ? JSON.parse(ids) : ids).length;
    await repo.create("NafsResult", { testId: id, classId: klassId, studentId: s1, source: "TYPED", answers: Array.from({ length: n }, () => 0), correct: 0, points: 0, maxPoints: n, submittedAt: JAN20, updatedAt: JAN20 });
    const rt = await bookletReportTest(repo, g6, "NB-902");
    assert.equal(rt.testId, id);
    const rep = await nafsTestReport(repo, g6, id, klassId);
    assert.equal(rep.taken, 1);
    assert.ok(rep.summary.standards.length >= 1, "per standard");
    assert.equal(rep.items.length, n, "per question");
    assert.equal((await bookletList(repo, g6)).find((b) => b.code === "NB-902")!.results, 1);
    assert.deepEqual(await bookletReportTest(repo, g6, "NB-777"), { testId: null, tests: 0 });
  });
});

describe("4 + 5. Reports and the Suggested plan", () => {
  test("Reports: strengths and weaknesses per student from the same cells", () => {
    const sw = strengthsOf({ "MOE.S01": { pct: 100, n: 4 }, "MOE.S04": { pct: 0, n: 4 }, "MOE.S05": { pct: 50, n: 4 }, "MOE.S07": { pct: 0, n: 1 } });
    assert.deepEqual(sw, { strong: ["MOE.S01"], weak: ["MOE.S04", "MOE.S05"] }, "an item alone is not enough");
  });

  test("the plan: the weakest standards per class, per group and per student — each with a one-click assign", async () => {
    const d = await nafsDashboard(repo, g6, { classId: klassId });
    const plan = suggestedPlan(d);
    const c = plan.classes.find((x) => x.classId === klassId)!;
    assert.ok(c.withData >= 3);
    assert.ok(c.classItem && c.classItem.codes.includes("MOE.S05"), "S05: the class's weakest");
    assert.ok(c.classItem!.evidence.every((e) => (e.pct ?? 100) < WEAK_BELOW));
    assert.ok(c.strengths.some((x) => x.code === "MOE.S01"));
    const mine = c.perStudent.find((x) => x.students[0].id === s2)!;
    assert.deepEqual(mine.codes.slice().sort(), ["MOE.S04", "MOE.S05"]);
    assert.ok(!c.perStudent.some((x) => x.students[0].id === s1), "a strong student needs nothing");
    const grp = c.groups.find((g) => g.codes[0] === "MOE.S05");
    assert.ok(grp && grp.students.map((x) => x.id).sort().join() === [s2, s3].sort().join(), "s2 and s3 share S05");
    const u = new URL(mine.practiceHref, "http://x");
    assert.deepEqual([u.searchParams.get("tab"), u.searchParams.getAll("sid")], ["adaptive", [s2]]);
    // one click = adaptive practice on exactly those standards for exactly those students
    const p = await createNafsPractice(repo, g6, { title: mine.title, targets: mine.codes, classId: mine.classId, studentIds: mine.students.map((x) => x.id) });
    assert.equal(p.students, 1);
    assert.match(read("src/components/nafs/plan-tab.tsx"), /action=\{createPracticeAction\}[\s\S]*name="target"[\s\S]*name="sid"/);
    assert.match(read("src/app/teacher/nafs/actions.ts"), /backTo\.startsWith\("\/teacher\/nafs\?"\)/, "the one click comes back to the plan");
  });

  test("light: the dashboard is shared by Reports and Plan (a swept cache), reads are bounded", async () => {
    const a = nafsDashboardCached(repo, g6, { classId: klassId });
    assert.equal(nafsDashboardCached(repo, g6, { classId: klassId }), a, "the second tab reuses it");
    await a;
    assert.ok(cacheSizes().some((c) => c.name === "nafs.dashboard"));
    for (const f of ["src/components/nafs/overall-tab.tsx", "src/components/nafs/plan-tab.tsx", "src/components/nafs/dashboard-tab.tsx"]) assert.doesNotMatch(read(f), /nafsDashboard\(/, f);
    for (const f of ["src/server/nafs/adaptive-report.ts", "src/server/nafs/booklet-center.ts"]) {
      const src = read(f);
      for (const m of src.matchAll(/repo\.findMany\("(\w+)"[^;]*?\)/g)) assert.match(m[0], /take:|id: \{ in:|questionId|testId: \{ in:|practiceId: \{ in:|classId: \{ in:/, `${f}: ${m[1]} read is bounded`);
    }
    // nothing on the student's path
    for (const f of ["src/server/nafs/student.ts", "src/server/nafs/practice.ts"]) assert.doesNotMatch(read(f), /adaptive-report|booklet-center|suggested-plan/, f);
    for (const x of ["Adaptive", "NAFS test", "Ministry booklets", "Suggested plan", "Full detail", "Assign adaptive practice now", "Open the booklet", "Get ready to print", "Per standard and skill", "Level reached"]) assert.ok(hasAr(x), x);
    assert.equal(s(null), "");
  });
});
