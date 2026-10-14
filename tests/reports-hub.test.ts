/**
 * 📊 The Reports hub (owner r67: "organise everything, especially REPORTS — nothing exists twice"):
 *   four groups (My class · Students · Programs · Follow-up), every card opens ONE page and no two cards open the same
 *   page, the merged pages redirect their old addresses, the teacher's week in two lines on top. Pure + source checks.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HUB_LINKS, hubCards, matchReport, MOVED_REPORTS, openReportUrl, REPORT_CATEGORIES, REPORTS, reportByKey } from "../src/components/teacher/report-catalog";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (s: string) => (UI_STRINGS as readonly string[]).includes(s) && Boolean((ar as Record<string, string>)[s]);
const pathOf = (u: string) => u.split("?")[0];
function routeExists(url: string): boolean {
  let dir = join(ROOT, "src/app");
  for (const seg of pathOf(url).split("/").filter(Boolean)) {
    if (existsSync(join(dir, seg))) { dir = join(dir, seg); continue; }
    const dyn = readdirSync(dir).find((x) => x.startsWith("["));
    if (!dyn) return false;
    dir = join(dir, dyn);
  }
  return existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "route.ts"));
}
const hrefOf = (c: ReturnType<typeof hubCards>[number]) => (c.link ? c.link.href("c1") : openReportUrl(c.report!, { classId: "c1", firstStudent: "s1" })!);

describe("📊 Reports hub: four groups, nothing twice", () => {
  test("the four groups, in order, each with cards", () => {
    assert.deepEqual(REPORT_CATEGORIES.map((c) => c.key), ["My class", "Students", "Programs", "Follow-up"]);
    const cards = hubCards({ nafs: true });
    for (const c of REPORT_CATEGORIES) assert.ok(cards.some((x) => x.category === c.key), c.key);
    const keys = (cat: string) => cards.filter((x) => x.category === cat).map((x) => x.key);
    for (const k of ["class-progress", "skills-grid", "errors", "class-dashboard", "curriculum-results", "grammar", "practice"]) assert.ok(keys("My class").includes(k), `My class: ${k}`);
    assert.deepEqual(keys("Students"), ["student-file"], "the ONE student file");
    for (const k of ["map-profile", "map-groups", "map-study-plans", "map-growth", "map-overview", "nafs-reports", "readrise-growth", "learn-results", "writing", "fluency"]) assert.ok(keys("Programs").includes(k), `Programs: ${k}`);
    for (const k of ["early-warning", "alerts", "interventions", "family-reports"]) assert.ok(keys("Follow-up").includes(k), `Follow-up: ${k}`);
    assert.equal(keys("My class")[0], "class-progress", "the class against itself first");
  });

  test("no duplicates: one card per key and per page; the merged cards are gone", () => {
    const cards = hubCards({ nafs: true });
    assert.equal(new Set(cards.map((c) => c.key)).size, cards.length, "one card per key");
    // MAP reports share the MAP page with a view: the page + its view/subject is the identity
    const pages = cards.map((c) => { const u = hrefOf(c); return c.key.startsWith("map-") ? u : pathOf(u); });
    assert.equal(new Set(pages).size, pages.length, `no two cards open the same page: ${pages.join(" ")}`);
    for (const k of ["student-progress", "needs-help", "family-progress"]) assert.equal(reportByKey(k), undefined, `${k} was merged`);
    assert.equal(new Set([...REPORTS.map((r) => r.key), ...HUB_LINKS.map((l) => l.key)]).size, REPORTS.length + HUB_LINKS.length);
    assert.ok(!hubCards({ nafs: false }).some((c) => c.key === "nafs-reports"), "NAFS only for Grade 6 teachers (and admins)");
    assert.equal(reportByKey("family-reports")!.send, true, "Send to family lives on Family Reports");
  });

  test("every card opens a real page (the Skills grid arrives with the skill-status work) and is translated", () => {
    for (const c of hubCards({ nafs: true })) {
      const u = hrefOf(c);
      if (c.link?.pending) assert.equal(pathOf(u), "/teacher/reports/skills-grid");
      else assert.ok(routeExists(u), `${c.key}: ${u}`);
      assert.ok(hasAr(c.title) && hasAr(c.hint), c.key);
    }
    for (const c of REPORT_CATEGORIES) assert.ok(hasAr(c.key) && hasAr(c.hint), c.key);
    assert.equal(openReportUrl(reportByKey("student-file")!, { classId: "c1", firstStudent: "s9" }), "/teacher/students/s9");
    assert.equal(matchReport("/teacher/students/s9", "")?.report.key, "student-file", "the report bar knows the student file");
    assert.equal(matchReport("/teacher/reports/class", "?classId=c2")?.at.classId, "c2");
    assert.equal(matchReport("/teacher/reports/errors", "?classId=c2")?.report.key, "errors");
  });

  test("old addresses redirect to the one page that has them now", () => {
    const redirects: [string, RegExp][] = [
      ["src/app/teacher/progress/[studentId]/page.tsx", /redirect\(`\/teacher\/students\/\$\{encodeURIComponent\(studentId\)\}`\)/],
      ["src/app/admin/student-file/[studentId]/page.tsx", /redirect\(`\/teacher\/students\/\$\{encodeURIComponent\(studentId\)\}`\)/],
      ["src/app/admin/student-file/[studentId]/view/page.tsx", /redirect\(`\/teacher\/student-view\?/],
      ["src/app/admin/student-file/page.tsx", /redirect\(`\/teacher\/students\/\$\{id\}`\)/],
      ["src/app/teacher/reports/needs-help/page.tsx", /redirect\(`\/teacher\/reports\/errors/],
      ["src/app/teacher/intervention/page.tsx", /redirect\(`\/teacher\/alerts\?\$\{new URLSearchParams\(\{ view: "flags"/],
      ["src/app/teacher/family-reports/weekly/page.tsx", /redirect\(`\/teacher\/family-reports\/this-week/],
    ];
    for (const [f, re] of redirects) assert.match(read(f), re, f);
    for (const [k, to] of Object.entries(MOVED_REPORTS)) { assert.equal(reportByKey(k), undefined, k); assert.ok(routeExists(to), to); }
    assert.equal(MOVED_REPORTS["needs-help"], "/teacher/reports/errors");
    assert.equal(MOVED_REPORTS["student-progress"], "/teacher/students");
    // every student name opens the one file; nothing links the old pages any more
    assert.match(read("src/components/teacher/student-list.tsx"), /href=\{`\/teacher\/students\/\$\{x\.id\}`\}/);
    for (const f of ["src/app/teacher/students/[studentId]/page.tsx", "src/app/teacher/reports/early-warning/page.tsx", "src/components/teacher/repeated-mistakes.tsx"]) {
      assert.doesNotMatch(read(f), /href=\{`\/admin\/student-file\/|\/teacher\/progress\/\$\{(r\.)?studentId\}[`#]/, f);
    }
    assert.match(read("src/app/teacher/alerts/page.tsx"), /<FlagsView /, "Who Needs Help lives in Alerts");
    assert.match(read("src/app/teacher/students/[studentId]/comment-actions.ts"), /redirect\(`\/teacher\/students\/\$\{studentId\}\?msg=/, "comments and notes moved into the file");
    assert.doesNotMatch(read("src/app/teacher/students/page.tsx"), /\/teacher\/intervention"/, "one Alerts button");
    assert.match(read("docs/WHAT-MOVED-WHERE.md"), /r67: the Reports hub in four groups/);
  });

  test("the hub page: the four groups from the catalogue and the week in two lines", () => {
    const page = read("src/app/teacher/reports/page.tsx");
    assert.match(page, /hubCards\(\{ nafs: /);
    assert.match(page, /weeklySummary\(repo, actor\)/);
    assert.match(page, /This week: \{stars\} new stars · \{review\} students need review · weakest class skill: \{skill\}/);
    assert.match(page, /redirect\(url\)/, "?report=… still opens the report");
    assert.match(page, /MOVED_REPORTS\[sp\.report\]/);
  });
});
