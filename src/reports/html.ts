/**
 * ReportDoc → a complete, self-contained HTML document for printing to PDF.
 *
 * Right-to-left: the page sets dir="rtl" lang="ar" for Arabic reports and the
 * stylesheet only uses logical properties (inline-start/end, text-align:start), so
 * one stylesheet lays out both languages correctly. Shaping (joined Arabic letters)
 * and the bidirectional algorithm are done by the browser engine.
 *
 * Mixed text: English content inside an Arabic report (skill names, CCSS codes,
 * class names like "4A", student numbers) is wrapped in <bdi dir="ltr">, and names
 * that could be in either script in <bdi> (direction detected), so punctuation and
 * numbers never jump to the wrong side of a line.
 *
 * Safety: every value goes through the `h` template tag, which escapes it. Only
 * other `h` results (SafeHtml) are inserted unescaped. The page has no scripts and
 * is rendered with JavaScript and network access disabled (see pdf.ts).
 */
import { BAND_ORDER, bandLabel, dirOf, formatter, t, type Fmt } from "./i18n";
import type { CellValue, Column, Kpi, ReportDoc, Section } from "./model";

export class SafeHtml {
  constructor(readonly value: string) {}
  toString() {
    return this.value;
  }
}

export function esc(v: unknown): string {
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type Part = SafeHtml | string | number | null | undefined | false | Part[];

function part(v: Part): string {
  if (v === null || v === undefined || v === false) return "";
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(part).join("");
  return esc(v);
}

/** Escaping template tag: h`<p>${userText}</p>`. */
export function h(strings: TemplateStringsArray, ...vals: Part[]): SafeHtml {
  let out = strings[0];
  vals.forEach((v, i) => (out += part(v) + strings[i + 1]));
  return new SafeHtml(out);
}

const ltr = (v: Part) => h`<bdi dir="ltr">${v}</bdi>`;
const auto = (v: Part) => h`<bdi>${v}</bdi>`;

export const BAND_COLOURS: Record<string, { bg: string; fg: string }> = {
  BEGINNING: { bg: "#fde2e1", fg: "#a32a22" },
  DEVELOPING: { bg: "#fde9d2", fg: "#9a4d06" },
  APPROACHING: { bg: "#fff3c4", fg: "#7a5c00" },
  PROFICIENT: { bg: "#d4f1ef", fg: "#11706f" },
  MASTERED: { bg: "#dbe6f7", fg: "#1f3a68" },
};

function cell(f: Fmt, col: Column, v: CellValue): SafeHtml {
  if (v === null || v === "") return h`<span class="muted">${t(f.locale, "none")}</span>`;
  switch (col.kind) {
    case "text":
      return h`${String(v)}`;
    case "latin":
      return ltr(String(v));
    case "name":
      return auto(String(v));
    case "int":
      return h`${f.num(Number(v), 0)}`;
    case "dec":
      return h`${f.num(Number(v), 1)}`;
    case "pct":
      return h`${f.pct(Number(v))}`;
    case "signed": {
      const n = Number(v);
      return h`<span class="${n > 0 ? "up" : n < 0 ? "down" : ""}">${f.signed(n)}</span>`;
    }
    case "date":
      return h`${f.date(String(v))}`;
    case "band": {
      const code = String(v).toUpperCase();
      const c = BAND_COLOURS[code];
      return c ? h`<span class="chip" style="background:${c.bg};color:${c.fg}">${bandLabel(f.locale, code)}</span>` : h`${String(v)}`;
    }
  }
}

const NUMERIC = new Set(["int", "dec", "pct", "signed", "date", "band"]);

function kpiValue(f: Fmt, k: Kpi): SafeHtml {
  if (k.value === null) return h`<span class="muted">${t(f.locale, "none")}</span>`;
  switch (k.kind) {
    case "int":
      return h`${f.num(Number(k.value), 0)}`;
    case "dec":
      return h`${f.num(Number(k.value), 1)}`;
    case "pct":
      return h`${f.pct(Number(k.value))}`;
    case "signed":
      return h`${f.signed(Number(k.value))}`;
    case "latin":
      return ltr(String(k.value));
  }
}

function section(f: Fmt, s: Section): SafeHtml {
  switch (s.type) {
    case "kpis":
      return h`<section class="block keep"><h2>${s.title}</h2><div class="kpis">${s.items.map(
        (k) => h`<div class="kpi tone-${k.tone ?? "neutral"}"><div class="kpi-v">${kpiValue(f, k)}</div><div class="kpi-l">${k.label}</div></div>`,
      )}</div></section>`;
    case "bars":
      return h`<section class="block keep"><h2>${s.title}</h2><div class="bars">${s.items.map((b) => {
        const w = b.value === null ? 0 : Math.max(0, Math.min(100, (100 * b.value) / (s.max || 1)));
        const label = b.isolate === "latin" ? ltr(b.label) : h`${b.label}`;
        const value = b.value === null ? h`<span class="muted">${t(f.locale, "none")}</span>` : h`${s.kind === "pct" ? f.pct(b.value) : f.num(b.value, 0)}`;
        return h`<div class="bar-row"><div class="bar-l">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${w.toFixed(1)}%"></div></div><div class="bar-v">${value}</div></div>`;
      })}</div></section>`;
    case "table": {
      const total = s.columns.reduce((a, c) => a + (c.width ?? 1), 0);
      const body = s.rows.length
        ? s.rows.map((r) => h`<tr>${s.columns.map((c) => h`<td class="${[NUMERIC.has(c.kind) ? "num" : "", c.nowrap || c.kind === "date" ? "nowrap" : ""].join(" ").trim()}">${cell(f, c, r[c.key] ?? null)}</td>`)}</tr>`)
        : h`<tr><td class="empty" colspan="${s.columns.length}">${s.empty}</td></tr>`;
      return h`<section class="block"><h2>${s.title}</h2><table class="${s.columns.length > 8 ? "wide" : ""}"><colgroup>${s.columns.map((c) => h`<col style="width:${((100 * (c.width ?? 1)) / total).toFixed(2)}%">`)}</colgroup><thead><tr>${s.columns.map(
        (c) => h`<th class="${NUMERIC.has(c.kind) ? "num" : ""}">${c.label}</th>`,
      )}</tr></thead><tbody>${body}</tbody></table>${s.note ? h`<p class="note">${s.note}</p>` : ""}</section>`;
    }
    case "notes":
      return h`<section class="block notes"><h2>${s.title}</h2><ul>${s.items.map((n) => h`<li>${n}</li>`)}</ul></section>`;
  }
}

function header(doc: ReportDoc, f: Fmt): SafeHtml {
  const b = doc.branding;
  const logo = b.logo ? h`<img class="logo" alt="" src="data:${b.logo.mime};base64,${Buffer.from(b.logo.bytes).toString("base64")}">` : h`<div class="logo-text" aria-hidden="true">${(b.name.match(/\b\p{L}/gu) ?? []).slice(0, 2).join("")}</div>`;
  // Arabic report: Arabic school name first (if configured) and the English name below; English report: the reverse.
  const primary = doc.locale === "ar" && b.nameAr ? b.nameAr : b.name;
  const secondary = doc.locale === "ar" ? (b.nameAr ? b.name : null) : b.nameAr;
  return h`<header class="top">
  ${logo}
  <div class="school"><div class="school-name">${primary}</div>${secondary ? h`<div class="school-alt" dir="${doc.locale === "ar" ? "ltr" : "rtl"}" lang="${doc.locale === "ar" ? "en" : "ar"}">${secondary}</div>` : ""}<div class="subtitle">${doc.subtitle}</div></div>
  <div class="title"><h1>${doc.title}</h1><div class="generated">${t(f.locale, "meta.generated")}: ${f.dateTime(doc.generatedAt)}</div></div>
</header>
<div class="band-strip">${BAND_ORDER.map((c) => h`<span style="background:${BAND_COLOURS[c].fg}"></span>`)}</div>
<dl class="meta">${doc.meta.map(
    (m) => h`<div><dt>${m.label}</dt><dd>${m.isolate === "latin" ? ltr(m.value) : m.isolate === "auto" ? auto(m.value) : m.value}</dd></div>`,
  )}<div><dt>${t(f.locale, "meta.generatedBy")}</dt><dd>${auto(doc.generatedBy)}</dd></div></dl>`;
}

export function reportCss(fontStack: string): string {
  return `
@page { size: A4; margin: 12mm 11mm 16mm 11mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: ${fontStack}; font-size: 9.5pt; line-height: 1.45; color: #1e293b; }
[lang="ar"] body, body:lang(ar) { line-height: 1.7; }
bdi { unicode-bidi: isolate; }
.top { display: flex; align-items: center; gap: 12px; padding-bottom: 8px; }
.logo { width: 58px; height: 58px; object-fit: contain; flex: none; }
.logo-text { width: 58px; height: 58px; flex: none; border-radius: 12px; background: #1f3a68; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20pt; }
.school { flex: 1; min-width: 0; }
.school-name { font-weight: 700; font-size: 12.5pt; color: #1f3a68; }
.school-alt { font-size: 9.5pt; color: #475569; text-align: start; }
.school-alt[dir="ltr"] { text-align: right; }
.school-alt[dir="rtl"] { text-align: left; }
.subtitle { font-size: 8.5pt; color: #1fa3a3; font-weight: 700; margin-top: 2px; }
.title { text-align: end; flex: none; max-width: 48%; }
h1 { margin: 0; font-size: 16pt; color: #5b3fa0; }
.generated { font-size: 8pt; color: #64748b; }
.band-strip { display: flex; height: 4px; border-radius: 2px; overflow: hidden; margin-bottom: 10px; }
.band-strip span { flex: 1; }
.meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 12px; margin: 0 0 12px; padding: 8px 10px; background: #f1f5f9; border-radius: 8px; }
.meta div { min-width: 0; }
.meta dt { font-size: 7.5pt; color: #64748b; }
.meta dd { margin: 0; font-weight: 700; color: #1f3a68; overflow-wrap: anywhere; }
.block { margin: 0 0 12px; }
.block.keep { break-inside: avoid; }
h2 { font-size: 11pt; color: #1f3a68; margin: 0 0 6px; padding-inline-start: 8px; border-inline-start: 4px solid #1fa3a3; break-after: avoid; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.kpi { border-radius: 8px; padding: 7px 9px; background: #f8fafc; border: 1px solid #e2e8f0; border-inline-start: 4px solid #94a3b8; break-inside: avoid; }
.kpi.tone-good { border-inline-start-color: #1fa3a3; }
.kpi.tone-warn { border-inline-start-color: #f5b800; }
.kpi.tone-bad { border-inline-start-color: #d64545; }
.kpi.tone-neutral { border-inline-start-color: #5b3fa0; }
.kpi-v { font-size: 14pt; font-weight: 700; color: #1f3a68; }
.kpi-l { font-size: 7.8pt; color: #475569; }
.bars { display: grid; gap: 4px; }
.bar-row { display: grid; grid-template-columns: 28% 1fr 12%; align-items: center; gap: 8px; break-inside: avoid; }
.bar-l { font-size: 8.5pt; overflow-wrap: anywhere; }
.bar-track { height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; display: flex; }
.bar-fill { height: 100%; background: linear-gradient(90deg, #1fa3a3, #1f3a68); border-radius: 5px; }
[dir="rtl"] .bar-fill { background: linear-gradient(270deg, #1fa3a3, #1f3a68); }
.bar-v { text-align: end; font-weight: 700; font-size: 8.5pt; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.5pt; }
thead { display: table-header-group; }
th { background: #1f3a68; color: #fff; font-weight: 700; text-align: start; padding: 5px 6px; }
td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; overflow-wrap: anywhere; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: #f8fafc; }
th.num, td.num { text-align: center; }
table.wide { font-size: 7.6pt; }
table.wide th, table.wide td { padding: 4px 3px; }
table.wide th { font-size: 7pt; line-height: 1.25; }
th { overflow-wrap: anywhere; }
td.nowrap { white-space: nowrap; overflow-wrap: normal; }
td.empty { text-align: center; color: #64748b; padding: 10px; }
.chip { display: inline-block; padding: 0 7px; border-radius: 9px; font-size: 7.8pt; font-weight: 700; white-space: nowrap; }
.up { color: #11706f; font-weight: 700; }
.down { color: #a32a22; font-weight: 700; }
.muted { color: #94a3b8; }
.note { font-size: 8pt; color: #475569; margin: 4px 0 0; }
.notes ul { margin: 0; padding-inline-start: 18px; font-size: 8.3pt; color: #475569; }
`;
}

export interface HtmlOptions {
  fontCss: string;
  fontStack: string;
}

export function renderHtml(doc: ReportDoc, opts: HtmlOptions): string {
  const f = formatter(doc.locale);
  const body = h`${header(doc, f)}${doc.sections.map((s) => section(f, s))}`;
  return `<!doctype html><html lang="${doc.locale}" dir="${dirOf(doc.locale)}"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${opts.fontCss}\n${reportCss(opts.fontStack)}</style></head><body>${body.value}</body></html>`;
}

/** Chromium page footer (page numbers). Rendered by Chromium in a separate tiny page. */
export function footerTemplate(doc: ReportDoc, fontStack: string): string {
  const L = doc.locale;
  return `<div dir="${dirOf(L)}" lang="${L}" style="width:100%;font-family:${esc(fontStack)};font-size:7pt;color:#64748b;padding:0 11mm;display:flex;justify-content:space-between;"><span>${esc(t(L, "confidential"))}</span><span>${esc(t(L, "page"))} <span class="pageNumber"></span> ${esc(t(L, "of"))} <span class="totalPages"></span></span></div>`;
}
