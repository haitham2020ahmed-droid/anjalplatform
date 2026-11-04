/**
 * The report "PDF" engine of the Next.js server.
 *   PDF_ENGINE=browser (default, r84)  no Chromium on the server: a "PDF" is a print-ready page the user's browser
 *                                      prints or saves as a PDF (src/reports/print-page.ts) — 0 MB on the server
 *   PDF_ENGINE=server                  the old way: one headless Chromium per server process (150–200 MB while it
 *                                      runs), shared by all requests, bounded by REPORT_PDF_CONCURRENCY
 */
import "server-only";
import { resolve } from "node:path";
import { env } from "@/lib/env";
import { chromiumRenderer, type PdfRenderer } from "@/reports/pdf";
import { printPageRenderer } from "@/reports/print-page";
import { repo } from "@/server/auth/next";
import type { ReportDeps } from "./service";

const g = globalThis as unknown as { __reportPdf?: PdfRenderer; __reportPrint?: PdfRenderer };

/** "server" only when PDF_ENGINE=server is set; anything else is the browser. */
export function pdfEngine(): "browser" | "server" {
  return (process.env.PDF_ENGINE ?? "").trim().toLowerCase() === "server" ? "server" : "browser";
}

/** The renderer for the engine in use (Chromium is created — never started — only for PDF_ENGINE=server). */
export function reportRenderer(): PdfRenderer {
  if (pdfEngine() === "server") {
    g.__reportPdf ??= chromiumRenderer({
      executablePath: env.REPORT_CHROMIUM_PATH || undefined,
      concurrency: env.REPORT_PDF_CONCURRENCY,
      args: env.REPORT_CHROMIUM_NO_SANDBOX === "true" ? ["--no-sandbox"] : [],
    });
    return g.__reportPdf;
  }
  g.__reportPrint ??= printPageRenderer();
  return g.__reportPrint;
}

export function reportDeps(): ReportDeps {
  return { repo, pdf: reportRenderer(), fontDir: resolve(env.REPORT_FONT_DIR), brandingDir: resolve(env.REPORT_BRANDING_DIR) };
}
