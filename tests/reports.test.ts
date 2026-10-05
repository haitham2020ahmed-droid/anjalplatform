import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolvePeriod, type Calendar } from "../src/analytics/periods";
import { readXlsx } from "../src/imports/xlsx";
import { renderCsv } from "../src/reports/csv";
import { loadFonts } from "../src/reports/fonts";
import { esc, h, renderHtml } from "../src/reports/html";
import { bandLabel, formatter, gradeName, missingTranslations, periodLabel, t } from "../src/reports/i18n";
import { loadLogo, validateLogo } from "../src/reports/logo";
import type { ReportDoc } from "../src/reports/model";
import { chromiumRenderer, Semaphore, ReportBusyError, type PdfRenderer } from "../src/reports/pdf";
import { renderXlsx, sheetName } from "../src/reports/xlsx";
import { crc32, zip } from "../src/reports/zip";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { resetRateLimit } from "../src/server/auth/rate-limit";
import { loadCalendar } from "../src/server/analytics/calendar";
import { ValidationError } from "../src/server/curriculum-admin";
import { parentChildren } from "../src/server/queries/parent";
import { studentAnalytics } from "../src/server/analytics/reports";
import { classOverview, studentDetail } from "../src/server/teacher/queries";
import { BRANDING_KEY, exportReport, parseReportRequest, RateLimitedError, REPORT_RATE, reportHref, type ReportDeps, type ReportRequest } from "../src/server/reports/service";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank, simulatePractice } from "./helpers/practice";

const FONTS = join(ROOT, "assets/fonts");
const PNG_1PX = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));

/** Minimal ZIP reader for tests: name → bytes (independent of the writer's own code path). */
function unzip(buf: Uint8Array): Map<string, Buffer> {
  const b = Buffer.from(buf);
  const out = new Map<string, Buffer>();
  let i = 0;
  while (b.readUInt32LE(i) === 0x04034b50) {
    const comp = b.readUInt32LE(i + 18), nameLen = b.readUInt16LE(i + 26), extra = b.readUInt16LE(i + 28);
    const name = b.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const data = b.subarray(i + 30 + nameLen + extra, i + 30 + nameLen + extra + comp);
    out.set(name, inflateRawSync(data));
    i += 30 + nameLen + extra + comp;
  }
  return out;
}

function sampleDoc(locale: "en" | "ar", name = "Sara <b>\"Q\"</b> & co"): ReportDoc {
  return {
    kind: "class", locale, title: t(locale, "title.class"), subtitle: t(locale, "subtitle"),
    branding: { name: "Al-Anjal Private Schools", nameAr: "مدارس الأنجال الأهلية", logo: null },
    meta: [{ label: t(locale, "meta.class"), value: "4A", isolate: "latin" }],
    sections: [
      { type: "kpis", title: t(locale, "sec.summary"), items: [{ label: t(locale, "kpi.accuracy"), value: 75, kind: "pct" }] },
      {
        type: "table", id: "students", title: t(locale, "sec.students"), empty: t(locale, "noData"),
        columns: [
          { key: "name", label: t(locale, "col.student"), kind: "name" },
          { key: "skill", label: t(locale, "col.skill"), kind: "latin" },
          { key: "band", label: t(locale, "col.level"), kind: "band" },
          { key: "acc", label: t(locale, "col.accuracy"), kind: "pct" },
          { key: "last", label: t(locale, "col.lastActive"), kind: "date" },
          { key: "chg", label: t(locale, "col.change"), kind: "signed" },
        ],
        rows: [
          { name, skill: "Context Clues (L.4.4.a)", band: "MASTERED", acc: 85, last: "2026-10-04", chg: -2.5 },
          { name: "=HYPERLINK(\"http://evil\",\"x\")", skill: "+cmd|' /C calc'!A0", band: "BEGINNING", acc: null, last: null, chg: 3 },
          { name: "ليان أحمد", skill: "@SUM(A1)", band: "PROFICIENT", acc: 0, last: "2026-09-01", chg: 0 },
        ],
      },
      { type: "notes", title: t(locale, "sec.notes"), items: [t(locale, "note.internal")] },
    ],
    primaryTable: "students", fileStem: "class-report_4A_2026-10-04_" + locale,
    generatedAt: new Date("2026-10-04T09:00:00Z"), generatedBy: "Miss Doaa Eskandrany",
  };
}

// ------------------------------------------------------------- language

describe("report language (English / Arabic)", () => {
  test("every label exists in both languages and Arabic labels are Arabic", () => {
    assert.deepEqual(missingTranslations(), []);
    for (const k of ["title.student", "kpi.accuracy", "col.skill", "note.internal", "confidential"] as const) assert.match(t("ar", k), /[\u0600-\u06FF]/, k);
  });

  test("bands, grades and periods are localized; school term and year names are kept", () => {
    assert.equal(bandLabel("ar", "MASTERED"), "متقن");
    assert.equal(bandLabel("ar", "Developing"), "في طور النمو");
    assert.equal(gradeName("ar", 4), "الصف الرابع");
    assert.equal(gradeName("en", 6), "Grade 6");
    const cal: Calendar = { year: { name: "2026-2027", start: new Date("2026-09-01T00:00:00Z"), end: new Date("2027-06-30T00:00:00Z") }, terms: [{ name: "Term 1", start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-12-31T00:00:00Z") }] };
    const now = new Date("2026-10-04T10:00:00Z");
    assert.equal(periodLabel("ar", resolvePeriod("LAST_30_DAYS", cal, now)), "آخر 30 يومًا");
    assert.equal(periodLabel("ar", resolvePeriod("SCHOOL_YEAR", cal, now)), "العام الدراسي 2026-2027");
    assert.equal(periodLabel("ar", resolvePeriod("SEMESTER", cal, now)), "النصف الأول من العام الدراسي");
    assert.equal(periodLabel("en", resolvePeriod("TERM", cal, now)), "Term 1");
    assert.equal(periodLabel("ar", resolvePeriod("CUSTOM", cal, now, { from: new Date("2026-09-01"), to: new Date("2026-09-30") })), "من 1 سبتمبر 2026 إلى 30 سبتمبر 2026");
  });

  test("dates are Gregorian in Arabic; digits are Western unless Arabic-Indic is chosen", () => {
    const ar = formatter("ar");
    assert.equal(ar.date("2026-10-04"), "4 أكتوبر 2026");
    assert.match(ar.pct(85), /^85/);
    assert.equal(formatter("ar", "arab").num(85, 0), "٨٥");
    assert.equal(formatter("ar", "arab").num(2026, 0), "٢٬٠٢٦", "quantities keep thousands separators");
    assert.equal(formatter("en").pct(null), "—");
  });
});

// ------------------------------------------------------------------- HTML

describe("HTML rendering", () => {
  const fonts = loadFonts(FONTS);

  test("all values are escaped; the page contains no scripts", () => {
    assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    assert.equal(h`<p>${"<img onerror=alert(1)>"}</p>`.value, "<p>&lt;img onerror=alert(1)&gt;</p>");
    const html = renderHtml(sampleDoc("en", "<script>alert(1)</script>"), { fontCss: "", fontStack: "sans-serif" });
    assert.ok(!/<script/i.test(html));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  });

  test("Arabic report: rtl page, English content isolated left-to-right, names direction-detected", () => {
    const html = renderHtml(sampleDoc("ar"), { fontCss: fonts.css, fontStack: fonts.stack });
    assert.match(html, /<html lang="ar" dir="rtl">/);
    assert.ok(html.includes(`<bdi dir="ltr">Context Clues (L.4.4.a)</bdi>`));
    assert.ok(html.includes(`<bdi>ليان أحمد</bdi>`));
    assert.ok(html.includes(">متقن<"), "band chip in Arabic");
    assert.ok(html.includes("مدارس الأنجال الأهلية"), "Arabic school name in header");
    assert.match(fonts.css, /@font-face\{font-family:"Report Base"/);
  });
});

// --------------------------------------------------------------- ZIP/XLSX

describe("Excel and CSV output", () => {
  test("CRC-32 matches the standard check value; ZIP entries round-trip", () => {
    assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
    const z = unzip(zip([{ name: "a.txt", data: "hello" }, { name: "ب/ج.xml", data: "<x>عربي</x>" }]));
    assert.equal(z.get("a.txt")!.toString(), "hello");
    assert.equal(z.get("ب/ج.xml")!.toString(), "<x>عربي</x>");
  });

  test("workbook: Summary first, one sheet per table, read back by the Phase 9 reader", () => {
    const bytes = renderXlsx(sampleDoc("en"));
    const rows = readXlsx(Buffer.from(bytes));
    assert.equal(rows[0][1], "Class Progress Report");
    const files = unzip(bytes);
    const wb = files.get("xl/workbook.xml")!.toString();
    assert.match(wb, /<sheet name="Summary"[^>]*\/><sheet name="Students"/);
    const sheet = files.get("xl/worksheets/sheet2.xml")!.toString();
    assert.ok(sheet.includes(`<autoFilter ref="A1:F4"/>`) && sheet.includes(`state="frozen"`));
    assert.match(sheet, /<c r="D2" s="7"><v>0.85<\/v><\/c>/, "percent stored as a fraction with a % style");
    assert.match(sheet, /<c r="E2" s="9"><v>46299<\/v><\/c>/, "date stored as an Excel serial number");
  });

  test("formula-like text stays literal text in Excel (inline strings, never formulas)", () => {
    const sheet = unzip(renderXlsx(sampleDoc("en"))).get("xl/worksheets/sheet2.xml")!.toString();
    assert.ok(!/<f>/.test(sheet));
    assert.ok(sheet.includes(`<c r="A3" s="4" t="inlineStr"><is><t>=HYPERLINK(&quot;http://evil&quot;,&quot;x&quot;)</t></is></c>`));
  });

  test("Arabic workbook: right-to-left sheets with Arabic names; control characters removed", () => {
    const doc = sampleDoc("ar", "bad\u0001name");
    const files = unzip(renderXlsx(doc));
    assert.match(files.get("xl/workbook.xml")!.toString(), /<sheet name="الملخّص"/);
    const s2 = files.get("xl/worksheets/sheet2.xml")!.toString();
    assert.ok(s2.includes(`rightToLeft="1"`) && s2.includes("badname") && !s2.includes("\u0001"));
  });

  test("sheet names: forbidden characters removed, 31-character limit, unique", () => {
    const used = new Set<string>();
    assert.equal(sheetName("Q1/Q2: [draft]?", used), "Q1 Q2 draft");
    assert.equal(sheetName("x".repeat(40), used).length, 31);
    assert.equal(sheetName("q1 q2 draft", used), "q1 q2 draft 2");
  });

  test("CSV: primary table only, BOM, % header, formula injection neutralised, localized bands", () => {
    const csv = renderCsv(sampleDoc("ar"));
    assert.equal(csv.charCodeAt(0), 0xfeff);
    const lines = csv.slice(1).trim().split("\r\n");
    assert.equal(lines.length, 4);
    assert.ok(lines[0].includes("الدقة (%)"));
    assert.ok(lines[2].startsWith(`"'=HYPERLINK(`));
    assert.ok(lines[2].includes(`'+cmd|`));
    assert.ok(lines[3].includes("'@SUM(A1)"));
    assert.ok(lines[1].includes(",متقن,85,2026-10-04,-2.5"));
  });
});

// ------------------------------------------------------------------- logo

describe("school logo", () => {
  const dir = mkdtempSync(join(tmpdir(), "brand-"));
  writeFileSync(join(dir, "logo.png"), PNG_1PX);
  writeFileSync(join(dir, "fake.png"), "not an image");
  writeFileSync(join(dir, "bad.svg"), `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);

  test("accepts a branding-folder file or a data URI, checks the real content type", () => {
    assert.equal(loadLogo("logo.png", dir).logo?.mime, "image/png");
    assert.equal(loadLogo(`data:image/png;base64,${Buffer.from(PNG_1PX).toString("base64")}`, dir).logo?.mime, "image/png");
    assert.equal(loadLogo("fake.png", dir).logo, null);
    assert.equal(loadLogo("bad.svg", dir).logo, null);
    assert.equal(validateLogo(new Uint8Array(1_000_001).fill(0x89)).ok, false);
  });

  test("never fetches URLs and never leaves the branding folder", () => {
    for (const v of ["https://example.com/logo.png", "http://169.254.169.254/latest", "file:///etc/passwd", "../logo.png", "sub/logo.png", "/etc/passwd", ".hidden"]) {
      const r = loadLogo(v, dir);
      assert.equal(r.logo, null, v);
      assert.ok(r.warning, v);
    }
    assert.deepEqual(loadLogo("", dir), { logo: null, warning: null });
  });
});

// -------------------------------------------------------- service on a DB

describe("report export service (real database)", () => {
  let repo: SqliteRepo;
  let teacher: Actor, otherTeacher: Actor, admin: Actor, parent: Actor, otherParent: Actor, student: Actor;
  let s1: string, s4: string, classA: string;
  let deps: ReportDeps;
  const now = new Date("2026-12-20T09:00:00Z");
  const req = (r: Partial<ReportRequest> & Pick<ReportRequest, "kind">): ReportRequest => ({ format: "csv", locale: "en", period: "TERM", ...r });
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    await simulatePractice(repo, ["demo.s1001", "demo.s1002", "demo.s1003"], [
      { date: "2026-09-15", skill: "G4.theme" }, { date: "2026-10-15", skill: "G4.context-clues" }, { date: "2026-11-15", skill: "G4.theme" },
    ]);
    teacher = await actorFor("demo.teacher.4a");
    otherTeacher = await actorFor("demo.teacher.4b");
    admin = await actorFor("demo.admin");
    parent = await actorFor("demo.p1001");
    otherParent = await actorFor("demo.p1004");
    student = await actorFor("demo.s1001");
    s1 = student.studentId!;
    s4 = (await actorFor("demo.s1004")).studentId!;
    classA = String((await repo.findMany("ClassMembership", { studentId: s1 }))[0].classId);
    const school = (await repo.findMany("School", {}))[0];
    await repo.create("SchoolSetting", { schoolId: school.id, key: BRANDING_KEY, value: { nameAr: "مدرسة العرض" } });
    deps = { repo, fontDir: FONTS, brandingDir: mkdtempSync(join(tmpdir(), "b-")), now: () => now };
  });

  test("request parsing: defaults, strict values, ids and custom dates", () => {
    const r = parseReportRequest(new URLSearchParams({ kind: "student", studentId: "abc_123" }));
    assert.deepEqual(r, { kind: "student", format: "pdf", locale: "en", period: "TERM", studentId: "abc_123" });
    const bad: Record<string, string>[] = [{ kind: "nope" }, { kind: "student" }, { kind: "student", studentId: "x'; DROP" }, { kind: "class", classId: "c1", format: "docx" }, { kind: "class", classId: "c1", lang: "fr" }, { kind: "school", period: "CUSTOM", from: "2026-13-01", to: "x" }];
    for (const q of bad) assert.throws(() => parseReportRequest(new URLSearchParams(q)), ValidationError, JSON.stringify(q));
    assert.equal(parseReportRequest(new URLSearchParams({ kind: "standards", scope: "school" })).scope, "school");
    assert.equal(reportHref({ kind: "class", classId: "c1", format: "xlsx", locale: "ar", period: "TERM" }), "/api/reports?kind=class&format=xlsx&lang=ar&period=TERM&classId=c1");
  });

  test("who can export what: teachers their classes, parents their own children, admins the school", async () => {
    await exportReport(deps, teacher, req({ kind: "student", studentId: s1 }));
    await exportReport(deps, teacher, req({ kind: "class", classId: classA }));
    await exportReport(deps, parent, req({ kind: "student", studentId: s1 }));
    await exportReport(deps, admin, req({ kind: "school" }));
    await exportReport(deps, admin, req({ kind: "standards", scope: "school" }));
    const denied: [Actor, ReportRequest][] = [
      [otherTeacher, req({ kind: "student", studentId: s1 })],
      [otherTeacher, req({ kind: "class", classId: classA })],
      [otherParent, req({ kind: "student", studentId: s1 })],
      [parent, req({ kind: "student", studentId: s4 })],
      [parent, req({ kind: "class", classId: classA })],
      [student, req({ kind: "student", studentId: s1 })],
      [teacher, req({ kind: "school" })],
      [teacher, req({ kind: "standards", scope: "school" })],
      [teacher, req({ kind: "student", studentId: "does-not-exist" })],
    ];
    for (const [a, r] of denied) await assert.rejects(exportReport(deps, a, r), ForbiddenError, `${a.role} ${JSON.stringify(r)}`);
  });

  test("reports show exactly the dashboard numbers", async () => {
    const cal = await loadCalendar(repo, teacher.schoolId);
    const period = resolvePeriod("TERM", cal, now);
    const stu = await exportReport(deps, teacher, req({ kind: "student", studentId: s1, period: "LAST_30_DAYS" }));
    const a = await studentAnalytics(repo, teacher, s1, resolvePeriod("LAST_30_DAYS", cal, now));
    const kpi = stu.doc.sections.find((s) => s.type === "kpis")!;
    assert.equal(kpi.type === "kpis" && kpi.items[0].value, a.questions);
    const d = await studentDetail(repo, teacher, s1);
    const skills = stu.doc.sections.find((s) => s.type === "table" && s.id === "skills")!;
    assert.deepEqual(skills.type === "table" && skills.rows.map((r) => [r.skill, r.score]), d.skills.map((x) => [x.name, x.score]));

    const cls = await exportReport(deps, teacher, req({ kind: "class", classId: classA }));
    const o = await classOverview(repo, teacher, classA, period);
    const students = cls.doc.sections.find((s) => s.type === "table" && s.id === "students")!;
    assert.deepEqual(students.type === "table" && students.rows.map((r) => [r.name, r.questions, r.accuracy]), o.students.map((x) => [x.name, x.answered, x.accuracyPct]));
    const csv = Buffer.from(cls.bytes).toString("utf8");
    assert.equal(csv.trim().split("\r\n").length, o.students.length + 1);
  });

  test("headline growth uses paired skill growth, consistent with the growth table", async () => {
    const f = await exportReport(deps, teacher, req({ kind: "student", studentId: s1, period: "SCHOOL_YEAR" }));
    const kpis = f.doc.sections.find((s) => s.type === "kpis")!;
    const growth = f.doc.sections.find((s) => s.type === "table" && s.id === "growth")!;
    const changes = growth.type === "table" ? growth.rows.map((r) => Number(r.change)) : [];
    const card = kpis.type === "kpis" ? kpis.items.find((k) => k.label === t("en", "kpi.growth"))!.value : null;
    if (changes.length) assert.equal(card, Math.round((10 * changes.reduce((x, y) => x + y, 0)) / changes.length) / 10);
    else assert.equal(card, null);
  });

  test("Arabic export: Arabic labels, Arabic school name, right-to-left workbook", async () => {
    const f = await exportReport(deps, teacher, req({ kind: "class", classId: classA, format: "xlsx", locale: "ar" }));
    assert.equal(f.doc.branding.nameAr, "مدرسة العرض");
    assert.equal(f.doc.title, "تقرير تقدّم الشعبة");
    assert.ok(f.filename.endsWith("_ar.xlsx") && /^[\x20-\x7E]+$/.test(f.filename));
    assert.match(unzip(f.bytes).get("xl/worksheets/sheet2.xml")!.toString(), /rightToLeft="1"/);
  });

  test("every export is audited with metadata only", async () => {
    const before = await repo.count("AuditLog", { action: "report.export" });
    await exportReport(deps, parent, req({ kind: "student", studentId: s1, locale: "ar" }));
    const logs = await repo.findMany("AuditLog", { action: "report.export", actorId: parent.userId });
    assert.equal(await repo.count("AuditLog", { action: "report.export" }), before + 1);
    const last = logs[logs.length - 1];
    assert.equal(last.entityId, s1);
    const after = (typeof last.after === "string" ? JSON.parse(last.after) : last.after) as Record<string, unknown>;
    assert.deepEqual(Object.keys(after).sort(), ["bytes", "format", "from", "kind", "locale", "period", "scope", "to"]);
  });

  test("exports are rate limited per user", async () => {
    const a = otherParent; // parent of demo.s1004
    const id = s4;
    await resetRateLimit(repo, `report:${a.userId}`);
    for (let i = 0; i < REPORT_RATE.max; i++) await exportReport(deps, a, req({ kind: "student", studentId: id }));
    await assert.rejects(exportReport(deps, a, req({ kind: "student", studentId: id })), RateLimitedError);
    await exportReport(deps, admin, req({ kind: "school" })); // other users unaffected
  });

  test("a parent sees only linked children", async () => {
    const kids = await parentChildren(repo, parent);
    assert.deepEqual(kids.map((k) => k.studentId), [s1]);
    await assert.rejects(parentChildren(repo, teacher), ForbiddenError);
  });
});

// -------------------------------------------------------------------- PDF

let chromiumOk = true;
try {
  execFileSync(process.execPath, ["-e", "require('playwright-core')"], { cwd: ROOT, stdio: "ignore" });
} catch {
  chromiumOk = false;
}

describe("PDF rendering (headless Chromium)", { skip: chromiumOk ? false : "playwright-core is not installed" }, () => {
  let pdf: PdfRenderer;
  before(() => {
    pdf = chromiumRenderer({ executablePath: process.env.REPORT_CHROMIUM_PATH || undefined });
  });
  after(async () => pdf.close());

  const pdftotext = (bytes: Uint8Array): string | null => {
    try {
      const dir = mkdtempSync(join(tmpdir(), "pdf-"));
      writeFileSync(join(dir, "r.pdf"), bytes);
      return execFileSync("pdftotext", [join(dir, "r.pdf"), "-"]).toString("utf8");
    } catch {
      return null;
    }
  };

  test("Arabic and English PDFs render, with the text stored in reading order", async () => {
    const fonts = loadFonts(FONTS);
    for (const locale of ["ar", "en"] as const) {
      const doc = sampleDoc(locale);
      const bytes = await pdf.render(renderHtml(doc, { fontCss: fonts.css, fontStack: fonts.stack }), doc, fonts.stack);
      assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
      const text = pdftotext(bytes);
      if (text === null) continue; // poppler not installed: structure checked above
      if (locale === "ar") {
        // (words without the lam-alef ligature, which text extraction splits apart)
        assert.ok(text.includes("مدارس") && text.includes("الطالب") && text.includes("الشعبة") && text.includes("Context Clues"), text.slice(0, 300));
        assert.ok(text.includes("صفحة"), "Arabic page footer");
      } else assert.ok(text.includes("Class Progress Report") && text.includes("Page 1 of 1"));
    }
  });

  test("pages cannot run scripts or make network requests", async () => {
    let hits = 0;
    const server = createServer((_q, r) => { hits++; r.end("x"); });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const html = `<html><head><link rel="stylesheet" href="${url}/a.css"><style>@import url(${url}/b.css); body{background:url(${url}/c.png)}</style></head><body><img src="${url}/d.png"><iframe src="${url}/e"></iframe><script>fetch("${url}/f");document.body.innerHTML="SCRIPT RAN"</script>static text</body></html>`;
      const bytes = await pdf.render(html, sampleDoc("en"), "sans-serif");
      assert.equal(hits, 0, "no request reached the server");
      const text = pdftotext(bytes);
      if (text !== null) assert.ok(!text.includes("SCRIPT RAN") && text.includes("static text"));
    } finally {
      server.close();
    }
  });

  test("full export through the service produces a PDF", async () => {
    const { repo } = await demoDatabase();
    const t4 = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const cls = String((await repo.findMany("ClassTeacher", {}))[0].classId);
    const owned = (await repo.findMany("ClassTeacher", { teacherId: (await repo.findUnique("Teacher", { userId: t4.userId }))!.id }))[0];
    const f = await exportReport({ repo, pdf, fontDir: FONTS, brandingDir: tmpdir() }, t4, { kind: "class", classId: String(owned?.classId ?? cls), format: "pdf", locale: "ar", period: "TERM" });
    assert.equal(f.contentType, "application/pdf");
    assert.equal(Buffer.from(f.bytes.subarray(0, 5)).toString(), "%PDF-");
  });
});

describe("PDF queue", () => {
  test("a full queue waits, then gives up with a 'busy' error instead of piling up", async () => {
    const s = new Semaphore(1);
    const release = await s.acquire(100);
    await assert.rejects(s.acquire(30), ReportBusyError);
    const waiting = s.acquire(1000);
    release();
    (await waiting)();
    assert.equal(s.inUse, 0);
  });
});
