/**
 * 📄 NWEA “Achievement Status and Growth Projection Report” (ASG, PDF) → MAP scores with the Spring projection.
 * The NWEA data export (CSV) has the goal areas and Lexile but NO projection; the ASG report has the projection
 * and growth. Importing both gives the platform the complete picture.
 *
 * ASG layout (one table per subject: “Language Arts: Reading” / “Language Arts: Language Usage”):
 *   Student ID · Student Name · Grade · Date · RIT Score Range (low-RIT-high) · Achievement Percentile Range
 *   (low-pct-high) · [Spring columns, empty in Fall] · Projected RIT · Projected Growth · …
 *   Header: “Term Tested: Fall 2026-2027”, “Norms Reference Data: 2025 Norms”.
 */
import { MAP_TEMPLATE_HEADERS } from "./student-map";

export interface AsgRow { studentId: string; name: string; subject: "READING" | "LANGUAGE"; grade: number | null; rit: number; ritLow: number; ritHigh: number; percentile: number | null; projectedRit: number | null; projectedGrowth: number | null }
export interface AsgParsed { term: string | null; season: "FALL" | "WINTER" | "SPRING"; year: number; norms: string | null; rows: AsgRow[] }

export interface PdfItem { s: string; x: number; y: number }

/** The text items of each PDF page (with their position). */
export async function pdfPages(bytes: Uint8Array): Promise<PdfItem[][]> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as { getDocument: (o: Record<string, unknown>) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }> }> }> } };
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
  const out: PdfItem[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    out.push((await page.getTextContent()).items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] })));
  }
  return out;
}

/**
 * PDF pages → one text line per student (each value is attached to the student ID nearest to it vertically:
 * in the ASG a wrapped name moves the scores half a line up or down), plus the page's header lines.
 */
export function asgLinesFromPages(pages: PdfItem[][]): string[] {
  const out: string[] = [];
  for (const items of pages) {
    const ids = items.filter((i) => /^\d{5,}$/.test(i.s.trim()) && i.x < 120).sort((a, b) => b.y - a.y);
    const rows = new Map<number, PdfItem[]>();
    for (const it of items) {
      if (ids.includes(it)) continue;
      const near = ids.reduce<PdfItem | null>((best, id) => (Math.abs(id.y - it.y) < 12 && (!best || Math.abs(id.y - it.y) < Math.abs(best.y - it.y)) ? id : best), null);
      if (near && it.x > near.x) { const k = ids.indexOf(near); rows.set(k, [...(rows.get(k) ?? []), it]); }
      else { const k = -1 - Math.round(it.y / 4); rows.set(k, [...(rows.get(k) ?? []), it]); }   // header / other text: its own line
    }
    const lines: { y: number; text: string }[] = [];
    for (const [k, list] of rows) {
      const head = k >= 0 ? ids[k] : null;
      const all = (head ? [head, ...list] : list).sort((a, b) => a.x - b.x);
      lines.push({ y: head ? head.y : all[0].y, text: all.map((i) => i.s).join(" ") });
    }
    ids.forEach((id, k) => { if (!rows.has(k)) lines.push({ y: id.y, text: id.s }); });
    out.push(...lines.sort((a, b) => b.y - a.y).map((l) => l.text));
  }
  return out;
}

/** Reads the ASG lines (from pdfLines or from a text export of the PDF). */
export function parseAsg(lines: string[]): AsgParsed {
  let subject: "READING" | "LANGUAGE" | null = null, term: string | null = null, norms: string | null = null;
  const rows: AsgRow[] = [];
  for (const raw of lines) {
    // “193-   197   -201” (split by the PDF) → “193-197-201”
    const line = raw.replace(/\s+/g, " ").replace(/(\d{1,3})-\s*(\d{1,3})\s*-\s*(\d{1,3})/g, "$1-$2-$3").trim();
    if (!term) { const m = line.match(/Term Tested:\s*(Fall|Winter|Spring)\s+(\d{4})-(\d{4})/i); if (m) term = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}-${m[3]}`; }
    if (!norms) { const m = line.match(/Norms Reference Data:\s*(\d{4}) Norms/i); if (m) norms = `${m[1]} Norms`; }
    if (/Language Arts:\s*Reading/i.test(line)) subject = "READING";
    else if (/Language Arts:\s*Language Usage/i.test(line)) subject = "LANGUAGE";
    // a student row: ID … grade date low-RIT-high low-pct-high … projected RIT, projected growth
    const m = line.match(/^(\d{5,})\s+(.*?)\s(\d{1,2}|K)\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+(\d{3})-(\d{3})-(\d{3})\s+(\d{1,2})-(\d{1,2})-(\d{1,2})\s*(.*)$/);
    if (!m || !subject) continue;
    const rest = m[10].trim().split(/\s+/).filter((x) => /^-?\d+$/.test(x)).map(Number);
    // in Fall the Spring columns are empty: the next two numbers are Projected RIT and Projected Growth
    const projIx = rest.findIndex((n) => n >= 100 && n <= 350);
    const projectedRit = projIx >= 0 ? rest[projIx] : null;
    const projectedGrowth = projIx >= 0 && rest[projIx + 1] !== undefined && Math.abs(rest[projIx + 1]) <= 60 ? rest[projIx + 1] : projectedRit !== null ? projectedRit - Number(m[5]) : null;
    rows.push({ studentId: m[1], name: m[2].replace(/\s+/g, " ").trim(), subject, grade: m[3] === "K" ? 0 : Number(m[3]), rit: Number(m[5]), ritLow: Number(m[4]), ritHigh: Number(m[6]), percentile: Number(m[8]), projectedRit, projectedGrowth });
  }
  const tm = (term ?? "").match(/(Fall|Winter|Spring) (\d{4})-(\d{4})/);
  const season = (tm ? tm[1].toUpperCase() : "FALL") as AsgParsed["season"];
  const year = tm ? (season === "FALL" ? Number(tm[2]) : Number(tm[3])) : new Date().getFullYear();
  return { term, season, year, norms, rows };
}

/** ASG rows → the platform's MAP template table (one row per student, Reading and Language Usage). */
export function asgToTable(p: AsgParsed): string[][] {
  const H = [...MAP_TEMPLATE_HEADERS], col = (h: string) => H.indexOf(h);
  const by = new Map<string, string[]>();
  for (const r of p.rows) {
    const row = by.get(r.studentId) ?? H.map(() => "");
    row[0] = r.studentId; row[1] = row[1] || r.name; row[2] = r.grade !== null ? String(r.grade) : "";
    const read = r.subject === "READING";
    row[col(read ? "Reading Fall RIT" : "Language Fall RIT")] = String(r.rit);
    if (r.percentile !== null) row[col(read ? "Reading Fall Percentile" : "Language Fall Percentile")] = String(r.percentile);
    if (r.projectedRit !== null && p.season === "FALL") row[col(read ? "Reading Spring Projection" : "Language Spring Projection")] = String(r.projectedRit);
    by.set(r.studentId, row);
  }
  return [H, ...by.values()];
}
