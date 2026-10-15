/**
 * 🖨 r84: every "PDF" is made by the USER'S browser, not by a Chromium inside the server.
 *
 * Why: the server has 512 MB; a headless Chromium needed 150–200 MB of it per launch, and opening a heavy report right
 * after a deploy got the server killed. The same self-contained HTML the PDF was printed from (src/reports/html.ts and
 * the other templates: fonts embedded as data: URIs, A4 @page rules, clickable absolute links, QR codes as inline SVG)
 * is now sent as a print-ready page with a small toolbar: "🖨 Save as PDF / Print" calls window.print(); with ?print=1
 * the print window opens once by itself. The browser shapes Arabic and lays out right-to-left itself.
 *
 *   printPageHtml(html, doc, fontStack, opts)  the report's HTML + the toolbar (hidden when printing), page numbers and
 *                                              the footer line through CSS @page margin boxes (in place of Chromium's
 *                                              footer template), and the one small script (its nonce is filled in by
 *                                              the response: src/server/reports/file-response.ts)
 *   printPageRenderer()                        a PdfRenderer that returns that page (as UTF-8 bytes), so every export
 *                                              service works unchanged; the response sees PRINT_MARK and serves HTML
 * The Chromium renderer (src/reports/pdf.ts) is kept, OFF by default: PDF_ENGINE=server switches it back on.
 */
import type { ReportDoc } from "./model";
import type { PdfRenderer } from "./pdf";
import { dirOf, t, type Locale } from "./i18n";

/** The first bytes of a print page (a real PDF starts with "%PDF-"). */
export const PRINT_MARK = "<!--literise:print-page-->";
/** Replaced by the response with the request's CSP nonce (or removed). */
export const NONCE_SLOT = "__LITERISE_PRINT_NONCE__";

/** The page's only script: the toolbar button prints; ?print=1 opens the print window once (then leaves the address). */
export const PRINT_SCRIPT = `(function(){var b=document.getElementById("lr-print");if(b)b.addEventListener("click",function(){window.print()});try{var u=new URL(window.location.href);if(u.searchParams.get("print")==="1"){u.searchParams.delete("print");window.history.replaceState(null,"",u.toString());window.setTimeout(function(){window.print()},400)}}catch(e){}})();`;

const escHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** A CSS string literal: everything but plain letters, digits, spaces and common punctuation as a CSS escape. */
export function cssString(v: string): string {
  return `"${[...v.replace(/[\r\n]+/g, " ")].map((c) => (/[\p{L}\p{N} .,:;·()–—\-_/+%#&]/u.test(c) ? c : `\\${c.codePointAt(0)!.toString(16)} `)).join("")}"`;
}

/** The footer line of the PDF (the same text as Chromium's footer template). */
function footerText(doc: ReportDoc): string {
  const L = doc.locale;
  return doc.footer !== undefined ? doc.footer : `${doc.title ?? ""}${doc.title ? " · " : ""}${t(L, "confidential")}`;
}

export interface PrintPageOptions {
  /** false: no footer line and no page numbers (a one-page certificate) */
  footer?: boolean;
}

/** The report's HTML as a print-ready page (toolbar, page numbers, the print script). */
export function printPageHtml(html: string, doc: Pick<ReportDoc, "locale" | "title" | "footer">, fontStack: string, opts: PrintPageOptions = {}): string {
  const L: Locale = doc.locale === "ar" ? "ar" : "en";
  const rtl = dirOf(L) === "rtl";
  const box = `font-family:${fontStack.replace(/[<>{}]/g, "")};font-size:7pt;color:#64748b;`;
  const pageNo = `${cssString(`${t(L, "page")} `)} counter(page) ${cssString(` ${t(L, "of")} `)} counter(pages)`;
  const [textBox, numBox] = rtl ? ["@bottom-right", "@bottom-left"] : ["@bottom-left", "@bottom-right"];
  const margins = opts.footer === false ? "" : `${textBox}{content:${cssString(footerText(doc as ReportDoc))};${box}vertical-align:middle;border-top:0.5px solid #cbd5e1;}${numBox}{content:${pageNo};${box}white-space:nowrap;vertical-align:middle;border-top:0.5px solid #cbd5e1;}`;
  const css = `<style id="lr-print-css">
${margins ? `@page{${margins}}\n@page wide{${margins}}` : ""}
.lr-print-bar{position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:10px 16px;margin:0 0 12px;background:#1f3a68;color:#fff;font-family:${fontStack.replace(/[<>{}]/g, "")};font-size:14px;line-height:1.4;}
.lr-print-bar button{min-height:44px;padding:8px 18px;border:0;border-radius:12px;background:#fff;color:#1f3a68;font:inherit;font-weight:700;cursor:pointer;}
.lr-print-bar button:focus-visible{outline:3px solid #fbbf24;outline-offset:2px;}
.lr-print-bar span{opacity:.9;}
@media screen{html{background:#e2e8f0;}body{max-width:1100px;margin:0 auto 24px;padding:0 min(12mm,4vw) 12mm;background:#fff;box-shadow:0 1px 8px rgba(15,23,42,.18);min-height:100vh;}.lr-print-bar{margin:0 calc(-1 * min(12mm,4vw)) 14px;}}
@media print{.lr-print-bar{display:none!important;}}
</style>`;
  const bar = `<div class="lr-print-bar" role="toolbar" aria-label="${escHtml(t(L, "print.save"))}"><button type="button" id="lr-print">🖨 ${escHtml(t(L, "print.save"))}</button><span>${escHtml(t(L, "print.hint"))}</span></div>`;
  const script = `<script nonce="${NONCE_SLOT}">${PRINT_SCRIPT}</script>`;
  let out = html;
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, () => `${css}</head>`) : `${css}${out}`;
  out = /<body[^>]*>/i.test(out) ? out.replace(/<body[^>]*>/i, (m) => `${m}${bar}`) : `${bar}${out}`;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => `${script}</body>`) : `${out}${script}`;
  return PRINT_MARK + out;
}

/** True when the bytes are a print page (not a PDF file). */
export function isPrintPage(bytes: Uint8Array): boolean {
  if (bytes.length < PRINT_MARK.length) return false;
  for (let i = 0; i < PRINT_MARK.length; i++) if (bytes[i] !== PRINT_MARK.charCodeAt(i)) return false;
  return true;
}

/** The default "renderer": no Chromium — the report's HTML as a print page the user's browser saves as a PDF. */
export function printPageRenderer(): PdfRenderer & { engine: "browser" } {
  return {
    engine: "browser",
    async render(html, doc, fontStack, opts) {
      return new TextEncoder().encode(printPageHtml(html, doc, fontStack, { footer: opts?.footer }));
    },
    async close() { /* nothing to close */ },
  };
}
