/**
 * Process-wide PDF renderer for the Next.js server (one Chromium per server process,
 * shared by all requests, bounded by REPORT_PDF_CONCURRENCY).
 */
import "server-only";
import { resolve } from "node:path";
import { env } from "@/lib/env";
import { chromiumRenderer, type PdfRenderer } from "@/reports/pdf";
import { repo } from "@/server/auth/next";
import type { ReportDeps } from "./service";

const g = globalThis as unknown as { __reportPdf?: PdfRenderer };

export function reportDeps(): ReportDeps {
  g.__reportPdf ??= chromiumRenderer({
    executablePath: env.REPORT_CHROMIUM_PATH || undefined,
    concurrency: env.REPORT_PDF_CONCURRENCY,
    args: env.REPORT_CHROMIUM_NO_SANDBOX === "true" ? ["--no-sandbox"] : [],
  });
  return { repo, pdf: g.__reportPdf, fontDir: resolve(env.REPORT_FONT_DIR), brandingDir: resolve(env.REPORT_BRANDING_DIR) };
}
