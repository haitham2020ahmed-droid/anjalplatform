/**
 * 🧾 r70 reports (owner: "I am not a data person — simple, clear, CORRECT"; "the owner is tired of errors"): the
 * summary box at the end of every report and its action plan. Each summary function gets a fixture with KNOWN
 * numbers and every sentence, every number and every button (kind + link) is asserted; then the shared rules
 * (≥ 80 % doing well, < 60 % needs help, the weakest skill with 2+ answers, 5 sentences at most), the column rules
 * (hide empty / constant columns, "More details", standards as code + short name), the EN + AR strings and the
 * components (intro, ⓘ tooltip, summary, table).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// next/link is not loadable outside Next: a plain <a> stands in for the static render
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module") as { _resolveFilename: (r: unknown, ...x: unknown[]) => string; _cache: Record<string, unknown> };
const orig = Module._resolveFilename;
Module._resolveFilename = function (this: unknown, r: unknown, ...x: unknown[]) { return r === "next/link" ? "stub:next/link" : orig.call(this, r, ...x); };
Module._cache["stub:next/link"] = { id: "next/link", filename: "next/link", loaded: true, children: [], paths: [], exports: { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }: { href: string; children?: unknown; prefetch?: unknown }) => React.createElement("a", { href, ...rest }, children as never) } };
(globalThis as Record<string, unknown>).React ??= React;

import { A, S, classSummary, fit, line, mean, mostCommon, nameList, schoolSummary, splitScores, studentSummary, weakestSkill, SUMMARY_KEYS, type Summary } from "../src/lib/report-summary";
import * as RS from "../src/lib/report-summaries";
import { R, REPORT_SUMMARY_KEYS } from "../src/lib/report-summaries";
import { autoHidden, COLUMN_KEYS, GLOSSARY, shortStandard, tipOf } from "../src/lib/report-columns";
import { makeT } from "../src/i18n";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { I18nProvider } from "../src/i18n/client";

/** [key, vars] of every line — the exact sentences, numbers and names. */
const L = (s: Summary) => s.lines.map((l) => (l.vars ? [l.key, l.vars] : [l.key]));
/** [kind, href] of every button. */
const B = (s: Summary) => s.actions.map((a) => [a.kind, a.href]);
const en = makeT("en"), arT = makeT("ar");
const text = (s: Summary, t = en) => s.lines.map((l) => t(l.key, l.vars));
const h = React.createElement;
const html = (el: React.ReactElement, lang: "en" | "ar" = "en") => renderToStaticMarkup(h(I18nProvider, { lang, children: el }));

describe("shared rules", () => {
  test("names, mean, split (≥ 80 well, < 60 help), weakest skill (2+ answers), most common", () => {
    assert.equal(nameList([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }]), "A, B, C +2");
    assert.equal(nameList([{ name: "A" }, { name: "B" }]), "A, B");
    assert.equal(mean([90, 85, null, 70]), 82);
    assert.equal(mean([67.5]), 68);
    assert.equal(mean([]), null);
    const sp = splitScores([{ id: "1", name: "Ali", pct: 80 }, { id: "2", name: "Badr", pct: 79 }, { id: "3", name: "Cy", pct: 60 }, { id: "4", name: "Dan", pct: 59 }, { id: "5", name: "Eve", pct: null }]);
    assert.deepEqual(sp.well.map((x) => x.name), ["Ali"], "80 is doing well");
    assert.deepEqual(sp.help.map((x) => x.name), ["Dan"], "60 is not 'needs help', 59 is");
    assert.deepEqual(sp.noData.map((x) => x.name), ["Eve"]);
    assert.equal(sp.avg, 70, "(80+79+60+59)/4 = 69.5 → 70");
    assert.equal(weakestSkill([{ name: "X", pct: 10, n: 1 }, { name: "Y", pct: 40, n: 2 }, { name: "Z", pct: 40, n: 9 }])?.name, "Y", "1 answer is not enough; ties by name");
    assert.equal(weakestSkill([{ name: "X", pct: null }]), null);
    assert.deepEqual(mostCommon([["Inference", "Main idea"], ["Main idea", "Inference"], ["Vocab"]]), { name: "Inference", count: 2 });
  });

  test("a class: overview, doing well, needs help, weakest skill, small group (fewer than half need help)", () => {
    const s = classSummary({
      rows: [{ id: "s1", name: "Ali", pct: 90 }, { id: "s2", name: "Badr", pct: 85 }, { id: "s3", name: "Sara", pct: 70 }, { id: "s4", name: "Omar", pct: 50 }, { id: "s5", name: "Huda", pct: 40 }, { id: "s6", name: "Zaid", pct: null }],
      skills: [{ id: "k1", name: "Main idea", pct: 55, n: 10 }, { id: "k2", name: "Inference", pct: 45, n: 1 }, { id: "k3", name: "Vocabulary", pct: 72, n: 8 }],
      classId: "c1",
    });
    assert.deepEqual(L(s), [
      [S.classOverview, { n: 5, total: 6, avg: 67 }],
      [S.well, { names: "Ali, Badr" }],
      [S.help, { names: "Huda, Omar" }],
      [S.weak, { skill: "Main idea", pct: 55 }],
      [S.nextGroupSkill, { n: 2, skill: "Main idea" }],
    ]);
    assert.deepEqual(B(s), [
      ["group", "/teacher/intervention/groups?class=c1&students=s5%2Cs4"],
      ["practice", "/teacher/skill-assign?skillId=k1&classId=c1"],
      ["parent", "/teacher/students/s5#comments"],
    ]);
    assert.deepEqual(s.actions.map((a) => [a.label, a.vars]), [[A.group, { n: 2 }], [A.practiceSkill, { skill: "Main idea" }], [A.parent, { name: "Huda" }]]);
    assert.deepEqual(text(s), ["5 of 6 students have results; the average is 67%.", "Doing well (80% or more): Ali, Badr.", "Needs help (below 60%): Huda, Omar.", "Weakest skill: Main idea (55%).", "Next step: meet the 2 students who need help in a small group on Main idea."]);
    assert.deepEqual(text(s, arT), ["لدى 5 من 6 طالبًا نتائج؛ والمتوسط 67%.", "أداؤهم جيد (80% أو أكثر): Ali, Badr.", "يحتاجون إلى مساعدة (أقل من 60%): Huda, Omar.", "أضعف مهارة: Main idea (55%).", "الخطوة التالية: اجتمع مع الطلاب الـ2 الذين يحتاجون إلى مساعدة في مجموعة صغيرة حول Main idea."]);
  });

  test("a class: half or more need help → re-teach to the whole class; nobody has results; nobody needs help; admins follow up", () => {
    const re = classSummary({ rows: [{ id: "a", name: "A", pct: 30 }, { id: "b", name: "B", pct: 40 }, { id: "c", name: "C", pct: 90 }], skills: [{ id: "k1", name: "Commas", pct: 35, n: 4 }], classId: "c1" });
    assert.deepEqual(L(re).at(-1), [S.nextReteachSkill, { skill: "Commas" }]);
    assert.deepEqual(B(re), [["reteach", "/teacher/skill-assign?skillId=k1&classId=c1"], ["lesson", "/teacher/learn/assign?kind=LESSON&skillId=k1&classId=c1"], ["group", "/teacher/intervention/groups?class=c1&students=a%2Cb"]]);
    const none = classSummary({ rows: [{ id: "a", name: "A", pct: null }], classId: "c1" });
    assert.deepEqual(L(none), [[S.none], [S.nextNone]]);
    assert.deepEqual(B(none), [["practice", "/teacher/assignments?classId=c1"]]);
    const keep = classSummary({ rows: [{ id: "a", name: "A", pct: 80 }, { id: "b", name: "B", pct: 65 }], classId: "c1", admin: true });
    assert.deepEqual(L(keep), [[S.classOverview, { n: 2, total: 2, avg: 73 }], [S.well, { names: "A" }], [S.help0], [S.nextKeep]]);
    assert.deepEqual(B(keep), [["practice", "/teacher/assignments?classId=c1"], ["plan", "/teacher/plans?tab=custom&classId=c1"], ["followup", "/admin/teachers"]]);
  });

  test("one student: overall, strongest, needs help with, practice + lesson + parent", () => {
    const s = studentSummary({ studentId: "s1", name: "Sara", classId: "c1", pct: 72, skills: [{ id: "k1", name: "Main idea", pct: 90 }, { id: "k2", name: "Inference", pct: 40 }, { id: "k3", name: "Vocab", pct: 55 }, { id: "k4", name: "Spelling", pct: 85, n: 1 }] });
    assert.deepEqual(L(s), [[S.stOverview, { name: "Sara", pct: 72 }], [S.stStrong, { skills: "Main idea" }], [S.stWeak, { skills: "Inference, Vocab" }], [S.stNextWeak, { skill: "Inference" }]]);
    assert.deepEqual(B(s), [["practice", "/teacher/skill-assign?skillId=k2&classId=c1"], ["lesson", "/teacher/learn/assign?kind=LESSON&skillId=k2&classId=c1&studentId=s1"], ["parent", "/teacher/students/s1#comments"]]);
    const none = studentSummary({ studentId: "s2", name: "Omar", classId: "c1", pct: null, skills: [] });
    assert.deepEqual(L(none), [[S.stNone, { name: "Omar" }], [S.stStrong0], [S.stWeak0], [S.stNextNone]]);
    assert.deepEqual(B(none), [["plan", "/teacher/plans?tab=custom&classId=c1&who=student&sid=s2"], ["parent", "/teacher/students/s2#comments"]]);
  });

  test("the school: classes doing well / needing help, the weakest grade, follow up with the teachers", () => {
    const s = schoolSummary({ units: [{ id: "c1", name: "5A", pct: 85, href: "/a" }, { id: "c2", name: "5B", pct: 55, href: "/b" }, { id: "c3", name: "6A", pct: 70 }, { id: "c4", name: "6B", pct: null }], grades: [{ grade: 4, pct: 72 }, { grade: 5, pct: 58 }] });
    assert.deepEqual(L(s), [[S.scOverview, { n: 3, avg: 70 }], [S.scWell, { names: "5A" }], [S.scHelp, { names: "5B" }], [S.scGrade, { grade: 5, pct: 58 }], [S.scNextHelp, { names: "5B" }]]);
    assert.deepEqual(B(s), [["followup", "/admin/teachers"], ["open", "/b"], ["message", "/admin/messages"]]);
    const none = schoolSummary({ units: [] });
    assert.deepEqual(L(none), [[S.scNone], [S.scNextNone]]);
  });

  test("at most 5 sentences: 'Nobody …' lines give way first, then extra info lines; the next step stays last", () => {
    const l = fit([line("o", "info"), line("x1", "info"), line("x2", "info"), line(S.well0, "good"), line(S.help0, "help"), line("w", "skill"), line("n", "next")]);
    assert.deepEqual(l.map((x) => x.key), ["o", "x1", "x2", "w", "n"]);
    const l2 = fit([line("o", "info"), line("x1", "info"), line("g", "good"), line("h", "help"), line("w", "skill"), line("n", "next")]);
    assert.deepEqual(l2.map((x) => x.key), ["o", "g", "h", "w", "n"]);
  });
});

describe("one summary per report: known fixtures, every sentence and button", () => {
  test("Reports hub (teacher week; admin)", () => {
    const s = RS.hubSummary({ newStars: 4, needReview: 3, weakest: "Inference", minutes: 120, active: 5, students: 12 }, { classId: "c1", admin: false });
    assert.deepEqual(L(s), [[R.hubWeek, { active: 5, students: 12, minutes: 120 }], [R.hubStars, { n: 4 }], [R.hubReview, { n: 3 }], [R.hubWeak, { skill: "Inference" }], [R.hubNextRemind]]);
    assert.deepEqual(B(s), [["practice", "/teacher/assignments?classId=c1"], ["reteach", "/teacher/learning-loop?classId=c1"], ["open", "/teacher/reports/errors?classId=c1"], ["open", "/teacher/reports/early-warning?classId=c1"]]);
    const a = RS.hubSummary(null, { classId: "c1", admin: true });
    assert.deepEqual(L(a), [[R.hubAdmin], [R.hubAdminNext]]);
    assert.deepEqual(B(a), [["open", "/teacher/reports/early-warning"], ["open", "/admin/department"], ["followup", "/admin/teachers"]]);
  });

  test("Class progress (month against month, each student against the class)", () => {
    const s = RS.classCompareSummary({ thisMonth: { newStars: 6, answers: 200 }, lastMonth: { newStars: 2, answers: 150 }, weak: [{ skillId: "k9", name: "Prefixes", accuracy: 48, answers: 30 }] },
      { rows: [{ studentId: "a", name: "Ali", average: 88 }, { studentId: "b", name: "Badr", average: 52 }, { studentId: "c", name: "Cy", average: 75 }] }, "c1");
    assert.deepEqual(L(s), [[S.classOverview, { n: 3, total: 3, avg: 72 }], [R.monthLine, { stars: 6, answers: 200, stars0: 2, answers0: 150 }], [S.well, { names: "Ali" }], [S.help, { names: "Badr" }], [S.nextGroupSkill, { n: 1, skill: "Prefixes" }]]);
    assert.deepEqual(B(s), [["group", "/teacher/intervention/groups?class=c1&students=b"], ["practice", "/teacher/skill-assign?skillId=k9&classId=c1"], ["parent", "/teacher/students/b#comments"]]);
  });

  test("Students (progress table): accuracy, at risk, late work, the most common weakest skill", () => {
    const rows = [
      { studentId: "s1", name: "Ali", status: "ON_TRACK", practice: { accuracy: 85 }, work: { late: 0 }, weakest: ["Inference"] },
      { studentId: "s2", name: "Badr", status: "AT_RISK", practice: { accuracy: 45 }, work: { late: 2 }, weakest: ["Inference", "Main idea"] },
      { studentId: "s3", name: "Sara", status: "NO_DATA", practice: { accuracy: null }, work: { late: 0 }, weakest: [] },
      { studentId: "s4", name: "Omar", status: "MISSED", practice: { accuracy: 70 }, work: { late: 1 }, weakest: ["Main idea"] },
    ];
    const s = RS.progressSummary(rows, "c1");
    assert.deepEqual(L(s), [[S.classOverview, { n: 3, total: 4, avg: 67 }], [R.atRisk, { names: "Badr, Omar" }], [S.well, { names: "Ali" }], [S.help, { names: "Badr" }], [S.nextGroupSkill, { n: 1, skill: "Inference" }]]);
    assert.deepEqual(B(s), [["group", "/teacher/intervention/groups?class=c1&students=s2"], ["practice", "/teacher/assignments?classId=c1"], ["parent", "/teacher/students/s2#comments"]]);
  });

  test("Mistakes and root causes", () => {
    const s = RS.errorsSummary({ classId: "c1", size: 10, classWide: [{ label: "Confuses main idea with details", students: ["a", "b", "c", "d"], lesson: { skillId: "k1", name: "Main idea" } }], gaps: [{ prereqId: "p1", prereqName: "Key details", skillName: "Main idea", students: ["a", "b"] }], sentences: [{ studentId: "a", name: "Ali", count: 3 }, { studentId: "b", name: "Badr", count: 5 }] });
    assert.deepEqual(L(s), [[R.errCount, { n: 2, size: 10 }], [R.errShared, { mistake: "confuses main idea with details", n: 4, size: 10 }], [R.errGap, { skill: "Key details", target: "Main idea" }], [R.errHelp, { names: "Badr, Ali" }], [R.errNextShared]]);
    assert.deepEqual(B(s), [["reteach", "/teacher/skill-assign?skillId=k1&classId=c1"], ["lesson", "/teacher/learn/assign?kind=LESSON&skillId=k1&classId=c1"], ["parent", "/teacher/students/b#comments"]]);
    const gap = RS.errorsSummary({ classId: "c1", size: 10, classWide: [], gaps: [{ prereqId: "p1", prereqName: "Key details", skillName: "Main idea", students: ["a", "b"] }], sentences: [] }, true);
    assert.deepEqual(L(gap), [[R.errNone], [R.errGap, { skill: "Key details", target: "Main idea" }], [R.errNextGap, { skill: "Key details" }]]);
    assert.deepEqual(B(gap), [["practice", "/teacher/skill-assign?skillId=p1&classId=c1"], ["group", "/teacher/intervention/groups?class=c1&students=a%2Cb"], ["followup", "/admin/teachers"]]);
  });

  test("Early warning", () => {
    const s = RS.earlyWarningSummary({ isAdmin: false, classId: "c1", counts: { URGENT: 2, WATCH: 1, GOOD: 1 }, unhandled: [], rows: [
      { studentId: "u1", name: "Zed", severity: "URGENT", classId: "c1", practiceSkillId: "k1" }, { studentId: "u2", name: "Amy", severity: "URGENT", classId: "c1", practiceSkillId: null },
      { studentId: "w1", name: "Bob", severity: "WATCH", classId: "c1", practiceSkillId: null }, { studentId: "g1", name: "Gil", severity: "GOOD", classId: "c1", practiceSkillId: null }] });
    assert.deepEqual(L(s), [[R.ewCounts, { u: 2, w: 1, g: 1 }], [R.ewGood, { names: "Gil" }], [R.ewUrgent, { names: "Zed, Amy" }], [R.ewNextUrgent]]);
    assert.deepEqual(B(s), [["plan", "/teacher/plans?tab=custom&classId=c1&who=student&sid=u1"], ["practice", "/teacher/skill-assign?skillId=k1&classId=c1"], ["parent", "/teacher/students/u1#comments"], ["group", "/teacher/intervention/groups?class=c1&students=u1%2Cu2"]]);
    const adm = RS.earlyWarningSummary({ isAdmin: true, classId: null, counts: { URGENT: 0, WATCH: 0, GOOD: 0 }, unhandled: [1, 2], rows: [] });
    assert.deepEqual(L(adm), [[R.ewCounts, { u: 0, w: 0, g: 0 }], [R.ewUnhandled, { n: 2 }], [R.ewUrgent0], [S.nextKeep]]);
    assert.deepEqual(B(adm), [["followup", "/admin/teachers"], ["practice", "/teacher/assignments"]]);
  });

  test("Grammar: class, school, one student", () => {
    const c = RS.grammarClassSummary({ students: [{ studentId: "s1", name: "Ali", accuracy: 92 }, { studentId: "s2", name: "Badr", accuracy: 58 }, { studentId: "s3", name: "Sara", accuracy: null }], skills: [{ skillId: "k1", name: "Commas", accuracy: 50, answers: 12 }, { skillId: "k2", name: "Verbs", accuracy: 80, answers: 20 }] }, "c1");
    assert.deepEqual(L(c), [[S.classOverview, { n: 2, total: 3, avg: 75 }], [S.well, { names: "Ali" }], [S.help, { names: "Badr" }], [S.weak, { skill: "Commas", pct: 50 }], [S.nextGroupSkill, { n: 1, skill: "Commas" }]]);
    assert.deepEqual(B(c), [["group", "/teacher/intervention/groups?class=c1&students=s2"], ["practice", "/teacher/skill-assign?skillId=k1&classId=c1"], ["parent", "/teacher/students/s2#comments"]]);
    const sc = RS.grammarSchoolSummary([{ classId: "c1", name: "5A", accuracy: 82 }, { classId: "c2", name: "5B", accuracy: 40 }], (id) => `/x?classId=${id}`);
    assert.deepEqual(L(sc), [[S.scOverview, { n: 2, avg: 61 }], [S.scWell, { names: "5A" }], [S.scHelp, { names: "5B" }], [S.scNextHelp, { names: "5B" }]]);
    assert.deepEqual(B(sc), [["followup", "/admin/teachers"], ["open", "/x?classId=c2"], ["message", "/admin/messages"]]);
    const st = RS.grammarStudentSummary({ name: "Ali", summary: { accuracy: 64 }, skills: [{ skillId: "k1", name: "Commas", accuracy: 45, answers: 6 }, { skillId: "k2", name: "Verbs", accuracy: 88, answers: 9 }] }, "s1", null);
    assert.deepEqual(L(st), [[S.stOverview, { name: "Ali", pct: 64 }], [S.stStrong, { skills: "Verbs" }], [S.stWeak, { skills: "Commas" }], [S.stNextWeak, { skill: "Commas" }]]);
    assert.deepEqual(B(st), [["practice", "/teacher/skill-assign?skillId=k1"], ["lesson", "/teacher/learn/assign?kind=LESSON&skillId=k1&studentId=s1"], ["parent", "/teacher/students/s1#comments"]]);
  });

  test("ReadMaster: class and one student", () => {
    const c = RS.readMasterSummary({ students: [{ studentId: "a", name: "Ali", texts: 3, avgScore: 81 }, { studentId: "b", name: "Badr", texts: 0, avgScore: null }, { studentId: "c", name: "Cy", texts: 2, avgScore: 55 }], skills: [{ skill: "Inference", accuracy: 52, counted: 9 }, { skill: "Main idea", accuracy: 70, counted: 4 }], below: [{}] }, "c1");
    assert.deepEqual(L(c), [[S.classOverview, { n: 2, total: 3, avg: 68 }], [R.rmBelow, { n: 1 }], [S.well, { names: "Ali" }], [S.help, { names: "Cy" }], [S.nextGroupSkill, { n: 1, skill: "Inference" }]]);
    assert.deepEqual(B(c), [["group", "/teacher/intervention/groups?class=c1&students=c"], ["practice", "/teacher/assignments?classId=c1"], ["parent", "/teacher/students/c#comments"]]);
    const st = RS.readMasterStudentSummary({ name: "Cy", row: { accuracy: 55 }, types: [{ name: "Vocabulary", accuracy: 40, answers: 5 }, { name: "Main idea", accuracy: 90, answers: 4 }] }, "c", null);
    assert.deepEqual(L(st), [[S.stOverview, { name: "Cy", pct: 55 }], [S.stStrong, { skills: "Main idea" }], [S.stWeak, { skills: "Vocabulary" }], [S.stNextWeak, { skill: "Vocabulary" }]]);
    assert.deepEqual(B(st), [["practice", "/teacher/assignments"], ["lesson", "/teacher/learn"], ["parent", "/teacher/students/c#comments"]]);
  });

  test("Live games and the games report", () => {
    const g = RS.gamesSummary({ games: [{}], students: [{ studentId: "a", name: "Ali", games: 2, accuracy: 90 }, { studentId: "b", name: "Badr", games: 0, accuracy: null }, { studentId: "c", name: "Cy", games: 1, accuracy: 30 }], skills: [{ skillId: "k1", name: "Spelling", accuracy: 30, answers: 10 }] }, "c1");
    assert.deepEqual(L(g), [[S.classOverview, { n: 2, total: 3, avg: 60 }], [R.gmNoPlay, { names: "Badr" }], [S.well, { names: "Ali" }], [S.help, { names: "Cy" }], [S.nextGroupSkill, { n: 1, skill: "Spelling" }]]);
    assert.deepEqual(B(g), [["group", "/teacher/intervention/groups?class=c1&students=c"], ["practice", "/teacher/skill-assign?skillId=k1&classId=c1"], ["parent", "/teacher/students/c#comments"]]);
    const u = RS.gamesUsageSummary([{ name: "Word Race", plays: 10, correctPct: 80 }, { name: "Quiz", plays: 4, correctPct: 40 }, { name: "Idle", plays: 0, correctPct: null }], 30);
    assert.deepEqual(L(u), [[R.gmPlays, { n: 14, days: 30, game: "Word Race" }], [R.gmHard, { game: "Quiz", pct: 40 }], [R.gmNext]]);
    assert.deepEqual(B(u), [["open", "/teacher/games"], ["practice", "/teacher/assignments"]]);
    assert.deepEqual(L(RS.gamesUsageSummary([], 30)), [[R.gmNone], [R.gmNextNone]]);
  });

  test("ReadRise", () => {
    const s = RS.readRiseSummary({ students: [{ studentId: "a", name: "Ali", placed: true }, { studentId: "b", name: "Badr", placed: true }, { studentId: "c", name: "Cy", placed: false }], stuck: [{ studentId: "b", name: "Badr" }], rising: [{ studentId: "a", name: "Ali" }], byType: [{ name: "Inference", pct: 40, total: 10 }, { name: "Detail", pct: 20, total: 3 }] }, "c1");
    assert.deepEqual(L(s), [[R.rrPlaced, { n: 2, total: 3 }], [R.rrRising, { names: "Ali" }], [R.rrStuck, { names: "Badr" }], [R.rrWeak, { type: "Inference", pct: 40 }], [R.rrNextPlace]]);
    assert.deepEqual(B(s), [["open", "/teacher/readrise?class=c1"], ["parent", "/teacher/students/b#comments"]]);
  });

  test("Learn results", () => {
    const s = RS.learnResultsSummary({ counts: { assigned: 4, opened: 3, finished: 2, again: 1 }, rows: [
      { studentId: "a", name: "Ali", assigned: true, opened: "2026-10-01", finished: "2026-10-01", score: 3, again: false },
      { studentId: "b", name: "Badr", assigned: true, opened: "2026-10-01", finished: "2026-10-02", score: 2, again: true },
      { studentId: "c", name: "Cy", assigned: true, opened: "2026-10-03", finished: null, score: null, again: false },
      { studentId: "d", name: "Dan", assigned: true, opened: null, finished: null, score: null, again: false }] }, { kind: "LESSON", code: "G4.L1", classId: "c1" });
    assert.deepEqual(L(s), [[R.lnFinished, { f: 2, a: 4, o: 3 }], [R.lnFull, { names: "Ali" }], [R.lnAgain, { names: "Badr" }], [R.lnNotOpened, { names: "Dan" }], [R.lnNextRemind]]);
    assert.deepEqual(B(s), [["lesson", "/teacher/learn/assign?kind=LESSON&ref=G4.L1&classId=c1&studentId=b"], ["parent", "/teacher/students/b#comments"]]);
  });

  test("Writing results: the student averages and the weakest task", () => {
    const s = RS.writingSummary({ tasks: [{ id: "t1", title: "Letter" }, { id: "t2", title: "Story" }], rows: [{ studentId: "a", name: "Ali", pct: { t1: 90, t2: 80 }, average: 85 }, { studentId: "b", name: "Badr", pct: { t1: 50 }, average: 50 }, { studentId: "c", name: "Cy", pct: {}, average: null }] }, "c1");
    assert.deepEqual(L(s), [[S.classOverview, { n: 2, total: 3, avg: 68 }], [S.well, { names: "Ali" }], [S.help, { names: "Badr" }], [R.wrWeakTask, { task: "Letter", pct: 70 }], [S.nextGroup, { n: 1 }]]);
    assert.deepEqual(B(s), [["group", "/teacher/intervention/groups?class=c1&students=b"], ["practice", "/teacher/assignments?classId=c1"], ["parent", "/teacher/students/b#comments"]]);
  });

  test("Reading fluency", () => {
    const s = RS.fluencySummary({ rows: [
      { id: "a", name: "Ali", wcpm: 120, band: "ABOVE", needsWork: false, fastNotUnderstanding: false }, { id: "b", name: "Badr", wcpm: 60, band: "BELOW", needsWork: true, fastNotUnderstanding: false },
      { id: "c", name: "Cy", wcpm: null, band: null, needsWork: false, fastNotUnderstanding: false }, { id: "d", name: "Dan", wcpm: 110, band: "ON", needsWork: false, fastNotUnderstanding: true }],
    groups: [{ title: "Phrasing group", students: [{ id: "b" }, { id: "d" }] }] }, "c1");
    assert.deepEqual(L(s), [[R.flChecked, { n: 3, total: 4 }], [R.flWell, { names: "Ali, Dan" }], [R.flHelp, { names: "Badr" }], [R.flFast, { names: "Dan" }], [R.flNextGroup, { group: "Phrasing group" }]]);
    assert.deepEqual(B(s), [["group", "/teacher/intervention/groups?class=c1&students=b%2Cd"], ["parent", "/teacher/students/b#comments"], ["plan", "/teacher/plans?tab=custom&classId=c1"]]);
    assert.deepEqual(L(RS.fluencySummary({ rows: [{ id: "c", name: "Cy", wcpm: null, band: null, needsWork: false, fastNotUnderstanding: false }], groups: [] }, "c1")), [[R.flChecked, { n: 0, total: 1 }], [R.flNextNone]]);
  });

  test("Family reports and the family week", () => {
    const f = RS.familyReportsSummary([{ status: "DRAFT" }, { status: "DRAFT" }, { status: "PENDING" }, { status: "RETURNED" }, { status: "APPROVED", seenByParentAt: null }, { status: "APPROVED", seenByParentAt: "2026-10-01" }], "c1");
    assert.deepEqual(L(f), [[R.frCounts, { d: 2, p: 1, r: 1, a: 2 }], [R.frUnread, { n: 1 }], [R.frNextReturned]]);
    assert.deepEqual(B(f), [["open", "/teacher/family-reports?status=RETURNED"], ["open", "/teacher/family-reports?status=DRAFT"], ["open", "/teacher/family-reports/this-week?classId=c1"]]);
    const w = RS.familyWeekSummary([{ studentId: "a", name: "Ali", minutes: 30, note: "Well done" }, { studentId: "b", name: "Badr", minutes: 0, note: null }, { studentId: "c", name: "Cy", minutes: 15, note: null }], "c1");
    assert.deepEqual(L(w), [[R.fwActive, { n: 2, total: 3, minutes: 45 }], [R.fwNone, { names: "Badr" }], [R.fwNotes, { n: 1 }], [R.fwNext]]);
    assert.deepEqual(B(w), [["open", "/api/family-week?classId=c1&lang=ar"], ["parent", "/teacher/students/b#comments"], ["practice", "/teacher/assignments?classId=c1"]]);
  });

  test("The student file (teacher) and the coordinator's read-only file", () => {
    const s = RS.studentFileSummary({ studentId: "s1", name: "Ali", classId: "c1", accuracy: 58, skills: [{ skillId: "k1", name: "Commas", score: 30 }, { skillId: "k2", name: "Verbs", score: 85 }], late: 2 });
    assert.deepEqual(L(s), [[S.stOverview, { name: "Ali", pct: 58 }], [R.stLate, { n: 2 }], [S.stStrong, { skills: "Verbs" }], [S.stWeak, { skills: "Commas" }], [S.stNextWeak, { skill: "Commas" }]]);
    assert.deepEqual(B(s), [["practice", "/teacher/skill-assign?skillId=k1&classId=c1"], ["lesson", "/teacher/learn/assign?kind=LESSON&skillId=k1&classId=c1&studentId=s1"], ["parent", "/teacher/students/s1#comments"]]);
    const lite = RS.studentFileLiteSummary({ id: "s1", name: "Ali", classId: "c1", practice: { accuracy: null }, skills: { strong: [{ name: "Verbs", pct: 88, answers: 10 }], weak: [{ name: "Commas", pct: 40, answers: 1 }] }, work: { late: 0 } });
    assert.deepEqual(L(lite), [[S.stNone, { name: "Ali" }], [S.stStrong, { skills: "Verbs" }], [S.stWeak0], [S.stNextKeep]], "1 answer is not enough to call a skill weak");
    assert.deepEqual(B(lite), [["plan", "/teacher/plans?tab=custom&classId=c1&who=student&sid=s1"], ["parent", "/teacher/students/s1#comments"]]);
  });

  test("MAP: growth report, results, grade and school overview", () => {
    const g = RS.mapGrowthSummary([{ id: "a", name: "Ali", reading: 210, language: null }, { id: "b", name: "Badr", reading: 195, language: null }, { id: "c", name: "Cy", reading: null, language: 200 }, { id: "d", name: "Dan", reading: 200, language: null }],
      { rows: [{ studentId: "a", name: "Ali", met: true }, { studentId: "b", name: "Badr", met: false }, { studentId: "d", name: "Dan", met: null }] }, { classId: "c1", subject: "READING" });
    assert.deepEqual(L(g), [[R.mpScores, { n: 3, total: 4, avg: 202 }], [R.mpMet, { names: "Ali" }], [R.mpNotMet, { names: "Badr" }], [R.mpLow, { names: "Badr (195), Dan (200), Ali (210)" }], [R.mpNextPlan]]);
    assert.deepEqual(B(g), [["plan", "/teacher/map-center?tab=plan&classId=c1&subject=READING"], ["parent", "/teacher/students/b#comments"]]);
    const none = RS.mapGrowthSummary([{ id: "a", name: "Ali", reading: null, language: 200 }], null, { classId: "c1", subject: "READING" });
    assert.deepEqual(L(none), [[R.mpNoScores], [R.mpNextUpload]]);
    assert.deepEqual(B(none), [["open", "/teacher/map-entry?classId=c1"]]);
    const res = RS.mapResultsSummary([
      { studentId: "a", name: "Ali", profile: { overall: { rit: 200 }, areas: [{ group: "G1", status: "FOCUS" }, { group: "G2", status: "MAINTAIN" }] } },
      { studentId: "b", name: "Badr", profile: { overall: { rit: 190 }, areas: [{ group: "G1", status: "FOCUS" }, { group: "G2", status: "FOCUS" }] } },
      { studentId: "c", name: "Cy", profile: { overall: { rit: 210 }, areas: [{ group: "G2", status: "FOCUS" }] } }], { classId: "c1", subject: "LANGUAGE", total: 4, areaName: (k) => (k === "G1" ? "Vocabulary" : "Literary") });
    assert.deepEqual(L(res), [[R.mpScores, { n: 3, total: 4, avg: 200 }], [R.mpLow, { names: "Badr (190), Ali (200), Cy (210)" }], [R.mpArea, { area: "Vocabulary", n: 2 }], [R.mpNextLow]]);
    assert.deepEqual(B(res), [["plan", "/teacher/map-center?tab=plan&classId=c1&subject=LANGUAGE"], ["group", "/teacher/intervention/groups?class=c1&students=b%2Ca%2Cc"], ["parent", "/teacher/students/b#comments"]]);
    const ov = RS.mapOverviewSummary({ classes: [{ classId: "c1", className: "5A", n: 20, meanRit: 205, national: 200, flagged: 1 }, { classId: "c2", className: "5B", n: 18, meanRit: 195, national: 200, flagged: 0 }, { classId: null, className: "6A", n: 0, meanRit: null, national: null, flagged: 0 }] }, { admin: true, classId: "c1", subject: "READING" });
    assert.deepEqual(L(ov), [[R.ovTested, { n: 38, c: 3 }], [R.ovAbove, { names: "5A" }], [R.ovBelow, { names: "5B" }], [R.ovFlags, { n: 1 }], [R.ovNext]]);
    assert.deepEqual(B(ov), [["plan", "/teacher/map-center?tab=plan&classId=c1&subject=READING"], ["followup", "/admin/teachers"], ["message", "/admin/messages"]]);
    const ov0 = RS.mapOverviewSummary({ classes: [] }, { admin: false, classId: "c1", subject: "READING" });
    assert.deepEqual(L(ov0), [[R.ovNone], [R.mpNextUpload]]);
    assert.deepEqual(B(ov0), [["open", "/teacher/map-entry?classId=c1"]]);
  });

  test("Admin: School Analytics, the department week, the end-of-term report (school / grade / class level)", () => {
    const a = RS.analyticsSummary({ kpis: { students: 100, activeWeek: 60 }, classes: [{ classId: "c1", name: "A", grade: 4, accuracy: 85 }, { classId: "c2", name: "B", grade: 5, accuracy: 50 }], grades: [{ grade: 4, accuracy: 85 }, { grade: 5, accuracy: 50 }], standards: [{ short: "RL.5.2", accuracy: 41 }] });
    assert.deepEqual(L(a), [[S.scOverview, { n: 2, avg: 68 }], [S.scWell, { names: "G4 · A" }], [S.scHelp, { names: "G5 · B" }], [S.scGrade, { grade: 5, pct: 50 }], [S.scNextHelp, { names: "G5 · B" }]]);
    assert.deepEqual(B(a), [["followup", "/admin/teachers"], ["open", "/teacher/classes/c2/analytics?period=SCHOOL_YEAR"], ["message", "/admin/messages"]]);
    const dept = { classes: [{ classId: "c1", className: "A", grade: 4, accuracy: 75, alertsOpen: 0 }, { classId: "c2", className: "B", grade: 5, accuracy: null, alertsOpen: 3 }], weakest: [{ grade: 4, skills: [{ skillId: "k1", name: "Commas", accuracy: 45 }] }, { grade: 5, skills: [] }], totals: { students: 40, active: 30, alertsOpen: 3 } };
    const d = RS.departmentWeekSummary(dept);
    assert.deepEqual(L(d), [[S.scOverview, { n: 1, avg: 75 }], [R.adActive, { a: 30, s: 40 }], [R.adAlerts, { n: 3 }], [S.weak, { skill: "Commas", pct: 45 }], [S.scNextKeep, { name: "G4 · A" }]]);
    assert.deepEqual(B(d), [["message", "/admin/messages"], ["followup", "/admin/teachers"]]);
    const t = RS.termReportSummary(dept, { measured: 10, met: 6 }); // r72: growthTotals(…) — each student once
    assert.deepEqual(L(t), [[S.scOverview, { n: 1, avg: 75 }], [R.adMapMet, { p: 60, m: 6, n: 10 }], [S.scWell0], [S.weak, { skill: "Commas", pct: 45 }], [S.scNextKeep, { name: "G4 · A" }]]);
  });
});

describe("fewer columns", () => {
  test("empty and constant columns are hidden; the first column and `keep` columns stay; rich cells count as different", () => {
    const el = h("b", null, "x");
    const rows = ["1", "2", "3"].map((id, i) => ({ id, cells: { n: `S${id}`, a: "—", b: "0/13", c: i * 10, d: el, e: "same" } }));
    assert.deepEqual(autoHidden([{ key: "n" }, { key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }, { key: "e", keep: true }], rows), ["a", "b"]);
    // with sort values: all 0 mastered → hidden even if the cell is a node
    const r2 = ["1", "2", "3"].map((id) => ({ id, cells: { n: id, m: el }, sort: { m: 0 } }));
    assert.deepEqual(autoHidden([{ key: "n" }, { key: "m" }], r2), ["m"]);
    // two rows: the same value is not "constant" yet; empty still is
    assert.deepEqual(autoHidden([{ key: "n" }, { key: "x" }, { key: "y" }], [{ cells: { n: "a", x: 5, y: null } }, { cells: { n: "b", x: 5, y: "" } }]), ["y"]);
  });

  test("standards: code + a short name (≤ 4 words), the full text kept for the tooltip", () => {
    assert.deepEqual(shortStandard("S12", "Real or not?"), { label: "S12 Real or not?", short: "Real or not?", full: "Real or not?" });
    const s = shortStandard("RL.4.1", "Refer to details and examples in a text when explaining what the text says explicitly.");
    assert.equal(s.label, "RL.4.1 Refer to details and…");
    assert.ok(s.short.split(" ").length <= 4);
    assert.equal(s.full, "Refer to details and examples in a text when explaining what the text says explicitly.");
    assert.equal(shortStandard("L.5.2", "Commas, ").label, "L.5.2 Commas");
  });

  test("every usual heading has its plain-words tooltip", () => {
    assert.equal(tipOf("Accuracy"), "Accuracy = % of answers that were right.");
    assert.equal(tipOf("Accuracy", "own hint"), "own hint");
    assert.equal(tipOf("Unknown heading"), null);
  });
});

describe("EN + AR", () => {
  const keys = [...new Set([...SUMMARY_KEYS, ...REPORT_SUMMARY_KEYS, ...COLUMN_KEYS])];
  test("every summary sentence, button label, tooltip and column word is an interface string with an Arabic text keeping its {vars}", () => {
    const known = new Set<string>(UI_STRINGS);
    const vars = (x: string) => [...x.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of keys) {
      assert.ok(known.has(k), `en.ts: ${k}`);
      const a = (ar as Record<string, string>)[k];
      assert.ok(a && a !== k, `ar.ts: ${k}`);
      assert.deepEqual(vars(a), vars(k), `same {vars}: ${k}`);
    }
    assert.ok(Object.keys(GLOSSARY).length >= 30);
  });
  test("no duplicate interface strings", () => {
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length);
  });
  test("no level words in the summaries (staff pages; and never a student's)", () => {
    for (const k of keys) assert.doesNotMatch(k, /\b(Approaching|Meeting|Exceeding|Below Level|On Level|Above Level)\b/, k);
  });
});

describe("components", () => {
  test("ReportSummary: the sentences and the action plan buttons, in English and Arabic", async () => {
    const { ReportSummary } = await import("../src/components/report-kit/report-summary");
    const s = RS.grammarClassSummary({ students: [{ studentId: "s1", name: "Ali", accuracy: 92 }, { studentId: "s2", name: "Badr", accuracy: 58 }], skills: [{ skillId: "k1", name: "Commas", accuracy: 50, answers: 12 }] }, "c1");
    const out = html(h(ReportSummary, { summary: s }));
    assert.match(out, /data-rk="summary"/);
    assert.match(out, /2 of 2 students have results; the average is 75%\./);
    assert.match(out, /Needs help \(below 60%\): Badr\./);
    assert.match(out, /Action plan/);
    assert.match(out, /href="\/teacher\/intervention\/groups\?class=c1&amp;students=s2" data-action="group"[^>]*>.*Make a small group \(1\)/);
    assert.match(out, /href="\/teacher\/students\/s2#comments" data-action="parent"[^>]*>.*Contact Badr&#x27;s parent/);
    const o2 = html(h(ReportSummary, { summary: s }), "ar");
    assert.match(o2, /خطة العمل/);
    assert.match(o2, /يحتاجون إلى مساعدة \(أقل من 60%\): Badr\./);
    assert.match(o2, /تواصل مع وليّ أمر Badr/);
  });

  test("ReportIntro and InfoTip", async () => {
    const { ReportIntro } = await import("../src/components/report-kit/report-intro");
    const { InfoTip, StandardLabel } = await import("../src/components/report-kit/info-tip");
    assert.match(html(h(ReportIntro, { text: "The rubric score (%) of each graded writing task, per student." })), /data-rk="intro".*What this shows.*The rubric score/);
    assert.match(html(h(ReportIntro, { text: "The rubric score (%) of each graded writing task, per student." }), "ar"), /ماذا يعرض هذا التقرير/);
    const tip = html(h(InfoTip, { text: GLOSSARY.Accuracy }));
    assert.match(tip, /role="tooltip"[^>]*>Accuracy = % of answers that were right\./);
    assert.match(tip, /aria-label="More information: Accuracy = % of answers that were right\."/);
    assert.match(html(h(InfoTip, { text: GLOSSARY.Accuracy }), "ar"), /الدقة = نسبة الإجابات الصحيحة\./);
    const std = html(h(StandardLabel, { code: "RL.4.1", text: "Refer to details and examples in a text when explaining" }));
    assert.match(std, /<b class="font-semibold">RL\.4\.1<\/b> Refer to details and…/);
    assert.match(std, /role="tooltip"[^>]*>Refer to details and examples in a text when explaining</);
  });

  test("ReportTable: More details (collapsed), hidden empty / constant columns named under the table, ⓘ on headings", async () => {
    const { ReportTable } = await import("../src/components/report-kit/report-table");
    const rows = ["1", "2", "3"].map((id, i) => ({ id, cells: { n: `S${id}`, acc: `${60 + i * 10}%`, m: "0/13", e: "—", x: i } }));
    const out = html(h(ReportTable, { label: "Students", cols: [{ key: "n", label: "Student" }, { key: "acc", label: "Accuracy", num: true }, { key: "m", label: "Skills mastered" }, { key: "e", label: "Empty" }, { key: "x", label: "Extra", more: true }], rows }));
    const heads = [...out.matchAll(/<th [^>]*>(.*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/[↕i]$/u, ""));
    assert.equal(heads.length, 2, `only Student and Accuracy: ${heads.join(" | ")}`);
    assert.match(out, /data-rk="more"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*data-rk="more"/);
    assert.match(out, /More details/);
    assert.match(out, /data-rk="hidden-cols">Not shown \(the same for every row\): Skills mastered, Empty</);
    assert.match(out, /role="tooltip"[^>]*>Accuracy = % of answers that were right\./, "the glossary's tooltip on Accuracy");
    assert.doesNotMatch(out, /0\/13/);
  });
});
