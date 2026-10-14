import Link from "next/link";
import type { ReactNode } from "react";
import type { TFn } from "@/i18n";
import { centerHref, SUB_TABS, type CenterTab } from "@/server/nafs/center";

/** The sub-tabs inside a NAFS center tab (Adaptive: Practice · Report; NAFS test: Create · Report; booklets: Booklets · Report). */
export function SubNav({ tab, sub, t, keep = {} }: { tab: CenterTab; sub: string; t: TFn; keep?: Record<string, string | undefined> }) {
  const list = SUB_TABS[tab] ?? [];
  return (
    <nav aria-label={t("Sections")} className="mb-4 flex flex-wrap gap-1.5 print:hidden">
      {list.map((x) => (
        <Link key={x.key} href={centerHref(tab, { sub: x.key, ...keep })} aria-current={sub === x.key ? "page" : undefined}
          className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ring-1 ${sub === x.key ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-ink-2 ring-line hover:bg-surface-2"}`}>
          {x.key === "report" ? "📊 " : ""}{t(x.label)}
        </Link>
      ))}
    </nav>
  );
}

/** A bar for a percentage (the number is always written; colour by the usual cut-offs). */
export function PctBar({ v, label, sub }: { v: number | null; label: string; sub?: string }) {
  const cls = v === null ? "" : v >= 85 ? "bg-emerald-500" : v >= 65 ? "bg-sky-500" : v >= 45 ? "bg-amber-400" : "bg-rose-400";
  const txt = v === null ? "text-muted" : v >= 85 ? "text-emerald-700" : v >= 65 ? "text-sky-700" : v >= 45 ? "text-amber-700" : "text-rose-700";
  return (
    <div>
      <div className="flex justify-between gap-2 text-sm text-ink-2"><span className="min-w-0">{label}{sub ? <span className="ms-1 text-xs text-muted">{sub}</span> : null}</span><span className={`tabular-nums font-semibold ${txt}`}>{v === null ? "—" : `${v}%`}</span></div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2 print:ring-1 print:ring-black" aria-hidden="true"><div className={`h-full rounded-full ${cls}`} style={{ width: `${v ?? 0}%` }} /></div>
    </div>
  );
}

/** A summary card (number + label + optional line under it). */
export function Card({ n, label, sub }: { n: ReactNode; label: string; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line print:shadow-none">
      <p className="text-2xl font-bold tabular-nums text-ink">{n}</p>
      <p className="mt-0.5 text-sm text-ink-2">{label}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}
