/**
 * ⚡ The import preview's tabs (Admin → Questions → Import questions → a file), shared by the server (which counts
 * the rows and sends only one page of the chosen tab to the browser) and the page (which updates the counts after
 * an edit without reading every row again). No server code here.
 */
export type PreviewFilter = "all" | "ready" | "errors" | "duplicates" | "done";
export const PREVIEW_FILTERS: readonly PreviewFilter[] = ["all", "ready", "errors", "duplicates", "done"];
/** rows per page of the preview */
export const PREVIEW_PAGE = 50;

/** What the tabs need to know about a row. `duplicate`: the row repeats a question of the bank. */
export interface PreviewRowState { status: string; decision: string; selected: boolean; duplicate: unknown }

export function inFilter(filter: PreviewFilter, r: PreviewRowState): boolean {
  switch (filter) {
    case "ready": return r.status === "VALID";
    case "errors": return r.status === "INVALID" || r.status === "FAILED";
    case "duplicates": return r.status === "DUPLICATE" || Boolean(r.duplicate);
    case "done": return r.status === "IMPORTED" || r.status === "REPLACED";
    default: return true;
  }
}

/** The row will be imported when the admin presses Import. */
export const willImport = (r: PreviewRowState) => r.selected && r.status !== "INVALID" && !(r.status === "DUPLICATE" && r.decision === "SKIP") && r.decision !== "SKIP";

export type PreviewCounts = Record<PreviewFilter, number> & { toImport: number };

export function emptyCounts(): PreviewCounts {
  return { all: 0, ready: 0, errors: 0, duplicates: 0, done: 0, toImport: 0 };
}

/** Adds (sign 1) or removes (sign -1) one row from the counts. */
export function countRow(c: PreviewCounts, r: PreviewRowState, sign = 1): PreviewCounts {
  for (const f of PREVIEW_FILTERS) if (inFilter(f, r)) c[f] += sign;
  if (willImport(r)) c.toImport += sign;
  return c;
}

export const parseFilter = (v: unknown): PreviewFilter | null => (PREVIEW_FILTERS as readonly string[]).includes(String(v)) ? (v as PreviewFilter) : null;
