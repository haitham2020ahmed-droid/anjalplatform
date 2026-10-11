/**
 * Small shared pieces of the Update 39C report pages: class and window pickers, stat tiles, a scrolling table box
 * (wide tables scroll inside their box, the page never scrolls sideways on a phone) and the export links.
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
  return <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={c.id} href={href(c.id)} className={chip(c.id === current)}><bdi>{c.name}</bdi></Link>)}</nav>;
}

export function WindowChips({ days, href, options = [7, 30, 90, 365] }: { days: number; href: (d: number) => string; options?: number[] }) {
  return (
    <nav aria-label="Time window" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-500">Window:</span>
      {options.map((d) => <Link key={d} href={href(d)} className={chip(d === days)}>{d === 365 ? "12 months" : `${d} days`}</Link>)}
    </nav>
  );
}

export function Stat({ label, value, note, tone = "slate" }: { label: string; value: ReactNode; note?: ReactNode; tone?: "slate" | "teal" | "amber" | "red" }) {
  const ring = { slate: "ring-slate-200", teal: "ring-teal-200", amber: "ring-amber-300", red: "ring-red-300" }[tone];
  return (
    <div className={`min-w-0 rounded-2xl bg-white p-4 ring-1 ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-brand-navy">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}
export function Stats({ children }: { children: ReactNode }) {
  return <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</div>;
}

/** A table that scrolls inside its own box on narrow screens. */
export function TableBox({ label, children }: { label: string; children: ReactNode }) {
  return <div className="relative -mx-1 max-w-full overflow-x-auto px-1" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}
export const th = "p-2 text-start text-xs font-semibold uppercase tracking-wide text-slate-500";
export const td = "p-2 align-top";

type Req = Omit<ReportRequest, "format" | "locale">;
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
  return <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{children}</p>;
}
