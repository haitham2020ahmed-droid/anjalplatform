/**
 * Reports redesign (screens): the shared on-screen report kit and its use on every teacher, student and admin
 * report page. Checks the kit (colour + text, aligned numbers, card layout, print), that every report page wears
 * it while still calling the same loaders (numbers unchanged), the interface words in English and Arabic, and the
 * print styles.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { classGrammarReport } from "../src/server/reports/grammar-report";
import { classProgress } from "../src/server/insights/progress";
import { schoolLevels } from "../src/server/reports/level-distribution";
import { I18nProvider } from "../src/i18n/client";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { AtAGlance } from "../src/components/report-kit/at-a-glance";
import { BandBar, Legend } from "../src/components/report-kit/bands";
import { Callout } from "../src/components/report-kit/callout";
import { Donut, SimpleBar, Sparkline } from "../src/components/report-kit/charts";
import { ReportTable } from "../src/components/report-kit/report-table";
import { BAND, pctBand, shares, toneOfPct } from "../src/components/report-kit/tokens";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const h = React.createElement;
const html = (el: React.ReactElement, lang: "en" | "ar" = "en") => renderToStaticMarkup(h(I18nProvider, { lang, children: el }));

/** Every on-screen report page → the loader(s) it must still call (the numbers come from them, untouched). */
const PAGES: Record<string, string[]> = {
  "src/app/teacher/reports/page.tsx": ["readableClasses"],
  // r67: Needs help merged into Mistakes and root causes; Student Progress into the student file (both redirect)
  "src/app/teacher/reports/errors/page.tsx": ["repeatedMistakes", "classErrors"],
  "src/app/teacher/reports/class/page.tsx": ["classMonth", "peerCompare"],
  "src/app/teacher/progress/page.tsx": ["classProgress"],
  "src/components/teacher/class-overview.tsx": [],
  "src/components/analytics/class-analytics.tsx": [],
  "src/app/teacher/curriculum-results/page.tsx": ["curriculumResults"],
  "src/app/teacher/practice-analytics/page.tsx": ["practiceAnalytics"],
  "src/app/teacher/assessments/page.tsx": ["teacherTests", "listTemplates"],
  "src/app/teacher/assessments/[testId]/page.tsx": ["testResults"],
  // MAP: one page (Results · Reports · Make a MAP plan); the old report routes redirect to its Reports tab
  "src/app/teacher/map-center/page.tsx": [],
  "src/app/teacher/map-center/reports-tab.tsx": ["reportsHub", "growthReport"],
  "src/app/teacher/map-center/overview.tsx": ["schoolOverview"],
  "src/app/teacher/grade-summary/page.tsx": ["gradeSummary"],
  "src/app/teacher/tiers/page.tsx": ["classTiers"],
  "src/app/teacher/data-meeting/page.tsx": ["dataMeetingSnapshot", "listDataMeetings"],
  "src/app/teacher/rti-plan/weekly/page.tsx": ["rtiWeeklyPlan"],
  "src/app/teacher/reports/grammar/page.tsx": ["classGrammarReport", "schoolGrammarReport"],
  "src/app/teacher/reports/grammar/[studentId]/page.tsx": ["studentGrammarReport"],
  "src/app/teacher/reports/readmaster/page.tsx": ["classReadMasterReport"],
  "src/app/teacher/reports/readmaster/[studentId]/page.tsx": ["studentReadMasterReport"],
  "src/app/teacher/readrise/page.tsx": ["classReport"],
  "src/app/teacher/reports/games/page.tsx": ["classGamesReport"],
  "src/app/teacher/reports/games-usage/page.tsx": ["gamesUsage"],
  "src/app/teacher/games/[gameId]/page.tsx": ["challengeResults"],
  "src/components/game/challenge-results.tsx": [],
  "src/app/teacher/students/[studentId]/page.tsx": ["teacherStudentData"],
  // the student's Progress Report (old /student/insights) is "My progress" inside My Reports now
  "src/app/student/reports/page.tsx": ["studentWeek", "streakAndPoints", "profilesOf", "risksOf", "nextStep"],
  "src/app/student/map/page.tsx": ["myMap", "programWork"],
  "src/app/admin/department/page.tsx": ["departmentSummary"],
  "src/app/admin/levels/page.tsx": ["schoolLevels"],
  "src/app/admin/data-health/page.tsx": ["dataHealth"],
  "src/app/admin/question-intelligence/page.tsx": ["intelligenceOverview"],
  "src/app/admin/tiers/page.tsx": ["schoolTierSummary"],
  "src/app/admin/term-report/page.tsx": ["departmentSummary", "growthReport"],
  "src/app/admin/performance/page.tsx": ["schoolPerformance"],
};

describe("report kit · pure rules", () => {
  test("bands: every colour has a mark and words; accuracy cut points match the report pages", () => {
    for (const [k, b] of Object.entries(BAND)) { assert.ok(b.mark.length > 0, `${k} has a mark`); assert.ok(b.label.length >= 2, `${k} has words`); assert.match(b.hex, /^#[0-9a-f]{6}$/); }
    // the same cut points as pctTone in src/components/reports/report-ui.tsx (80+ green, 60–79 amber, under 60 red)
    assert.match(read("src/components/reports/report-ui.tsx"), /v >= 80 \? "text-emerald-700" : v >= 60 \? "text-amber-700" : "text-red-700"/);
    assert.deepEqual([0, 59, 60, 79, 80, 100].map((v) => pctBand(v)), ["LOW", "LOW", "OK", "OK", "GOOD", "GOOD"]);
    assert.equal(pctBand(null), null); assert.equal(toneOfPct(null), "neutral"); assert.equal(toneOfPct(75, [75, 50]), "good");
  });

  test("shares add up to 100 and never invent a part (display only)", () => {
    assert.deepEqual(shares([1, 1, 1]), [34, 33, 33]);
    assert.equal(shares([46, 63, 91]).reduce((a, b) => a + b, 0), 100);
    assert.deepEqual(shares([0, 5, 0]), [0, 100, 0]);
    assert.deepEqual(shares([0, 0]), [0, 0]);
  });
});

describe("report kit · rendering", () => {
  test("AtAGlance shows the value as given, its meaning and a mark (never colour alone)", () => {
    const out = html(h(AtAGlance, { items: [{ label: "Accuracy", value: "59%", meaning: "of answers were right", tone: "bad" }, { label: "Answers", value: 11403 }] }));
    assert.match(out, /59%/); assert.match(out, /11403/); assert.match(out, /of answers were right/); assert.match(out, /At a glance/);
    assert.match(out, /aria-hidden="true" class="text-base">!</, "a mark next to a red number");
  });

  test("BandBar and Legend: colour + mark + words + count + %; an accessible text for the whole bar", () => {
    const out = html(h(BandBar, { label: "Levels", parts: [{ key: "BELOW", value: 46 }, { key: "ON", value: 63 }, { key: "ABOVE", value: 91 }] }));
    assert.match(out, /role="img" aria-label="Levels: Approaching 46 \(23%\), Meeting 63 \(32%\), Exceeding 91 \(45%\)"/);
    for (const w of ["Approaching", "Meeting", "Exceeding", "▼", "●", "▲"]) assert.ok(out.includes(w), w);
    const lg = html(h(Legend, { parts: [{ key: "T1", value: 15 }, { key: "T3", value: 25 }] }));
    assert.match(lg, /Tier 1/); assert.match(lg, /15 \(38%\)/);
  });

  test("charts are SVG / CSS with a text alternative and the numbers written out", () => {
    const sb = html(h(SimpleBar, { items: [{ label: "Theme", value: 45 }, { label: "Main idea", value: 85 }] }));
    assert.match(sb, /45%/); assert.match(sb, /85%/); assert.match(sb, />!</); assert.match(sb, />✓</);
    const sp = html(h(Sparkline, { values: [40, null, 60, 70], label: "Weekly accuracy" }));
    assert.match(sp, /<svg role="img" aria-label="Weekly accuracy: 40, –, 60, 70"/); assert.match(sp, /<polyline/);
    const dn = html(h(Donut, { label: "Levels now", center: 200, parts: [{ key: "BELOW", value: 46 }, { key: "ON", value: 154 }] }));
    assert.match(dn, /<circle/); assert.match(dn, /46 \(23%\)/);
  });

  test("ReportTable: sticky-header box, aligned numbers, card labels for phones, sort buttons, rows in the given order", () => {
    const out = html(h(ReportTable, {
      label: "Students", cols: [{ key: "n", label: "Student" }, { key: "a", label: "Accuracy", num: true }],
      rows: [{ id: "1", cells: { n: "TEST Zed", a: "40%" }, flag: "bad" }, { id: "2", cells: { n: "TEST Amy", a: "90%" } }],
    }));
    assert.match(out, /class="rk-box rk-cards/); assert.match(out, /<th scope="col" class="rk-num/);
    assert.match(out, /data-label="Accuracy" class="rk-num/); assert.match(out, /<button type="button" class="rk-sort">/);
    assert.ok(out.indexOf("TEST Zed") < out.indexOf("TEST Amy"), "default order is the loader's order");
    assert.match(out, /rk-flag-bad/);
    assert.match(html(h(ReportTable, { label: "x", cols: [{ key: "n", label: "Student" }], rows: [], empty: "No students match." })), /No students match\./);
  });

  test("Arabic interface: the kit's words turn Arabic; names and numbers stay as given", () => {
    const out = html(h(Callout, { kind: "next", items: ["Keep the daily practice going.", "TEST Yara Mansour"] }), "ar");
    assert.match(out, /الخطوة التالية/); assert.match(out, /استمروا على التدريب اليومي/); assert.match(out, /TEST Yara Mansour/);
    assert.match(html(h(AtAGlance, { items: [{ label: "Accuracy", value: "72%" }] }), "ar"), /نظرة سريعة[\s\S]*72%/);
  });
});

describe("report pages wear the kit and keep their loaders", () => {
  test("every report page uses the kit (header, at-a-glance or table) and still calls the same loaders", () => {
    for (const [file, loaders] of Object.entries(PAGES)) {
      const src = read(file);
      assert.match(src, /report-kit/, `${file} imports the report kit`);
      assert.match(src, /<(ReportHeader|AtAGlance|ReportTable|ReportSection)\b/, `${file} uses the kit`);
      for (const l of loaders) assert.match(src, new RegExp(`\\b${l}\\(`), `${file} still calls ${l}`);
    }
  });

  test("decisions first on teacher pages; explanations on student pages", () => {
    for (const f of ["src/app/teacher/reports/grammar/page.tsx", "src/app/teacher/progress/page.tsx", "src/components/teacher/class-overview.tsx", "src/app/teacher/reports/games/page.tsx", "src/app/admin/department/page.tsx"]) {
      const src = read(f);
      assert.match(src, /kind="help"/, `${f}: who needs help`); assert.match(src, /kind="next"/, `${f}: next step`);
      const glance = src.indexOf("<AtAGlance");
      assert.ok(glance > 0 && src.indexOf('kind="help"', glance) > 0 && src.indexOf('kind="help"', glance) < src.indexOf("<ReportTable", glance), `${f}: decisions come before the tables`);
    }
    for (const f of ["src/app/student/reports/page.tsx", "src/app/student/map/page.tsx"]) assert.match(read(f), /kind="meaning"/, `${f}: what this means`);
  });

  test("ReadRise is never called a Lexile on its report (the median is a ReadRise Level, an estimate)", () => {
    const src = read("src/app/teacher/readrise/page.tsx");
    assert.match(src, /"Median ReadRise Level"/); assert.doesNotMatch(src, /"ReadRise Lexile/);
  });

  test("no chart library: the kit draws with SVG and CSS only", () => {
    for (const f of readdirSync(join(ROOT, "src/components/report-kit"))) assert.doesNotMatch(read(`src/components/report-kit/${f}`), /from "(chart\.js|recharts|d3|victory|apexcharts)/, f);
  });

  test("print: a clean page with the header and no menus, filters or buttons", () => {
    const css = read("src/app/globals.css");
    assert.match(css, /report kit \(src\/components\/report-kit\)/);
    const print = css.slice(css.indexOf("/* paper: no menus"));
    for (const r of [/\.rk-filters, \[data-rk="print"\] \{ display: none !important; \}/, /max-height: none !important/, /\.rk-box thead \{ display: table-header-group; \}/, /\.lg\\:ps-64 \{ padding-inline-start: 0 !important; \}/]) assert.match(print, r);
    assert.match(css, /@media \(max-width: 639\.98px\)[\s\S]*content: attr\(data-label\)/, "phones: every row is a card");
    assert.match(read("src/components/report-kit/report-header.tsx"), /Printed \{date\}/);
    assert.match(read("src/components/app-shell.tsx"), /print:hidden/);
  });

  test("interface words in English and Arabic: report kit section right after games (part 1)", () => {
    const en = read("src/i18n/en.ts"), arSrc = read("src/i18n/ar.ts");
    const g = en.indexOf("// ---- games (part 1)"), k = en.indexOf("// ---- report kit"), w = en.indexOf("// ---- wave-1 pages");
    assert.ok(g > 0 && g < k && k < w, "en.ts: games (part 1) → report kit → wave-1");
    assert.ok(arSrc.indexOf("// ---- games (part 1)") < arSrc.indexOf("// ---- report kit"));
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length, "no duplicate interface strings");
    for (const s of ["What this means", "Next step", "Who needs help", "At a glance", "Printed {date}", "Approaching", "Tier 3", "Last {n} days", "Median ReadRise Level"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(s), s);
      assert.match(ar[s as keyof typeof ar], /[؀-ۿ]/, `${s} has Arabic`);
    }
    assert.equal(ar["Printed {date}" as keyof typeof ar].includes("{date}"), true, "placeholders kept");
  });
});

describe("loader equivalence (Test School)", () => {
  let repo: SqliteRepo, admin: Actor, t1: Actor, classA = "";
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: ROOT, passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    t1 = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    classA = String((await readableClasses(repo, t1))[0].id);
  });

  test("loaders give the same numbers on a second call, and the kit shows them exactly", async () => {
    const now = new Date(Date.UTC(2026, 9, 14, 9));
    const g1 = await classGrammarReport(repo, t1, classA, { days: 30, now }), g2 = await classGrammarReport(repo, t1, classA, { days: 30, now });
    assert.deepEqual(g1.summary, g2.summary);
    const p1 = await classProgress(repo, t1, classA, "READING"), p2 = await classProgress(repo, t1, classA, "READING");
    assert.deepEqual(p1.summary, p2.summary);
    const l1 = await schoolLevels(repo, admin), l2 = await schoolLevels(repo, admin);
    assert.deepEqual(l1.overall, l2.overall);
    const out = html(h(AtAGlance, { items: [
      { label: "Practised", value: `${g1.summary.practised} / ${g1.summary.students}` },
      { label: "On track", value: String(p1.summary.onTrack) },
      { label: "Approaching the standard", value: `${l1.overall.pctNow.below ?? 0}%` },
    ] }));
    assert.ok(out.includes(`${g1.summary.practised} / ${g1.summary.students}`));
    assert.ok(out.includes(`>${p1.summary.onTrack}<`));
    assert.ok(out.includes(`${l1.overall.pctNow.below ?? 0}%`));
    const bar = html(h(BandBar, { parts: [{ key: "BELOW", value: l1.overall.now.below }, { key: "ON", value: l1.overall.now.on }, { key: "ABOVE", value: l1.overall.now.above }] }));
    assert.ok(bar.includes(`Approaching ${l1.overall.now.below} (`), "the counts are the loader's");
  });
});
