/**
 * ReportDoc → a complete, self-contained HTML document for printing to PDF.
 *
 * One document design system for every downloadable report (Reports redesign):
 *   header      school logo + name, report title, date and who the report is for ("Prepared for")
 *   at a glance the 3–5 numbers that matter most, each with a plain-language meaning
 *   sections    clear headings in the report's source colour (Curriculum blue, MAP green, RTI orange,
 *               Grammar purple, NAFS teal), consistent tables (zebra rows, numbers aligned to the end,
 *               headers that never break inside a word), small SVG bar charts
 *   colour      levels and tones are ALWAYS shown with their text label, and every table that uses
 *               them is followed by a colour key (never colour alone)
 *   families    "What this means" / "How you can help at home" boxes in simple words
 *   pages       A4, page numbers in the footer, very wide tables on a landscape page
 * Only the presentation changes here: every value is the builder's value, formatted as before.
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
import { BAND_ORDER, bandLabel, dirOf, formatter, t, type Fmt, type LabelKey } from "./i18n";
import type { Accent, Audience, CellValue, Column, Kpi, ReportDoc, Section, Tone } from "./model";

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

// ------------------------------------------------------------------ design tokens (shared with xlsx.ts)

export const BAND_COLOURS: Record<string, { bg: string; fg: string }> = {
  BEGINNING: { bg: "#fde2e1", fg: "#a32a22" },
  DEVELOPING: { bg: "#fde9d2", fg: "#9a4d06" },
  APPROACHING: { bg: "#fff3c4", fg: "#7a5c00" },
  PROFICIENT: { bg: "#d4f1ef", fg: "#11706f" },
  MASTERED: { bg: "#dbe6f7", fg: "#1f3a68" },
};

/** Tone colours (chips, Excel fills). Text colours meet WCAG AA on their background. */
export const TONE_COLOURS: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: "#dcf3e6", fg: "#166534" },
  info: { bg: "#dbe6f7", fg: "#1f3a68" },
  warn: { bg: "#fdf0c8", fg: "#7a4b00" },
  bad: { bg: "#fde2e1", fg: "#a32a22" },
  neutral: { bg: "#eef1f5", fg: "#475569" },
};

/** The platform's source colours. */
export const ACCENTS: Record<Accent, string> = {
  curriculum: "#1f5fbf",
  map: "#15803d",
  rti: "#c2410c",
  grammar: "#6d28d9",
  nafs: "#0f766e",
};

export function accentOf(doc: Pick<ReportDoc, "kind" | "accent">): Accent {
  if (doc.accent) return doc.accent;
  return doc.kind === "grammar" ? "grammar" : doc.kind === "rti" ? "rti" : doc.kind === "readrise" || doc.kind === "readmaster" ? "nafs" : "curriculum";
}

export function audienceOf(doc: Pick<ReportDoc, "kind" | "audience">): Audience {
  if (doc.audience) return doc.audience;
  return doc.kind === "student" ? "family" : doc.kind === "school" || doc.kind === "levels" ? "school" : "teacher";
}

const TONE_ICON: Record<Tone, string> = { good: "✓", info: "•", warn: "!", bad: "▲", neutral: "•" };

// ------------------------------------------------------------------ cells

function chip(c: { bg: string; fg: string }, label: Part, icon?: string): SafeHtml {
  return h`<span class="chip" style="background:${c.bg};color:${c.fg}">${icon ? h`<span class="chip-i" aria-hidden="true">${icon}</span>` : ""}${label}</span>`;
}

/** Small inline bar (0–100) drawn in SVG, beside the number it shows. */
function miniBar(v: number, colour = "#1f3a68"): SafeHtml {
  const w = Math.max(0, Math.min(100, v));
  return h`<svg class="mini" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="100" height="10" rx="5" fill="#e2e8f0"/>${w > 0 ? h`<rect x="0" y="0" width="${w.toFixed(1)}" height="10" rx="5" fill="${colour}"/>` : ""}</svg>`;
}

function cell(f: Fmt, col: Column, v: CellValue, bars: boolean): SafeHtml {
  if (v === null || v === "") return h`<span class="muted">${t(f.locale, "none")}</span>`;
  switch (col.kind) {
    case "text": {
      const tone = col.tones?.[String(v)];
      return tone ? chip(TONE_COLOURS[tone], String(v)) : h`${String(v)}`;
    }
    case "latin": {
      const tone = col.tones?.[String(v)];
      return tone ? chip(TONE_COLOURS[tone], ltr(String(v))) : ltr(String(v));
    }
    case "name":
      return auto(String(v));
    case "int":
      return h`${f.num(Number(v), 0)}`;
    case "dec":
      return h`${f.num(Number(v), 1)}`;
    case "pct": {
      const n = Number(v);
      return bars ? h`<span class="pct">${miniBar(n, n >= 75 ? "#11706f" : n >= 60 ? "#b7791f" : "#c0392b")}<span>${f.pct(n)}</span></span>` : h`${f.pct(n)}`;
    }
    case "signed": {
      const n = Number(v);
      return h`<span class="${n > 0 ? "up" : n < 0 ? "down" : ""}">${n > 0 ? h`<span class="arrow" aria-hidden="true">▲</span>` : n < 0 ? h`<span class="arrow" aria-hidden="true">▼</span>` : ""}${f.signed(n)}</span>`;
    }
    case "date":
      return h`${f.date(String(v))}`;
    case "band": {
      const code = String(v).toUpperCase();
      const c = BAND_COLOURS[code];
      return c ? chip(c, bandLabel(f.locale, code)) : h`${String(v)}`;
    }
  }
}

const NUMERIC = new Set(["int", "dec", "pct", "signed"]);
const CENTRED = new Set(["date", "band"]);
const align = (c: Column) => (NUMERIC.has(c.kind) ? "num" : CENTRED.has(c.kind) || c.tones ? "mid" : "");

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

const toneTag = (f: Fmt, tone: Kpi["tone"]) =>
  tone && tone !== "neutral" ? h`<span class="tone-tag t-${tone}"><span aria-hidden="true">${TONE_ICON[tone]}</span> ${t(f.locale, `tone.${tone}` as LabelKey)}</span>` : "";

// ------------------------------------------------------------------ legends

function bandLegend(f: Fmt): SafeHtml {
  return h`<div class="legend" role="note"><span class="legend-t">${t(f.locale, "legend")}:</span>${BAND_ORDER.map(
    (c) => h`<span class="legend-i">${chip(BAND_COLOURS[c], bandLabel(f.locale, c))}<span class="legend-h">${t(f.locale, `band.${c}.hint` as LabelKey)}</span></span>`,
  )}</div>`;
}

function toneLegend(f: Fmt, cols: Column[], rows: Record<string, CellValue>[]): SafeHtml | "" {
  const seen = new Map<string, Tone>();
  for (const c of cols) if (c.tones) for (const r of rows) { const v = r[c.key]; if (v !== null && v !== undefined && c.tones[String(v)]) seen.set(String(v), c.tones[String(v)]); }
  if (!seen.size) return "";
  return h`<div class="legend" role="note"><span class="legend-t">${t(f.locale, "legend")}:</span>${[...seen].map(([label, tone]) => h`<span class="legend-i">${chip(TONE_COLOURS[tone], label)}</span>`)}</div>`;
}

// ------------------------------------------------------------------ sections

function glanceBox(f: Fmt, s: Extract<Section, { type: "kpis" }>): { glance: SafeHtml; rest: Kpi[] } {
  const flagged = s.items.filter((k) => k.glance);
  const pick = (flagged.length ? flagged : s.items.slice(0, 4)).slice(0, 5);
  const rest = s.items.filter((k) => !pick.includes(k));
  const glance = h`<section class="glance keep" aria-label="${t(f.locale, "glance")}"><div class="glance-t">${t(f.locale, "glance")}</div><div class="glance-g n${pick.length}">${pick.map(
    (k) => h`<div class="g"><div class="g-v">${kpiValue(f, k)}</div><div class="g-l">${k.label}</div>${k.hint ? h`<div class="g-h">${k.hint}</div>` : ""}${toneTag(f, k.tone)}</div>`,
  )}</div></section>`;
  return { glance, rest };
}

function kpiGrid(f: Fmt, title: string, items: Kpi[]): SafeHtml {
  if (!items.length) return h``;
  return h`<section class="block keep"><h2>${title}</h2><div class="kpis">${items.map(
    (k) => h`<div class="kpi tone-${k.tone ?? "neutral"}"><div class="kpi-v">${kpiValue(f, k)}</div><div class="kpi-l">${k.label}</div>${toneTag(f, k.tone)}</div>`,
  )}</div></section>`;
}

function barsChart(f: Fmt, s: Extract<Section, { type: "bars" }>, accent: string): SafeHtml {
  const hasBands = s.items.some((b) => b.band && BAND_COLOURS[b.band]);
  return h`<section class="block keep"><h2>${s.title}</h2><div class="bars">${s.items.map((b) => {
    const w = b.value === null ? 0 : Math.max(0, Math.min(100, (100 * b.value) / (s.max || 1)));
    const label = b.isolate === "latin" ? ltr(b.label) : h`${b.label}`;
    const value = b.value === null ? h`<span class="muted">${t(f.locale, "none")}</span>` : h`${s.kind === "pct" ? f.pct(b.value) : f.num(b.value, 0)}`;
    const colour = b.band && BAND_COLOURS[b.band] ? BAND_COLOURS[b.band].fg : accent;
    return h`<div class="bar-row"><div class="bar-l">${label}</div><svg class="bar-svg" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="100" height="12" rx="6" fill="#e8edf3"/>${w > 0 ? h`<rect x="0" y="0" width="${w.toFixed(1)}" height="12" rx="6" fill="${colour}"/>` : ""}</svg><div class="bar-v">${value}</div></div>`;
  })}</div>${hasBands ? bandLegend(f) : ""}</section>`;
}

/** Tables with more columns than this go on a landscape page. */
export const LANDSCAPE_COLUMNS = 11;

function table(f: Fmt, s: Extract<Section, { type: "table" }>): SafeHtml {
  // a date ("29 Oct 2026") never breaks, so its column is given room for it
  const wOf = (c: Column) => Math.max(c.width ?? 1, c.kind === "date" ? 1.4 : 0);
  const total = s.columns.reduce((a, c) => a + wOf(c), 0);
  const landscape = s.columns.length > LANDSCAPE_COLUMNS;
  const dense = s.columns.length > 8;
  const bars = s.columns.length <= 7;
  const body = s.rows.length
    ? s.rows.map((r) => h`<tr>${s.columns.map((c) => h`<td class="${[align(c), c.nowrap || c.kind === "date" ? "nowrap" : ""].join(" ").trim()}">${cell(f, c, r[c.key] ?? null, bars)}</td>`)}</tr>`)
    : h`<tr><td class="empty" colspan="${s.columns.length}">${s.empty}</td></tr>`;
  const hasBand = s.rows.length > 0 && s.columns.some((c) => c.kind === "band");
  // the colour key sits between the heading and the table, so it is read first and never lands alone on a page
  return h`<section class="block${landscape ? " landscape" : ""}"><h2>${s.title}</h2>${hasBand ? bandLegend(f) : ""}${toneLegend(f, s.columns, s.rows)}<table class="${[dense ? "wide" : "", landscape ? "xwide" : ""].join(" ").trim()}"><colgroup>${s.columns.map((c) => h`<col style="width:${((100 * wOf(c)) / total).toFixed(2)}%">`)}</colgroup><thead><tr>${s.columns.map(
    (c) => h`<th class="${align(c)}" scope="col">${c.label}</th>`,
  )}</tr></thead><tbody>${body}</tbody></table>${s.note ? h`<p class="note">${s.note}</p>` : ""}</section>`;
}

const ICON_INFO = h`<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><rect x="11" y="10" width="2" height="8" rx="1" fill="#fff"/><circle cx="12" cy="6.8" r="1.4" fill="#fff"/></svg>`;
const ICON_HOME = h`<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2.5 1.5 11.5h3V21h6v-6h3v6h6v-9.5h3z" fill="currentColor"/></svg>`;

function section(f: Fmt, s: Section, accent: string): SafeHtml {
  switch (s.type) {
    case "kpis":
      return kpiGrid(f, s.title, s.items);
    case "bars":
      return barsChart(f, s, accent);
    case "table":
      return table(f, s);
    case "notes":
      return h`<section class="block notes keep"><h3>${s.title}</h3><ul>${s.items.map((n) => h`<li>${n}</li>`)}</ul></section>`;
    case "explain":
      return h`<section class="block explain ${s.tone === "home" ? "home" : "info"} keep"><h2 class="explain-t">${s.tone === "home" ? ICON_HOME : ICON_INFO}<span>${s.title}</span></h2>${(s.paragraphs ?? []).map((p) => h`<p>${p}</p>`)}${s.items?.length ? h`<ul>${s.items.map((n) => h`<li>${n}</li>`)}</ul>` : ""}</section>`;
  }
}

function header(doc: ReportDoc, f: Fmt): SafeHtml {
  const b = doc.branding;
  const logo = b.logo ? h`<img class="logo" alt="" src="data:${b.logo.mime};base64,${Buffer.from(b.logo.bytes).toString("base64")}">` : h`<div class="logo-text" aria-hidden="true">${(b.name.match(/\b\p{L}/gu) ?? []).slice(0, 2).join("")}</div>`;
  // Arabic report: Arabic school name first (if configured) and the English name below; English report: the reverse.
  const primary = doc.locale === "ar" && b.nameAr ? b.nameAr : b.name;
  const secondary = doc.locale === "ar" ? (b.nameAr ? b.name : null) : b.nameAr;
  const L = doc.locale;
  return h`<header class="top">
  ${logo}
  <div class="school"><div class="school-name">${primary}</div>${secondary ? h`<div class="school-alt" dir="${L === "ar" ? "ltr" : "rtl"}" lang="${L === "ar" ? "en" : "ar"}">${secondary}</div>` : ""}<div class="subtitle">${doc.subtitle}</div></div>
  <div class="title"><h1 class="${doc.title.length > 44 ? "long" : ""}">${doc.title}</h1><div class="for"><span class="for-l">${t(L, "meta.for")}:</span> ${t(L, `aud.${audienceOf(doc)}` as LabelKey)}</div><div class="generated">${t(L, "meta.generated")}: ${f.dateTime(doc.generatedAt)}</div></div>
</header>
<div class="band-strip" aria-hidden="true"></div>
<dl class="meta">${doc.meta.map(
    (m) => h`<div><dt>${m.label}</dt><dd>${m.isolate === "latin" ? ltr(m.value) : m.isolate === "auto" ? auto(m.value) : m.value}</dd></div>`,
  )}<div><dt>${t(L, "meta.generatedBy")}</dt><dd>${auto(doc.generatedBy)}</dd></div></dl>`;
}

export function reportCss(fontStack: string, accent = ACCENTS.curriculum): string {
  return `
@page { size: A4; margin: 13mm 12mm 17mm 12mm; }
@page wide { size: A4 landscape; margin: 11mm 11mm 15mm 11mm; }
:root { --accent: ${accent}; --navy: #1f3a68; --ink: #1e293b; --soft: #475569; --line: #e2e8f0; --zebra: #f6f8fb; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: ${fontStack}; font-size: 9.5pt; line-height: 1.45; color: var(--ink); font-variant-numeric: tabular-nums; }
[lang="ar"] body, body:lang(ar) { line-height: 1.7; }
bdi { unicode-bidi: isolate; }
.top { display: flex; align-items: center; gap: 12px; padding-bottom: 8px; }
.logo { width: 60px; height: 60px; object-fit: contain; flex: none; }
.logo-text { width: 60px; height: 60px; flex: none; border-radius: 14px; background: var(--navy); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20pt; }
.school { flex: 1; min-width: 0; }
.school-name { font-weight: 700; font-size: 12.5pt; color: var(--navy); }
.school-alt { font-size: 9.5pt; color: var(--soft); text-align: start; }
.school-alt[dir="ltr"] { text-align: right; }
.school-alt[dir="rtl"] { text-align: left; }
.subtitle { font-size: 8.5pt; color: var(--accent); font-weight: 700; margin-top: 2px; }
.title { text-align: end; flex: 0 1 auto; max-width: 58%; }
h1 { margin: 0; font-size: 17pt; line-height: 1.2; color: var(--accent); }
h1.long { font-size: 13pt; }
.for { display: inline-block; margin-top: 4px; padding: 1px 9px; border-radius: 10px; background: color-mix(in srgb, var(--accent) 12%, white); color: var(--navy); font-size: 8pt; font-weight: 700; }
.for-l { font-weight: 400; color: var(--soft); }
.generated { font-size: 7.8pt; color: #64748b; margin-top: 2px; }
.band-strip { height: 4px; border-radius: 2px; margin-bottom: 10px; background: linear-gradient(90deg, var(--accent), var(--navy)); }
[dir="rtl"] .band-strip { background: linear-gradient(270deg, var(--accent), var(--navy)); }
.meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 12px; margin: 0 0 12px; padding: 8px 12px; background: #f1f5f9; border-radius: 8px; }
.meta div { min-width: 0; }
.meta dt { font-size: 7.5pt; color: #64748b; }
.meta dd { margin: 0; font-weight: 700; color: var(--navy); overflow-wrap: anywhere; }
.block { margin: 0 0 14px; }
.block.keep { break-inside: avoid; }
h2 { font-size: 11.5pt; color: var(--navy); margin: 0 0 7px; padding: 0 0 3px; padding-inline-start: 9px; border-inline-start: 4px solid var(--accent); border-bottom: 1px solid var(--line); break-after: avoid; }
h3 { font-size: 9.5pt; color: var(--navy); margin: 0 0 4px; }
/* at a glance */
.glance { margin: 0 0 14px; padding: 10px 12px 12px; border-radius: 10px; border: 1.5px solid color-mix(in srgb, var(--accent) 35%, white); background: color-mix(in srgb, var(--accent) 6%, white); break-inside: avoid; }
.glance-t { font-size: 10.5pt; font-weight: 700; color: var(--accent); margin-bottom: 6px; }
.glance-g { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.glance-g.n3 { grid-template-columns: repeat(3, 1fr); }
.glance-g.n5 { grid-template-columns: repeat(5, 1fr); }
.glance-g.n1, .glance-g.n2 { grid-template-columns: repeat(2, 1fr); }
.g { background: #fff; border-radius: 8px; padding: 7px 9px; border: 1px solid var(--line); }
.g-v { font-size: 17pt; font-weight: 700; color: var(--navy); line-height: 1.15; }
.g-l { font-size: 8.4pt; font-weight: 700; color: var(--ink); }
.g-h { font-size: 7.6pt; color: var(--soft); line-height: 1.35; }
.tone-tag { display: inline-block; margin-top: 3px; padding: 0 6px; border-radius: 8px; font-size: 7.2pt; font-weight: 700; }
.t-good { background: ${TONE_COLOURS.good.bg}; color: ${TONE_COLOURS.good.fg}; }
.t-warn { background: ${TONE_COLOURS.warn.bg}; color: ${TONE_COLOURS.warn.fg}; }
.t-bad { background: ${TONE_COLOURS.bad.bg}; color: ${TONE_COLOURS.bad.fg}; }
/* other numbers */
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.kpi { border-radius: 8px; padding: 6px 9px; background: #f8fafc; border: 1px solid var(--line); border-inline-start: 4px solid #94a3b8; break-inside: avoid; }
.kpi.tone-good { border-inline-start-color: #11706f; }
.kpi.tone-warn { border-inline-start-color: #d69e00; }
.kpi.tone-bad { border-inline-start-color: #c0392b; }
.kpi.tone-neutral { border-inline-start-color: var(--accent); }
.kpi-v { font-size: 13pt; font-weight: 700; color: var(--navy); }
.kpi-l { font-size: 7.8pt; color: var(--soft); }
.kpi .tone-tag { margin-top: 2px; }
/* bar charts (SVG) */
.bars { display: grid; gap: 4px; }
.bars + .legend { margin-top: 6px; }
.bar-row { display: grid; grid-template-columns: 30% 1fr 12%; align-items: center; gap: 8px; break-inside: avoid; }
.bar-l { font-size: 8.5pt; overflow-wrap: anywhere; }
.bar-svg { width: 100%; height: 10px; display: block; }
[dir="rtl"] .bar-svg, [dir="rtl"] .mini { transform: scaleX(-1); }
.bar-v { text-align: end; font-weight: 700; font-size: 8.5pt; }
/* tables */
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.5pt; }
thead { display: table-header-group; }
th { background: var(--navy); color: #fff; font-weight: 700; text-align: start; padding: 5px 6px; vertical-align: bottom; line-height: 1.25; }
thead tr th:first-child { border-start-start-radius: 6px; }
thead tr th:last-child { border-start-end-radius: 6px; }
td { padding: 4px 6px; border-bottom: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: var(--zebra); }
th.num, td.num { text-align: end; }
th.mid, td.mid { text-align: center; }
table.wide { font-size: 7.6pt; }
table.wide th, table.wide td { padding: 4px 3px; }
table.wide th { font-size: 7pt; }
table.xwide { font-size: 7.2pt; }
table.xwide th { font-size: 6.8pt; }
.landscape { page: wide; }
/* headers break between words, never inside one (readiness S-5: “mastere/d”); a word too long for its column is hyphenated */
th { overflow-wrap: normal; word-break: normal; hyphens: auto; }
td.nowrap { white-space: nowrap; overflow-wrap: normal; }
td.empty { text-align: center; color: #64748b; padding: 10px; }
.chip { display: inline-block; padding: 0 7px; border-radius: 9px; font-size: 7.8pt; font-weight: 700; white-space: nowrap; }
.chip-i { margin-inline-end: 3px; }
td .chip { white-space: normal; line-height: 1.35; max-width: 100%; }
table.xwide .chip { font-size: 6.6pt; padding: 0 5px; }
.pct { display: inline-flex; align-items: center; gap: 4px; justify-content: flex-end; white-space: nowrap; }
.mini { width: 26px; height: 6px; flex: none; }
.up { color: #11706f; font-weight: 700; }
.down { color: #a32a22; font-weight: 700; }
.arrow { font-size: 6pt; margin-inline-end: 2px; vertical-align: 1px; }
.muted { color: #94a3b8; }
.note { font-size: 8pt; color: var(--soft); margin: 4px 0 0; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0 0 6px; font-size: 7.4pt; color: var(--soft); break-inside: avoid; }
.legend-t { font-weight: 700; color: var(--navy); }
.legend-i { display: inline-flex; align-items: center; gap: 4px; }
.legend .chip { font-size: 7.2pt; }
.notes { padding: 8px 12px; border-radius: 8px; background: #f8fafc; border: 1px solid var(--line); }
.notes ul { margin: 0; padding-inline-start: 18px; font-size: 8.2pt; color: var(--soft); }
/* plain-language boxes for families */
.explain { padding: 9px 13px; border-radius: 10px; font-size: 9.3pt; line-height: 1.55; }
.explain.info { background: #eef4fc; border: 1px solid #c9daf3; }
.explain.home { background: #eefaf3; border: 1px solid #bfe6cf; }
.explain .explain-t { display: flex; align-items: center; gap: 6px; border: 0; padding: 0; margin-bottom: 4px; }
.explain.info .explain-t { color: #1f3a68; }
.explain.home .explain-t { color: #166534; }
.explain p { margin: 0 0 4px; }
.explain ul { margin: 2px 0 0; padding-inline-start: 18px; }
.explain li { margin-bottom: 2px; }
`;
}

export interface HtmlOptions {
  fontCss: string;
  fontStack: string;
}

export function renderHtml(doc: ReportDoc, opts: HtmlOptions): string {
  const f = formatter(doc.locale);
  const accent = ACCENTS[accentOf(doc)];
  // the first key-figures section becomes "At a glance" (+ the remaining figures under its own title)
  const firstKpis = doc.sections.findIndex((s) => s.type === "kpis");
  const parts: SafeHtml[] = [];
  doc.sections.forEach((s, i) => {
    if (i === firstKpis && s.type === "kpis") {
      const { glance, rest } = glanceBox(f, s);
      parts.push(glance);
      if (rest.length) parts.push(kpiGrid(f, s.items.length > rest.length ? t(doc.locale, "moreNumbers") : s.title, rest));
    } else parts.push(section(f, s, accent));
  });
  const body = h`${header(doc, f)}${parts}`;
  return `<!doctype html><html lang="${doc.locale}" dir="${dirOf(doc.locale)}"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${opts.fontCss}\n${reportCss(opts.fontStack, accent)}</style></head><body>${body.value}</body></html>`;
}

/** Chromium page footer (report title, confidentiality, page numbers). Rendered by Chromium in a separate tiny page. */
export function footerTemplate(doc: ReportDoc, fontStack: string): string {
  const L = doc.locale;
  return `<div dir="${dirOf(L)}" lang="${L}" style="width:100%;box-sizing:border-box;padding:0 12mm;font-family:${esc(fontStack)};font-size:7pt;color:#64748b;"><div style="border-top:0.5px solid #cbd5e1;padding-top:3px;display:flex;justify-content:space-between;gap:12px;"><span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(doc.title ?? "")}${doc.title ? " · " : ""}${esc(t(L, "confidential"))}</span><span style="white-space:nowrap;">${esc(t(L, "page"))} <span class="pageNumber"></span> ${esc(t(L, "of"))} <span class="totalPages"></span></span></div></div>`;
}
