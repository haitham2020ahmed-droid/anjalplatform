/**
 * r70 reports A (owner: "simple, clear, CORRECT" — every number checked against fixtures with KNOWN answers):
 *  3. NAFS reports — tests, booklets (the same TestReport), adaptive (all practices / one practice), the overall Reports
 *     tab and the Excel / PDF exports: per student SCORE %, RIGHT, WRONG (right + wrong = the answers), FINISHED, TOP
 *     STRENGTH (≥ 80 % with ≥ 2 answers), TOP WEAKNESS (< 60 % with ≥ 2 answers), "—" + the reason; per class the
 *     average of the students (each once), how many finished, the strongest / weakest standard. ONE rule
 *     (src/server/nafs/strengths.ts) used everywhere; the 88 % student with no strength is fixed.
 *  4. Student Skills grid: MAP plan = the union of every MAP source; ☆ everywhere before the star migration → the grid
 *     counts the raw practice (same rule as the migration) and the migration is queued; no weekly-goal column;
 *     whole-class tiles; each student once.
 * Fictional demo school, in-memory database.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherRoster } from "../src/server/teacher/assign";
import { ensureNafsFramework } from "../src/server/nafs/framework";
import { nafsBankChanged, saveNafsQuestion } from "../src/server/nafs/bank";
import { nafsClasses, saveNafsTest } from "../src/server/nafs/tests";
import { nafsAcrossDoc, nafsAcrossReport, nafsReportDoc, nafsTestReport } from "../src/server/nafs/reports";
import { buildAdaptiveReport } from "../src/server/nafs/adaptive-report";
import { practiceReportOf } from "../src/server/nafs/practice";
import { dashboardDoc, nafsDashboard, nafsStudentDashboard, WEAK_BELOW } from "../src/server/nafs/dashboard";
import { strengthsOf, STRONG_FROM } from "../src/server/nafs/suggested-plan";
import { averageOf, classLine, MIN_ANSWERS, roundPct, scoreLine, STRENGTH_FROM, strengthsWeaknesses, WEAKNESS_BELOW, WHY_TEXT } from "../src/server/nafs/strengths";
import { skillsGrid } from "../src/server/skills/skills-grid";
import { countAnswers, ensureStarsMigration, fallbackView, starsMigrated } from "../src/server/skills/grid-fallback";
import { migrateSchool } from "../src/server/skills/status-extras";
import { skillKeyIndex, STAR_MIN_ANSWERS } from "../src/server/skills/status";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank, simulatePractice } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const BASE = { branding: { name: "Demo", nameAr: null, logo: null }, generatedAt: new Date(), generatedBy: "t" } as never;
type Rows = { id: string; columns: { key: string }[]; rows: Record<string, unknown>[] };
const table = (doc: { sections: unknown[] }, id: string) => (doc.sections as Rows[]).find((x) => x.id === id)!;

describe("3. the ONE strength / weakness rule (strengths.ts)", () => {
  test("cut-offs: strength ≥ 80 with ≥ 2 answers, weakness < 60 with ≥ 2 answers; everyone uses them", () => {
    assert.deepEqual([STRENGTH_FROM, WEAKNESS_BELOW, MIN_ANSWERS], [80, 60, 2]);
    assert.equal(STRONG_FROM, STRENGTH_FROM, "suggested plan"); assert.equal(WEAK_BELOW, WEAKNESS_BELOW, "dashboard");
    const sw = strengthsWeaknesses({ A: { pct: 80, n: 2 }, B: { pct: 79, n: 9 }, C: { pct: 60, n: 5 }, D: { pct: 59, n: 2 }, E: { pct: 100, n: 1 }, F: { pct: 0, n: 1 } });
    assert.deepEqual([sw.strengths, sw.weaknesses, sw.top, sw.weak], [["A"], ["D"], "A", "D"], "80 is a strength, 79 is not; 59 is weak, 60 is not; one answer never counts");
    assert.deepEqual(strengthsOf({ A: { pct: 80, n: 2 }, D: { pct: 59, n: 2 } }), { strong: ["A"], weak: ["D"] }, "the overall tab's helper delegates");
  });
  test("the 88 % student: a strength is shown (it was '—' before)", () => {
    const sw = strengthsWeaknesses({ "MOE.S01": { pct: roundPct(7, 8), n: 8 } });
    assert.equal(roundPct(7, 8), 88);
    assert.deepEqual([sw.top, sw.topWhy, sw.weak, sw.weakWhy], ["MOE.S01", null, null, "NONE_LOW"]);
  });
  test("'—' only with a reason", () => {
    assert.deepEqual([strengthsWeaknesses({}).topWhy, strengthsWeaknesses({ A: { pct: 100, n: 1 } }).topWhy, strengthsWeaknesses({ A: { pct: 70, n: 3 } }).topWhy, strengthsWeaknesses({ A: { pct: 70, n: 3 } }).weakWhy], ["NO_ANSWERS", "TOO_FEW", "NONE_HIGH", "NONE_LOW"]);
    for (const x of Object.values(WHY_TEXT)) assert.ok((UI_STRINGS as readonly string[]).includes(x) && (ar as Record<string, string>)[x], x);
  });
  test("score / right / wrong, the average (each student once), the class line", () => {
    assert.deepEqual(scoreLine(9, 12), { pct: 75, right: 9, wrong: 3, answers: 12 });
    assert.deepEqual(scoreLine(1, 2, 1.5), { pct: 75, right: 1, wrong: 1, answers: 2 }, "a half-marked written answer: ½ in the score, wrong in the counts");
    assert.equal(averageOf([100, 75]), 88, "87.5 → 88 (halves up)"); assert.equal(averageOf([null, 50]), 50); assert.equal(averageOf([]), null);
    const c = classLine([{ pct: 100, finished: true }, { pct: 75, finished: true }, { pct: null, finished: false }], { "MOE.S01": { pct: 100, n: 8 }, "MOE.S04": { pct: 88, n: 8 }, "MOE.S05": { pct: 75, n: 8 }, "MOE.S07": { pct: 0, n: 1 } }, 5);
    assert.deepEqual([c.average, c.finished, c.of, c.students, c.strongest, c.weakest], [88, 2, 5, 2, "MOE.S01", "MOE.S05"], "S07 has one answer: never the weakest");
    const one = classLine([{ pct: 40, finished: true }], { "MOE.S02": { pct: 40, n: 5 } });
    assert.deepEqual([one.strongest, one.weakest, one.strongestWhy], [null, "MOE.S02", "NONE_HIGH"], "one weak standard is the weakest, not the strongest");
  });
});

describe("3. NAFS reports with known answers", () => {
  let repo: SqliteRepo; let g6: Actor; let klassId = ""; let s1 = "", s2 = "", s3 = ""; let roster = 0; let testId = "";
  const Q: Record<string, string[]> = { S01: [], S04: [], S05: [] };
  const AT = new Date("2026-03-01T09:00:00Z");
  before(async () => {
    ({ repo } = await demoDatabase());
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const admin = await as("demo.admin");
    const teachers = await Promise.all((await repo.findMany("User", { role: "TEACHER" })).map((u) => resolveActor(repo, u)));
    const grades = await Promise.all(teachers.map(async (a) => (await teacherRoster(repo, a)).map((c) => c.grade)));
    let i = grades.findIndex((g) => g.includes(6));
    if (i < 0) {
      i = 0;
      const g = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 6 }))[0];
      const k = (await repo.findMany("Class", { gradeId: g.id, deletedAt: null }))[0];
      await repo.create("ClassTeacher", { classId: k.id, teacherId: (await repo.findUnique("Teacher", { userId: teachers[i].userId }))!.id });
    }
    g6 = teachers[i];
    const klass = (await nafsClasses(repo, g6))[0];
    klassId = klass.id; roster = klass.students.length;
    [s1, s2, s3] = klass.students.map((x) => x.id);
    await ensureNafsFramework(repo);
    const code = { S01: "NAFS.V.SYNANT", S04: "NAFS.RC.MAIN", S05: "NAFS.RC.DETAIL" } as const;
    for (const std of ["S01", "S04", "S05"] as const) for (let k = 0; k < 4; k++) Q[std].push((await saveNafsQuestion(repo, g6, { nafsCode: code[std], standard: `MOE.${std}`, difficulty: (k % 3) + 1, stem: `r70 ${std} question ${k + 1}?`, options: [`a ${std}${k}`, `b ${std}${k}`, `c ${std}${k}`, `d ${std}${k}`], correct: 1 })).id);
    nafsBankChanged(repo, admin.schoolId!);
    testId = await saveNafsTest(repo, g6, { title: "r70 Simulation", mode: "MANUAL", questionIds: [...Q.S01, ...Q.S04, ...Q.S05], timeLimitMin: 30 });
    const R = (n: number, of = 4) => Array.from({ length: of }, (_x, k) => (k < n ? 1 : 2)); // 1 = the key, 2 = wrong
    // s1: 12/12 · s2: S01 4/4, S04 3/4, S05 2/4 = 9/12 (one blank among the wrong) · s3: started online, not handed in
    await repo.create("NafsResult", { testId, classId: klassId, studentId: s1, source: "TYPED", answers: [...R(4), ...R(4), ...R(4)], correct: 12, points: 12, maxPoints: 12, submittedAt: AT, updatedAt: AT });
    await repo.create("NafsResult", { testId, classId: klassId, studentId: s2, source: "TYPED", answers: [...R(4), ...R(3), 1, 1, 2, null], correct: 9, points: 9, maxPoints: 12, submittedAt: AT, updatedAt: AT });
    await repo.create("NafsResult", { testId, classId: klassId, studentId: s3, source: "ONLINE", answers: Array(12).fill(null), correct: 0, points: 0, maxPoints: 12, startedAt: new Date(), updatedAt: AT });
  });

  test("one test (and every Ministry booklet: the same report): per student and the class line", async () => {
    const r = await nafsTestReport(repo, g6, testId, klassId, AT);
    const a = r.students.find((x) => x.id === s1)!, b = r.students.find((x) => x.id === s2)!;
    assert.deepEqual([a.pct, a.right, a.wrong, a.finished, a.strength, a.weakness, a.weaknessWhy], [100, 12, 0, true, "MOE.S01", null, "NONE_LOW"]);
    assert.deepEqual([b.pct, b.right, b.wrong, b.finished, b.strength, b.weakness], [75, 9, 3, true, "MOE.S01", "MOE.S05"]);
    for (const x of r.students) assert.equal(x.right + x.wrong, 12, "right + wrong = the answers");
    assert.equal(r.students.length, 2, "s3 did not hand in: not scored");
    assert.deepEqual(r.notTaken.find((x) => x.id === s3), { id: s3, name: r.notTaken.find((x) => x.id === s3)!.name, className: r.notTaken[0].className, started: true });
    assert.ok(r.notTaken.filter((x) => x.id !== s3).every((x) => !x.started));
    assert.deepEqual([r.cls.average, r.cls.finished, r.cls.of, r.cls.strongest, r.cls.weakest], [88, 2, roster, "MOE.S01", "MOE.S05"], "(100 + 75) / 2 = 87.5 → 88; S01 8/8, S04 7/8, S05 6/8");
    assert.equal(r.avgPct, 88);
    assert.deepEqual(r.summary.standards.map((x) => [x.short, x.pct, x.n]), [["S01", 100, 8], ["S04", 88, 8], ["S05", 75, 8]]);
    // the export: the same numbers
    const doc = nafsReportDoc(r, BASE);
    const st = table(doc, "students");
    assert.deepEqual(st.columns.slice(2, 8).map((c) => c.key), ["pct", "right", "wrong", "finished", "strength", "weakness"]);
    const row = st.rows.find((x) => x.pct === 75)!;
    assert.deepEqual([row.right, row.wrong, row.finished, row.strength, row.weakness], [9, 3, "Yes", "S01", "S05"]);
    const k = (doc.sections as { type: string; items?: { label: string; value: unknown }[] }[]).find((x) => x.type === "kpis")!.items!;
    assert.deepEqual(["Finished", "Class average", "Strongest standard", "Weakest standard"].map((l) => k.find((x) => x.label === l)!.value), [`2 / ${roster}`, 88, "S01", "S05"]);
    assert.equal(table(doc, "missing").rows.find((x) => x.state === "No (started)")!.name, r.notTaken.find((x) => x.id === s3)!.name);
  });

  test("all tests together: the same counts", async () => {
    const r = await nafsAcrossReport(repo, g6, klassId);
    const b = r.students.find((x) => x.id === s2)!;
    assert.deepEqual([b.pct, b.right, b.wrong, b.tests, b.strength, b.weakness], [75, 9, 3, 1, "MOE.S01", "MOE.S05"]);
    assert.deepEqual([r.cls.average, r.cls.finished, r.cls.strongest, r.cls.weakest], [88, 2, "MOE.S01", "MOE.S05"]);
    const row = table(nafsAcrossDoc(r, BASE), "students").rows.find((x) => x.pct === 75)!;
    assert.deepEqual([row.right, row.wrong, row.strength, row.weakness], [9, 3, "S01", "S05"]);
  });

  test("the overall Reports tab (tests + practice): per student, the class line, the export, the student page", async () => {
    const d = await nafsDashboard(repo, g6, { classId: klassId });
    const b = d.heat.students.find((x) => x.id === s2)!;
    assert.deepEqual([b.pct, b.n, b.right, b.wrong, b.tests, b.strength, b.weakness], [75, 12, 9, 3, 1, "MOE.S01", "MOE.S05"]);
    assert.equal(d.heat.students.length, new Set(d.heat.students.map((x) => x.id)).size, "each student once");
    assert.deepEqual([d.cls.average, d.cls.finished, d.cls.of, d.cls.strongest, d.cls.weakest], [88, 2, roster, "MOE.S01", "MOE.S05"]);
    const row = table(dashboardDoc(d, BASE), "scores").rows.find((x) => x.pct === 75)!;
    assert.deepEqual([row.right, row.wrong, row.tests, row.strength, row.weakness], [9, 3, 1, "S01", "S05"]);
    const one = await nafsStudentDashboard(repo, g6, s2);
    assert.deepEqual([one.strengths, one.weaknesses], [["MOE.S01"], ["MOE.S05"]], "S04 at 75 % is neither (it was a 'strength' at ≥ 65 before)");
  });

  test("adaptive — all practices: the 88 % student shows a strength even with nothing mastered", () => {
    const P = [{ id: "p1", createdAt: "2026-01-01" }, { id: "p2", createdAt: "2026-02-01" }];
    const run = (practiceId: string, studentId: string, t: Record<string, [number, number]>, finished: boolean) => {
      const asked = Object.values(t).reduce((a, x) => a + x[0], 0), correct = Object.values(t).reduce((a, x) => a + x[1], 0);
      return { practiceId, studentId, classId: "k", asked, correct, seconds: 60, finishedAt: finished ? "2026-02-02" : null, state: { targets: Object.fromEntries(Object.entries(t).map(([c, [n, right]]) => [c, { n, right, mastered: false, reached: 2, ms: n * 1000, level: 2, last: [] }])) } };
    };
    const r = buildAdaptiveReport(P, [run("p1", "a", { "MOE.S01": [8, 7] }, true), run("p2", "a", { "MOE.S04": [4, 1] }, true), run("p1", "b", { "MOE.S01": [2, 1] }, false)], [{ id: "k", name: "6A", students: [{ id: "a", name: "Ali" }, { id: "b", name: "Badr" }, { id: "c", name: "Coby" }] }], null);
    const a = r.students.find((x) => x.id === "a")!, b = r.students.find((x) => x.id === "b")!;
    assert.deepEqual([a.pct, a.answers, a.right, a.wrong, a.finishedAll, a.mastered, a.strengths, a.workOn], [67, 12, 8, 4, true, 0, ["MOE.S01"], ["MOE.S04"]], "S01 7/8 = 88 % → strength although not mastered");
    assert.deepEqual([b.pct, b.right, b.wrong, b.finishedAll, b.strengths, b.strengthWhy, b.workOn], [50, 1, 1, false, [], "NONE_HIGH", ["MOE.S01"]]);
    const c = r.classes[0];
    assert.deepEqual([c.average, c.finished, c.students, c.practised, c.right, c.wrong, c.pct, c.strongest, c.weakest], [59, 1, 3, 2, 9, 5, 64, "MOE.S01", "MOE.S04"], "(67 + 50) / 2 = 58.5 → 59; pooled S01 8/10 = 80, S04 1/4 = 25; 9/14 = 64");
    assert.deepEqual([r.cls.average, r.cls.finished, r.cls.of, r.summary.right, r.summary.wrong, r.summary.answers], [59, 1, 3, 9, 5, 14]);
  });

  test("adaptive — one practice: score, right, wrong, finished, strength / weakness, the class line", () => {
    const st = (n: number, right: number) => ({ n, right, mastered: false, reached: 2, ms: 0, level: 2, last: [] });
    const runs = [
      { studentId: "x", asked: 8, correct: 5, seconds: 90, finishedAt: "2026-02-02", state: { targets: { "MOE.S01": st(4, 4), "MOE.S04": st(4, 1) } } },
      { studentId: "y", asked: 2, correct: 1, seconds: 30, finishedAt: null, state: { targets: { "MOE.S01": st(2, 1) } } },
    ];
    const r = practiceReportOf({ id: "p", title: "P", className: "6A", maxQuestions: 10, minutes: null, dueAt: null }, ["MOE.S01", "MOE.S04"], [{ id: "x", name: "X" }, { id: "y", name: "Y" }, { id: "z", name: "Z" }], runs);
    const [x, y, z] = r.students;
    assert.deepEqual([x.pct, x.right, x.wrong, x.finished, x.strength, x.weakness], [63, 5, 3, true, "MOE.S01", "MOE.S04"], "5/8 = 62.5 → 63");
    assert.deepEqual([y.pct, y.right, y.wrong, y.finished, y.strength, y.strengthWhy, y.weakness], [50, 1, 1, false, null, "NONE_HIGH", "MOE.S01"]);
    assert.deepEqual([z.pct, z.right, z.wrong, z.finished, z.strengthWhy, z.status], [null, 0, 0, false, "NO_ANSWERS", "NOT_STARTED"]);
    assert.deepEqual([r.cls.average, r.cls.finished, r.cls.of, r.cls.strongest, r.cls.weakest], [57, 1, 3, "MOE.S01", "MOE.S04"], "(63 + 50) / 2 = 56.5 → 57; S01 5/6 = 83, S04 1/4 = 25");
  });

  test("the pages show the six columns and the class line (teacher-facing; no level words added for students)", () => {
    for (const f of ["src/components/nafs/reports-tab.tsx", "src/components/nafs/adaptive-tab.tsx", "src/components/nafs/practice-report.tsx", "src/components/nafs/overall-tab.tsx"]) {
      const src = read(f);
      assert.match(src, /<LineHeads /, f); assert.match(src, /<LineCells /, f); assert.match(src, /<ClassLineCards /, f);
    }
    assert.match(read("src/components/nafs/student-line.tsx"), /WHY_TEXT\[why\]/, "'—' carries its reason");
  });
});

describe("4. Student Skills grid", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = ""; let schoolId = ""; let ids: string[] = []; let g4 = new Map<string, string>();
  const now = new Date("2026-10-13T09:00:00Z");
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 4 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = teacher.schoolId!;
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId));
    const g = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    g4 = new Map((await repo.findMany("Skill", { curriculumId: cur.id })).map((k) => [s(k.code).replace(/^G4\./, ""), s(k.id)]));
  });

  test("(a) r74: the MAP filter = the skills of MAP ASSIGNMENTS (older rows: inferred); plans alone are not assignments", async () => {
    const ix = await skillKeyIndex(repo, schoolId);
    const key = (c: string) => ix.keyOf.get(g4.get(c)!)!;
    const tRow = await repo.findUnique("Teacher", { userId: teacher.userId });
    // student 1's plan: theme + inference · student 2's plan: inference + main idea (shared skill once)
    await repo.create("MapPlan", { schoolId, classId, studentId: ids[0], subject: "READING", term: "Fall 2026", status: "SENT", items: [{ group: "LIT", skillIds: [g4.get("theme"), g4.get("inference")] }], createdAt: now, updatedAt: now });
    await repo.create("MapPlan", { schoolId, classId, studentId: ids[1], subject: "READING", term: "Fall 2026", status: "DRAFT", items: [{ group: "INFO", skillIds: [g4.get("inference"), g4.get("main-idea") ?? g4.get("summarize")] }], createdAt: now, updatedAt: now });
    await repo.create("SkillPlan", { schoolId, classId, title: "MAP group plan", kind: "PLACES", gradeLevel: 4, program: "MAP", status: "SENT", doc: { v: 1, sections: [{ key: "a", skillId: g4.get("capitalization") }] }, createdAt: now });
    // older rows (before r74: no source) — the MAP one is inferred from its program
    const a1 = await repo.create("Assignment", { classId, createdById: tRow!.id, title: "Commas", target: "SKILL", skillId: g4.get("commas") ?? g4.get("punctuation"), program: "MAP", track: "MAP", createdAt: now });
    const a2 = await repo.create("Assignment", { classId, createdById: tRow!.id, title: "Not MAP", target: "SKILL", skillId: g4.get("poetry-elements") ?? g4.get("character"), createdAt: now });
    for (const a of [a1, a2]) for (const id of ids) await repo.create("AssignmentStudent", { assignmentId: a.id, studentId: id, status: "NOT_STARTED", progress: 0 });
    const commas = key(g4.has("commas") ? "commas" : "punctuation");
    const practise = async (sid: string, code: string) => repo.create("SkillStatus", { studentId: sid, skillKey: key(code), level: 1, status: "IN_PROGRESS", skillId: g4.get(code), answered: 6, correct: 3, score: 40, startedAt: now, createdAt: now, updatedAt: now, history: [] });
    await practise(ids[0], "theme"); await practise(ids[1], "inference"); await practise(ids[2], g4.has("main-idea") ? "main-idea" : "summarize"); await practise(ids[3], "capitalization");
    await practise(ids[0], g4.has("poetry-elements") ? "poetry-elements" : "character");
    const g = await skillsGrid(repo, teacher, { classId, plan: "MAP" }, now);
    assert.deepEqual(g.skills.map((k) => [k.key, k.sources]), [[commas, ["MAP"]]], "the MAP assignment only — assigned but not practised still listed (☆); plans and practice alone are not");
    assert.ok(!g.skills.some((k) => k.key === key(g4.has("poetry-elements") ? "poetry-elements" : "character")), "non-MAP work is not a MAP skill");
    for (const k of g.skills) assert.equal(k.total, ids.length, "of the whole class");
    const all = await skillsGrid(repo, teacher, { classId }, now);
    assert.deepEqual(new Set(all.skills.map((k) => k.key)), new Set([commas, key(g4.has("poetry-elements") ? "poetry-elements" : "character")]), "All sources: the two assigned skills; the practised-only ones never");
  });

  test("(b) before the star migration: the grid counts the raw practice (same rule), then the migration rows", async () => {
    // class practice (12 answers per student on theme): no SkillStatus row, no migration report — as on the live server
    const users = (await repo.findMany("User", { id: { in: (await repo.findMany("Student", { id: { in: ids } }, { select: ["userId"] })).map((x) => s(x.userId)) } })).map((u) => s(u.username));
    await simulatePractice(repo, users, [{ date: "2026-09-02", skill: "G4.theme" }], 12);
    await repo.deleteMany("SkillStatus", {});
    await assignSkill(repo, teacher, { classId, skillId: g4.get("theme")!, source: "CURRICULUM" }, now); // r74: assigned skills only
    assert.equal(await starsMigrated(repo, schoolId), false);
    const ix = await skillKeyIndex(repo, schoolId);
    const theme = ix.keyOf.get(g4.get("theme")!)!;
    const before = await skillsGrid(repo, teacher, { classId, plan: "ALL" }, now);
    assert.equal(before.migrated, false);
    const col = before.skills.find((k) => k.key === theme)!;
    assert.ok(col, "the assigned, practised skill is listed although no star row exists");
    assert.deepEqual([col.started, col.mastered], [ids.length, 0], "◐ for every student who practised (12 < 30 answers)");
    for (const id of ids) {
      // the known count: the student's careful answers (no rapid guess, reliable session) on theme
      const careful = (await repo.findMany("QuestionAttempt", { studentId: id, skillId: g4.get("theme"), rapidGuess: false })).filter((a) => !a.unreliable && !s(a.source)).length;
      assert.ok(careful > 0 && careful <= 12);
      assert.deepEqual([before.cells[id][theme].status, before.cells[id][theme].answered], ["IN_PROGRESS", careful]);
    }
    assert.ok((before.estimated ?? 0) >= ids.length);
    // the migration writes the same statuses; the grid then reads the rows (no fallback)
    await migrateSchool(repo, schoolId, now);
    const after = await skillsGrid(repo, teacher, { classId, plan: "ALL" }, now);
    assert.equal(after.migrated, true); assert.equal(after.estimated, 0);
    for (const id of ids) assert.deepEqual([after.cells[id][theme].status, after.cells[id][theme].answered], [before.cells[id][theme].status, before.cells[id][theme].answered], "fallback = migration");
  });

  test("(b) the rule in the fallback: ⭐ only with 30 counted answers and the engine's mastery; guesses and tests never count", () => {
    const keyOf = new Map([["k1", "fam:theme"]]);
    const at = (n: number, extra: Record<string, unknown> = {}) => Array.from({ length: n }, (_x, i) => ({ studentId: "s", sessionId: "ok", skillId: "k1", isCorrect: i % 4 !== 0, source: "", unreliable: false, ...extra }));
    const rows = [...at(STAR_MIN_ANSWERS), ...at(5, { sessionId: "test" }), ...at(4, { source: "LEARN" }), ...at(3, { unreliable: true })];
    const c = countAnswers(rows, new Set(["ok"]), keyOf).get("s|fam:theme")!;
    assert.deepEqual([c.answered, c.correct], [30, 22], "only the 30 practice answers (22 right) count");
    assert.equal(fallbackView("fam:theme", c, { score: 90, mastered: true }).status, "MASTERED");
    assert.equal(fallbackView("fam:theme", c, { score: 90, mastered: false }).status, "IN_PROGRESS");
    assert.equal(fallbackView("fam:theme", { ...c, answered: 29 }, { score: 90, mastered: true }).status, "IN_PROGRESS");
    assert.equal(fallbackView("fam:theme", undefined, undefined).status, "NOT_STARTED");
  });

  test("(b) the migration is queued once per school; never when it already ran", async () => {
    const { repo: r2 } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 });
    const sc = s((await r2.findMany("School", {}))[0].id);
    await migrateSchool(r2, sc, now);
    assert.equal(await ensureStarsMigration(r2, sc), false, "already migrated: nothing queued");
    assert.equal(await ensureStarsMigration(r2, sc), false, "asked once per process");
    assert.match(read("src/app/teacher/reports/skills-grid/page.tsx"), /ensureStarsMigration\(repo, actor\.schoolId\)/);
  });

  test("(c) no weekly-goal column in the grid; whole-class tiles; each student once", async () => {
    const src = read("src/app/teacher/reports/skills-grid/page.tsx");
    const grid = src.slice(src.indexOf("function GridView"), src.indexOf("function SkillView"));
    assert.doesNotMatch(grid, /Weekly goal|<select name="target"/);
    assert.match(grid, /sum\(\(k\) => k\.mastered\)/, "the tiles add the whole-class column counts");
    // each student once: the class size, on every column
    const g = await skillsGrid(repo, teacher, { classId }, now);
    assert.equal(g.totalStudents, ids.length);
    for (const k of g.skills) assert.equal(k.total, ids.length);
  });
});
