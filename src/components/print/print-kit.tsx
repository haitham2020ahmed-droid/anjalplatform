/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * 🖨 The print kit: ONE design for every printed or saved-as-PDF page (account sheets, sign-in cards, the weekly
 * family summary, plans, certificates…). Server-safe (no hooks, no browser code), so pages and tests can render it.
 *
 *   PrintStyles   the kit's stylesheet (inline <style>, screen + paper; works in a test render too)
 *   PrintPage     one A4 sheet: a white rounded card on screen, a clean page on paper (each starts a new page)
 *   PrintHeader   the header band: "Al-Anjal" + school name, the document title, the date
 *   PrintMeta     small chips under the header (class, teacher, grade…)
 *   PrintSection  a rounded, coloured section header + its content (never split across pages when it fits)
 *   PrintTable    a clear table: coloured header row, zebra rows, rows never split
 *   PrintFooter   a footer line (the page number is added by the browser where it supports @page boxes)
 *   CutLine       a dashed "cut here" guide
 * Nothing here computes a result: pages pass the values their loaders return.
 */
import type { CSSProperties, ReactNode } from "react";
import { translate } from "@/i18n";
import { BRAND, CARD_CYCLE, PLATFORM, SOURCE_COLORS, accentHex, printDate, type PrintAccent } from "./tokens";

export type T = (x: string, v?: Record<string, string | number>) => string;
export const tEn: T = (x, v) => translate("en", x, v);

const FONT = `var(--font-lexend), "Lexend", "Segoe UI", Tahoma, system-ui, sans-serif`;

/** The kit's stylesheet. Class names start with pk- so nothing else on the page is touched. */
export const PRINT_CSS = `
.pk-doc{font-family:${FONT};color:${BRAND.ink};line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pk-doc *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pk-doc bdi{unicode-bidi:isolate}
.pk-page{background:#fff;border-radius:24px;box-shadow:0 1px 3px rgb(15 23 42/.08),0 0 0 1px ${BRAND.line};padding:22px;margin:0 auto 24px;max-width:210mm}
.pk-page.pk-land{max-width:297mm}
.pk-head{display:flex;flex-wrap:wrap;align-items:stretch;border-radius:16px;overflow:hidden;color:#fff;background:linear-gradient(100deg,${BRAND.navy} 0%,${BRAND.navy} 52%,${BRAND.teal} 100%);margin:0 0 6px}
[dir="rtl"] .pk-head{background:linear-gradient(260deg,${BRAND.navy} 0%,${BRAND.navy} 52%,${BRAND.teal} 100%)}
.pk-brand{display:flex;flex-direction:column;justify-content:center;gap:1px;padding:10px 16px;background:rgb(255 255 255/.10);min-width:0}
.pk-logo{direction:ltr;font-weight:800;font-size:21px;letter-spacing:.01em;line-height:1.1;white-space:nowrap}
.pk-logo i{font-style:normal;color:${BRAND.gold}}
.pk-school{font-size:11px;opacity:.9;overflow-wrap:anywhere}
.pk-title{flex:1 1 220px;padding:10px 16px;text-align:end;min-width:0}
.pk-title h1{margin:0;font-size:20px;font-weight:700;line-height:1.2;color:#fff}
.pk-sub{font-size:11.5px;opacity:.92;margin-top:2px}
.pk-date{display:inline-block;margin-top:5px;padding:1px 11px;border-radius:999px;background:rgb(255 255 255/.2);font-size:10.5px;font-weight:600}
.pk-stripe{display:flex;height:5px;border-radius:3px;overflow:hidden;margin:0 0 12px}
.pk-stripe span{flex:1}
.pk-meta{display:flex;flex-wrap:wrap;gap:6px 8px;margin:0 0 12px;padding:0;list-style:none}
.pk-meta li{display:inline-flex;gap:6px;align-items:baseline;padding:3px 12px;border-radius:999px;background:${BRAND.grey};font-size:12px;color:${BRAND.soft}}
.pk-meta b{color:${BRAND.navy};font-weight:700}
.pk-sec{margin:0 0 14px;break-inside:avoid}
.pk-sec.pk-flow{break-inside:auto}
.pk-sec-h{display:flex;align-items:center;gap:8px;margin:0 0 8px;padding:6px 14px;border-radius:12px;font-size:14px;font-weight:700;break-after:avoid;color:var(--pk-c);background:color-mix(in srgb,var(--pk-c) 11%,#fff);border-inline-start:6px solid var(--pk-c)}
.pk-sec-h small{font-weight:500;font-size:11px;color:${BRAND.soft};margin-inline-start:auto}
.pk-table{width:100%;border-collapse:separate;border-spacing:0;font-size:12px}
.pk-table thead{display:table-header-group}
.pk-table th{background:var(--pk-c,${BRAND.navy});color:#fff;font-weight:700;text-align:start;padding:6px 8px;font-size:11px;letter-spacing:.02em}
.pk-table th:first-child{border-start-start-radius:10px}
.pk-table th:last-child{border-start-end-radius:10px}
.pk-table td{padding:6px 8px;border-bottom:1px solid ${BRAND.line};vertical-align:middle}
.pk-table tbody tr:nth-child(even) td{background:${BRAND.zebra}}
.pk-table tr{break-inside:avoid;page-break-inside:avoid}
.pk-table .pk-num{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
.pk-table .pk-mid{text-align:center}
.pk-empty{padding:14px;border-radius:12px;background:${BRAND.grey};color:${BRAND.soft};text-align:center;font-size:12.5px}
.pk-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 14px}
.pk-tile{border-radius:14px;padding:9px 11px;background:color-mix(in srgb,var(--pk-c) 9%,#fff);border:1px solid color-mix(in srgb,var(--pk-c) 30%,#fff);break-inside:avoid}
.pk-tile-v{font-size:22px;font-weight:700;color:var(--pk-c);line-height:1.15}
.pk-tile-l{font-size:11px;font-weight:600;color:${BRAND.ink}}
.pk-tile-h{font-size:10px;color:${BRAND.soft}}
.pk-pill{display:inline-flex;align-items:center;gap:4px;padding:1px 10px;border-radius:999px;font-size:11px;font-weight:700;color:var(--pk-c);background:color-mix(in srgb,var(--pk-c) 13%,#fff)}
.pk-callout{border-radius:14px;padding:10px 14px;background:#fff8e1;border:1px solid #f6d77b;break-inside:avoid}
.pk-callout b{color:#7a4b00}
.pk-foot{display:flex;justify-content:space-between;gap:12px;margin-top:12px;padding-top:6px;border-top:1px solid ${BRAND.line};font-size:10px;color:#64748b}
.pk-cut{position:relative;margin:10px 0;border-top:1.5px dashed #94a3b8;height:0}
.pk-cut span{position:absolute;inset-inline-start:8px;top:-9px;padding:0 6px;background:#fff;color:#64748b;font-size:11px;line-height:16px}
@media (max-width:640px){.pk-page{padding:14px;border-radius:18px}.pk-tiles{grid-template-columns:repeat(2,1fr)}.pk-title{text-align:start}.pk-table{font-size:11.5px}}
@media print{
  .pk-page,.pk-page.pk-land{box-shadow:none;border-radius:0;padding:0;margin:0;max-width:none;width:auto}
  .pk-page+.pk-page{break-before:page;page-break-before:always}
  .pk-land{page:pk-landscape}
  .pk-noprint{display:none!important}
}
@page pk-landscape{size:A4 landscape;margin:10mm}
`;

/** The kit's stylesheet; put it once on any page that uses the kit. */
export function PrintStyles({ extra = "" }: { extra?: string }) {
  return <style>{PRINT_CSS + extra}</style>;
}

/** One A4 sheet (portrait; `landscape` for wide ones). The first sheet follows the page; each next one starts a new page. */
export function PrintPage({ children, landscape = false, className = "", label }: { children: ReactNode; landscape?: boolean; className?: string; label?: string }) {
  return <section className={`pk-doc pk-page ${landscape ? "pk-land" : ""} ${className}`.trim()} aria-label={label} data-pk="page">{children}</section>;
}

/** The header band: "Al-Anjal" + school, the title (and subtitle) and the date; the five source colours below it. */
export function PrintHeader({ title, subtitle, school, date = new Date(), t = tEn }: { title: string; subtitle?: ReactNode; school?: string; date?: Date | string | null; t?: T }) {
  return (
    <header data-pk="header">
      <div className="pk-head">
        <div className="pk-brand">
          <span className="pk-logo">Al-<i>Anjal</i></span>
          {school ? <span className="pk-school"><bdi>{school}</bdi></span> : <span className="pk-school">{t("English")}</span>}
        </div>
        <div className="pk-title">
          <h1>{title}</h1>
          {subtitle ? <div className="pk-sub">{subtitle}</div> : null}
          {date ? <span className="pk-date" dir="ltr">{printDate(date)}</span> : null}
        </div>
      </div>
      <div className="pk-stripe" aria-hidden="true">{Object.values(SOURCE_COLORS).map((c) => <span key={c} style={{ background: c }} />)}</div>
    </header>
  );
}

/** Chips under the header: label + value (values are names, kept in their own direction). */
export function PrintMeta({ items }: { items: { label: string; value: ReactNode }[] }) {
  const shown = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== "");
  if (!shown.length) return null;
  return <ul className="pk-meta" data-pk="meta">{shown.map((i) => <li key={i.label}>{i.label}: <b><bdi>{i.value}</bdi></b></li>)}</ul>;
}

const cvar = (accent?: PrintAccent) => ({ ["--pk-c" as string]: accentHex(accent) }) as CSSProperties;

/** A section with a rounded, coloured header (source colour or navy). `flow` lets a long section run over pages. */
export function PrintSection({ title, icon, accent, note, flow = false, children }: { title: string; icon?: string; accent?: PrintAccent; note?: ReactNode; flow?: boolean; children: ReactNode }) {
  return (
    <section className={`pk-sec ${flow ? "pk-flow" : ""}`} style={cvar(accent)} data-pk="section">
      <h2 className="pk-sec-h">{icon ? <span aria-hidden="true">{icon}</span> : null}<span>{title}</span>{note ? <small>{note}</small> : null}</h2>
      {children}
    </section>
  );
}

export interface PCol { key: string; label: string; num?: boolean; mid?: boolean; width?: string }
/** A clear table: coloured header row (repeated on every printed page), zebra rows, rows never split. */
export function PrintTable({ cols, rows, accent, empty = "Nothing to show yet.", t = tEn, className = "" }: { cols: PCol[]; rows: { id: string; cells: Record<string, ReactNode> }[]; accent?: PrintAccent; empty?: string; t?: T; className?: string }) {
  if (!rows.length) return <p className="pk-empty">{t(empty)}</p>;
  return (
    <table className={`pk-table ${className}`.trim()} style={cvar(accent)} data-pk="table">
      {cols.some((c) => c.width) ? <colgroup>{cols.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}</colgroup> : null}
      <thead><tr>{cols.map((c) => <th key={c.key} scope="col" className={c.num ? "pk-num" : c.mid ? "pk-mid" : undefined}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}>{cols.map((c) => <td key={c.key} className={c.num ? "pk-num" : c.mid ? "pk-mid" : undefined}>{r.cells[c.key] ?? "—"}</td>)}</tr>)}</tbody>
    </table>
  );
}

/** Big numbers in soft colour tiles (up to 4 a row). */
export function PrintTiles({ items }: { items: { label: string; value: ReactNode; hint?: string; accent?: PrintAccent }[] }) {
  return <div className="pk-tiles" data-pk="tiles">{items.map((i) => <div key={i.label} className="pk-tile" style={cvar(i.accent)}><div className="pk-tile-v">{i.value}</div><div className="pk-tile-l">{i.label}</div>{i.hint ? <div className="pk-tile-h">{i.hint}</div> : null}</div>)}</div>;
}

/** A small coloured word ("Strong", "On track"…), always text and colour together. */
export function PrintPill({ children, accent }: { children: ReactNode; accent?: PrintAccent }) {
  return <span className="pk-pill" style={cvar(accent)}>{children}</span>;
}

/** The footer line of a sheet. */
export function PrintFooter({ left, right, t = tEn }: { left?: ReactNode; right?: ReactNode; t?: T }) {
  return <footer className="pk-foot" data-pk="footer"><span>{left ?? `${PLATFORM} ${t("English")}`}</span><span>{right}</span></footer>;
}

/** A dashed "cut here" guide. */
export function CutLine({ t = tEn }: { t?: T }) {
  return <div className="pk-cut" role="separator"><span><span aria-hidden="true">✂ </span>{t("Cut here")}</span></div>;
}

/** The colour of the n-th card in the cheerful cycle. */
export const cycleColor = (i: number) => CARD_CYCLE[((i % CARD_CYCLE.length) + CARD_CYCLE.length) % CARD_CYCLE.length];
