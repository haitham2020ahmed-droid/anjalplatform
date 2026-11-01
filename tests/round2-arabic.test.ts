/**
 * Round 2 · Arabic: the teacher / parent report views send their interface words through t() (cookie i18n), so the
 * Arabic interface shows no hard-coded English label — and the parent report shows the summary in the reader's
 * language. Names, skill names and question content stay as written (never through t()).
 *
 * A recording t() marks every word it is given with "§": a label that is still hard-coded shows up unmarked.
 */
import "./helpers/page-render"; // stand-ins for server-only / next/headers / next/link (import first)
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeT, type Lang, type TFn } from "../src/i18n";
import type * as PRV from "../src/components/insights/parent-report-view";
import type * as FV from "../src/components/map/family-view";
import type * as CO from "../src/components/teacher/class-overview";
import type * as SD from "../src/components/teacher/student-detail";
import type { ParentReport } from "../src/server/insights/parent-report";
import type { FamilyDoc } from "../src/server/map/map-reports";
import type { ClassOverview, StudentDetail } from "../src/server/teacher/queries";

// the request's language (src/i18n/server.ts reads the signed-in user / cookie): a stand-in set per test, so the
// components' own default path (no `t` passed) is exercised too
const cur: { lang: Lang } = { lang: "ar" };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Mod = require("module") as { _cache: Record<string, unknown> };
const serverFile = join(process.cwd(), "src/i18n/server.ts");
Mod._cache[serverFile] = { id: serverFile, filename: serverFile, loaded: true, children: [], paths: [],
  exports: { getLang: async () => cur.lang, getT: async () => ({ lang: cur.lang, dir: cur.lang === "ar" ? "rtl" : "ltr", t: makeT(cur.lang) }) } };
/* eslint-disable @typescript-eslint/no-require-imports */
const { ParentReportView, summaryIn } = require("../src/components/insights/parent-report-view") as typeof PRV;
const { FamilyView } = require("../src/components/map/family-view") as typeof FV;
const { ClassOverviewView } = require("../src/components/teacher/class-overview") as typeof CO;
const { StudentDetailView } = require("../src/components/teacher/student-detail") as typeof SD;
/* eslint-enable @typescript-eslint/no-require-imports */

const fill = (s: string, v?: Record<string, string | number>) => (v ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m)) : s);
function recorder() {
  const keys: string[] = [];
  const t: TFn = (s, v) => { keys.push(s); return `§${fill(s, v)}`; };
  return { t, keys };
}
const render = (el: unknown) => renderToStaticMarkup(el as React.ReactElement);

const report: ParentReport = {
  studentId: "s1", name: "Omar Ali", grade: 5, className: "5A", date: "2026-11-01",
  summary: { en: "Omar is doing well this month.", ar: "عمر يتقدم جيدًا هذا الشهر." },
  practice: { answers: 40, accuracy: 80, minutesMonth: 55, tasksDone: 3, tasksLate: 1 },
  completed: ["Main idea"], strengths: [], practiseNext: ["Inference"],
  map: [{ subject: "Reading", fall: 200, latest: 205, latestTerm: "Winter 2026", target: 210, status: "On track" }],
  badges: [{ icon: "🏅", name: "First star" }],
  share: { shared: true, sharedAt: null, note: "Great effort" },
  mapPlans: [{ id: "p1", subject: "Reading", term: "Winter 2026", goal: 210, items: [{ name: "Vocabulary", icon: "📚", skills: ["Context clues"], progress: null, done: false }] }],
  comments: [{ body: "Keep reading.", author: "Ms A", date: "2026-10-30", about: null }],
} as unknown as ParentReport;

describe("round 2 · Arabic interface words on the teacher / parent reports", () => {
  test("parent report: the summary follows the interface language (summary.ar in Arabic)", async () => {
    assert.equal(summaryIn(report.summary, "ar"), report.summary.ar);
    assert.equal(summaryIn(report.summary, "en"), report.summary.en);
    assert.equal(summaryIn({ en: "x", ar: "" }, "ar"), "x", "no Arabic copy → English");
    const { t } = recorder();
    const ar = render(await ParentReportView({ r: report, t, lang: "ar" }));
    assert.ok(ar.includes(report.summary.ar) && !ar.includes(report.summary.en), "Arabic reader sees the Arabic summary");
    const en = render(await ParentReportView({ r: report, t, lang: "en" }));
    assert.ok(en.includes(report.summary.en) && !en.includes(report.summary.ar));
  });

  test("parent report without an explicit t: reads the request's language (Arabic summary, Arabic words)", async () => {
    cur.lang = "ar";
    const ar = render(await ParentReportView({ r: report }));
    assert.ok(ar.includes(report.summary.ar), "Arabic summary from the request language");
    const known = makeT("ar")("Strengths");
    assert.ok(ar.includes(known), "a word already in the Arabic list is shown in Arabic");
    cur.lang = "en";
    const en = render(await ParentReportView({ r: report }));
    assert.ok(en.includes(report.summary.en) && en.includes("Strengths"));
    cur.lang = "ar";
  });

  test("parent report: every label goes through t(); names, skills and comments do not", async () => {
    const { t, keys } = recorder();
    const html = render(await ParentReportView({ r: report, t, lang: "ar" }));
    for (const k of ["Progress report", "Questions answered", "Correct", "Practice this month", "Tasks finished", "Skills Completed", "Strengths", "Practise Next", "We will see them soon.", "MAP Test", "What is MAP Growth?", "MAP Plan", "Teacher Comments", "Badges", "Teacher:"]) {
      assert.ok(keys.includes(k), `t("${k}")`);
      assert.ok(html.includes(`§${k}`), `${k} rendered through t()`);
    }
    for (const content of ["Omar Ali", "Main idea", "Inference", "Keep reading.", "Vocabulary"]) assert.ok(!keys.includes(content), `${content} stays as written`);
    for (const bare of [/>Questions answered</, />✅ Skills Completed</, /[^§]Progress report ·/]) assert.doesNotMatch(html, bare, "no bare English label");
  });

  test("family report (MAP): headings, table headers and questions go through t()", async () => {
    const doc: FamilyDoc = {
      student: { id: "s1", name: "Omar Ali", first: "Omar", number: "77", grade: 5, className: "5A", classId: "c1", school: "Test School", logoUrl: null },
      term: "Fall 2026", note: null, practice: { answers: 10, accuracy: 70, minutes: 30, mastered: 2, days: 4 },
      subjects: [{ subject: "READING" as never, name: "Reading", latest: { rit: 205, term: "Fall 2026", grade: 5, percentile: 55, percentileFromFile: true, descriptor: "Avg" }, points: [], growth: null, goal: { target: 212, term: "Spring 2027" }, areas: [{ name: "Vocabulary", icon: "📚", rit: 200, descriptor: "LoAvg" }], fallRit: 205, classAvgRit: 203 }],
    };
    const { t, keys } = recorder();
    const html = render(await FamilyView({ d: doc, highlights: [], t, lang: "ar" }));
    for (const k of ["Family Report", "What is this report?", "Practice on the platform · last 30 days", "Days practised", "Goal areas", "Level", "How can I use this information to help my child?", "Does my child need extra help in a specific area?", "Summary", "Student Name:", "Fall RIT Score", "National Average RIT", "Growth appears after the next MAP test (it compares two tests).", "{n} Percentile", "Goal for {term}:"]) {
      assert.ok(keys.includes(k), `t("${k}")`);
    }
    assert.ok(!/>Family Report</.test(html) && !html.includes(">Subject<"), "no bare English heading");
    assert.ok(html.includes("§55 Percentile"), "Arabic: the percentile is a plain number (no 55th)");
  });

  test("class overview and student detail: every label goes through t()", async () => {
    const o = {
      classId: "c1", className: "5A", grade: 5,
      kpis: { students: 2, activeStudents: 1, questions: 10, accuracyPct: 70, avgMastery: null, minutes: 75, skillsMastered: 1, needSupport: 1, stars: { mastered: 1, inProgress: 0, needsReview: 0 } },
      groups: { Intervention: [], Developing: ["Omar"], Meeting: [], Advanced: [] },
      students: [{ studentId: "s1", name: "Omar", group: "Developing", placement: null, avgMastery: null, skillsMastered: 0, answered: 3, accuracyPct: null, minutes: 5, openAlerts: 1 }],
      weakSkills: [{ skillId: "k", key: "k", name: "Main idea", avgMastery: 30, students: 3, mastered: 1, needsHelp: 1 }], strongSkills: [],
      hardQuestions: [{ questionId: "q", ref: "r", stem: "Which is the main idea?", skill: "Main idea", attempts: 4, accuracyPct: 25 }],
      alerts: [{ id: "a1", studentId: "s1", message: "Omar needs help", rule: "x", createdAt: "2026-10-30", nextAction: "Meet Omar" }],
    } as unknown as ClassOverview;
    const c = recorder();
    await ClassOverviewView({ o, assignments: [{ id: "as1", title: "Unit 1", dueAt: null, targetMastery: 80, counts: { COMPLETED: 1, IN_PROGRESS: 0, NOT_STARTED: 1, OVERDUE: 0 } }] as never, heatMap: null, t: c.t });
    for (const k of ["Progress and growth", "New assignment", "Next step:", "Mark as handled", "No students", "Students Who May Need Support", "Groups", "Developing", "Skills to Reteach", "Hardest Questions for This Class", "Student", "Not taken", "No due date", "{h} h {m} min", "Reteach"]) assert.ok(c.keys.includes(k), `class overview: t("${k}")`);
    for (const content of ["Omar", "Main idea", "Which is the main idea?"]) assert.ok(!c.keys.includes(content), `${content} stays as written`);

    const d = {
      name: "Omar", grade: 5, className: "5A", studentNumber: "77",
      alerts: [{ id: "a1", message: "Omar needs help", nextAction: "Meet Omar" }], placement: null,
      skills: [{ key: "k", name: "Main idea", band: "Learning", score: 40, attempts: 5, accuracyPct: 60, star: { status: "LEARNING", score: 40, level: 1, answered: 5, needsSupport: false, masteredAt: null, reviewDueAt: null } }],
      recent: [{ at: "2026-10-30T10:00:00Z", skill: "Main idea", stem: "Q?", answer: "B", correct: false, rapid: true, seconds: 3 }],
      decisions: [{ at: "2026-10-30T10:00:00Z", correct: true, fromTheta: 0, toTheta: 0.2, masteryBefore: 30, masteryAfter: 40, reason: "Next item" }],
    } as unknown as StudentDetail;
    const s = recorder();
    await StudentDetailView({ d, classHref: "/teacher/classes/c1", t: s.t });
    for (const k of ["Back to class", "Next step:", "Placement", "Not taken yet.", "Skills Practised", "Recent Answers", "When", "Result", "Incorrect", "very fast", "Why the Platform Chose Each Question", "correct", "mastery {from} → {to}"]) assert.ok(s.keys.includes(k), `student detail: t("${k}")`);
    for (const content of ["Omar", "Main idea", "Next item"]) assert.ok(!s.keys.includes(content), `${content} stays as written`);
  });

  test("class page: the buttons, unit picker and Open Plans go through t(); the class report's peer line in Arabic is built from t()", () => {
    const page = readFileSync(join(process.cwd(), "src/app/teacher/classes/[classId]/page.tsx"), "utf8");
    for (const k of ["Quick snapshot", "Download Accounts", "Upload Roster", "Open Plans", "Unit {n}", "Choose unit"]) assert.ok(page.includes(`t("${k}"`), `class page: t("${k}")`);
    assert.match(page, /badgeOf=\{badgeOf\} t=\{t\}/, "the page hands its t() to the overview");
    const rep = readFileSync(join(process.cwd(), "src/app/teacher/reports/class/page.tsx"), "utf8");
    assert.match(rep, /lang === "ar"[\s\S]*peerSentence\(t, r\)/, "Arabic readers get the peer line through t()");
  });
});
