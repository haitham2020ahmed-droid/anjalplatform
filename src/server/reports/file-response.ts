/**
 * 🖨 r84: the response of every report download route. A print page (src/reports/print-page.ts, the default
 * PDF_ENGINE=browser) is served as an HTML page the user's browser prints or saves as a PDF; a real file (Excel, CSV,
 * or a PDF from the server's Chromium when PDF_ENGINE=server) is served as a download, as before.
 *
 * The print page's one script runs with the request's CSP nonce (set by the middleware) and is also allowed by its
 * hash in the page's own policy; nothing else can run, load or be sent (default-src 'none'; images and fonts are data:).
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isPrintPage, NONCE_SLOT, PRINT_MARK, PRINT_SCRIPT } from "../../reports/print-page";
import { contentDisposition } from "./service";

export const PRINT_SCRIPT_HASH = `sha256-${createHash("sha256").update(PRINT_SCRIPT).digest("base64")}`;

/** The print page's own Content-Security-Policy (nonce: the request's, when the middleware gave one). */
export function printPagePolicy(nonce: string | null): string {
  return [
    "default-src 'none'",
    `script-src ${nonce ? `'nonce-${nonce}' ` : ""}'${PRINT_SCRIPT_HASH}'`,
    "style-src 'unsafe-inline'",
    "img-src data:",
    "font-src data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
}

const NONCE = /^[A-Za-z0-9+/=_-]{8,128}$/;

/** The print page as sent: the nonce filled in and the file's name as the page title (= the saved PDF's name). */
export function printPageText(bytes: Uint8Array, nonce: string | null, filename?: string): string {
  let html = new TextDecoder().decode(bytes);
  if (html.startsWith(PRINT_MARK)) html = html.slice(PRINT_MARK.length);
  html = nonce ? html.split(NONCE_SLOT).join(nonce) : html.split(` nonce="${NONCE_SLOT}"`).join("");
  if (filename) {
    const stem = filename.replace(/\.pdf$/i, "").replace(/[<>&"']/g, "");
    if (stem) html = html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${stem}</title>`);
  }
  return html;
}

/** A report download route's response for an export result ({ bytes, contentType, filename }). */
export function reportFileResponse(req: Request, file: { bytes: Uint8Array; contentType: string; filename: string }) {
  if (isPrintPage(file.bytes)) {
    const n = req.headers.get("x-nonce");
    const nonce = n && NONCE.test(n) ? n : null;
    return new NextResponse(printPageText(file.bytes, nonce, file.filename), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": printPagePolicy(nonce),
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": contentDisposition(file.filename),
      "Content-Length": String(file.bytes.length),
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
