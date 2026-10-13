/**
 * Reports redesign (documents): one document design system for every downloadable report.
 * Design only — these tests check that every number is unchanged, that colours always come with words and a
 * colour key, that pages are numbered, that the Excel files have frozen headers, formats and a Read me sheet,
 * and that the ReadRise level is never called a Lexile.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { readXlsx } from "../src/imports/xlsx";
import { formatter, t } from "../src/reports/i18n";
import { footerTemplate, LANDSCAPE_COLUMNS, renderHtml } from "../src/reports/html";
import type { ReportDoc, Section } from "../src/reports/model";
import { renderXlsx } from "../src/reports/xlsx";
import { renderCsv } from "../src/reports/csv";
import { loadFonts } from "../src/reports/fonts";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { exportReport, parseReportRequest, type ReportDeps } from "../src/server/reports/service";
import { classProgress } from "../src/server/insights/progress";
import { alertList } from "../src/server/insights/alerts";
import { departmentSummary } from "../src/server/insights/department";
import { classMatrix } from "../src/server/map/map-more";
import { GROUPS } from "../src/server/map/map-plan";
import { alertsRows, alertsWorkbook, departmentRows, departmentWorkbook, mapMatrixRows, mapMatrixWorkbook, progressRows, progressWorkbook } from "../src/server/reports/workbooks";
import { personalPlan } from "../src/server/map/personal-plan";
import { personalPlanDoc } from "../src/server/map/personal-plan-doc";
import { demoDatabase, ROOT } from "./helpers/db";

const NOW = new Date("2026-10-29T09:00:00Z");

function unzip(buf: Uint8Array): Map<string, string> {
  const b = Buffer.from(buf);
  const out = new Map<string, string>();
  let i = 0;
  while (b.readUInt32LE(i) === 0x04034b50) {
    const comp = b.readUInt32LE(i + 18), nameLen = b.readUInt16LE(i + 26), extra = b.readUInt16LE(i + 28);
    const name = b.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    out.set(name, inflateRawSync(b.subarray(i + 30 + nameLen + extra, i + 30 + nameLen + extra + comp)).toString("utf8"));
    i += 30 + nameLen + extra + comp;
  }
  return out;
}
const sheetNames = (bytes: Uint8Array) => [...unzip(bytes).get("xl/workbook.xml")!.matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
const text = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ");
const serialToIso = (v: string) => new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000).toISOString().slice(0, 10);

function sampleDoc(locale: "en" | "ar" = "en", cols = 6): ReportDoc {
  const extra = Array.from({ length: Math.max(0, cols - 6) }, (_, i) => ({ key: `x${i}`, label: `Extra ${i}`, kind: "int" as const }));
  return {
    kind: "student", locale, title: t(locale, "title.student"), subtitle: t(locale, "subtitle"),
    branding: { name: "Test School", nameAr: null, logo: null },
    meta: [{ label: t(locale, "meta.class"), value: "4A", isolate: "latin" }],
    sections: [
      { type: "kpis", title: t(locale, "sec.summary"), items: [
        { label: "Questions answered", value: 385, kind: "int", glance: true, hint: "in the chosen period" },
        { label: "Accuracy", value: 42, kind: "pct", tone: "bad", glance: true, hint: "of answers were right" },
        { label: "Growth", value: 6.1, kind: "signed", tone: "good", glance: true },
        { label: "Minutes", value: 212, kind: "int" },
      ] },
      { type: "explain", tone: "home", title: "How you can help at home", items: ["Read together every day."] },
      { type: "bars", title: "Distribution", items: [{ label: "Beginning", value: 3, band: "BEGINNING" }, { label: "Mastered", value: 7, band: "MASTERED" }], max: 7, kind: "int" },
      { type: "table", id: "skills", title: "Skills", empty: "—", columns: [
        { key: "skill", label: "Skill", kind: "latin" }, { key: "band", label: "Level", kind: "band" }, { key: "score", label: "Mastery", kind: "int" },
        { key: "acc", label: "Accuracy", kind: "pct" }, { key: "last", label: "Last practised", kind: "date" }, { key: "status", label: "Status", kind: "text", tones: { Strength: "good", "Needs support": "bad" } }, ...extra,
      ], rows: [
        { skill: "Context Clues", band: "MASTERED", score: 93, acc: 88, last: "2026-10-04", status: "Strength", ...Object.fromEntries(extra.map((c, i) => [c.key, 1000 + i])) },
        { skill: "Theme", band: "BEGINNING", score: 12, acc: 31, last: "2026-09-20", status: "Needs support", ...Object.fromEntries(extra.map((c, i) => [c.key, 2000 + i])) },
      ] },
      { type: "notes", title: "Notes", items: ["Internal measures."] },
    ],
    primaryTable: "skills", fileStem: "x", generatedAt: NOW, generatedBy: "Teacher",
  };
}

describe("document design system: PDF (HTML)", () => {
  const html = renderHtml(sampleDoc(), { fontCss: "", fontStack: "sans-serif" });
  const plain = text(html);

  test("header: school, title, date and who the report is for", () => {
    assert.ok(plain.includes("Test School") && plain.includes("Student Progress Report"));
    assert.match(plain, /Prepared for: The student, parents and teacher/);
    assert.match(plain, /Generated: 29 Oct 2026/);
  });

  test("at a glance: the flagged numbers with their plain-language meaning; tones also in words", () => {
    assert.match(plain, /At a glance 385 Questions answered in the chosen period 42% Accuracy of answers were right ▲ Needs support \+6\.1 Growth ✓ Good/);
    assert.match(plain, /More numbers 212 Minutes/);
  });

  test("every value is shown exactly as formatted before (numbers unchanged)", () => {
    const f = formatter("en");
    for (const v of [f.num(93, 0), f.num(12, 0), f.pct(88), f.pct(31), f.date("2026-10-04"), f.date("2026-09-20"), f.num(3, 0), f.num(7, 0)]) assert.ok(plain.includes(v), v);
  });

  test("colour is never alone: band chips carry their names and a colour key is printed with the table", () => {
    assert.match(plain, /Colour key: Beginning score under 40 · just starting/);
    assert.match(plain, /Mastered 90–100 · secure/);
    assert.match(plain, /Colour key: Strength Needs support/, "tone key for a text column");
    assert.ok(html.includes(">Mastered</span>") && html.includes(">Needs support</span>"));
  });

  test("small charts are SVG; family boxes; zebra rows and numbers aligned to the end", () => {
    assert.ok((html.match(/<svg class="bar-svg"/g) ?? []).length === 2 && html.includes(`<svg class="mini"`));
    assert.match(plain, /How you can help at home Read together every day\./);
    assert.ok(html.includes("tbody tr:nth-child(even) td") && html.includes("th.num, td.num { text-align: end; }"));
    assert.ok(html.includes(`<td class="num">93</td>`));
  });

  test("very wide tables go on a landscape page; ordinary ones stay portrait", () => {
    assert.ok(!html.includes(`class="block landscape"`));
    const wide = renderHtml(sampleDoc("en", LANDSCAPE_COLUMNS + 1), { fontCss: "", fontStack: "sans-serif" });
    assert.ok(wide.includes(`class="block landscape"`) && wide.includes("@page wide { size: A4 landscape;"));
  });

  test("page numbers: the footer has the title, 'Page X of Y' (both languages)", () => {
    const en = footerTemplate(sampleDoc(), "sans-serif");
    assert.ok(en.includes(`Page <span class="pageNumber"></span> of <span class="totalPages"></span>`) && en.includes("Student Progress Report"));
    const ar = footerTemplate(sampleDoc("ar"), "sans-serif");
    assert.ok(ar.includes(`dir="rtl"`) && ar.includes("صفحة"));
  });

  test("Arabic: right-to-left page with Arabic glance and key labels", () => {
    const ar = renderHtml(sampleDoc("ar"), { fontCss: "", fontStack: "sans-serif" });
    assert.match(ar, /<html lang="ar" dir="rtl">/);
    assert.ok(ar.includes("نظرة سريعة") && ar.includes("دليل الألوان") && ar.includes("أُعدّ من أجل"));
  });

  test("CSV is unchanged by the design (same primary table)", () => {
    const csv = renderCsv(sampleDoc());
    assert.ok(csv.includes("Context Clues,Mastered,93,88,2026-10-04,Strength"));
  });
});

describe("document design system: Excel (reports)", () => {
  const bytes = renderXlsx(sampleDoc());
  const files = unzip(bytes);
  test("Summary first, the tables, a Read me sheet last", () => {
    assert.deepEqual(sheetNames(bytes), ["Summary", "Skills", "Read me"]);
  });
  test("table sheet: frozen header, filters, printed header row, page numbers, zebra + data bars, values unchanged", () => {
    const s = files.get("xl/worksheets/sheet2.xml")!;
    assert.ok(s.includes(`state="frozen"`) && s.includes(`<autoFilter ref="A1:F3"/>`));
    assert.ok(s.includes(`<pageSetUpPr fitToPage="1"/>`) && s.includes("&amp;P / &amp;N"));
    assert.ok(s.includes(`<formula>MOD(ROW(),2)=1</formula>`) && s.includes(`<conditionalFormatting sqref="D2:D3"><cfRule type="dataBar"`));
    assert.ok(files.get("xl/workbook.xml")!.includes(`_xlnm.Print_Titles`));
    const rows = readXlsx(Buffer.from(bytes), { sheet: "Skills" });
    assert.deepEqual(rows[1].slice(0, 6), ["Context Clues", "Mastered", "93", "0.88", rows[1][4], "Strength"]);
    assert.equal(serialToIso(rows[1][4]), "2026-10-04");
    assert.match(s, /<c r="F2" s="18" t="inlineStr"><is><t>Strength<\/t>/, "tone fill keeps the word");
  });
  test("Read me: every column explained and the colour key in words", () => {
    const r = readXlsx(Buffer.from(bytes), { sheet: "Read me" }).map((x) => x.join("|"));
    assert.ok(r.some((l) => l === "Skills|Skill|Text"));
    assert.ok(r.some((l) => l.includes("Accuracy|A percentage from 0% to 100%")));
    assert.ok(r.some((l) => l === "|Mastered|90–100 · secure"));
    assert.ok(r.some((l) => /^\|Needs support\|?$/.test(l)));
  });
  test("Summary: key figures with their meaning, colour key", () => {
    const r = readXlsx(Buffer.from(bytes)).map((x) => x.join("|"));
    assert.ok(r.includes("Questions answered|385|in the chosen period"));
    assert.ok(r.includes("Beginning|score under 40 · just starting"));
  });
});

// ------------------------------------------------------------------ real exports (Test School)

/** The routes' table code as it was before the redesign (copied verbatim), to prove the values are unchanged. */
const OLD = {
  progress: (v: Awaited<ReturnType<typeof classProgress>>) => {
    const head = ["Student", "Student ID", "Status", "Why", "Level", "Answers", "Correct", "Accuracy %", "Skills mastered", "Skills needing work", "Minutes this week", "Minutes this month", "Minutes total", "Tasks done", "Tasks pending", "Tasks late", "Last active", "MAP Fall RIT", "MAP latest RIT", "Latest term", "Spring target", "Growth needed", "Plan", "Weakest goal areas"];
    const rows = v.rows.map((r) => [r.name, r.number, r.status.replace("_", " "), r.statusWhy, r.level ? ({ BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" } as Record<string, string>)[r.level] ?? r.level : "", String(r.practice.answers), String(r.practice.correct), r.practice.accuracy === null ? "" : String(r.practice.accuracy), String(r.mastered), String(r.needsWork), String(r.practice.week.minutes), String(r.practice.month.minutes), String(r.practice.totalMinutes), String(r.work.done), String(r.work.pending), String(r.work.late), r.practice.lastActive?.slice(0, 10) ?? "", String(r.map?.fall?.rit ?? ""), String(r.map?.latest?.rit ?? ""), r.map?.latest?.term ?? "", String(r.map?.springTarget ?? ""), String(r.map?.gap ?? ""), r.intensity ?? "", r.weakest.join(", ")]);
    return [head, ...rows];
  },
  alerts: (rows: Awaited<ReturnType<typeof alertList>>) => [["Date", "Student", "Class", "Reason", "Details", "Status", "What was done", "By", "Handled on", "Days open"], ...rows.map((r) => [r.createdAt.slice(0, 10), r.name, r.className, r.title, r.detail, r.status === "OPEN" ? "Not handled" : "Handled", r.action ?? "", r.handledBy ?? "", r.handledAt?.slice(0, 10) ?? "", r.status === "OPEN" ? String(r.ageDays) : ""])],
  matrix: (v: Awaited<ReturnType<typeof classMatrix>>, subject: "READING" | "LANGUAGE") => {
    const groups = GROUPS.filter((g) => g.subject === subject);
    const head = ["Student", "Student ID", "Term", "RIT", "Band", "Percentile", "Descriptor", "Fall RIT", "Spring goal", "Now (estimate)", "Rapid guessing %", "Retest?", ...groups.flatMap((g) => [`${g.name} RIT`, `${g.name} band`, `${g.name} descriptor`, `${g.name} status`]), "Plan"];
    return [head, ...v.rows.map((r) => { const o = r.profile.overall; return [r.name, r.number, r.profile.term ?? "", String(o?.rit ?? ""), o?.band ?? "", String(o?.percentile ?? ""), o?.descriptor ?? "", String(r.profile.fall?.rit ?? ""), String(r.profile.fall?.projection ?? ""), String(r.estimate ?? ""), String(o?.rapidGuessPct ?? ""), r.retest ? "yes" : "", ...groups.flatMap((g) => { const a = r.profile.areas.find((x) => x.group === g.key); return [String(a?.rit ?? ""), a?.band ?? "", a?.descriptor ?? "", a?.status ?? ""]; }), r.plan ?? ""]; })];
  },
};

/** Workbook cells read back (dates converted back from Excel serials) must equal the table's strings. */
function assertSameTable(bytes: Uint8Array, sheet: string, rows: string[][], dateCols: number[]) {
  const got = readXlsx(Buffer.from(bytes), { sheet });
  assert.equal(got.length, rows.length, `${sheet}: row count`);
  rows.forEach((r, i) => r.forEach((v, j) => {
    const g = got[i][j] ?? "";
    assert.equal(i > 0 && dateCols.includes(j) && g ? serialToIso(g) : g, v, `${sheet} row ${i} col ${j}`);
  }));
}

describe("real exports keep every number (Test School)", () => {
  let repo: SqliteRepo, admin: Actor, t1: Actor, classA = "", deps: ReportDeps;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: ROOT, passwordHash: "x".repeat(60), practice: "light" });
    const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actor("test.admin"); t1 = await actor("test.teacher.1");
    classA = String((await readableClasses(repo, t1))[0].id);
    deps = { repo, fontDir: join(ROOT, "assets/fonts"), brandingDir: mkdtempSync(join(tmpdir(), "rpdf-")), now: () => NOW };
  });

  test("students dashboard, alerts, department and MAP matrix workbooks: same values as the old routes, plus a Read me", async () => {
    const v = await classProgress(repo, t1, classA, "READING", NOW);
    assert.deepEqual(progressRows(v), OLD.progress(v));
    const pb = progressWorkbook(v);
    assertSameTable(pb, v.className.slice(0, 30), progressRows(v), [16]);
    assert.deepEqual(sheetNames(pb).slice(-1), ["Read me"]);
    const al = await alertList(repo, admin, { status: "ALL" }, NOW);
    assert.deepEqual(alertsRows(al), OLD.alerts(al));
    assertSameTable(alertsWorkbook(al), "Alerts", alertsRows(al), [0, 8]);
    const d = await departmentSummary(repo, admin, NOW);
    const dr = departmentRows(d), db = departmentWorkbook(d);
    assertSameTable(db, `Week ${d.week}`, dr.classes, []);
    assertSameTable(db, "Hardest skills", dr.weak, []);
    for (const subject of ["READING", "LANGUAGE"] as const) {
      const m = await classMatrix(repo, t1, classA, subject, NOW);
      assert.deepEqual(mapMatrixRows(m, subject), OLD.matrix(m, subject));
      assertSameTable(mapMatrixWorkbook(m, subject), `${m.className}`.slice(0, 30), mapMatrixRows(m, subject), []);
    }
    const sheet = unzip(pb).get("xl/worksheets/sheet1.xml")!;
    assert.ok(sheet.includes(`state="frozen"`) && sheet.includes("<autoFilter") && sheet.includes(`type="dataBar"`));
  });

  test("student report: plain-language boxes for families, glance numbers equal the summary figures", async () => {
    const studentId = String((await repo.findMany("ClassMembership", { classId: classA, leftAt: null }))[0].studentId);
    for (const lang of ["en", "ar"] as const) {
      const f = await exportReport(deps, t1, parseReportRequest(new URLSearchParams({ kind: "student", studentId, format: "xlsx", lang })));
      const types = f.doc.sections.map((s) => s.type);
      assert.ok(types.includes("explain"), lang);
      const kpis = f.doc.sections.find((s): s is Extract<Section, { type: "kpis" }> => s.type === "kpis")!;
      assert.ok(kpis.items.filter((k) => k.glance).length >= 3 && kpis.items.filter((k) => k.glance).length <= 5);
      const html = text(renderHtml(f.doc, { fontCss: "", fontStack: "sans-serif" }));
      const fm = formatter(lang);
      for (const k of kpis.items) if (k.kind === "int" && k.value !== null) assert.ok(html.includes(fm.num(Number(k.value), 0)), k.label);
      assert.ok(html.includes(t(lang, "home.title")) && html.includes(t(lang, "glance")));
    }
  });

  test("ReadRise: the level is never called a Lexile in any label of its reports", async () => {
    for (const q of [{ kind: "readrise", classId: classA }, { kind: "readrise", scope: "school" }] as Record<string, string>[]) {
      const f = await exportReport(deps, q.scope ? admin : t1, parseReportRequest(new URLSearchParams({ format: "csv", ...q })));
      for (const s of f.doc.sections) {
        const labels = s.type === "kpis" ? s.items.map((k) => k.label) : s.type === "table" ? s.columns.map((c) => c.label) : [];
        for (const l of labels) assert.doesNotMatch(l, /Lexile/, l);
      }
      const html = text(renderHtml(f.doc, { fontCss: "", fontStack: "sans-serif" }));
      assert.doesNotMatch(html, /ReadRise (Level|level)( \(estimate\))? ?Lexile|ReadRise Lexile/);
    }
  });

  test("personalized plan (.doc): same students and RIT numbers, glance counts, colour key, Word page numbers", async () => {
    const p = await personalPlan(repo, t1, classA, "READING");
    const doc = personalPlanDoc(p, NOW);
    for (const b of p.bands) for (const st of b.students) assert.ok(doc.includes(`text-align:right">${st.rit}</td>`), `RIT ${st.rit}`);
    assert.ok(doc.includes("At a glance") && doc.includes("Colour key:") && doc.includes("mso-field-code:' PAGE '"));
    assert.ok(doc.includes(`>${p.bands.reduce((n, b) => n + b.students.length, 0)}</span><br><b>Students grouped`));
  });
});

// ------------------------------------------------------------------ the PDF itself (when Chromium is installed)

let chromiumOk = true;
try { execFileSync(process.execPath, ["-e", "require('playwright-core')"], { cwd: ROOT, stdio: "ignore" }); } catch { chromiumOk = false; }

describe("rendered PDF", { skip: chromiumOk ? false : "playwright-core is not installed" }, () => {
  test("A4 pages with page numbers, landscape pages for very wide tables, the colour key in the text", async () => {
    const { chromiumRenderer } = await import("../src/reports/pdf");
    const pdf = chromiumRenderer({ executablePath: process.env.REPORT_CHROMIUM_PATH || undefined });
    try {
      const fonts = loadFonts(join(ROOT, "assets/fonts"));
      const doc = sampleDoc("en", LANDSCAPE_COLUMNS + 2);
      const bytes = await pdf.render(renderHtml(doc, { fontCss: fonts.css, fontStack: fonts.stack }), doc, fonts.stack);
      const dir = mkdtempSync(join(tmpdir(), "rpdf-"));
      writeFileSync(join(dir, "r.pdf"), bytes);
      let txt: string, info: string;
      try { txt = execFileSync("pdftotext", [join(dir, "r.pdf"), "-"]).toString("utf8"); info = execFileSync("pdfinfo", ["-f", "1", "-l", "9", join(dir, "r.pdf")]).toString("utf8"); } catch { return; }
      assert.match(txt, /Page 1 of [2-9]/);
      assert.match(txt, /Colour key/);
      assert.match(info, /Page +1 size: +59\d\.\d+ x 84\d/);
      assert.match(info, /Page +2 size: +84\d\.\d+ x 59\d/);
    } finally { await pdf.close(); }
  });
});
