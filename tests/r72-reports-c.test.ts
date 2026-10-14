/**
 * 🧾 r72 reports C (owner: "simple, clear, CORRECT" — "the owner is tired of errors"):
 *  1. the printable MAP pages (/map-report/*): a summary + action plan from the page's own data — Student Profile,
 *     Family Report (parents: plain sentences, no level words, no teacher button), the class's family reports,
 *     Personal Study Plan (staff / student / parent), every study plan of a class, Class Profile;
 *  4. a correctness audit of the non-NAFS reports on a fixture with KNOWN answers: answers = right + wrong, accuracy
 *     recomputed, every student counted once, class averages = the mean of the students — class progress, students
 *     (progress), the department week, School Analytics, MAP growth and the end-of-term totals, Learn results, early
 *     warning; plus the wrong numbers found (and fixed): growth "% met" counted students without an expected growth
 *     as "not met", "+-2" growth, a student in two classes counted twice in the school totals, "5 of 3 finished",
 *     the coordinator's file listing 70 % skills as "strong", unhandled alerts matched by class NAME.
 * Fictional demo school, in-memory database.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { classProgress } from "../src/server/insights/progress";
import { departmentSummary } from "../src/server/insights/department";
import { schoolDashboard } from "../src/server/analytics/school-dashboard";
import { classMonth, peerCompare } from "../src/server/insights/class-compare";
import { growthReport } from "../src/server/teacher/extras";
import { learnResults } from "../src/server/learn/teacher";
import { earlyWarning } from "../src/server/insights/early-warning";
import type { Period } from "../src/analytics/periods";
import { A, S, type Summary } from "../src/lib/report-summary";
import * as RS from "../src/lib/report-summaries";
import { R } from "../src/lib/report-summaries";
import { GLOSSARY, COLUMN_KEYS } from "../src/lib/report-columns";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const L = (x: Summary) => x.lines.map((l) => (l.vars ? [l.key, l.vars] : [l.key]));
const B = (x: Summary) => x.actions.map((a) => [a.kind, a.href]);
const has = (k: string) => (UI_STRINGS as readonly string[]).includes(k) && !!(ar as Record<string, string>)[k];

// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("1. the printable MAP pages: summary + action plan from known numbers", () => {
  const area = (name: string, rit: number, relative: "STRENGTH" | "FOCUS" | null = null) => ({ name, rit, relative });

  test("Student Profile: scores, growth, strengths, focus (lowest first), next step; staff buttons", () => {
    const d = {
      student: { id: "s1", name: "Ali Hassan", classId: "c1" },
      subjects: [
        { subject: "READING", name: "Reading", latest: { rit: 205, percentile: 55, met: false }, areas: [area("Literary Text", 214, "STRENGTH"), area("Vocabulary", 196, "FOCUS"), area("Informational Text", 205)] },
        { subject: "LANGUAGE", name: "Language Usage", latest: { rit: 210, percentile: 60, met: true }, areas: [area("Mechanics", 199, "FOCUS"), area("Grammar", 212)] },
      ],
    };
    const x = RS.mapProfileSummary(d);
    assert.deepEqual(L(x), [
      [R.mrScores, { scores: "Reading 205, Language Usage 210" }],
      [R.mrNotMet, { subjects: "Reading" }],
      [R.mrStrong, { areas: "Literary Text" }],
      [R.mrFocus, { areas: "Vocabulary, Mechanics" }],
      [R.mrNextFocus, { area: "Vocabulary" }],
    ], "Vocabulary (196) is lower than Mechanics (199): first");
    assert.deepEqual(B(x), [["plan", "/map-report/study-plan/s1?subject=READING"], ["practice", "/teacher/assignments?classId=c1"], ["lesson", "/teacher/learn"], ["parent", "/teacher/students/s1#comments"]]);
    const none = RS.mapProfileSummary({ student: { id: "s2", name: "Sara", classId: "c1" }, subjects: [] });
    assert.deepEqual(L(none), [[R.mrNone, { name: "Sara" }], [R.mrNextNone]]);
    assert.deepEqual(B(none), [["open", "/teacher/map-entry?classId=c1"], ["parent", "/teacher/students/s2#comments"]]);
    const flat = RS.mapProfileSummary({ student: { id: "s3", name: "Omar", classId: null }, subjects: [{ subject: "READING", name: "Reading", latest: { rit: 200, percentile: null, met: true }, areas: [area("Vocabulary", 199)] }] });
    assert.deepEqual(L(flat), [[R.mrScores, { scores: "Reading 200" }], [R.mrMet, { subjects: "Reading" }], [R.mrFocus0], [R.mrNextKeep]]);
  });

  const fam = (over: Partial<RS.FamilyIn> = {}): RS.FamilyIn => ({
    student: { id: "s1", first: "Ali" },
    subjects: [
      { subject: "READING", name: "Reading", latest: { rit: 205 }, growth: { from: "Fall 2025", rit: -2 }, areas: [{ name: "Literary Text", rit: 214 }, { name: "Vocabulary", rit: 196 }] },
      { subject: "LANGUAGE", name: "Language Usage", latest: { rit: 210 }, growth: null, areas: [{ name: "Grammar", rit: 212 }] },
    ],
    practice: { answers: 120, accuracy: 74, days: 9 },
    ...over,
  });

  test("Family Report (parents): plain sentences, no level word, the signed change, the only button = the student's own plan", () => {
    const x = RS.mapFamilySummary(fam());
    assert.deepEqual(L(x), [
      [R.fmScores, { first: "Ali", scores: "Reading 205, Language Usage 210" }],
      [R.fmStrong, { area: "Literary Text" }],
      [R.fmWork, { area: "Vocabulary" }],
      [R.fmPractice, { first: "Ali", days: 9, answers: 120, acc: 74 }],
      [R.fmNextArea, { area: "Vocabulary" }],
    ], "6 sentences → at most 5: the growth line (extra info) gives way first");
    const g = RS.mapFamilySummary(fam({ practice: { answers: 0, accuracy: null, days: 0 }, subjects: [{ ...fam().subjects[0], areas: [] }] }));
    assert.deepEqual(L(g)[1], [R.fmGrowth, { from: "Fall 2025", first: "Ali", subject: "Reading", g: "-2" }], "a drop is shown as -2 (never +-2)");
    assert.deepEqual(B(x), [["plan", "/map-report/study-plan/s1?subject=READING"]]);
    for (const a of x.actions) assert.doesNotMatch(a.href, /^\/teacher|^\/admin/, "no teacher-only button for a family");
    const words = [...x.lines.map((l) => l.key), ...x.lines.flatMap((l) => Object.values(l.vars ?? {}).map(String))].join(" ");
    assert.doesNotMatch(words, /\b(Low|Average|High|LoAvg|HiAvg|Below|Above|Approaching|Meeting|Exceeding)\b/, "no level words (students may read it)");
    // no practice, no growth
    const y = RS.mapFamilySummary(fam({ practice: { answers: 0, accuracy: null, days: 0 }, subjects: [{ subject: "READING", name: "Reading", latest: { rit: 190 }, growth: null, areas: [] }] }));
    assert.deepEqual(L(y), [[R.fmScores, { first: "Ali", scores: "Reading 190" }], [R.fmPractice0, { first: "Ali" }], [R.fmNext]]);
    const z = RS.mapFamilySummary(fam({ subjects: [], practice: { answers: 30, accuracy: null, days: 2 } }));
    assert.deepEqual(L(z), [[R.fmNone, { first: "Ali" }], [R.fmPracticeNoAcc, { first: "Ali", days: 2, answers: 30 }], [R.fmNext]]);
    assert.deepEqual(z.actions, [], "no MAP score: no plan to open");
    const p = RS.mapFamilySummary(fam({ subjects: [{ subject: "READING", name: "Reading", latest: { rit: 205 }, growth: null, areas: [] }] }));
    assert.deepEqual(L(p)[1], [R.fmPractice, { first: "Ali", days: 9, answers: 120, acc: 74 }]);
  });

  test("the class's family reports (teacher cover): scores, practised most, no practice, next step", () => {
    const d = (id: string, name: string, days: number, scored: boolean) => ({ ...fam(), student: { id, first: name, name }, practice: { answers: days * 10, accuracy: 70, days }, subjects: scored ? fam().subjects : [] });
    const x = RS.classFamilySummary([d("a", "Ali", 9, true), d("b", "Badr", 0, true), d("c", "Cy", 3, false), d("e", "Eve", 0, false), d("f", "Fay", 12, true)], "c1");
    assert.deepEqual(L(x), [[R.cfScores, { n: 3, total: 5 }], [R.cfMost, { names: "Fay, Ali, Cy" }], [R.cfNone, { names: "Badr, Eve" }], [R.cfNext]]);
    assert.deepEqual(B(x), [["open", "/teacher/family-reports?classId=c1"], ["parent", "/teacher/students/b#comments"], ["group", "/teacher/intervention/groups?class=c1&students=b%2Ce"], ["practice", "/teacher/assignments?classId=c1"]]);
    const all = RS.classFamilySummary([d("a", "Ali", 1, true)], "c1");
    assert.deepEqual(L(all), [[R.cfScores, { n: 1, total: 1 }], [R.cfMost, { names: "Ali" }], [R.cfNone0], [R.cfNextKeep]]);
  });

  const sk = (id: string, status = "NEW") => ({ id, name: `Skill ${id}`, status });
  const planDoc = (): RS.PlanIn => ({
    student: { id: "s1", name: "Ali", classId: "c1" }, subject: "READING", counts: { mastered: 3, total: 12 },
    areas: [
      { name: "Literary Text", focus: false, skillsMastered: 2, skillsLinked: 4, stages: [{ key: "DEVELOP", topics: [{ statements: [{ skills: [sk("k1", "MASTERED"), sk("k2")] }] }] }] },
      { name: "Vocabulary", focus: true, skillsMastered: 1, skillsLinked: 8, stages: [{ key: "REINFORCE", topics: [{ statements: [{ skills: [sk("k9")] }] }] }, { key: "DEVELOP", topics: [{ statements: [{ skills: [sk("k3", "PRACTISING"), sk("k4"), sk("k3")] }] }] }] },
    ],
  });

  test("Personal Study Plan: mastered of total, most progress, focus, ready-to-learn (focus first, once each), buttons per viewer", () => {
    assert.deepEqual(RS.readySkills(planDoc()).map((k) => k.id), ["k3", "k4", "k2"], "focus area first; mastered and Reinforce skills left out; k3 once");
    const staff = RS.studyPlanSummary(planDoc(), "staff");
    assert.deepEqual(L(staff), [
      [R.spMastered, { name: "Ali", n: 3, total: 12 }],
      [R.spBest, { area: "Literary Text", n: 2, total: 4 }],
      [R.spFocus, { areas: "Vocabulary" }],
      [R.spReady, { skills: "Skill k3, Skill k4, Skill k2" }],
      [R.spNextStaff, { skill: "Skill k3" }],
    ]);
    assert.deepEqual(B(staff), [["practice", "/teacher/skill-assign?skillId=k3&classId=c1"], ["lesson", "/teacher/learn/assign?kind=LESSON&skillId=k3&classId=c1&studentId=s1"], ["parent", "/teacher/students/s1#comments"]]);
    const student = RS.studyPlanSummary(planDoc(), "student");
    assert.deepEqual(L(student).at(-1), [R.spNextHome, { skill: "Skill k3" }]);
    assert.deepEqual(B(student), [["practice", "/practice/k3?from=map"]], "the student: practise the skill, nothing else");
    const parent = RS.studyPlanSummary(planDoc(), "parent");
    assert.deepEqual(B(parent), [["open", "/map-report/family/s1"]], "the parent: the family report, no teacher page");
    const done = planDoc(); done.areas = done.areas.map((a) => ({ ...a, focus: false, stages: [] }));
    assert.deepEqual(L(RS.studyPlanSummary(done, "student")).at(-1), [R.spNextDone]);
  });

  test("every study plan of a class: the mean share mastered (each student once), most / fewest, the common focus → group", () => {
    const doc = (id: string, name: string, m: number, t: number, focus: string[]): RS.PlanIn => ({ student: { id, name, classId: "c1" }, subject: "READING", counts: { mastered: m, total: t }, areas: focus.map((f) => ({ name: f, focus: true, skillsMastered: 0, skillsLinked: 1, stages: [] })) });
    const x = RS.classStudyPlansSummary([doc("a", "Ali", 6, 12, ["Vocabulary"]), doc("b", "Badr", 3, 12, ["Vocabulary", "Literary Text"]), doc("c", "Cy", 0, 10, []), doc("d", "Dan", 9, 12, ["Literary Text"]), doc("e", "Eve", 0, 0, ["Vocabulary"])], "c1", "READING");
    // 50, 25, 0, 75 (Eve: no skills → not in the mean) → 37.5 → 38
    assert.deepEqual(L(x), [
      [R.csPlans, { n: 5, avg: 38 }],
      [R.csMost, { names: "Dan, Ali, Badr" }],
      [R.csFewest, { names: "Cy" }],
      [R.csFocus, { area: "Vocabulary", n: 3 }],
      [R.csNextGroup, { area: "Vocabulary" }],
    ]);
    assert.deepEqual(B(x), [["plan", "/map-report/class/c1/groups?subject=READING"], ["group", "/teacher/intervention/groups?class=c1&students=a%2Cb%2Ce"], ["practice", "/teacher/assignments?classId=c1"], ["parent", "/teacher/students/c#comments"]]);
  });

  test("Class Profile: tested of the class, mean vs national, highest / lowest, weakest area, growth met", () => {
    const st = (id: string, name: string, rit: number) => ({ id, name, test: { rit } });
    const x = RS.classProfileSummary({ classId: "c1", subject: "READING", n: 4, notTested: [{}], meanRit: 204, national: 206.5, students: [st("a", "Ali", 220), st("b", "Badr", 190), st("c", "Cy", 205), st("d", "Dan", 201)], areas: [{ name: "Vocabulary", mean: 198 }, { name: "Literary Text", mean: 207 }, { name: "Informational", mean: null }], growth: { pctMet: 60, enough: false } });
    assert.deepEqual(L(x), [
      [R.cpTested, { n: 4, total: 5, mean: 204, national: 206.5 }],
      [R.cpHigh, { names: "Ali (220)" }],
      [R.cpLow, { names: "Badr (190), Dan (201), Cy (205)" }],
      [R.cpArea, { area: "Vocabulary", rit: 198 }],
      [R.cpNext],
    ], "growth with fewer than 10 students is not shown; the highest list never repeats the lowest");
    assert.deepEqual(B(x), [["plan", "/map-report/class/c1/groups?subject=READING"], ["group", "/teacher/intervention/groups?class=c1&students=b%2Cd%2Cc"], ["parent", "/teacher/students/b#comments"], ["practice", "/teacher/assignments?classId=c1"]]);
    assert.deepEqual(L(RS.classProfileSummary({ classId: "c1", subject: "READING", n: 0, notTested: [{}, {}], meanRit: null, national: null, students: [], areas: [], growth: { pctMet: null, enough: false } })), [[R.mpNoScores], [R.mpNextUpload]]);
  });

  test("every new sentence, button and tooltip is an interface string in English and Arabic", () => {
    for (const k of Object.values(R)) assert.ok(has(k), `"${k}" in en + ar`);
    for (const k of COLUMN_KEYS) assert.ok(has(k), `glossary "${k}" in en + ar`);
    for (const k of ["Stuck", "Rising fast", "Unreliable readings", "Class accuracy by question type", "Hardest skills", "Class Comparison", "Classes This Week", "Language profile", "Strong and weak skills", "MAP Reading Growth by Class"]) assert.ok(GLOSSARY[k], `ⓘ for "${k}"`);
    assert.ok(has("{m} of {n} met their growth · average {g} (expected {e})"));
  });

  test("the pages: intro on top, summary at the end (a pure call on the loaded data), buttons hidden on paper", () => {
    const pages: [string, RegExp | null][] = [
      ["src/app/map-report/profile/[studentId]/page.tsx", /<ReportSummary summary=\{mapProfileSummary\(d\)\} \/>/],
      ["src/app/map-report/family/[studentId]/page.tsx", /<FamilyView d=\{d\} summary=\{mapFamilySummary\(d\)\} \/>/],
      ["src/app/map-report/class/[classId]/family/page.tsx", /<ReportSummary summary=\{classFamilySummary\(v\.docs, classId\)\} \/>/],
      ["src/app/map-report/study-plan/[studentId]/page.tsx", /<ReportSummary summary=\{studyPlanSummary\(/],
      ["src/app/map-report/class/[classId]/study-plans/page.tsx", /<ReportSummary summary=\{classStudyPlansSummary\(/],
      ["src/app/map-report/class/[classId]/profile/page.tsx", /<ReportSummary summary=\{classProfileSummary\(d\)\} \/>/],
      ["src/app/map-report/class/[classId]/groups/page.tsx", null],
    ];
    for (const [f, re] of pages) {
      const src = read(f);
      const intro = /<ReportIntro text="([^"]+)"/.exec(src);
      assert.ok(intro, `${f}: intro`); assert.ok(has(intro![1].replace(/\\'/g, "'")), `${f}: the intro is translated`);
      if (re) { assert.match(src, re, f); assert.ok(src.indexOf("<ReportIntro") < src.search(re), `${f}: intro before the summary`); }
      assert.doesNotMatch(src, /repo\.find|findMany/, `${f}: no new query`);
    }
    assert.match(read("src/components/map/family-view.tsx"), /\{summary && <ReportSummary summary=\{summary\} \/>\}/, "each family report ends with its summary");
    assert.match(read("src/components/report-kit/report-summary.tsx"), /<div className="mt-4 border-t border-emerald-200 pt-3 print:hidden">/, "the action-plan buttons are not printed");
    assert.match(read("src/components/report-kit/report-summary.tsx"), /useId\(\)/, "several summaries on one page: unique heading ids");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("3. end-of-term report: the main table cut to the essentials", () => {
  test("Classes This Week: 5 visible columns (≤ 6), the rest behind More details; growth signs and % met right", () => {
    const src = read("src/app/admin/term-report/page.tsx");
    const block = src.slice(src.indexOf('<ReportTable label="Classes This Week"'), src.indexOf("rows={d.classes.map"));
    const cols = [...block.matchAll(/\{ key: "(\w+)", label: "([^"]+)"([^}]*)\}/g)];
    const visible = cols.filter((c) => !/more: true/.test(c[3])).map((c) => c[2]), more = cols.filter((c) => /more: true/.test(c[3])).map((c) => c[2]);
    assert.deepEqual(visible, ["Class", "Teacher", "Practised (week)", "Accuracy", "Alerts open"]);
    assert.deepEqual(more, ["Students", "Tasks done", "Late", "Handled"]);
    assert.ok(visible.length <= 6);
    assert.doesNotMatch(src, />\+\{c\.avgGrowth\}|\+\{c\.avgProjected/, "never '+-2' or '+—'");
    assert.match(src, /signed\(c\.avgGrowth\)/);
    assert.match(src, /growthTotals\(growth\)/, "the totals count each student once");
    assert.equal(RS.signed(-2), "-2"); assert.equal(RS.signed(3.5), "+3.5"); assert.equal(RS.signed(0), "0"); assert.equal(RS.signed(null), "—");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("4. correctness audit with KNOWN answers", () => {
  let repo: SqliteRepo; let admin: Actor; let t4: Actor;
  let c4a = "", c4b = "";
  let s1 = "", s2 = "", s3 = "", s4 = "";
  const NOW = new Date();
  const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
  const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  let qn = 0;

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 3 }));
    for (const m of ["QuestionAttempt", "PracticeSession", "StudentSkillMastery", "MapResult", "StudentAbility"]) await repo.deleteMany(m, {});
    admin = await as("demo.admin");
    t4 = await as("demo.teacher.4a");
    const tch = await repo.findUnique("Teacher", { userId: t4.userId });
    c4a = s((await repo.findMany("ClassTeacher", { teacherId: tch!.id }))[0].classId);
    const k4a = (await repo.findUnique("Class", { id: c4a }))!;
    c4b = s((await repo.findMany("Class", { gradeId: k4a.gradeId, deletedAt: null })).find((c) => c.id !== c4a)!.id);
    const names = async (cid: string) => {
      const ids = (await repo.findMany("ClassMembership", { classId: cid, leftAt: null })).map((m) => s(m.studentId));
      const st = await repo.findMany("Student", { id: { in: ids } });
      const us = await repo.findMany("User", { id: { in: st.map((x) => s(x.userId)) } });
      return st.map((x) => ({ id: s(x.id), name: s(us.find((u) => u.id === x.userId)?.displayName) })).sort((a, b) => a.name.localeCompare(b.name)).map((x) => x.id);
    };
    [s1, s2, s3] = await names(c4a);
    [s4] = await names(c4b);
    // s1 is ALSO in 4B (a student in two classes: must be counted once in the school totals)
    await repo.create("ClassMembership", { classId: c4b, studentId: s1, joinedAt: ago(40) });
    const skills = (await repo.findMany("Skill", {}, { select: ["id", "code"] })).filter((k) => /^G?4/i.test(s(k.code)) || true).slice(0, 2);
    const type = (await repo.findMany("QuestionType", {}))[0];
    const qOf = new Map<string, string>();
    for (const k of skills) {
      const q = await repo.create("Question", { skillId: k.id, typeId: type.id, stem: `Audit question ${s(k.id).slice(-4)}`, content: {}, difficultyLevel: 3, irtB: 0, status: "PUBLISHED", createdAt: ago(100), updatedAt: ago(100) });
      qOf.set(s(k.id), s(q.id));
    }
    const [K1, K2] = skills.map((k) => s(k.id));
    const answer = async (studentId: string, skillId: string, right: number, wrong: number, daysAgo = 2) => {
      const ses = await repo.create("PracticeSession", { id: `audit-${++qn}`, studentId, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: ago(daysAgo), questionCount: right + wrong, correctCount: right });
      for (let i = 0; i < right + wrong; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId, questionId: qOf.get(skillId)!, skillId, response: {}, isCorrect: i < right, responseMs: 9000, difficultyB: 0, rapidGuess: false, createdAt: ago(daysAgo) });
    };
    await answer(s1, K1, 8, 2);   // 10 answers, 80 %
    await answer(s2, K1, 3, 7);   // 10 answers, 30 %
    await answer(s4, K2, 5, 5);   // 10 answers, 50 %
    // MAP growth: Fall → Spring; s3 has no projected growth (met unknown)
    const map = async (studentId: string, fall: number, spring: number, projected: number | null) => {
      await repo.create("MapResult", { studentId, subject: "Reading", termName: "Fall 2025", testDate: new Date("2025-09-15T08:00:00Z"), rit: fall, projectedGrowth: projected });
      await repo.create("MapResult", { studentId, subject: "Reading", termName: "Spring 2026", testDate: new Date("2026-05-10T08:00:00Z"), rit: spring });
    };
    await map(s1, 200, 210, 8);   // +10 ≥ 8 → met
    await map(s2, 195, 199, 8);   // +4 < 8 → not met
    await map(s3, 190, 195, null); // no expectation → unknown, never "not met"
  });

  test("class progress (Students): each student once, answers = right + wrong, accuracy recomputed, the class line", async () => {
    const v = await classProgress(repo, t4, c4a, "READING", NOW);
    assert.equal(v.rows.length, 3); assert.equal(new Set(v.rows.map((r) => r.studentId)).size, 3, "each student once");
    const by = new Map(v.rows.map((r) => [r.studentId, r.practice]));
    assert.deepEqual([by.get(s1)!.answers, by.get(s1)!.correct, by.get(s1)!.accuracy], [10, 8, 80]);
    assert.deepEqual([by.get(s2)!.answers, by.get(s2)!.correct, by.get(s2)!.accuracy], [10, 3, 30]);
    assert.deepEqual([by.get(s3)!.answers, by.get(s3)!.correct, by.get(s3)!.accuracy], [0, 0, null]);
    for (const r of v.rows) {
      assert.equal(r.practice.answers - r.practice.correct >= 0, true, "wrong = answers − right ≥ 0");
      assert.equal(r.practice.accuracy, r.practice.answers ? Math.round((100 * r.practice.correct) / r.practice.answers) : null, "accuracy recomputed");
    }
    assert.deepEqual([v.summary.students, v.summary.activeWeek, v.summary.tested], [3, 2, 3]);
    const sum = RS.progressSummary(v.rows, c4a);
    assert.deepEqual(L(sum)[0], [S.classOverview, { n: 2, total: 3, avg: 55 }], "the class average = the mean of the students (80 + 30) / 2");
  });

  test("class progress (this month vs last): answers, accuracy and active students from the same answers", async () => {
    const m = await classMonth(repo, t4, c4a, NOW);
    assert.deepEqual([m.thisMonth.answers, m.thisMonth.accuracy, m.thisMonth.active], [20, 55, 2], "11 right of 20");
    assert.deepEqual([m.lastMonth.answers, m.lastMonth.accuracy, m.lastMonth.active], [0, null, 0]);
    const p = await peerCompare(repo, t4, c4a, NOW);
    assert.equal(p.rows.length, 3); assert.equal(new Set(p.rows.map((r) => r.studentId)).size, 3);
  });

  test("department week: each class pooled (right / answers), the school totals count each student ONCE", async () => {
    const d = await departmentSummary(repo, admin, NOW);
    const a = d.classes.find((c) => c.classId === c4a)!, b = d.classes.find((c) => c.classId === c4b)!;
    assert.deepEqual([a.students, a.activeWeek, a.answersWeek, a.accuracy, a.activePct], [3, 2, 20, 55, 67]);
    assert.deepEqual([b.students, b.activeWeek, b.answersWeek, b.accuracy], [4, 2, 20, 65], "4B: s1 (8/10) + s4 (5/10) = 13 of 20");
    const members = await repo.findMany("ClassMembership", { classId: { in: d.classes.map((c) => c.classId) }, leftAt: null });
    const unique = new Set(members.map((m) => s(m.studentId))).size;
    assert.equal(d.totals.students, unique, "each student once");
    assert.equal(d.classes.reduce((t, c) => t + c.students, 0), unique + 1, "the class rows show s1 in both classes");
    assert.deepEqual([d.totals.active, d.totals.answers], [3, 30], "s1, s2, s4; 30 answers (not 40)");
  });

  test("School Analytics: answers, accuracy recomputed, active, each class's students", async () => {
    const period = { name: "CUSTOM", label: "Audit", from: ago(30), to: NOW } as unknown as Period;
    const d = await schoolDashboard(repo, admin, period, NOW);
    assert.deepEqual([d.kpis.answers, d.kpis.accuracy, d.kpis.activeWeek], [30, 53, 3], "16 right of 30 = 53 %");
    const a = d.classes.find((c) => c.classId === c4a)!, b = d.classes.find((c) => c.classId === c4b)!;
    assert.deepEqual([a.students, a.answers, a.accuracy, a.activeWeek], [3, 20, 55, 2]);
    assert.deepEqual([b.students, b.answers, b.accuracy, b.activeWeek], [4, 20, 65, 2]);
    const g4 = d.grades.find((g) => g.grade === 4)!;
    assert.equal(g4.accuracy, 53, "the grade: every Grade 4 answer once (16 / 30)");
    assert.equal(d.weeks.reduce((t, w) => t + w.answers, 0), 30, "the weekly chart adds up to the answers");
  });

  test("MAP growth: met / measured (a student without an expected growth is never 'not met'), the totals once", async () => {
    const g = await growthReport(repo, t4, "READING");
    const a = g.find((c) => c.classId === c4a)!;
    assert.deepEqual([a.tested, a.measured, a.met, a.avgGrowth], [3, 2, 1, 6.3], "(10 + 4 + 5) / 3 = 6.3");
    assert.deepEqual(a.rows.map((r) => [r.studentId, r.growth, r.met]).sort(), [[s1, 10, true], [s2, 4, false], [s3, 5, null]].sort());
    const all = await growthReport(repo, admin, "READING");
    const b = all.find((c) => c.classId === c4b)!;
    assert.deepEqual([b.tested, b.measured, b.met], [1, 1, 1], "s1 again in 4B");
    assert.deepEqual(RS.growthTotals(all), { tested: 3, measured: 2, met: 1, pct: 50 }, "each student once: not 4 tested / 2 met");
    const sum = RS.mapGrowthSummary([{ id: s1, name: "A", reading: 210, language: null }, { id: s2, name: "B", reading: 199, language: null }, { id: s3, name: "C", reading: 195, language: null }], a, { classId: c4a, subject: "READING" });
    assert.deepEqual(L(sum)[0], [R.mpScores, { n: 3, total: 3, avg: 201 }], "(210 + 199 + 195) / 3 = 201.3 → 201");
    const d = await departmentSummary(repo, admin, NOW);
    const t = RS.termReportSummary(d, RS.growthTotals(all));
    assert.ok(L(t).some((l) => l[0] === R.adMapMet && JSON.stringify(l[1]) === JSON.stringify({ p: 50, m: 1, n: 2 })), "1 of the 2 with an expected growth");
  });

  test("Learn results: counts of the students listed, '{f} of {a}' never more finished than listed", async () => {
    const school = s((await repo.findUnique("Class", { id: c4a }))!.schoolId);
    for (const id of [s1, s2]) await repo.create("LearnAssignee", { assignId: "audit-assign", schoolId: school, studentId: id, kind: "LESSON", ref: "G4.L1", title: "Audit lesson" });
    await repo.create("LearnProgress", { schoolId: school, studentId: s1, kind: "LESSON", ref: "G4.L1", openedAt: ago(3), finishedAt: ago(2), score: 3, best: 3, attempts: 1, seconds: 600 });
    await repo.create("LearnProgress", { schoolId: school, studentId: s2, kind: "LESSON", ref: "G4.L1", openedAt: ago(3), neededAgain: true, attempts: 1 });
    await repo.create("LearnProgress", { schoolId: school, studentId: s3, kind: "LESSON", ref: "G4.L1", openedAt: ago(1), finishedAt: ago(1), score: 2, attempts: 2 });
    const r = await learnResults(repo, t4, "LESSON", "G4.L1", c4a);
    assert.equal(r.rows.length, 3); assert.equal(new Set(r.rows.map((x) => x.studentId)).size, 3);
    assert.deepEqual(r.counts, { assigned: 2, opened: 3, finished: 2, again: 1 });
    const sum = RS.learnResultsSummary(r, { kind: "LESSON", code: "G4.L1", classId: c4a });
    assert.deepEqual(L(sum)[0], [R.lnFinished, { f: 2, a: 3, o: 3 }], "2 of the 3 students listed (before: '2 of 2' — s3 opened it on their own)");
  });

  test("early warning: the severity counts add up to the students shown, each student once", async () => {
    const v = await earlyWarning(repo, admin, {}, NOW);
    assert.equal(new Set(v.rows.map((r) => r.studentId)).size, v.rows.length, "each student once");
    assert.equal(v.counts.URGENT + v.counts.WATCH + v.counts.GOOD, v.rows.length);
    assert.equal(v.byClass.reduce((t, c) => t + c.urgent + c.watch + c.good, 0), v.rows.length, "the per-class table adds up");
    for (const c of v.byClass) assert.equal(c.unhandled7, v.unhandled.filter((u) => u.classId === c.classId).length, "matched by class id, not name");
  });

  test("the fixes stay in the code", () => {
    assert.match(read("src/server/insights/early-warning.ts"), /unhandled\.filter\(\(u\) => u\.classId === c\.id\)/);
    assert.doesNotMatch(read("src/server/insights/early-warning.ts"), /u\.className === c\.name/);
    assert.match(read("src/server/insights/student-file.ts"), /x\.pct >= 80/, "strong = 80 %+ (the one rule)");
    assert.match(read("src/server/analytics/school-dashboard.ts"), /if \(!known\.has\(sid\)\) continue;/);
    assert.match(read("src/app/teacher/map-center/reports-tab.tsx"), /n: g\.measured, g: signed\(g\.avgGrowth\)/);
    assert.equal(A.parent, "Contact {name}'s parent");
  });
});
