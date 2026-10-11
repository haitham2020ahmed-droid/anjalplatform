/**
 * 📘 The MAP Growth Learning Continuum as a PDF (“Language Usage & Reading”, one page per RIT band, goal area and
 * sub-topic headings, one statement per line with its CCSS codes at the right) → the continuum table the import
 * reads (Subject, RIT Low, RIT High, Goal Area, Sub-topic, Statement, Standards).
 *
 * Read from the text and its size: band titles are large (≈18 pt), goal areas ≈11.5 pt, sub-topics ≈9.5 pt,
 * statements ≈9.6 pt with the codes small (≈6.6 pt) on the same line. A statement wrapped onto a second line
 * continues in lower case; codes may wrap onto their own line. The appendix (standards reference) is skipped.
 */
import { CONTINUUM_HEADERS } from "./continuum";

const CODE = /^(RL|RI|RF|L|W|SL)\.(K|\d{1,2})\.\d{1,2}(\.[a-z])?$/;
export interface PdfWord { s: string; x: number; y: number; size: number }

/** The words of each page with their position and size (pdf.js). */
export async function pdfWords(bytes: Uint8Array): Promise<PdfWord[][]> {
  const pdfjs = (await import(/* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs")) as unknown as { getDocument: (o: Record<string, unknown>) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }> }> }> } };
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
  const out: PdfWord[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const items = (await (await doc.getPage(p)).getTextContent()).items;
    const words: PdfWord[] = [];
    for (const i of items) {
      if (!i.str || !i.str.trim()) continue;
      const size = Math.round(Math.hypot(i.transform[2], i.transform[3]) * 10) / 10;
      // one item may hold several words (a statement, or several codes): keep it whole but split codes
      const parts = size < 7.5 ? i.str.trim().split(/\s+/) : [i.str.trim()];
      parts.forEach((s, k) => words.push({ s, x: i.transform[4] + k, y: i.transform[5], size }));
    }
    out.push(words);
  }
  return out;
}

/** Pages of words → the continuum table (header row first). */
export function continuumTableFromWords(pages: PdfWord[][]): { table: string[][]; counts: Record<string, number> } {
  const H = [...CONTINUUM_HEADERS];
  const rows: string[][] = [];
  let subject = "", low = 0, high = 0, goal = "", topic = "", carry = "";
  let last: { page: number; y: number } | null = null;
  // “2–5 grade band”: the dash glyph comes out as spaces
  const tidy = (x: string) => x.replace(/\s*[\uE000-\uF8FF]\s*/g, "–").replace(/\b(K|\d{1,2})\s{2,}(\d{1,2})(?= grade band)/g, "$1–$2").replace(/\s+/g, " ").trim();
  const emit = (text: string, codes: string[], page: number, y: number) => { rows.push([subject, String(low), String(high), goal, topic || goal, tidy(text), codes.join(" ")]); last = { page, y }; };
  pages: for (let p = 0; p < pages.length; p++) {
    // lines: words within 4 pt vertically, top of the page first
    const ws = [...pages[p]].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; words: PdfWord[] }[] = [];
    for (const w of ws) { const l = lines[lines.length - 1]; if (l && Math.abs(l.y - w.y) <= 4) l.words.push(w); else lines.push({ y: w.y, words: [w] }); }
    for (const l of lines) {
      const words = l.words.sort((a, b) => a.x - b.x);
      const text = words.map((w) => w.s).join(" ").replace(/\s+/g, " ").trim();
      const big = Math.max(...words.map((w) => w.size));
      if (/^APPENDIX\b/i.test(text)) break pages;
      if (/Learning Continuum\s*·/.test(text) || /^MAP GROWTH/i.test(text) || /^Goal areas:/i.test(text)) continue;
      if (big >= 16) {
        const m = text.match(/(\d{3})\D*(\d{3})/); if (m) { low = Number(m[1]); high = Number(m[2]); }
        if (/LANGUAGE USAGE/i.test(text)) subject = "Language Usage"; else if (/\bREADING\b/i.test(text)) subject = "Reading";
        continue;
      }
      if (/^LANGUAGE USAGE$/i.test(text)) { subject = "Language Usage"; continue; }
      if (/^READING$/i.test(text)) { subject = "Reading"; continue; }
      if (/^\d+ statements?$/i.test(text) || big < 9 && !words.some((w) => CODE.test(w.s))) continue;
      const codes = words.filter((w) => w.size < 7.5 && CODE.test(w.s)).map((w) => w.s);
      const body = words.filter((w) => w.size >= 9).map((w) => w.s).join(" ").replace(/\s+/g, " ").trim();
      if (big >= 11) { goal = body; topic = ""; carry = ""; continue; }
      if (!subject || !goal) continue;
      if (!body && codes.length && rows.length) { const r = rows[rows.length - 1]; r[6] = [...new Set([...r[6].split(" ").filter(Boolean), ...codes])].join(" "); continue; }
      const lastNow = last as { page: number; y: number } | null;
      // the end of the statement above (wrapped, starts in lower case, right under it)
      if (!carry && lastNow && lastNow.page === p && lastNow.y - l.y < 16 && /^[a-z(]/.test(body)) {
        const r = rows[rows.length - 1]; r[5] = tidy(`${r[5]}  ${body}`); if (codes.length) r[6] = [...new Set([...r[6].split(" ").filter(Boolean), ...codes])].join(" ");
        last = { page: p, y: l.y }; continue;
      }
      if (codes.length) { emit(`${carry} ${body}`, codes, p, l.y); carry = ""; continue; }
      // no codes: a sub-topic heading (slightly smaller, bold), else the first line of a wrapped statement
      if (big < 9.55) { topic = body; carry = ""; } else carry = `${carry} ${body}`.trim();
    }
  }
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r[0]] = (counts[r[0]] ?? 0) + 1;
  return { table: [H, ...rows], counts };
}
