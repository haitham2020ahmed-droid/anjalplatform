/**
 * 🖨 r84: the "PDF" links open a print-ready page (the user's browser saves it as a PDF; see src/reports/print-page.ts).
 *   withPrint(href)   the link with print=1: the print window opens once by itself
 *   isPrintHref(href) a "PDF" link (no `download` attribute: the page must open, not be saved as a .html file)
 */
const PDF_ROUTES = /^\/api\/(year-plan-pdf|curriculum-map-pdf|family-week|certificates\/)/;

export function withPrint(href: string): string {
  if (/[?&]print=1(&|#|$)/.test(href)) return href;
  const [path, hash] = href.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}print=1${hash !== undefined ? `#${hash}` : ""}`;
}

export function isPrintHref(href: string): boolean {
  if (/[?&]print=1(&|#|$)/.test(href)) return true;
  if (/[?&]format=pdf(&|#|$)/.test(href)) return true;
  return PDF_ROUTES.test(href) && !/[?&]format=(html|xlsx|csv)(&|#|$)/.test(href);
}
