import type { Health } from "@/server/admin/connections";

export const HEALTH_UI: Record<Health, { ring: string; text: string; chip: string; label: string; bar: string }> = {
  GOOD: { ring: "#1fa3a3", text: "text-teal-800", chip: "bg-teal-50 text-teal-800 ring-teal-200", label: "Connected", bar: "bg-brand-teal" },
  WARN: { ring: "#f5b800", text: "text-amber-800", chip: "bg-amber-50 text-amber-900 ring-amber-200", label: "Some gaps", bar: "bg-amber-400" },
  BAD: { ring: "#e5484d", text: "text-red-700", chip: "bg-red-50 text-red-800 ring-red-200", label: "Needs work", bar: "bg-red-500" },
  INFO: { ring: "#94a3b8", text: "text-slate-600", chip: "bg-slate-50 text-slate-700 ring-slate-200", label: "For information", bar: "bg-slate-400" },
};

export interface ThreadNode { key: string; title: string; icon: string; pct: number | null; health: Health; href: string }

/**
 * The learning thread: the platform's parts in the order learning flows through them, joined by one line.
 * Each knot shows how well that part is joined to the rest (ring = share of its links in place).
 */
export function Thread({ nodes }: { nodes: ThreadNode[] }) {
  return (
    <ol className="relative grid grid-cols-2 gap-y-6 sm:grid-cols-4 lg:grid-cols-7" aria-label="How the platform's parts connect">
      <span aria-hidden="true" className="absolute inset-x-[7%] top-9 hidden h-[3px] rounded-full bg-gradient-to-r bg-linear-to-r from-brand-navy via-brand-purple to-brand-teal lg:block" />
      {nodes.map((n, i) => {
        const ui = HEALTH_UI[n.health], r = 30, c = 2 * Math.PI * r, p = n.pct ?? 0;
        return (
          <li key={n.key} className="relative flex flex-col items-center text-center">
            <a href={n.href} className="group flex flex-col items-center rounded-2xl px-2 py-1 focus-visible:outline-2">
              <span className="relative grid h-[76px] w-[76px] place-items-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90" aria-hidden="true">
                  <circle cx="38" cy="38" r={r} fill="none" stroke="#eef2f6" strokeWidth="6" />
                  <circle cx="38" cy="38" r={r} fill="none" stroke={ui.ring} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(p / 100) * c} ${c}`} />
                </svg>
                <span className="text-2xl" aria-hidden="true">{n.icon}</span>
              </span>
              <span className="mt-2 text-[13px] font-semibold leading-tight text-slate-800">{n.title}</span>
              <span className={`text-xs font-semibold ${ui.text}`}>{n.pct === null ? "—" : `${n.pct}%`}<span className="sr-only"> · {ui.label} · step {i + 1} of {nodes.length}</span></span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** A share as a slim bar. */
export function ShareBar({ ok, total, health }: { ok: number; total: number; health: Health }) {
  const p = total ? Math.round((ok / total) * 100) : 0;
  return <span className="block h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><span className={`block h-full rounded-full ${HEALTH_UI[health].bar}`} style={{ width: `${p}%` }} /></span>;
}
