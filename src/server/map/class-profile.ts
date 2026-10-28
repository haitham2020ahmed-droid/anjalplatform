/**
 * 📄 NWEA MAP Growth “Class Profile” report (PDF, Instructional Areas tab → “Instructional Area Details by
 * Student—Growth” table) → MAP scores. Unlike the ASG report (asg.ts) a Class Profile has no Student ID column —
 * students are matched by name only (see importMapScores) — and it gives the per-student Achievement Percentile,
 * RIT, Lexile range (Reading only) and the 3 instructional-area RIT scores, but NO Spring projection (that still
 * needs the ASG report or the NWEA data export).
 *
 * Layout: one table per subject (“… Reading …” / “… Language Usage …”), printed from reports.mapnwea.org. A
 * heading “Instructional Area Details by Student—Growth: …”, a “<class> | Grade <n> | <school> | <subject>” line,
 * then one row per tested student: “Last, First” · Grade · Achievement Percentile · RIT Score · [Lexile range,
 * Reading only] · 3 instructional-area RIT scores. Continuation pages repeat only the column-header row, not the
 * section title, so “are we inside the table” has to carry across pages. A “Students … with No Test Data” table
 * and a “…—Screening…” table (a different assessment) may follow — both are skipped, as is the trailing
 * “Percentiles Key” legend row that NWEA prints under the last page of the table.
 */
import type { PdfItem } from "./asg";
import { MAP_TEMPLATE_HEADERS } from "./student-map";

export interface ClassProfileRow { name: string; grade: number | null; percentile: number; rit: number; lexile: number | null; areas: number[] }
export interface ClassProfileParsed { subject: "READING" | "LANGUAGE_USAGE" | null; className: string | null; term: string | null; season: "FALL" | "WINTER" | "SPRING"; year: number; rows: ClassProfileRow[] }

const START_RE = /Instructional Area Details by Student.*Growth/i;
const STOP_RE = /Instructional Area (Achievement Percentiles|Details by Student).*Screening|Students (Grouped|with No Test Data)|Instructional Area Achievement Percentiles\s*-\s*Growth/i;
const CLASS_RE = /^(\S+)\s*\|\s*Grade/;
const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4},?$/;
const LEGEND_RE = /^(>80th|Percentiles)$/i;
const ORD_RE = /^(\d+)(st|nd|rd|th)$/i;
const LEX_RE = /^(BR)?(\d+)L-(BR)?(\d+)L$/i;

function ordinal(s: string): number | null { const m = s.match(ORD_RE); return m ? Number(m[1]) : null; }
function lexileMid(s: string): number | null {
  const m = s.replace(/\s+/g, "").match(LEX_RE);
  if (!m) return null;
  const lo = m[1] ? 0 : Number(m[2]), hi = m[3] ? 0 : Number(m[4]);
  return Math.round((lo + hi) / 2);
}

/** Page items grouped into text lines (items within 0.5pt of the same vertical position merged), top-to-bottom. */
function pageLines(items: PdfItem[]): { d: number; text: string }[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x); // top-to-bottom, then left-to-right on the same line
  const out: { d: number; text: string }[] = [];
  for (const it of sorted) {
    const d = -it.y;
    const last = out[out.length - 1];
    if (last && Math.abs(last.d - d) <= 0.5) last.text += " " + it.s;
    else out.push({ d, text: it.s });
  }
  return out;
}

/** The PDF pages (from asg.ts's pdfPages) → the parsed Class Profile table (one subject per call). */
export function parseClassProfile(pages: PdfItem[][]): ClassProfileParsed {
  let subject: ClassProfileParsed["subject"] = null;
  let className: string | null = null;
  let term: string | null = null;
  let inTable = false;
  const rows: ClassProfileParsed["rows"] = [];

  for (const items of pages) {
    const withD = items.map((it) => ({ ...it, d: -it.y }));
    const lines = pageLines(items);
    if (!term) { for (const l of lines) { const m = l.text.match(/(Fall|Winter|Spring)\s+(\d{4})-(\d{4})/i); if (m) { term = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}-${m[3]}`; break; } } }

    // Find every table-start / table-stop marker on this page, in order, carrying `inTable` in from the previous page.
    type Marker = { d: number; start: boolean };
    const markers: Marker[] = [];
    for (const l of lines) {
      if (START_RE.test(l.text)) markers.push({ d: l.d, start: true });
      else if (STOP_RE.test(l.text)) markers.push({ d: l.d, start: false });
      if (!subject) { if (/Reading/i.test(l.text) && START_RE.test(l.text)) subject = "READING"; else if (/Language/i.test(l.text) && START_RE.test(l.text)) subject = "LANGUAGE_USAGE"; }
      const cm = l.text.match(CLASS_RE);
      if (cm && !className) className = cm[1];
    }
    markers.sort((a, b) => a.d - b.d);

    // Build the active [lo, hi) vertical segments on this page from the markers, continuing `inTable` across the page boundary.
    const segs: { lo: number; hi: number }[] = [];
    let lo: number | null = inTable ? -Infinity : null;
    for (const m of markers) {
      if (m.start) { lo = m.d; }
      else { if (lo !== null) segs.push({ lo, hi: m.d }); lo = null; }
    }
    if (lo !== null) segs.push({ lo, hi: Infinity });
    inTable = lo !== null;

    for (const seg of segs) {
      let hi = seg.hi;
      // Clip out the trailing "Percentiles Key" legend by its unique word-level tokens (position/clustering-independent).
      const legendDs = withD.filter((w) => w.d >= seg.lo && w.d < hi && LEGEND_RE.test(w.s.trim())).map((w) => w.d);
      if (legendDs.length) hi = Math.min(hi, Math.min(...legendDs));
      const segWords = withD.filter((w) => w.d >= seg.lo && w.d < hi);
      if (!segWords.length) continue;

      // Row anchors: "Lastname," items (x<150, PDF text engines vary — the comma may or may not be the item's last
      // character if "Lastname, Firstname" was drawn as one run), excluding the page's date/time stamp (which also
      // contains a comma and otherwise matches).
      const anchors = segWords.filter((w) => w.x < 150 && /,/.test(w.s.trim()) && !DATE_RE.test(w.s.trim())).sort((a, b) => a.d - b.d);
      if (!anchors.length) continue;
      // Drop header-row remnants sitting well above the first real row (true headers sit 38-60+ units above; a
      // same-row wrapped Lexile fragment can sit ~13 units above its own anchor — 20 safely separates the two).
      const floor = anchors[0].d - 20;
      const rowWords = segWords.filter((w) => w.d > floor);

      for (const a of anchors) {
        const sameLine = rowWords.filter((w) => w !== a && Math.abs(w.d - a.d) <= 2 && w.x > a.x && w.x < 220).sort((x, y) => x.x - y.x);
        const name = (a.s.trim() + (sameLine.length ? " " + sameLine.map((w) => w.s).join(" ") : "")).replace(/\s+/g, " ").replace(/,(?=\S)/g, ", ").trim();
        const others = rowWords.filter((w) => w.x >= 220);
        // assign each "other" word to its nearest anchor (by vertical distance), not just the same line — capped,
        // so page-footer text (a page number, a repeated URL) below the page's last row is never swept in. A
        // wrapped Lexile fragment can sit ~13 units from its own row's anchor; a page footer sits 30+ away — 20
        // safely separates the two (the same margin used for the header-remnant cutoff above).
        const mine = others.filter((w) => {
          let best = anchors[0], bestDist = Math.abs(anchors[0].d - w.d);
          for (const b of anchors) { const dist = Math.abs(b.d - w.d); if (dist < bestDist) { best = b; bestDist = dist; } }
          return best === a && bestDist <= 20;
        });
        const toks = mine.sort((x, y) => x.x - y.x).map((w) => w.s.trim());
        if (subject === "READING") {
          if (toks.length < 7) continue; // grade, pct, rit, 1-2 lexile parts, info, lit, vocab
          const grade = Number(toks[0]), pct = ordinal(toks[1]), rit = Number(toks[2]);
          const lexParts = toks.slice(3, toks.length - 3);
          const [info, lit, vocab] = toks.slice(-3).map(Number);
          const lexile = lexileMid(lexParts.join(""));
          if (pct === null || !Number.isFinite(rit) || !Number.isFinite(info) || !Number.isFinite(lit) || !Number.isFinite(vocab)) continue;
          rows.push({ name, grade: Number.isFinite(grade) ? grade : null, percentile: pct, rit, lexile, areas: [info, lit, vocab] });
        } else if (subject === "LANGUAGE_USAGE") {
          if (toks.length !== 6) continue; // grade, pct, rit, grammar, mech, writing
          const grade = Number(toks[0]), pct = ordinal(toks[1]), rit = Number(toks[2]);
          const [grammar, mech, writing] = toks.slice(3).map(Number);
          if (pct === null || !Number.isFinite(rit) || !Number.isFinite(grammar) || !Number.isFinite(mech) || !Number.isFinite(writing)) continue;
          rows.push({ name, grade: Number.isFinite(grade) ? grade : null, percentile: pct, rit, lexile: null, areas: [grammar, mech, writing] });
        }
      }
    }
  }

  const tm = (term ?? "").match(/(Fall|Winter|Spring) (\d{4})-(\d{4})/);
  const season = (tm ? tm[1].toUpperCase() : "FALL") as ClassProfileParsed["season"];
  const year = tm ? (season === "FALL" ? Number(tm[2]) : Number(tm[3])) : new Date().getFullYear();
  return { subject, className, term, season, year, rows };
}

/** Class Profile rows → the platform's MAP template table (one row per student, Reading OR Language Usage). */
export function classProfileToTable(p: ClassProfileParsed): string[][] {
  const H = [...MAP_TEMPLATE_HEADERS], col = (h: string) => H.indexOf(h);
  const read = p.subject === "READING";
  return [H, ...p.rows.map((r) => {
    const row = H.map(() => "");
    row[col("Student Name")] = r.name;
    row[col("Grade")] = r.grade !== null ? String(r.grade) : "";
    row[col(read ? "Reading Fall RIT" : "Language Fall RIT")] = String(r.rit);
    row[col(read ? "Reading Fall Percentile" : "Language Fall Percentile")] = String(r.percentile);
    if (read) {
      if (r.lexile !== null) row[col("Fall Lexile")] = String(r.lexile);
      row[col("R: Informational Text")] = String(r.areas[0]);
      row[col("R: Literary Text")] = String(r.areas[1]);
      row[col("R: Vocabulary")] = String(r.areas[2]);
    } else {
      row[col("L: Grammar & Usage")] = String(r.areas[0]);
      row[col("L: Mechanics")] = String(r.areas[1]);
      row[col("L: Writing")] = String(r.areas[2]);
    }
    return row;
  })];
}
