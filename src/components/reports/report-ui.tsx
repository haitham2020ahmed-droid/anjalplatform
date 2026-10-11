/**
 * Small shared pieces of the Update 39C report pages: class and window pickers, stat tiles, a scrolling table box
 * (wide tables scroll inside their box, the page never scrolls sideways on a phone) and the export links.
 * Reports redesign: they now wear the report kit's look (src/components/report-kit) — sticky table headers, zebra
 * rows, even digits, tiles with a coloured bar + mark — so every page that uses them changes together.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { reportHref, type ReportRequest } from "@/reports/links";

export const chip = (on: boolean) => `inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);
export const fmtNum = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
export const fmtSigned = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v > 0 ? `+${v}` : String(v));
export const pctTone = (v: number | null | undefined) => (v === null || v === undefined ? "text-slate-400" : v >= 80 ? "text-emerald-700" : v >= 60 ? "text-amber-700" : "text-red-700");

export function ClassChips({ classes, current, href }: { classes: { id: string; name: string }[]; current: string | null; href: (id: string) => string }) {
  return <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2 print:hidden">{classes.map((c) => <Link key={c.id} href={href(c.id)} className={chip(c.id === current)}><bdi>{c.name}</bdi></Link>)}</nav>;
}

export function WindowChips({ days, href, options = [7, 30, 90, 365] }: { days: number; href: (d: number) => string; options?: number[] }) {
  return (
    <nav aria-label="Time window" className="mb-4 flex flex-wrap items-center gap-2 text-sm print:hidden">
      <span className="text-slate-500">Window:</span>
      {options.map((d) => <Link key={d} href={href(d)} className={chip(d === days)}>{d === 365 ? "12 months" : `${d} days`}</Link>)}
    </nav>
  );
}

export function Stat({ label, value, note, tone = "slate" }: { label: string; value: ReactNode; note?: ReactNode; tone?: "slate" | "teal" | "amber" | "red" }) {
  // a coloured top bar AND a mark: the tone is never shown by colour alone
  const bar = { slate: "bg-slate-200", teal: "bg-brand-teal", amber: "bg-amber-400", red: "bg-rose-500" }[tone];
  const val = { slate: "text-brand-navy", teal: "text-teal-800", amber: "text-amber-800", red: "text-rose-700" }[tone];
  const mark = tone === "red" || tone === "amber" ? "!" : tone === "teal" ? "✓" : "";
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl bg-white p-4 pt-5 shadow-sm ring-1 ring-slate-200 break-inside-avoid">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1.5 ${bar}`} />
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className={`mt-1 flex items-baseline gap-1.5 text-2xl font-bold tabular-nums ${val}`}><bdi dir="ltr">{value}</bdi>{mark && <span aria-hidden="true" className="text-sm">{mark}</span>}</p>
      {note && <p className="mt-0.5 text-[13px] leading-snug text-slate-600">{note}</p>}
    </div>
  );
}
export function Stats({ children }: { children: ReactNode }) {
  return <div className="rk-glance mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</div>;
}

/** A table that scrolls inside its own box on narrow screens. */
export function TableBox({ label, children }: { label: string; children: ReactNode }) {
  return <div className="rk-box rk-tall mt-2" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}
/** Header and cell classes: the report kit's table style (src/app/globals.css · report kit) does the rest. */
export const th = "text-start";
export const td = "align-top";

type Req = Omit<ReportRequest, "format" | "locale">;
/** The same PDF / Excel / CSV links as ExportLinks, as Download buttons for the report kit's ReportHeader. */
export const exportsOf = (report: Req) => [
  { href: reportHref({ ...report, format: "pdf", locale: "en" }), label: "PDF", icon: "📄" },
  { href: reportHref({ ...report, format: "xlsx", locale: "en" }), label: "Excel", icon: "📊" },
  { href: reportHref({ ...report, format: "csv", locale: "en" }), label: "CSV", icon: "🧾" },
];
/** "Last 30 days" / "Last 12 months" for the report header. */
export const windowText = (t: (s: string, v?: Record<string, string | number>) => string, days: number) => (days === 365 ? t("Last 12 months") : t("Last {n} days", { n: days }));
/** PDF / Excel / CSV links through /api/reports (the route checks access; a link grants nothing by itself). */
export function ExportLinks({ report, label = "Download" }: { report: Req; label?: string }) {
  const a = "inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <span className="text-sm text-slate-500">{label}:</span>
      <a className={a} download href={reportHref({ ...report, format: "pdf", locale: "en" })}>PDF</a>
      <a className={a} download href={reportHref({ ...report, format: "xlsx", locale: "en" })}>Excel</a>
      <a className={a} download href={reportHref({ ...report, format: "csv", locale: "en" })}>CSV</a>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p role="status" className="flex items-center gap-3 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200"><span aria-hidden="true" className="text-3xl">🗂️</span><span>{children}</span></p>;
}
