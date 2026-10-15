/**
 * 🖨 r84 memory: every "PDF" is made by the user's browser (no Chromium in the 512 MB server).
 * Every former PDF entry point is CALLED as a request (the route handler itself, with the signed-in user's cookies) on
 * the demo school (in-memory SQLite only — never a real database or real students):
 *   - by default (PDF_ENGINE unset = browser) it answers a print page: HTML, the toolbar "Save as PDF / Print" (hidden
 *     in print), the one print script with the request's nonce (and its hash in the page's own policy), page numbers
 *     through CSS, the saved file's name as the title — and never starts (or even loads) Chromium;
 *   - the page carries the SAME content the PDF was printed from: the <body> the Chromium renderer received is inside
 *     the print page unchanged (text, clickable links, QR codes);
 *   - PDF_ENGINE=server still answers a PDF file through the renderer (a fake one here: never a real browser in tests);
 *   - students, parents and the family pages still get theirs; the links ask for the print window (print=1) and are
 *     never `download` links (a print page must open, not be saved as an .html file).
 */
import { inRequest } from "./helpers/page-render";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/db";
import type { Repo } from "../src/server/seeding/repo";
import { mapSchool, type MapSchool } from "./helpers/map-school";
import { nafsSchool, type NafsSchool } from "./helpers/nafs-school";
import { NONCE_SLOT, PRINT_MARK, PRINT_SCRIPT, cssString, isPrintPage, printPageHtml } from "../src/reports/print-page";
import { PRINT_SCRIPT_HASH, printPagePolicy } from "../src/server/reports/file-response";
import { clearCurriculumMapPdfs } from "../src/server/curriculum-map/map-pdf";
import { buildDiagnostic, openDiagnostic } from "../src/server/diagnostic/test";
import { isPrintHref, withPrint } from "../src/lib/print-href";
import { reportHref } from "../src/reports/links";
import { compareDownload } from "../src/server/nafs/compare";
import { dashboardDownload } from "../src/server/nafs/dashboard";
import { curriculumMapPdfHref } from "../src/server/curriculum-map/map-pdf";
import { missingTranslations } from "../src/reports/i18n";

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const s = (v: unknown) => String(v ?? "");
const NONCE = "r84NonceAbc123+/=";
const G = globalThis as unknown as { __reportPdf?: unknown; __reportPrint?: unknown };

/** The fake Chromium of PDF_ENGINE=server: keeps the HTML it was given, answers a tiny "PDF". */
const captured: string[] = [];
const fakeChromium = { async render(html: string) { captured.push(html); return new TextEncoder().encode("%PDF-1.7 fake"); }, async close() { /* nothing */ } };

interface Answer { status: number; type: string; csp: string; disposition: string; body: string }
async function call(repo: Repo, file: string, url: string, cookie: Record<string, string>, params?: Record<string, string>): Promise<Answer> {
  await repo.deleteMany("RateLimitBucket", {}); // the exports' rate limit (30 per 10 minutes) is not under test here
  clearCurriculumMapPdfs();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(join(ROOT, file)) as { GET: (req: Request, ctx?: unknown) => Promise<Response> };
  const req = new Request(`http://localhost:3000${url}`, { headers: { "x-nonce": NONCE } });
  const { value: r } = await inRequest({ path: url.split("?")[0], cookies: cookie }, () => mod.GET(req, params ? { params: Promise.resolve(params) } : undefined));
  return { status: r.status, type: s(r.headers.get("content-type")), csp: s(r.headers.get("content-security-policy")), disposition: s(r.headers.get("content-disposition")), body: Buffer.from(await r.arrayBuffer()).toString("utf8") };
}
async function asServer<T>(fn: () => Promise<T>): Promise<T> {
  const was = process.env.PDF_ENGINE, had = G.__reportPdf;
  process.env.PDF_ENGINE = "server";
  G.__reportPdf = fakeChromium;
  try { return await fn(); } finally { if (was === undefined) delete process.env.PDF_ENGINE; else process.env.PDF_ENGINE = was; G.__reportPdf = had; }
}
const bodyOf = (html: string) => html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");

/**
 * One entry point: the print page by default, the same content as the server PDF, a PDF file with PDF_ENGINE=server.
 * Returns the print page (for extra checks).
 */
async function entry(repo: Parameters<typeof call>[0], name: string, file: string, url: string, cookie: Record<string, string>, opts: { params?: Record<string, string>; footer?: boolean } = {}): Promise<string> {
  delete process.env.PDF_ENGINE;
  const page = await call(repo, file, url, cookie, opts.params);
  assert.equal(page.status, 200, `${name}: ${page.status} ${page.body.slice(0, 200)}`);
  assert.match(page.type, /^text\/html/, `${name}: a page, not a file`);
  assert.equal(page.disposition, "", `${name}: shown, not downloaded`);
  assert.ok(page.body.startsWith("<!doctype html>"), `${name}: a standards-mode page (the internal mark is removed)`);
  assert.ok(!page.body.includes(PRINT_MARK) && !page.body.includes(NONCE_SLOT), name);
  assert.ok(page.body.includes('id="lr-print"') && page.body.includes("lr-print-bar"), `${name}: the toolbar`);
  assert.match(page.body, /@media print\{\.lr-print-bar\{display:none!important;\}\}/, `${name}: the toolbar is hidden in print`);
  assert.ok(page.body.includes(`<script nonce="${NONCE}">${PRINT_SCRIPT}</script>`), `${name}: the print script with the request's nonce`);
  assert.ok(page.csp.includes(`'nonce-${NONCE}'`) && page.csp.includes(`'${PRINT_SCRIPT_HASH}'`) && page.csp.includes("default-src 'none'"), `${name}: its own strict policy`);
  if (opts.footer !== false) assert.match(page.body, /@page\{@bottom-(left|right)\{content:/, `${name}: page numbers and the footer through CSS`);
  assert.equal((page.body.match(/<script/g) ?? []).length, 1, `${name}: no other script`);
  // the same content as the PDF (the HTML the server's Chromium printed)
  captured.length = 0;
  const pdf = await asServer(() => call(repo, file, url, cookie, opts.params));
  assert.equal(pdf.status, 200, `${name} (server): ${pdf.body.slice(0, 200)}`);
  assert.equal(pdf.type, "application/pdf", `${name}: PDF_ENGINE=server still makes a PDF file`);
  assert.match(pdf.disposition, /^attachment; filename=/, name);
  assert.ok(pdf.body.startsWith("%PDF-"), name);
  assert.equal(captured.length, 1, `${name}: rendered once`);
  const body = bodyOf(captured[0]);
  assert.ok(body.length > 200, `${name}: real content`);
  assert.ok(page.body.includes(body), `${name}: the print page holds exactly the PDF's content`);
  const stem = (pdf.disposition.match(/filename="([^"]+)"/)?.[1] ?? "").replace(/\.pdf$/i, "");
  if (stem) assert.ok(page.body.includes(`<title>${stem}</title>`), `${name}: the saved PDF keeps the file's name (${stem})`);
  return page.body;
}

const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

// ---------------------------------------------------------------------------------------------------------------

describe("🖨 r84 print page: building blocks", () => {
  test("the print page wraps the report's own HTML: toolbar, script slot, CSS page numbers, both languages", () => {
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>T</title><style>@page { size: A4; }</style></head><body><h1>تقرير</h1><a href="https://x.test/p">رابط</a></body></html>`;
    const p = printPageHtml(html, { locale: "ar", title: "تقرير الشعبة", footer: undefined }, "sans-serif");
    assert.ok(p.startsWith(PRINT_MARK));
    assert.ok(p.includes("حفظ PDF / طباعة"), "Arabic toolbar");
    assert.match(p, /@page\{@bottom-right\{content:/, "right-to-left: the footer line on the right");
    assert.ok(p.includes("counter(page)") && p.includes("counter(pages)"));
    assert.ok(p.includes(`<h1>تقرير</h1><a href="https://x.test/p">رابط</a>`), "the content is untouched");
    assert.ok(p.indexOf("lr-print-bar\" role") > p.indexOf("<body>"), "toolbar inside the body");
    assert.ok(p.indexOf(`nonce="${NONCE_SLOT}"`) > p.indexOf("رابط"), "script at the end");
    const en = printPageHtml(html.replace('lang="ar" dir="rtl"', 'lang="en" dir="ltr"'), { locale: "en", title: "Class report" }, "sans-serif", { footer: false });
    assert.ok(en.includes("Save as PDF / Print") && !en.includes("@bottom-left"), "a certificate: no footer");
    assert.ok(isPrintPage(new TextEncoder().encode(p)) && !isPrintPage(new TextEncoder().encode("%PDF-1.7")));
    assert.deepEqual(missingTranslations(), []);
  });

  test("CSS strings cannot break out (a title with quotes, braces, </style>)", () => {
    const c = cssString(`a"b}{</style><script>x</script>\\`);
    assert.ok(!/["{}<>\\](?![0-9a-f])/.test(c.slice(1, -1).replace(/\\[0-9a-f]+ /g, "")), c);
    assert.ok(!c.includes("</style"));
  });

  test("the policy: only the print script (nonce or hash), data: images and fonts, nothing sent anywhere", () => {
    const p = printPagePolicy("abcDEF123456");
    assert.match(p, /default-src 'none'/); assert.match(p, /script-src 'nonce-abcDEF123456' 'sha256-[A-Za-z0-9+/=]+'/); assert.match(p, /img-src data:/); assert.match(p, /form-action 'none'/);
    assert.doesNotMatch(printPagePolicy(null), /nonce/);
  });

  test("links: print=1 on every PDF link, never a `download` attribute on one", () => {
    assert.equal(withPrint("/api/x?a=1"), "/api/x?a=1&print=1"); assert.equal(withPrint("/api/x"), "/api/x?print=1"); assert.equal(withPrint("/api/x?print=1"), "/api/x?print=1");
    assert.match(reportHref({ kind: "class", classId: "c1", format: "pdf", locale: "en" }), /format=pdf.*&print=1$/);
    assert.doesNotMatch(reportHref({ kind: "class", classId: "c1", format: "xlsx", locale: "en" }), /print=/, "Excel stays a download");
    assert.match(dashboardDownload("pdf", null, { from: null, to: null } as never), /print=1/);
    assert.doesNotMatch(dashboardDownload("xlsx", null, { from: null, to: null } as never), /print=1/);
    assert.match(compareDownload("pdf", { mode: "tests" }), /print=1/);
    assert.match(curriculumMapPdfHref(4, "staff", "en"), /print=1/);
    for (const h of ["/api/year-plan-pdf?classId=c", "/api/family-week?lang=ar", "/api/certificates/x?lang=en", "/api/nafs/export?format=pdf"]) assert.ok(isPrintHref(h), h);
    for (const h of ["/api/reports?format=xlsx", "/api/certificates/x?format=html", "/api/department-export"]) assert.ok(!isPrintHref(h), h);
    for (const f of ["src/components/reports/report-ui.tsx", "src/components/reports/report-downloads.tsx", "src/app/admin/analytics/page.tsx"]) assert.doesNotMatch(read(f), /\bdownload href=\{[^}]*"pdf"/, f);
    assert.match(read("src/components/report-kit/report-header.tsx"), /isPrintHref\(d\.href\) \? \{ target: "_blank"/);
    assert.match(read("src/components/teacher/report-bar.tsx"), /isPrintHref\(f\.href\) \? \{ target: "_blank"/);
    for (const [f, re] of [["src/app/teacher/map-center/year-tab.tsx", /year-plan-pdf\?\$\{new URLSearchParams\(\{ classId, print: "1" \}\)/], ["src/app/teacher/family-reports/this-week/page.tsx", /lang=ar&print=1/], ["src/app/student/reports/page.tsx", /&print=1`/], ["src/components/motivation/certificate-list.tsx", /lang=\$\{lang\}&print=1/], ["src/server/student/certificates.ts", /lang=\$\{lang\}&print=1/], ["src/components/nafs/reports-tab.tsx", /format=pdf&print=1/], ["src/components/diagnostic/class-report.tsx", /withPrint\(q\("pdf"\)\)/], ["src/app/teacher/map-center/test-page.tsx", /withPrint\(dl\("pdf"\)\)/]] as const) assert.match(read(f), re, f);
  });

  test("every PDF route answers through reportFileResponse; Chromium only behind PDF_ENGINE=server", () => {
    for (const f of ["reports", "family-week", "year-plan-pdf", "curriculum-map-pdf", "nafs/export", "nafs/compare", "nafs/dashboard", "map-test/export", "diagnostic/export", "certificates/[id]"]) {
      const src = read(`src/app/api/${f}/route.ts`);
      assert.match(src, /reportFileResponse\(req, /, f);
      assert.doesNotMatch(src, /"application\/pdf", "Content-Disposition"/, `${f}: no hand-made PDF response`);
    }
    const rt = read("src/server/reports/runtime.ts");
    assert.match(rt, /=== "server" \? "server" : "browser"/, "browser unless PDF_ENGINE=server");
    assert.match(read("src/lib/env.ts"), /PDF_ENGINE: z\.enum\(\["browser", "server"\]\)\.default\("browser"\)/);
    assert.match(read("src/reports/pdf.ts"), /export function chromiumRenderer/, "the Chromium renderer is kept (off)");
  });
});

let M: MapSchool;
describe("🖨 r84 every former PDF entry point (MAP fixture: reports, families, year plan, curriculum map, MAP test, diagnostic, certificates)", () => {
  before(async () => { M = await mapSchool(); M.b.S.m.latency = 0; });

  test("teacher reports, early warning, family week (one student / the whole class), year plan, curriculum map, MAP test", async () => {
    const repo = M.b.S.repo, c0 = M.classIds[0], st = M.studentIds[0];
    await entry(repo, "class report (EN)", "src/app/api/reports/route.ts", `/api/reports?kind=class&classId=${c0}&format=pdf&lang=en&period=TERM&print=1`, M.cookie);
    const ar = await entry(repo, "student report (AR)", "src/app/api/reports/route.ts", `/api/reports?kind=student&studentId=${st}&format=pdf&lang=ar&period=TERM`, M.cookie);
    assert.match(ar, /<html lang="ar" dir="rtl"/); assert.ok(ar.includes("حفظ PDF / طباعة"));
    await entry(repo, "early warning", "src/app/api/reports/route.ts", `/api/reports?kind=warning&classId=${c0}&scope=class&format=pdf&lang=en&period=TERM`, M.cookie);
    await entry(repo, "family week (student, AR)", "src/app/api/family-week/route.ts", `/api/family-week?studentId=${st}&lang=ar&print=1`, M.cookie);
    await entry(repo, "family week (class)", "src/app/api/family-week/route.ts", `/api/family-week?classId=${c0}&lang=en`, M.cookie);
    const yp = await entry(repo, "year plan", "src/app/api/year-plan-pdf/route.ts", `/api/year-plan-pdf?classId=${c0}&print=1`, M.cookie);
    const links = hrefsOf(yp).filter((h) => /^https?:/.test(h));
    assert.ok(links.length > 0, "the year plan keeps its clickable links");
    assert.ok(links.every((h) => /^https?:\/\/[^/]+\//.test(h)), "absolute links");
    const cm = await entry(repo, "curriculum map (staff)", "src/app/api/curriculum-map-pdf/route.ts", `/api/curriculum-map-pdf?grade=4&copy=staff&lang=en&print=1`, M.cookie);
    const fw = await entry(repo, "family week (student, EN)", "src/app/api/family-week/route.ts", `/api/family-week?studentId=${st}&lang=en`, M.cookie);
    assert.ok(/<svg class="plan-qr"/.test(cm + fw), "QR codes kept (inline SVG: nothing to fetch)");
    assert.ok(hrefsOf(cm + fw).some((h) => /^https?:\/\/[^/]+\//.test(h)), "clickable absolute links kept");
    await entry(repo, "MAP test results", "src/app/api/map-test/export/route.ts", `/api/map-test/export?id=${M.autoTest}&format=pdf&print=1`, M.cookie);
  });

  test("diagnostic report, a certificate (no footer), the student's and the parent's own reports", async () => {
    const repo = M.b.S.repo;
    const built = await buildDiagnostic(repo, M.admin, { grade: 4 });
    await openDiagnostic(repo, M.admin, built.id);
    await entry(repo, "diagnostic class report", "src/app/api/diagnostic/export/route.ts", `/api/diagnostic/export?testId=${built.id}&classId=${M.classIds[0]}&format=pdf&print=1`, M.cookie);
    // the student: their family-week report and a certificate
    const me = M.b.S.student;
    await entry(repo, "family week (the student themself)", "src/app/api/family-week/route.ts", "/api/family-week?lang=en&print=1", M.b.cookies.student);
    const cert = await repo.create("Certificate", { schoolId: me.schoolId, studentId: me.studentId, kind: "MANUAL", title: "Reading star", detail: "Five books this month", refId: "r84-test", createdById: M.admin.userId, createdAt: new Date() });
    const c = await entry(repo, "certificate (student)", "src/app/api/certificates/[id]/route.ts", `/api/certificates/${s(cert.id)}?lang=en&print=1`, M.b.cookies.student, { params: { id: s(cert.id) }, footer: false });
    assert.ok(c.includes("Reading star"));
    assert.doesNotMatch(c, /@bottom-/, "one page, no page numbers");
    // the parent: the child's progress report
    const pu = (await repo.findMany("User", { role: "PARENT" }, { take: 1 }))[0];
    const parent = await repo.findUnique("Parent", { userId: pu.id });
    const kid = parent ? (await repo.findMany("ParentStudent", { parentId: parent.id }, { take: 1 }))[0] : null;
    assert.ok(kid, "the demo parent has a child");
    await entry(repo, "parent: child's report", "src/app/api/reports/route.ts", `/api/reports?kind=student&studentId=${s(kid!.studentId)}&format=pdf&lang=en&period=TERM&print=1`, M.b.cookies.parent);
  });

  test("Excel stays a server download (unchanged)", async () => {
    const r = await call(M.b.S.repo, "src/app/api/reports/route.ts", `/api/reports?kind=class&classId=${M.classIds[0]}&format=xlsx&lang=en&period=TERM`, M.cookie);
    assert.equal(r.status, 200); assert.match(r.type, /spreadsheetml/); assert.match(r.disposition, /^attachment/);
  });
});

let N: NafsSchool;
describe("🖨 r84 NAFS entry points (results, across tests, dashboard, compare)", () => {
  before(async () => { N = await nafsSchool(); N.b.S.m.latency = 0; });
  test("each one: the print page with the PDF's content", async () => {
    const repo = N.b.S.repo;
    await entry(repo, "NAFS test results", "src/app/api/nafs/export/route.ts", `/api/nafs/export?testId=${N.tests[0]}&classId=${N.classId}&format=pdf&print=1`, N.cookie);
    await entry(repo, "NAFS across tests", "src/app/api/nafs/export/route.ts", `/api/nafs/export?view=across&classId=${N.classId}&format=pdf`, N.cookie);
    await entry(repo, "NAFS dashboard", "src/app/api/nafs/dashboard/route.ts", `/api/nafs/dashboard?format=pdf&classId=${N.classId}&print=1`, N.cookie);
    await entry(repo, "NAFS compare", "src/app/api/nafs/compare/route.ts", `/api/nafs/compare?format=pdf&mode=tests&classId=${N.classId}&print=1`, N.cookie);
  });
});

after(() => {
  // nothing above started — or even loaded — the browser engine
  assert.ok(!Object.keys(require.cache).some((k) => k.includes(`${"node_modules"}/playwright-core/`)), "playwright-core was never loaded");
});
