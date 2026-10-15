/**
 * 🖨 r84 manual check (not part of the suite): opens a print page in a real Chromium as a user would (JavaScript on),
 * prints it like the browser's "Save as PDF" (no Chromium footer template: the page's own CSS page numbers) and prints
 * the text of the PDF, plus a screenshot of the screen view. `npx tsx tests/helpers/r84-print-check.ts <out-dir>`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { loadFonts } from "../../src/reports/fonts";
import { renderHtml } from "../../src/reports/html";
import { printPageHtml, PRINT_MARK, NONCE_SLOT } from "../../src/reports/print-page";
import type { ReportDoc } from "../../src/reports/model";
import { ROOT } from "./db";

(async () => {
  const out = process.argv[2] ?? "/tmp/r84";
  mkdirSync(out, { recursive: true });
  const fonts = loadFonts(join(ROOT, "assets/fonts"));
  const { chromium } = await import("playwright-core");
  const b = await chromium.launch({ executablePath: process.env.REPORT_CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  for (const locale of ["en", "ar"] as const) {
    const rows = Array.from({ length: 80 }, (_x, i) => [`Student ${i + 1}`, 50 + (i % 50)]);
    const doc: ReportDoc = { kind: "class", locale, title: locale === "ar" ? "تقرير الشعبة" : "Class Progress Report", subtitle: "", branding: { name: "Demo School", nameAr: null, logo: null } as never, meta: [], sections: [{ type: "table", title: "Students", columns: [{ key: "n", label: "Name" }, { key: "s", label: "Score", align: "end" }], rows: rows.map(([n, sc]) => ({ n, s: sc })) } as never], primaryTable: "", fileStem: "class-report", generatedAt: new Date(), generatedBy: "Teacher" };
    const page = printPageHtml(renderHtml(doc, { fontCss: fonts.css, fontStack: fonts.stack }), doc, fonts.stack).slice(PRINT_MARK.length).split(` nonce="${NONCE_SLOT}"`).join("");
    const p = await b.newPage();
    await p.setContent(page, { waitUntil: "load" });
    await p.screenshot({ path: join(out, `screen-${locale}.png`) });
    await p.emulateMedia({ media: "print" });
    const pdf = await p.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    writeFileSync(join(out, `print-${locale}.pdf`), pdf);
    let text = "";
    try { text = execFileSync("pdftotext", ["-layout", join(out, `print-${locale}.pdf`), "-"]).toString("utf8"); } catch { text = "(pdftotext missing)"; }
    console.log(`--- ${locale}: ${pdf.length} bytes`);
    console.log(text.split("\n").filter((l) => /Page|صفحة|Save as|حفظ|Confidential|سرّي|Student 1\b/.test(l)).slice(0, 12).join("\n"));
    await p.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
