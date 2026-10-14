/**
 * 🇸🇦 NAFS DASHBOARD (owner request; fictional demo school only, in-memory database):
 *  1. overview (students, tests taken, practice sessions, average score, change from the previous test, marking)
 *  2. skills analysis maths (tests vs practice, items, difficulty, trend, most-missed + most-chosen wrong option)
 *  3. attempt-to-attempt deltas (class and student), tests vs practice ("practised in between")
 *  4. groups (cut-offs in one place), movement, groups by weakest standard, prefilled one-click actions
 *  5. drill-down; 6. Excel / PDF; 7. the admin's school view + class comparison
 *  + students never see group words; a bounded number of reads (no N+1)
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Repo } from "../src/server/seeding/repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { teacherRoster } from "../src/server/teacher/assign";
import { ensureNafsFramework } from "../src/server/nafs/framework";
import { nafsBankChanged, saveNafsQuestion } from "../src/server/nafs/bank";
import { nafsClasses, saveNafsTest } from "../src/server/nafs/tests";
import { createNafsPractice, newRunState } from "../src/server/nafs/practice";
import { CENTER_TABS } from "../src/server/nafs/center";
import { cleanRange, dashboardDoc, exportNafsDashboard, groupOf, movementOf, NAFS_GROUPS, nafsDashboard, nafsStudentDashboard, practiceHref, testHref, WEAK_BELOW } from "../src/server/nafs/dashboard";
import { searchablePagesFor } from "../src/components/nav-items";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && Boolean((ar as Record<string, string>)[x]);
const s = (v: unknown) => String(v ?? "");
const GROUP_WORDS = ["Exceeding", "Meeting", "Approaching", "Needs support"];

let repo: SqliteRepo;
let g6: Actor, admin: Actor, other: Actor, student: Actor;
let klassId = "", class2 = "";
let s1 = "", s2 = "", s3 = "", t1 = "";
const Q: Record<string, string[]> = { S01: [], S04: [], S05: [] };
let testA = "", testB = "", practiceId = "";
const JAN10 = new Date("2026-01-10T09:00:00Z"), JAN20 = new Date("2026-01-20T09:00:00Z"), FEB10 = new Date("2026-02-10T09:00:00Z");

/** answers for the 12 questions (S01 ×4, S04 ×4, S05 ×4): right = 1 (the key), wrong = the given letter */
const ans = (right: boolean[], wrong = 0) => right.map((r) => (r ? 1 : wrong));
const R4 = [true, true, true, true], W4 = [false, false, false, false], H4 = [true, true, false, false];
async function result(testId: string, classId: string, studentId: string, answers: number[], at: Date) {
  await repo.create("NafsResult", { testId, classId, studentId, source: "TYPED", answers, correct: answers.filter((a) => a === 1).length, points: 0, maxPoints: 12, submittedAt: at, updatedAt: at });
}

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
  const second = (await nafsClasses(repo, admin)).find((c) => c.id !== klassId)!;
  class2 = second.id; t1 = second.students[0].id;
  student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: s1 }))!.userId }))!);

  await ensureNafsFramework(repo);
  const code = { S01: "NAFS.V.SYNANT", S04: "NAFS.RC.MAIN", S05: "NAFS.RC.DETAIL" } as const;
  for (const std of ["S01", "S04", "S05"] as const) for (let k = 0; k < 4; k++) {
    Q[std].push((await saveNafsQuestion(repo, g6, { nafsCode: code[std], standard: `MOE.${std}`, difficulty: (k % 3) + 1, stem: `Dashboard ${std} question ${k + 1}?`, options: [`one ${std}${k}`, `two ${std}${k}`, `three ${std}${k}`, `four ${std}${k}`], correct: 1 })).id);
  }
  nafsBankChanged(repo, admin.schoolId!);
  const ids = [...Q.S01, ...Q.S04, ...Q.S05];
  testA = await saveNafsTest(repo, g6, { title: "Simulation A", mode: "MANUAL", questionIds: ids, timeLimitMin: 30 });
  testB = await saveNafsTest(repo, g6, { title: "Simulation B", mode: "MANUAL", questionIds: ids, timeLimitMin: 30 });
  // Test A (10 Jan): s1 12/12 · s2 4/12 (S01 only) · s3 6/12 (S01 + half of S04; wrong = D) · t1 (class 2) 12/12
  await result(testA, klassId, s1, ans([...R4, ...R4, ...R4]), JAN10);
  await result(testA, klassId, s2, ans([...R4, ...W4, ...W4]), JAN10);
  await result(testA, klassId, s3, ans([...R4, ...H4, ...W4], 3), JAN10);
  await result(testA, class2, t1, ans([...R4, ...R4, ...R4]), JAN10);
  // adaptive practice on S04 for s2 (20 Jan): 2 right, 2 wrong (chose C)
  practiceId = (await createNafsPractice(repo, g6, { title: "S04 practice", targets: ["MOE.S04"], classId: klassId, studentIds: [s2] })).id;
  const run = await repo.create("NafsPracticeRun", { practiceId, studentId: s2, classId: klassId, state: { ...newRunState(["MOE.S04"]), targets: { "MOE.S04": { level: 2, n: 4, right: 2, last: [], mastered: false, reached: 2, ms: 60000 } } }, asked: 4, correct: 2, seconds: 120, startedAt: JAN20, updatedAt: JAN20, finishedAt: JAN20 });
  for (let k = 0; k < 4; k++) await repo.create("NafsPracticeAnswer", { runId: run.id, practiceId, studentId: s2, questionId: Q.S04[k], target: "MOE.S04", difficulty: 2, choice: k < 2 ? 1 : 2, correct: k < 2, ms: 1000, at: new Date(JAN20.getTime() + k * 60_000) });
  // Test B (10 Feb): s1 8/12 (S01 all wrong) · s2 10/12 (S05 half)
  await result(testB, klassId, s1, ans([...W4, ...R4, ...R4]), FEB10);
  await result(testB, klassId, s2, ans([...R4, ...R4, ...H4]), FEB10);
});

describe("tabs, cut-offs and the range", () => {
  test("Dashboard is the second tab; group cut-offs live in one place", () => {
    assert.deepEqual(CENTER_TABS.map((x) => x.label), ["Home", "Dashboard", "Practice", "Tests", "Question bank", "Marking", "Reports"]); // owner r67: Practice · Tests
    assert.deepEqual(NAFS_GROUPS.map((g) => [g.name, g.min]), [["Exceeding", 85], ["Meeting", 65], ["Approaching", 45], ["Needs support", 0]]);
    assert.equal(WEAK_BELOW, 65);
    assert.equal(groupOf(85), "EXCEEDING"); assert.equal(groupOf(84), "MEETING"); assert.equal(groupOf(65), "MEETING");
    assert.equal(groupOf(64), "APPROACHING"); assert.equal(groupOf(45), "APPROACHING"); assert.equal(groupOf(44), "SUPPORT"); assert.equal(groupOf(null), null);
    assert.equal(movementOf("SUPPORT", "MEETING"), 1); assert.equal(movementOf("EXCEEDING", "MEETING"), -1); assert.equal(movementOf(null, "MEETING"), 0);
    assert.deepEqual(cleanRange("2026-02-01", "2026-01-01"), { from: "2026-01-01", to: "2026-02-01" });
    assert.deepEqual(cleanRange("x", "2026-13-45"), { from: null, to: null });
  });
});

describe("1–3. overview, skills analysis, attempts", () => {
  test("overview numbers", async () => {
    const d = await nafsDashboard(repo, g6, { classId: klassId });
    const o = d.overview;
    assert.equal(o.students, 3);
    assert.equal(o.tested, 3);
    assert.equal(o.testsTaken, 5);
    assert.equal(o.tests, 2);
    assert.equal(o.practiceSessions, 1);
    assert.equal(o.practiceAnswers, 4);
    assert.equal(o.avgScore, 67, "mean of 100, 33, 50, 67, 83");
    assert.equal(o.practicePct, 50);
    assert.equal(o.trend?.delta, 14, "test B 75% − test A 61%");
    assert.equal(o.waiting, 0);
  });

  test("standards: tests vs practice, items, difficulty, trend, most missed", async () => {
    const d = await nafsDashboard(repo, g6, { classId: klassId });
    const row = (c: string) => d.standards.find((x) => x.key === c)!;
    assert.deepEqual(d.standards.map((x) => x.key), ["MOE.S01", "MOE.S04", "MOE.S05"]);
    assert.equal(row("MOE.S01").testPct, 80); assert.equal(row("MOE.S01").testN, 20); assert.equal(row("MOE.S01").practicePct, null);
    assert.equal(row("MOE.S04").testPct, 70); assert.equal(row("MOE.S04").practicePct, 50); assert.equal(row("MOE.S04").practiceN, 4); assert.equal(row("MOE.S04").items, 24);
    assert.equal(row("MOE.S05").testPct, 50);
    for (const x of d.standards) assert.equal(Object.values(x.byDifficulty).reduce((a, b) => a + b.n, 0), x.items, "every item has a difficulty");
    // trend attempt by attempt: S04 = test A 50 → practice 50 → test B 100
    assert.deepEqual(row("MOE.S04").trend.map((t) => [t.kind, t.pct]), [["TEST", 50], ["PRACTICE", 50], ["TEST", 100]]);
    assert.deepEqual(row("MOE.S01").trend.map((t) => t.pct), [100, 50]);
    // the most-missed question overall: an S05 item at 40% whose most-chosen wrong option is A (twice)
    const m = d.missed[0];
    assert.ok(Q.S05.slice(2).includes(m.id), "S05 question 3 or 4");
    assert.equal(m.pct, 40); assert.equal(m.answered, 5); assert.equal(m.topWrong, 0); assert.equal(m.topWrongCount, 2);
    assert.match(m.stem, /Dashboard S05 question/);
    assert.equal(row("MOE.S05").missed?.pct, 40);
    // NAFS skills and PIRLS processes exist with the same maths
    assert.equal(d.skills.find((x) => x.key === "NAFS.RC.DETAIL")?.testPct, 50);
    assert.ok(d.processes.length > 0);
    // heat map students × standards (tests and practice together)
    const h2 = d.heat.students.find((x) => x.id === s2)!;
    assert.deepEqual(h2.cells["MOE.S04"], { pct: 50, n: 12 });
    assert.deepEqual(h2.cells["MOE.S05"], { pct: 25, n: 8 });
  });

  test("attempt-to-attempt deltas (class) and tests vs practice", async () => {
    const d = await nafsDashboard(repo, g6, { classId: klassId });
    assert.deepEqual(d.attempts.map((a) => [a.kind, a.title, a.pct]), [["TEST", "Simulation A", 61], ["PRACTICE", "S04 practice", 50], ["TEST", "Simulation B", 75]]);
    const b = d.attempts[2];
    assert.equal(b.dPrev, 25); assert.equal(b.dFirst, 14);
    assert.equal(b.stdPrev["MOE.S04"], 50, "S04: 100 now − 50 in the practice before");
    assert.equal(b.stdFirst["MOE.S04"], 50);
    assert.equal(b.stdPrev["MOE.S01"], -50);
    assert.equal(d.attempts[0].dPrev, null);
    // practice between two tests on S04: s2 went 0 → 100 (practised); s1 stayed 100 (not practised)
    const e = d.practiceEffect.find((x) => x.code === "MOE.S04")!;
    assert.deepEqual(e.practised, { delta: 100, pairs: 1 });
    assert.deepEqual(e.notPractised, { delta: 0, pairs: 1 });
    // per student: first, previous, latest
    const st2 = d.students.find((x) => x.id === s2)!;
    assert.deepEqual([st2.attempts, st2.first, st2.prev, st2.latest, st2.dPrev, st2.dFirst], [3, 33, 50, 83, 33, 50]);
  });

  test("the date range filters tests and practice", async () => {
    const d = await nafsDashboard(repo, g6, { classId: klassId, from: "2026-01-15", to: "2026-02-28" });
    assert.deepEqual(d.attempts.map((a) => a.title), ["S04 practice", "Simulation B"]);
    assert.equal(d.overview.testsTaken, 2);
    assert.equal(d.overview.trend, null);
    const none = await nafsDashboard(repo, g6, { classId: klassId, from: "2025-01-01", to: "2025-01-02" });
    assert.equal(none.attempts.length, 0);
  });
});

describe("4. groups, movement, actions", () => {
  test("groups from the latest test, weak standards and movement", async () => {
    const d = await nafsDashboard(repo, g6, { classId: klassId });
    const g = (k: string) => d.groups.find((x) => x.key === k)!;
    assert.deepEqual(g("MEETING").classes[0].students.map((x) => [x.id, x.pct, x.prevPct]), [[s1, 67, 100], [s2, 83, 33]]);
    assert.deepEqual(g("APPROACHING").classes[0].students.map((x) => x.id), [s3]);
    assert.equal(g("EXCEEDING").count, 0); assert.equal(g("SUPPORT").count, 0);
    assert.deepEqual(g("MEETING").classes[0].students.find((x) => x.id === s2)!.weak, ["MOE.S05", "MOE.S04"]);
    assert.deepEqual(g("MEETING").classes[0].weak, ["MOE.S01", "MOE.S04", "MOE.S05"]);
    assert.deepEqual(d.movement.up.map((x) => [x.id, x.from, x.to]), [[s2, "SUPPORT", "MEETING"]]);
    assert.deepEqual(d.movement.down.map((x) => [x.id, x.from, x.to]), [[s1, "EXCEEDING", "MEETING"]]);
    assert.equal(g("MEETING").classes[0].students.find((x) => x.id === s2)!.move, 1);
    // by weakest standard: S05 (s2, s3) first, then S01 (s1)
    assert.deepEqual(d.weakest.map((w) => [w.code, w.count]), [["MOE.S05", 2], ["MOE.S01", 1]]);
  });

  test("one-click actions open the tools prefilled", async () => {
    const d = await nafsDashboard(repo, g6, { classId: klassId });
    const c = d.groups.find((x) => x.key === "MEETING")!.classes[0];
    const p = new URL(c.practiceHref, "http://x");
    assert.equal(p.pathname, "/teacher/nafs"); assert.equal(p.searchParams.get("tab"), "practice"); assert.equal(p.searchParams.get("class"), klassId);
    assert.deepEqual(p.searchParams.getAll("target"), ["MOE.S01", "MOE.S04", "MOE.S05"]);
    assert.deepEqual(p.searchParams.getAll("sid").sort(), [s1, s2].sort());
    assert.equal(p.hash, "#give");
    const t = new URL(c.testHref, "http://x");
    assert.equal(t.pathname, "/teacher/nafs/tests/new"); assert.equal(t.searchParams.get("start"), "CHOOSE"); assert.equal(t.searchParams.get("class"), klassId);
    assert.equal(t.searchParams.get("codes"), "MOE.S01,MOE.S04,MOE.S05");
    assert.equal(practiceHref("k", ["MOE.S02"]), "/teacher/nafs?tab=practice&class=k&target=MOE.S02#give");
    assert.equal(testHref("k", ["MOE.S02"]), "/teacher/nafs/tests/new?start=CHOOSE&class=k&codes=MOE.S02"); // owner r67: the one builder
    // the tools read the prefill
    const tab = read("src/components/nafs/practice-tab.tsx");
    assert.match(tab, /defaultValue=\{\[\.\.\.preTargets\]\}/); assert.match(tab, /defaultValue=\{preClass \?\? classes\[0\]\.id\}/); assert.match(tab, /defaultValue=\{preSids\}/);
    assert.match(read("src/app/teacher/nafs/tests/new/page.tsx"), /initialCodes=\{initialCodes\}/);
    assert.match(read("src/components/nafs/nafs-builder.tsx"), /props\.initialCodes/);
    for (const k of ["Assign adaptive practice on these standards", "Make a test on these standards", "Dashboard", "Student groups", "Movement since the previous test", "Groups by weakest standard", ...GROUP_WORDS]) assert.ok(hasAr(k), k);
  });
});

describe("5. drill-down", () => {
  test("one student: attempts, standard trends, strengths, practice, recommendations", async () => {
    const d = await nafsStudentDashboard(repo, g6, s2);
    assert.deepEqual(d.attempts.map((a) => [a.kind, a.pct, a.dPrev, a.dFirst]), [["TEST", 33, null, null], ["PRACTICE", 50, 17, 17], ["TEST", 83, 33, 50]]);
    const s04 = d.standards.find((x) => x.code === "MOE.S04")!;
    assert.deepEqual(s04.trend.map((t) => t.pct), [0, 50, 100]);
    assert.equal(s04.change, 100); assert.equal(s04.testPct, 50); assert.equal(s04.practicePct, 50);
    assert.deepEqual(d.strengths, ["MOE.S01"]);
    assert.deepEqual(d.weaknesses, ["MOE.S05", "MOE.S04"]);
    assert.equal(d.practice.length, 1);
    assert.deepEqual(d.practice[0].targets.map((x) => [x.code, x.n, x.pct, x.mastered]), [["MOE.S04", 4, 50, false]]);
    assert.deepEqual(d.recommended.map((x) => [x.code, x.why]), [["MOE.S05", "WEAK"], ["MOE.S04", "WEAK"], ["MOE.S02", "NOT_YET"]]);
    assert.equal(d.group, "MEETING"); assert.equal(d.prevGroup, "SUPPORT");
    assert.match(d.practiceHref, /sid=/); assert.match(d.testHref, /codes=MOE\.S05%2CMOE\.S04%2CMOE\.S02/);
    // a student of a class the teacher does not teach is refused
    if (!(await nafsClasses(repo, g6)).some((c) => c.id === class2)) await assert.rejects(nafsStudentDashboard(repo, g6, t1), ForbiddenError);
    assert.equal((await nafsStudentDashboard(repo, admin, t1)).group, "EXCEEDING");
  });
});

describe("7. the admin's school view", () => {
  test("every Grade 6 class, class against class on each standard, class → students", async () => {
    const d = await nafsDashboard(repo, admin);
    assert.equal(d.scope.admin, true);
    assert.ok(d.school.classes.length >= 2);
    const c1 = d.school.classes.find((c) => c.id === klassId)!, c2 = d.school.classes.find((c) => c.id === class2)!;
    assert.equal(c2.testPct, 100); assert.equal(c2.standards["MOE.S04"].test, 100);
    assert.equal(c1.standards["MOE.S04"].test, 70); assert.equal(c1.standards["MOE.S04"].practice, 50);
    assert.equal(c1.members.find((x) => x.id === s2)!.group, "MEETING");
    assert.equal(c2.members.find((x) => x.id === t1)!.group, "EXCEEDING");
    assert.equal(c2.tested, 1);
    // the admin's groups span the classes
    assert.ok(d.groups.find((g) => g.key === "EXCEEDING")!.classes.some((c) => c.classId === class2));
    // a class filter is the same as the teacher's view
    const one = await nafsDashboard(repo, admin, { classId: klassId });
    assert.equal(one.overview.avgScore, 67);
    // admins find the dashboard by name
    assert.ok(searchablePagesFor("SCHOOL_ADMIN", { nafs: true }).some((x) => x.href === "/teacher/nafs?tab=dashboard"));
    assert.ok(searchablePagesFor("TEACHER", { nafs: true }).some((x) => x.href === "/teacher/nafs?tab=dashboard"));
    assert.ok(!searchablePagesFor("TEACHER", { nafs: false }).some((x) => x.href === "/teacher/nafs?tab=dashboard"));
  });

  test("access: only Grade 6 teachers and admins; a teacher only their classes", async () => {
    await assert.rejects(nafsDashboard(repo, other), ForbiddenError);
    await assert.rejects(nafsDashboard(repo, student), ForbiddenError);
    await assert.rejects(nafsStudentDashboard(repo, other, s1), ForbiddenError);
    await assert.rejects(nafsDashboard(repo, g6, { classId: "not-a-class" }), ForbiddenError);
  });
});

describe("6. downloads", () => {
  test("Excel and PDF of the dashboard (same access, audited)", async () => {
    const pdf = { render: async (html: string) => new TextEncoder().encode(html), close: async () => {} };
    const deps = { repo, pdf, fontDir: join(ROOT, "assets/fonts"), brandingDir: mkdtempSync(join(tmpdir(), "nd-")) };
    const x = await exportNafsDashboard(deps, g6, { classId: klassId, format: "xlsx" });
    assert.equal(Buffer.from(x.bytes).subarray(0, 2).toString(), "PK");
    assert.match(x.filename, /^nafs_dashboard_.*\.xlsx$/);
    const p = await exportNafsDashboard(deps, g6, { classId: klassId, format: "pdf", from: "2026-01-01" });
    const html = new TextDecoder().decode(p.bytes);
    assert.match(html, /NAFS dashboard/); assert.match(html, /Simulation B/); assert.match(html, /Groups by weakest standard/);
    assert.ok((await repo.count("AuditLog", { action: "report.export", entityType: "NafsDashboard" })) >= 2);
    await assert.rejects(exportNafsDashboard(deps, other, { format: "xlsx" }), ForbiddenError);
    const doc = dashboardDoc(await nafsDashboard(repo, g6, { classId: klassId }), { branding: { schoolName: "Demo" } as never, generatedAt: new Date(), generatedBy: "T" });
    for (const id of ["standards", "skills", "processes", "missed", "heat", "attempts", "effect", "students", "groups", "weakest", "compare"]) assert.ok(doc.sections.some((sec) => sec.type === "table" && sec.id === id), id);
    assert.ok(read("src/app/api/nafs/dashboard/route.ts").includes("exportNafsDashboard"));
  });
});

describe("students never see group words; fast", () => {
  test("no student page or student NAFS code shows the group words or reads the dashboard", () => {
    const walk = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap((f) => { const p = `${dir}/${f}`; return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(f) ? [p] : []; });
    for (const f of [...walk("src/app/student/nafs"), "src/server/nafs/student.ts", "src/components/nafs/practice-player.tsx"]) {
      const src = read(f);
      assert.ok(!/nafs\/dashboard/.test(src), `${f} must not read the dashboard`);
      for (const w of GROUP_WORDS) assert.ok(!new RegExp(`["'>]\\s*${w}\\b`).test(src), `${f} shows "${w}"`);
    }
    for (const f of walk("src/app/student")) assert.ok(!/server\/nafs\/dashboard/.test(read(f)), f);
  });

  test("a bounded number of reads, the same with more students' results (no N+1)", async () => {
    const counting = () => {
      let n = 0;
      const p = new Proxy(repo as unknown as Repo, { get(target, prop, recv) { const v = Reflect.get(target, prop, recv); return typeof v === "function" && ["findMany", "findUnique", "count", "findFirst"].includes(String(prop)) ? (...a: unknown[]) => { n++; return (v as (...x: unknown[]) => unknown).apply(target, a); } : typeof v === "function" ? v.bind(target) : v; } });
      return { repo: p, calls: () => n };
    };
    const a = counting();
    await nafsDashboard(a.repo, admin);
    const before0 = a.calls();
    // more results in class 2 (every student) → the same number of reads
    const c2 = (await nafsClasses(repo, admin)).find((c) => c.id === class2)!;
    for (const st of c2.students.slice(1)) await result(testA, class2, st.id, ans([...R4, ...H4, ...W4]), JAN10);
    const b = counting();
    await nafsDashboard(b.repo, admin);
    assert.equal(b.calls(), before0, "reads do not grow with students");
    assert.ok(before0 <= 40, `at most 40 reads (was ${before0})`);
  });
});
