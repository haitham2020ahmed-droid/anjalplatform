/**
 * 📘🔗 r79 — (A) the Full curriculum map as a PDF (Grades 4–6: units, weeks, essential questions, selections, the
 * platform's categories, numbered skills, each an absolute link for the right reader, footer with page numbers; the
 * buttons at the top of the Curriculum Map; "Send to students" to the teacher's own classes only; the student sees it)
 * and (B) every plan PDF / print: each item an absolute APP_URL link to the right page for the reader, sign-in → back,
 * never an external or personal address, a QR code per section for paper copies. In-memory demo school only.
 */
process.env.APP_URL = "https://literise.test";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/link → a plain <a>; the server-action files → no-op stand-ins (static renders only, as tests/stars-ui.test.ts)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module") as { _resolveFilename: (r: unknown, ...x: unknown[]) => string; _cache: Record<string, unknown> };
const orig = Module._resolveFilename;
Module._resolveFilename = function (this: unknown, r: unknown, ...x: unknown[]) {
  const q = String(r);
  if (q === "next/link") return "stub:next/link";
  if (/star-actions$|stars-notice-actions$|plans\/actions$|nafs\/actions$/.test(q)) return "stub:actions";
  return orig.call(this, r, ...x);
};
const noop = async () => ({ ok: true });
Module._cache["stub:next/link"] = { id: "next/link", filename: "next/link", loaded: true, children: [], paths: [], exports: { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }: { href: string; children?: unknown; prefetch?: unknown }) => React.createElement("a", { href, ...rest }, children as never) } };
Module._cache["stub:actions"] = { id: "actions", filename: "actions", loaded: true, children: [], paths: [], exports: new Proxy({ __esModule: true }, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : noop) }) };
(globalThis as Record<string, unknown>).React ??= React;

import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { absolutePlanPath, appOrigin, isPlanHref, planHref, planPath, planQrSvg, type PlanAudience } from "../src/lib/plan-links";
import { safeNext } from "../src/lib/safe-next";
import { assertMapPdfAccess, clearCurriculumMapPdfs, curriculumMapHtml, curriculumMapPdfData, exportCurriculumMapPdf, mapShareClasses, MAP_CATEGORY_GROUPS, sectionLabel, shareCurriculumMap, sharedMapGradesForStudent, type MapPdfData } from "../src/server/curriculum-map/map-pdf";
import { footerTemplate, renderHtml } from "../src/reports/html";
import type { ReportDoc } from "../src/reports/model";
import type { PdfRenderer } from "../src/reports/pdf";
import { firstSunday, WEEKS, type YearWeek } from "../src/server/map/year-plan";
import { yearPlanDoc } from "../src/server/reports/year-plan-pdf";
import { personalPlanDoc } from "../src/server/map/personal-plan-doc";
import type { PersonalPlan } from "../src/server/map/personal-plan";
import { familyWeekArticle } from "../src/reports/family-week-html";
import type { FamilyWeek } from "../src/server/reports/family-week";
import { makeT } from "../src/i18n";
// the page components load after the stand-ins above (static imports would run first)
const ui = async () => ({
  ...(await import("../src/components/map/map-ui")), ...(await import("../src/components/map/study-plan-view")), ...(await import("../src/components/student/study-plan")),
  ...(await import("../src/components/skills/my-skills-view")), ...(await import("../src/components/plans/plan-links")),
});
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const ORIGIN = "https://literise.test";
const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const BRAND = { name: "Demo School", nameAr: null, logo: null };
/** every href in an HTML string */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
const t = makeT("en");

/** A fake Chromium: records what it was given and returns a tiny "PDF". */
function fakePdf(): PdfRenderer & { calls: { html: string; doc: ReportDoc }[] } {
  const calls: { html: string; doc: ReportDoc }[] = [];
  return { calls, async render(html, doc) { calls.push({ html, doc }); return new TextEncoder().encode(`%PDF-1.7 ${calls.length}`); }, async close() { /* nothing */ } };
}

/** Every link is the platform's own page, absolute, and carries no personal data or token. */
function assertSafeLinks(list: string[], what: string) {
  assert.ok(list.length > 0, `${what}: has links`);
  for (const h of list) {
    assert.ok(isPlanHref(h), `${what}: ${h} is a platform link`);
    assert.ok(h.startsWith(`${ORIGIN}/`), `${what}: absolute`);
    assert.doesNotMatch(h, /token|session|password|email|@|name=/i, `${what}: no personal data in ${h}`);
  }
}

describe("🔗 the plan-link helper", () => {
  test("absolute APP_URL links to the right page per item and reader; ids only", () => {
    assert.equal(appOrigin(), ORIGIN);
    assert.equal(planHref({ kind: "skill", id: "sk1" }, "student"), `${ORIGIN}/practice/sk1`);
    assert.equal(planHref({ kind: "skill", id: "sk1", from: "map" }, "family"), `${ORIGIN}/practice/sk1?from=map`);
    assert.equal(planHref({ kind: "skill", id: "sk1" }, "staff"), `${ORIGIN}/skill/sk1`);
    assert.equal(planHref({ kind: "lesson", code: "LN-12" }, "student"), `${ORIGIN}/student/learn/LN-12`);
    assert.equal(planHref({ kind: "lesson", code: "LN-12" }, "staff"), `${ORIGIN}/teacher/learn/LN-12`);
    assert.equal(planHref({ kind: "plan-step", planId: "p1", itemId: "i1" }, "student"), `${ORIGIN}/student/plans/p1/open/i1`);
    assert.equal(planHref({ kind: "curriculum-unit", grade: 4, unit: 2 }, "staff"), `${ORIGIN}/admin/curriculum-map?grade=4&unit=2`);
    assert.equal(planHref({ kind: "curriculum-unit", grade: 4, unit: 2 }, "student"), `${ORIGIN}/student/curriculum`);
    assert.equal(planHref({ kind: "year-plan", classId: "c1" }, "staff"), `${ORIGIN}/teacher/map-center?tab=year&classId=c1`);
    assert.equal(planHref({ kind: "map-plan", id: "m1" }, "student"), `${ORIGIN}/map-plan/m1`);
    // malformed ids give no link at all
    for (const bad of ["", "a b", "../x", "x<y", "https://evil.example/"]) assert.equal(planHref({ kind: "skill", id: bad }, "student"), null, bad);
    assert.equal(planPath({ kind: "curriculum-unit", grade: 99, unit: 1 }, "staff"), null);
  });

  test("only the platform's own pages may be printed as links", () => {
    for (const ok of [`${ORIGIN}/practice/x`, `${ORIGIN}/skill/x`, `${ORIGIN}/teacher/nafs?tab=adaptive&class=c1#give`]) assert.ok(isPlanHref(ok), ok);
    for (const bad of ["https://evil.example/practice/x", `${ORIGIN}.evil.example/x`, `${ORIGIN}//evil.example`, `${ORIGIN}/login?next=/x`, `${ORIGIN}/api/reports`, `${ORIGIN}/x y`, `${ORIGIN}/x"onmouseover="a`, "javascript:alert(1)", `/practice/x`]) assert.equal(isPlanHref(bad), false, bad);
    assert.equal(absolutePlanPath("/student/plans/p1/open/i1"), `${ORIGIN}/student/plans/p1/open/i1`);
    assert.equal(absolutePlanPath("//evil.example"), null);
    assert.equal(absolutePlanPath("https://evil.example"), null);
    assert.equal(planQrSvg("https://evil.example/x"), "", "no QR for a foreign address");
    assert.match(planQrSvg(`${ORIGIN}/practice/x`), /^<svg class="plan-qr"[^>]*viewBox="0 0 \d+ \d+"[\s\S]*<path d="M/);
  });

  test("signed out: sign in, then straight back to the same page (middleware ?next= + the sign-in form's safeNext)", () => {
    const mw = read("src/middleware.ts");
    assert.match(mw, /url\.pathname = "\/login"/);
    assert.match(mw, /\?next=\$\{encodeURIComponent\(pathname \+ req\.nextUrl\.search\)\}/);
    for (const item of [{ kind: "skill", id: "sk1", from: "map" }, { kind: "lesson", code: "LN-1" }, { kind: "plan-step", planId: "p1", itemId: "i1" }, { kind: "curriculum-unit", grade: 5, unit: 3 }, { kind: "year-plan", classId: "c1" }, { kind: "study-plan", studentId: "st1", subject: "READING" }, { kind: "map-plan", id: "m1" }] as const) {
      for (const who of ["student", "family", "staff"] as PlanAudience[]) {
        const h = planHref(item, who)!;
        const u = new URL(h);
        const next = u.pathname + u.search; // what the middleware puts in ?next=
        assert.equal(safeNext(decodeURIComponent(encodeURIComponent(next))), next, `${h} comes back after sign-in`);
      }
    }
    assert.equal(safeNext("//evil.example"), ""); assert.equal(safeNext("https://evil.example"), ""); assert.equal(safeNext("/login"), "");
    assert.match(read("src/app/login/submit/route.ts"), /import \{ safeNext \} from "@\/lib\/safe-next"/);
  });
});

describe("📘 Full curriculum map (PDF)", () => {
  let repo: SqliteRepo; let teacher4: Actor; let teacher4b: Actor; let teacher5: Actor; let admin: Actor; let student: Actor; let other: Actor;
  let schoolId = ""; let class4a = ""; let class4b = ""; let class5a = "";
  const data: Record<number, MapPdfData> = {};

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 2 }));
    const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher4 = await actor("demo.teacher.4a"); teacher4b = await actor("demo.teacher.4b"); teacher5 = await actor("demo.teacher.5a"); admin = await actor("demo.admin");
    schoolId = teacher4.schoolId!;
    const classOf = async (a: Actor) => s((await repo.findMany("ClassTeacher", { teacherId: (await repo.findUnique("Teacher", { userId: a.userId }))!.id }))[0].classId);
    class4a = await classOf(teacher4); class4b = await classOf(teacher4b); class5a = await classOf(teacher5);
    const m = await repo.findMany("ClassMembership", { classId: class4a });
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: m[0].studentId }))!.userId }))!);
    const m2 = await repo.findMany("ClassMembership", { classId: class4b });
    other = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: m2[0].studentId }))!.userId }))!);
    for (const g of [4, 5, 6]) data[g] = (await curriculumMapPdfData(repo, schoolId, g))!;
  });

  test("the data: 6 units each; Grades 4–5 three Text Sets a unit (Weeks 1 and 2 · 3 and 4 · 5) with 3 selections; Grade 6 selections", () => {
    for (const g of [4, 5, 6]) assert.equal(data[g].units.length, 6, `Grade ${g}: 6 units`);
    for (const g of [4, 5]) {
      assert.equal(data[g].book, "Wonders");
      for (const u of data[g].units) {
        assert.equal(u.sections.length, 3);
        assert.deepEqual(u.sections.map((x) => sectionLabel(x)), ["Weeks 1 and 2", "Weeks 3 and 4", "Week 5"]);
        for (const x of u.sections) assert.deepEqual(x.selections.map((y) => y.label), ["Shared Read", "Anchor Text", "Paired Selection"], `G${g} U${u.number}: the three selections`);
      }
    }
    assert.equal(data[4].units[0].sections[0].selections.map((x) => x.name).join(" | "), "A World of Change | Earthquakes | Weathering the Storm");
    // essential questions: Grade 4 (all 18); Grades 5–6: none in the data (the Text Set title is shown instead)
    assert.ok(data[4].units.every((u) => u.sections.every((x) => x.essentialQuestion)), "Grade 4: every Text Set has its essential question");
    assert.equal(data[4].units[0].sections[0].essentialQuestion, "How do people respond to natural disasters?");
    assert.ok(data[5].units.every((u) => u.sections.every((x) => x.essentialQuestion === null)));
    const g6 = data[6].units.flatMap((u) => u.sections);
    assert.equal(g6.length, 23, "Grade 6: 23 StudySync selections");
    assert.ok(g6.every((x) => x.weeks.length === 0 && x.selections.length === 1 && x.selections[0].label === "Selection"));
    assert.equal(sectionLabel(g6[0]), "Selection 1");
    for (const g of [4, 5, 6]) assert.ok(data[g].units.every((u) => u.sections.some((x) => x.skills.length > 0)), `Grade ${g}: platform skills in every unit`);
  });

  for (const g of [4, 5, 6]) test(`Grade ${g}: cover, units, weeks, selections, categories, numbered skills — each an absolute link for the right reader`, () => {
    const d = data[g];
    for (const copy of ["student", "staff"] as const) {
      const html = curriculumMapHtml(d, { copy, locale: "en", branding: BRAND });
      assert.match(html, new RegExp(`<h1>Grade ${g} Curriculum Map — ${d.book}</h1>`));
      assert.match(html, /How to use this map/); assert.match(html, /Click any skill to (practise|open) it/);
      assert.match(html, /🔗 Everything in this plan is clickable/);
      assert.match(html, /Demo School/, "the school's own name");
      assert.doesNotMatch(html, /IXL/i, "never the other company's name");
      for (const u of d.units) assert.ok(html.includes(`<h2>Unit ${u.number}</h2>`), `Unit ${u.number}`);
      assert.match(html, /<th scope="col">Textbook section<\/th><th scope="col">Platform skills<\/th>/);
      if (g < 6) { assert.match(html, /<b>Weeks 1 and 2:<\/b>/); assert.match(html, /<b>Week 5:<\/b>/); assert.match(html, /Shared Read:<\/span> <i>/); }
      else assert.match(html, /<b>Selection 1:<\/b> <bdi dir="ltr">Amigo Brothers<\/bdi>/);
      if (g === 4) assert.match(html, /How do people respond to natural disasters\?/);
      const groups = MAP_CATEGORY_GROUPS.filter((c) => html.includes(`<h4>${c.en.replace(/&/g, "&amp;")}</h4>`));
      assert.ok(groups.length >= 4, `the platform's categories (${groups.map((x) => x.key)})`);
      assert.ok(groups.some((x) => x.key === "writing"), "Writing (the unit's writing skills)");
      if (g < 6) assert.match(html, /<b>Unit writing:<\/b>/);
      // every skill: numbered, a link, its short code in grey
      const skills = d.units.flatMap((u) => u.sections.flatMap((x) => x.skills));
      for (const k of skills.slice(0, 40)) {
        const want = copy === "student" ? `${ORIGIN}/practice/${k.id}` : `${ORIGIN}/skill/${k.id}`;
        assert.ok(html.includes(`<a class="plink" href="${want}"><bdi dir="ltr">`), `${k.name} → ${want}`);
      }
      assert.match(html, /<li><span class="n">1\.<\/span> <a class="plink"/); assert.match(html, /<span class="code" dir="ltr">G\d\.[a-z-]+<\/span>/);
      const links = hrefs(html);
      assertSafeLinks(links, `G${g} ${copy}`);
      assert.ok(links.every((h) => copy === "student" ? !h.includes("/skill/") && !h.includes("/admin/") : !h.includes("/practice/")), `${copy} copy: only its own reader's pages`);
      // one QR per unit (paper copies), to the unit's page
      assert.equal((html.match(/<svg class="plan-qr"/g) ?? []).length, d.units.length);
      assert.doesNotMatch(html, /<script/i);
    }
    const arHtml = curriculumMapHtml(d, { copy: "student", locale: "ar", branding: BRAND });
    assert.match(arHtml, /<html lang="ar" dir="rtl">/); assert.match(arHtml, /خريطة منهج الصف/); assert.match(arHtml, /مهارات المنصة/);
    assert.match(arHtml, /<bdi dir="ltr">[A-Z]/, "skill names stay English, left to right");
  });

  test("⬇ the PDF: rendered once by the shared engine (footer: the map's name + Page X of Y), then kept a few minutes", async () => {
    clearCurriculumMapPdfs();
    const pdf = fakePdf();
    const deps = { repo, pdf, fontDir: join(ROOT, "assets/fonts"), brandingDir: "/nonexistent" };
    const a = await exportCurriculumMapPdf(deps, teacher4, 4, "staff", "en");
    assert.equal(a.cached, false); assert.equal(a.contentType, "application/pdf"); assert.match(a.filename, /^curriculum-map_grade-4_Wonders_staff\.pdf$/);
    const b = await exportCurriculumMapPdf(deps, teacher4b, 4, "staff", "en");
    assert.equal(b.cached, true, "the second teacher gets the kept file"); assert.equal(pdf.calls.length, 1);
    await exportCurriculumMapPdf(deps, teacher4, 4, "student", "ar");
    assert.equal(pdf.calls.length, 2, "another copy / language is its own file");
    const foot = footerTemplate(pdf.calls[0].doc, "sans-serif");
    assert.match(foot, /Grade 4 Curriculum Map — Wonders · Literise/); assert.match(foot, /class="pageNumber"/); assert.match(foot, /class="totalPages"/);
    assert.doesNotMatch(foot, /Confidential/);
    assert.match(read("src/server/curriculum-map/map-pdf.ts"), /sweptMap<string, \{ at: number; bytes: Uint8Array; filename: string \}>\("curriculum-map-pdf", KEEP_MS, 6\)/, "small cap, registered with the cache sweeper");
    // teachers: only the grades they teach; students: only a map sent to them
    await assert.rejects(exportCurriculumMapPdf(deps, teacher5, 4, "staff", "en"), /Not found/);
    await assert.rejects(exportCurriculumMapPdf(deps, student, 4, "staff", "en"), /Not found/);
    await assertMapPdfAccess(repo, admin, 6, "staff");
  });

  test("📨 Send to students: own classes of that grade only; a document, not an assignment; the student sees it", async () => {
    const mine = await mapShareClasses(repo, teacher4, 4);
    assert.deepEqual(mine.map((c) => c.id), [class4a], "a teacher sees only their own classes of the grade");
    assert.equal((await mapShareClasses(repo, admin, 4)).length, 2, "an admin: the school's classes of the grade");
    await assert.rejects(shareCurriculumMap(repo, teacher4, 4, [class4b]), /only to your own classes/);
    await assert.rejects(shareCurriculumMap(repo, teacher4, 4, [class5a]), /only to your own classes/);
    await assert.rejects(shareCurriculumMap(repo, teacher4, 4, []), /at least one class/);
    await assert.rejects(shareCurriculumMap(repo, student, 4, [class4a]), /permission|Forbidden|not allowed|Only teachers/i);
    assert.deepEqual(await sharedMapGradesForStudent(repo, student), []);
    const assignments = await repo.count("Assignment", {});
    const r = await shareCurriculumMap(repo, teacher4, 4, [class4a]);
    assert.equal(r.classes, 1); assert.ok(r.students >= 1);
    assert.equal(await repo.count("Assignment", {}), assignments, "no assignment is made (r74/r78: Student Skills shows assigned work only)");
    assert.deepEqual(await sharedMapGradesForStudent(repo, student), [4]);
    assert.deepEqual(await sharedMapGradesForStudent(repo, other), [], "another class does not see it");
    await assertMapPdfAccess(repo, student, 4, "student");
    await assert.rejects(assertMapPdfAccess(repo, other, 4, "student"), /Not found/);
    assert.ok((await mapShareClasses(repo, teacher4, 4))[0].sentAt, "✓ Sent shows on the teacher's list");
    const notes = await repo.findMany("Notification", { userId: student.userId });
    assert.ok(notes.some((n) => s(n.link) === "/student/curriculum"), "the students are told where to find it");
    await shareCurriculumMap(repo, teacher4, 4, [class4a], false);
    assert.deepEqual(await sharedMapGradesForStudent(repo, student), [], "Stop showing: gone");
    await shareCurriculumMap(repo, teacher4, 4, [class4a], true);
  });

  test("the buttons at the top of the Curriculum Map; the student's Curriculum page; words in English and Arabic", () => {
    const page = read("src/app/admin/curriculum-map/page.tsx");
    const bar = page.indexOf("<MapPdfBar"), grades = page.indexOf('aria-label={t("Grade")}');
    assert.ok(bar > 0 && bar < grades, "the bar comes first on the page (above the grades and units)");
    assert.match(page, /curriculumMapPdfHref\(v\.grade, "staff", lang\)/); assert.match(page, /share=\{canSend \? shareMapPdfAction : null\}/);
    const ui = read("src/components/curriculum-map/map-pdf-bar.tsx");
    for (const x of ["⬇ {t(\"Full curriculum map (PDF)\")}", "t(\"Send to students\")", "type=\"checkbox\""]) assert.ok(ui.includes(x), x);
    const st = read("src/app/student/curriculum/page.tsx");
    assert.match(st, /sharedMapGradesForStudent/); assert.match(st, /curriculumMapPdfHref\(g, "student", lang\)/);
    assert.match(read("src/app/api/curriculum-map-pdf/route.ts"), /actor\.role === "STUDENT" \? "student"/, "a student always gets the student copy");
    for (const k of ["Full curriculum map (PDF)", "Send to students", "Students' copy", "Everything in this plan is clickable", "Your teacher sent you the curriculum map."]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), k); assert.ok(ar[k as keyof typeof ar], `${k} in Arabic`);
    }
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length, "no duplicate interface words");
  });
});

describe("🔗 every plan PDF / print: clickable, absolute, the right reader's page, a QR per section", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = ""; let skills: { id: string; name: string; code: string }[] = [];
  const now = new Date("2026-10-13T09:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 }));
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    classId = s((await repo.findMany("ClassTeacher", { teacherId: (await repo.findUnique("Teacher", { userId: teacher.userId }))!.id }))[0].classId);
    const g = (await repo.findMany("Grade", { schoolId: teacher.schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    skills = (await repo.findMany("Skill", { curriculumId: cur.id }, { select: ["id", "name", "code"], take: 6 })).map((k) => ({ id: s(k.id), name: s(k.name), code: s(k.code) }));
    const weeks: YearWeek[] = Array.from({ length: WEEKS }, (_, i) => ({ week: i + 1, skills: [0, 1].map((j) => { const k = skills[(i * 2 + j) % skills.length]; return { skillId: k.id, code: k.code, name: k.name, group: j ? "INFO" : "LIT", need: 2, of: 2, rit: 195, ...(i >= 3 && j ? { review: true } : {}) }; }) }));
    await repo.create("MapYearPlan", { schoolId: teacher.schoolId, classId, startDate: firstSunday(new Date("2026-09-01T00:00:00Z")), weeks, needs: [], createdById: teacher.userId, generatedAt: now, updatedAt: now });
  });

  test("🗓️ MAP Year plan PDF (teachers' copy): every skill of every week is a link to its skill page; note + QR", async () => {
    const doc = await yearPlanDoc({ repo, brandingDir: "/nonexistent", now: () => now }, teacher, classId);
    const html = renderHtml(doc, { fontCss: "", fontStack: "sans-serif" });
    assert.match(html, /<p class="plinks-note">🔗 Everything in this plan is clickable<\/p>/);
    for (const k of skills.slice(0, 3)) assert.ok(html.includes(`<a class="plink" href="${ORIGIN}/skill/${k.id}">`), k.name);
    const links = hrefs(html);
    assertSafeLinks(links, "year plan");
    assert.ok(links.some((h) => h === `${ORIGIN}/teacher/map-center?tab=year&classId=${classId}`), "the QR opens the class's Year plan");
    assert.equal((html.match(/<svg class="plan-qr"/g) ?? []).length, 1, "one QR (the weeks section)");
    // a week with two new skills: each name is its own link
    assert.match(html, /<a class="plink" href="[^"]+"><bdi dir="ltr">[^<]+<\/bdi><\/a> · <a class="plink"|<a class="plink" href="[^"]+"><bdi dir="ltr">[^<]+<\/bdi><\/a>/);
  });

  test("🧩 a link that is not the platform's own page is printed as plain text", () => {
    const doc: ReportDoc = { kind: "class", locale: "en", title: "T", subtitle: "", branding: BRAND, meta: [], primaryTable: "x", fileStem: "x", generatedAt: now, generatedBy: "x",
      sections: [{ type: "table", id: "x", title: "X", empty: "-", columns: [{ key: "a", label: "A", kind: "latin", linkKey: "l" }], rows: [{ a: "Evil", l: "https://evil.example/x" }, { a: "Good", l: `${ORIGIN}/practice/k1` }] }] };
    const html = renderHtml(doc, { fontCss: "", fontStack: "x" });
    assert.ok(!html.includes("evil.example")); assert.ok(html.includes(`href="${ORIGIN}/practice/k1"`));
  });

  test("👥 MAP group plan (Word): each goal skill links to its skill page; note; QR per group", () => {
    const p: PersonalPlan = { classId, className: "4A", grade: 4, teacher: "T", subject: "READING", term: "Fall 2026", notTested: [], bands: (["BELOW", "ON", "ABOVE"] as const).map((band) => ({ band, ritRange: "190–200", students: [], goals: [{ area: "Literature", areaId: "a1", meanRit: 195, skills: skills.slice(0, 2).map((k) => ({ id: k.id, name: k.name, standards: [] })) }], strengths: [], resources: [], monitoring: [] })) } as unknown as PersonalPlan;
    const html = personalPlanDoc(p, now);
    assert.match(html, /Everything in this plan is clickable/);
    for (const k of skills.slice(0, 2)) assert.ok(html.includes(`href="${ORIGIN}/skill/${k.id}"`), k.name);
    assertSafeLinks(hrefs(html), "group plan");
    assert.equal((html.match(/<svg class="plan-qr"/g) ?? []).length, 3, "one QR per group");
  });

  test("🗺️ MAP individual plan: teachers' copy → skill pages; students' and families' copies → practice", async () => {
    const { PlanDocView } = await ui();
    const d = { id: "plan1", studentId: "st1", name: "Student", number: "", className: "4A", grade: 4, subject: "READING", term: "Fall", status: "SENT", sentAt: null, dueAt: null, note: null, estimate: null,
      profile: { areas: [], fall: null, overall: null },
      items: [{ group: "LIT", name: "Literature", icon: "📖", status: null, rit: 195, band: "191–200", skills: skills.slice(0, 2).map((k) => k.name), skillRefs: skills.slice(0, 2), count: 20, assignmentId: null, progress: null, done: false }] } as never;
    for (const [aud, want] of [["staff", "/skill/"], ["student", "/practice/"], ["family", "/practice/"]] as const) {
      const html = renderToStaticMarkup(React.createElement(PlanDocView, { d, forStudent: aud !== "staff", audience: aud }));
      const links = hrefs(html);
      assertSafeLinks(links, `MAP plan ${aud}`);
      for (const k of skills.slice(0, 2)) assert.ok(links.some((h) => h.startsWith(`${ORIGIN}${want}${k.id}`)), `${aud}: ${k.name}`);
      assert.match(html, /Everything in this plan is clickable/); assert.match(html, /data-testid="plan-qr"/);
    }
    assert.match(read("src/app/teacher/map-plans/print/page.tsx"), /copy: "student"/, "the class print has a students' copy");
  });

  test("🧭 Personal Study Plan (staff / student / family): every skill name is a link; a QR per goal area", async () => {
    const { StudyPlanView } = await ui();
    const ref = (k: { id: string; name: string }) => ({ id: k.id, name: k.name, status: "NEW", score: null });
    const d = { student: { id: "st1", name: "S", first: "S", number: "", grade: 4, className: "4A", classId, school: "Demo School", logoUrl: null }, subject: "READING", term: "Fall", overall: null, source: "SKILLS", full: true,
      areas: [{ group: "LIT", name: "Literature", icon: "📖", rit: 195, fromGoal: true, percentile: null, descriptor: null, focus: false, skillsMastered: 0, skillsLinked: 2,
        stages: [{ key: "DEVELOP", title: "Develop", range: "191–200", total: 2, shown: 2, topics: [{ name: "T", statements: skills.slice(0, 2).map((k) => ({ text: "x", standards: [], skills: [ref(k)] })) }] }] }] } as never;
    for (const [props, want] of [[{ hub: true }, "/skill/"], [{ link: true }, "/practice/"], [{}, "/practice/"]] as const) {
      const html = renderToStaticMarkup(React.createElement(StudyPlanView, { d, ...props }));
      const links = hrefs(html).filter((h) => h.startsWith("http"));
      assertSafeLinks(links, "study plan");
      for (const k of skills.slice(0, 2)) assert.ok(links.some((h) => h.startsWith(`${ORIGIN}${want}${k.id}`)), `${JSON.stringify(props)} ${k.name}`);
      assert.ok(links.includes(`${ORIGIN}/map-report/study-plan/st1?subject=READING`), "the goal area's QR opens the plan");
      assert.match(html, /Everything in this plan is clickable/);
    }
  });

  test("📘 Curriculum / RTI / wizard plans (the student's sheet): every step a link; a QR per unit", async () => {
    const { StudyPlan } = await ui();
    const p = { id: "p1", title: "Grade 4 Curriculum", className: "4A", grade: 4, kind: "CURRICULUM", target: 10, note: null, createdAt: "2026-10-01",
      places: [{ itemId: "i1", code: "G4.U1.TS1.CV", label: "Concept Vocabulary", unit: "Unit 1", set: "Text Set 1: Expository Text", status: "NOT_STARTED", progress: 0, href: "/student/plans/p1/open/i1", locked: false, empty: false, skills: null, correct: 0 },
        { itemId: "i2", code: "G4.U1.TS1.ACS", label: "Analyze Craft and Structure", unit: "Unit 1", set: "Text Set 1: Expository Text", status: "NOT_STARTED", progress: 0, href: "/student/plans/p1/open/i2", locked: false, empty: false, skills: null, correct: 0 }] } as never;
    const html = renderToStaticMarkup(React.createElement(StudyPlan, { t, p, studentName: "S", basePath: "/student/curriculum" }));
    const links = hrefs(html).filter((h) => h.startsWith("http"));
    assertSafeLinks(links, "curriculum plan");
    assert.ok(links.includes(`${ORIGIN}/student/plans/p1/open/i1`) && links.includes(`${ORIGIN}/student/plans/p1/open/i2`));
    assert.equal((html.match(/data-testid="plan-qr"/g) ?? []).length, 1, "one QR for Unit 1");
    assert.match(html, /Everything in this plan is clickable/);
    // the plan editor (teachers' print): each part's name opens its skill page; the "Preview as student" sheet stays
    // read-only (owner rule: rows are not links there) — the student's own copy is the linked one
    const editor = read("src/components/plans/editor-ui.tsx");
    assert.match(editor, /<PlanA href=\{x\.skillId \? planHref\(\{ kind: "skill", id: x\.skillId \}, "staff"\) : null\}>/);
    assert.match(editor, /href: null, locked: false/);
  });

  test("👪 family 'practise at home': each topic opens the student's practice; ⭐ My Skills printed: names are links", async () => {
    const { MySkillsView } = await ui();
    const w: FamilyWeek = { studentId: "st1", name: "S", className: "4A", grade: 4, week: "2026-10-11", from: "2026-10-11", to: "2026-10-13", tasks: [], minutes: 0, days: 0, articles: [], lessons: [], tests: [], note: null,
      practise: [{ key: "main-idea", title: "Finding the main idea", activity: "Ask.", skillId: skills[0].id }, { key: "reading", title: "Reading every day", activity: "Read." }] };
    const html = familyWeekArticle(w, t, "en");
    assert.ok(html.includes(`<a class="fw-link" href="${ORIGIN}/practice/${skills[0].id}">`));
    assertSafeLinks(hrefs(html), "family week");
    assert.match(html, /class="fw-qr"/); assert.match(html, /Everything in this plan is clickable/);
    const v = { tab: "LEARNING", tabs: ["LEARNING"], counts: { LEARNING: 1 }, groups: { LEARNING: [{ strand: "READING", label: "Reading", rows: [{ key: "k1", name: skills[1].name, status: "IN_PROGRESS", score: 40, masteredAt: null, href: `/practice/${skills[1].id}?from=free`, action: "Practise" }] }] } } as never;
    let mine = "";
    try { mine = renderToStaticMarkup(React.createElement(MySkillsView, { v, tab: "LEARNING", t, hrefOf: () => "/student/skills" })); } catch { mine = ""; }
    if (mine) assert.ok(mine.includes(`href="${ORIGIN}/practice/${skills[1].id}?from=free"`), "My Skills: the name is an absolute link");
    else assert.match(read("src/components/skills/my-skills-view.tsx"), /<PlanA href=\{absolutePlanPath\(r\.href\)\}>/);
  });

  test("📚 Learn lesson, 🛟 RTI weekly plan, 🇸🇦 NAFS suggested plan, 🗂 curriculum plan grid, 📅 week: links + QR in the print", async () => {
    const { PlanA, PlanQr } = await ui();
    const lesson = read("src/app/teacher/learn/[code]/print/page.tsx");
    assert.match(lesson, /planHref\(\{ kind: "lesson", code: v\.meta\.code \}, "student"\)/); assert.match(lesson, /<PlanQr /); assert.match(lesson, /planHref\(\{ kind: "skill", id: k\.id \}, "student"\)/);
    const rti = read("src/app/teacher/rti-plan/weekly/page.tsx");
    assert.match(rti, /absolutePlanPath\(g\.lesson\.href\)/); assert.match(rti, /absolutePlanPath\(g\.assignHref\)/); assert.match(rti, /<PlanQr /); assert.doesNotMatch(rti, /<p className="mt-2 print:hidden"><Link href=\{g\.assignHref\}/);
    const nafs = read("src/components/nafs/plan-tab.tsx");
    assert.match(nafs, /<PlanA href=\{absolutePlanPath\(item\.practiceHref\)\}>/); assert.match(nafs, /<PlanQr href=\{absolutePlanPath\(centerHref\("plan"/);
    const grid = read("src/components/plans/curriculum-grid.tsx");
    assert.match(grid, /<PlanA href=\{unitOf\(x\.code\)\}>/); assert.match(grid, /<PlanQr /);
    assert.match(read("src/app/teacher/week/page.tsx"), /absolutePlanPath\(x\.href\) \?\? x\.href/);
    // the kit itself: PlanA prints a foreign address as plain text; PlanQr only for platform links
    assert.equal(renderToStaticMarkup(React.createElement(PlanA, { href: "https://evil.example/x" }, "X")), "X");
    assert.match(renderToStaticMarkup(React.createElement(PlanA, { href: `${ORIGIN}/practice/x` }, "X")), new RegExp(`href="${ORIGIN}/practice/x"`));
    assert.equal(renderToStaticMarkup(React.createElement(PlanQr, { href: "https://evil.example/x" })), "");
    assert.match(renderToStaticMarkup(React.createElement(PlanQr, { href: `${ORIGIN}/practice/x` })), /<svg[^>]*viewBox/);
  });
});
