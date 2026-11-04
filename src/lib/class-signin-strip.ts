/**
 * 🖨 r85: the small "class sign-in" strip printed in the header of a weekly sheet — the class's printable QR, its
 * name, and one line of instructions. Plain HTML string (for the report renderers: family week, Year plan). The
 * React print pages use <ClassSignInStrip> (src/components/class-signin/strip.tsx) with the same words.
 * Only ever built for a teacher's print of their own class (printQrForSheet): never for a student or parent page.
 * No server imports.
 * 🔁 fix (Oct 2026, "الكود مالوش داعي... اي حد ممكن يستخدمه"): dropped the class code from the strip (and the
 * "type the class code" step) — signing in no longer needs one (class-print-qr.ts#signInByName). `code` stays on
 * `ClassSignInStrip` for now (unused here) so callers that still pass it don't need touching.
 */
import { qrPath } from "./qr";

export interface ClassSignInStrip { url: string; code: string; className: string }
type T = (text: string, vars?: Record<string, string | number>) => string;

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const STRIP_STEPS = "Scan → tap your name → you're in";

/** The QR as an SVG string ("" when the link cannot be drawn). */
export function stripQrSvg(url: string, sizePx = 72): string {
  try {
    const q = qrPath(url);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${q.total} ${q.total}" width="${sizePx}" height="${sizePx}" role="img" aria-label="QR" shape-rendering="crispEdges"><rect width="${q.total}" height="${q.total}" fill="#fff"/><path d="${q.d}" fill="#000"/></svg>`;
  } catch { return ""; }
}

export const STRIP_CSS = `.cs-strip{display:flex;align-items:center;gap:10px;margin:0 0 10px;padding:6px 10px;border:1.5px dashed #94a3b8;border-radius:12px;background:#fff;break-inside:avoid;page-break-inside:avoid}
.cs-strip svg{flex:none;display:block}
.cs-strip b{display:block;font-size:14pt;color:#1e3a5f;line-height:1.2}
.cs-strip .cs-code{font-family:ui-monospace,monospace;letter-spacing:.15em}
.cs-strip small{display:block;font-size:9.5pt;color:#334155;line-height:1.35}`;

/** The strip ("" when there is nothing to print). */
export function classSignInStripHtml(s: ClassSignInStrip | null | undefined, t: T): string {
  if (!s) return "";
  const svg = stripQrSvg(s.url);
  if (!svg) return "";
  return `<div class="cs-strip" data-class-signin="1">${svg}<div><b dir="auto"><bdi>${esc(s.className)}</bdi></b><small>${esc(t(STRIP_STEPS))}</small></div></div>`;
}
