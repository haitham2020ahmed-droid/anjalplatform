import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { certificateFor, certificateHtml } from "@/server/motivation/certificates";
import { loadBranding } from "@/server/reports/service";
import { loadFonts } from "@/reports/fonts";
import { toLang } from "@/i18n";
import { getLang } from "@/i18n/server";
import type { ReportDoc } from "@/reports/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 📜 GET /api/certificates/<id>[?format=html][&lang=ar][&print=1] — one certificate: a print page to save as a PDF (r84 default; a
 * PDF file only with PDF_ENGINE=server) or the plain printable page (format=html).
 * The student, their parent, their teachers and the school admin only (unknown and forbidden look the same). The PDF
 * renderer (Chromium) is loaded on the first PDF only and shared (src/server/reports/runtime.ts).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Sign in.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const lang = q.get("lang") ? toLang(q.get("lang")) : await getLang();
  try {
    const d = await certificateFor(repo, actor, (await params).id);
    const branding = await loadBranding(repo, d.schoolId, resolve(env.REPORT_BRANDING_DIR));
    const fonts = q.get("format") === "html" ? { css: "", stack: `"Lexend", "Segoe UI", Tahoma, sans-serif` } : loadFonts(resolve(env.REPORT_FONT_DIR));
    const html = certificateHtml(d, branding, lang, fonts);
    if (q.get("format") === "html") return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:" } });
    const { reportDeps } = await import("@/server/reports/runtime");   // the PDF engine only when a PDF is asked for
    const { reportFileResponse } = await import("@/server/reports/file-response");
    const deps = reportDeps();
    if (!deps.pdf) return new NextResponse("PDF is not available. Use Print instead.", { status: 503 });
    const doc: ReportDoc = { kind: "student", locale: lang, title: "Certificate", subtitle: "", branding, meta: [], sections: [], primaryTable: "", fileStem: "certificate", generatedAt: new Date(), generatedBy: "" };
    // r84: by default a print page (the browser saves it as a PDF); a PDF file only with PDF_ENGINE=server
    const bytes = await deps.pdf.render(html, doc, fonts.stack, { footer: false });
    return reportFileResponse(req, { bytes, contentType: "application/pdf", filename: `Certificate-${d.cert.date}.pdf` });
  } catch (e) {
    if (e instanceof ForbiddenError) return new NextResponse("Not found.", { status: 404 });
    if (e instanceof Error && /busy/i.test(e.message)) return new NextResponse(e.message, { status: 503 });
    throw e;
  }
}
