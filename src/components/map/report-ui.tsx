import Link from "next/link";
import type { ReactNode } from "react";
import type { FamilyPoint, PlanSkillRef, ReportStudent } from "@/server/map/map-reports";

/** One printed page (a new page in the PDF, except the first). */
export function ReportPage({ children, first = false, className = "" }: { children: ReactNode; first?: boolean; className?: string }) {
  return <article className={`report-doc mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0 ${first ? "" : "mt-8 break-before-page print:mt-0"} ${className}`}>{children}</article>;
}

/** Name, ID, grade, class, school — top of every report page. */
export function ReportHead({ s, title, term, right }: { s: ReportStudent; title: string; term: string | null; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand-navy pb-3">
      <div className="flex items-center gap-3">
        {s.logoUrl && /^(\/|https:)/.test(s.logoUrl) && <img src={s.logoUrl} alt="" className="h-12 w-12 rounded-lg object-contain" />}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-teal">{title}</p>
          <h1 className="text-2xl font-black text-brand-navy">{s.name}</h1>
          <p className="text-sm text-slate-600">{term ? `${term} · ` : ""}Grade {s.grade}{s.className ? ` · ${s.className}` : ""}</p>
        </div>
      </div>
      <div className="text-right text-xs text-slate-500">{right}{s.number && <p>ID: {s.number}</p>}<p>{s.school}</p></div>
    </header>
  );
}

export const BAND_COLORS = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6"];
/** Percentile on the five descriptor bands (Low · Low Average · Average · High Average · High) with a marker. */
export function PercentileBar({ pct, label }: { pct: number; label: string }) {
  const x = Math.max(1, Math.min(99, pct));
  return (
    <svg viewBox="0 0 220 64" className="w-full max-w-[260px]" role="img" aria-label={`${label}: ${x}th percentile`}>
      <text x={(x / 100) * 200 + 10} y="12" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1f3a68">{label}</text>
      <polygon points={`${(x / 100) * 200 + 4},16 ${(x / 100) * 200 + 16},16 ${(x / 100) * 200 + 10},24`} fill="#1f3a68" />
      {BAND_COLORS.map((c, i) => <rect key={c} x={10 + i * 40} y="26" width="39" height="14" rx="2" fill={c} />)}
      <line x1="110" y1="24" x2="110" y2="48" stroke="#334155" strokeWidth="1" />
      <text x="110" y="60" textAnchor="middle" fontSize="9" fill="#475569">Average: 50th</text>
    </svg>
  );
}

/** The student's RIT across terms (solid) and the national average of their grade at the time (dashed). */
export function RitChart({ points, first }: { points: FamilyPoint[]; first: string }) {
  const vals = points.flatMap((p) => [p.rit, p.national]).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const lo = Math.floor((Math.min(...vals) - 8) / 5) * 5, hi = Math.ceil((Math.max(...vals) + 8) / 5) * 5;
  const W = 360, H = 150, L = 30, R = 26, T = 16, B = 24;
  const xs = (i: number) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const ys = (v: number) => T + ((hi - v) * (H - T - B)) / Math.max(1, hi - lo);
  const ticks = [lo, Math.round((lo * 2 + hi) / 3), Math.round((lo + hi * 2) / 3), hi];
  const line = (key: "rit" | "national") => points.map((p, i) => (p[key] === null ? null : `${xs(i)},${ys(p[key]!)}`)).filter(Boolean).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`RIT scores: ${points.map((p) => `${p.label} ${p.rit ?? "—"}`).join(", ")}`}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="none" stroke="#cbd5e1" />
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={ys(t)} y2={ys(t)} stroke="#f1f5f9" /><text x={L - 4} y={ys(t) + 3} textAnchor="end" fontSize="9" fill="#64748b">{t}</text></g>)}
      {points.map((p, i) => <g key={p.term + i}><line x1={xs(i)} x2={xs(i)} y1={T} y2={H - B} stroke="#f1f5f9" /><text x={xs(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="#475569">{p.label}</text></g>)}
      <polyline points={line("national")} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 3" />
      <polyline points={line("rit")} fill="none" stroke="#1f3a68" strokeWidth="2.5" />
      {points.map((p, i) => p.rit !== null && <g key={`d${i}`}><circle cx={xs(i)} cy={ys(p.rit)} r="3.5" fill="#1f3a68" /><text x={xs(i)} y={ys(p.rit) - 7} textAnchor="middle" fontSize="10" fontWeight="700" fill="#1f3a68">{p.rit}</text></g>)}
    </svg>
  );
}

/** The legend of the RIT chart (under it). */
export function RitLegend({ first, approx }: { first: string; approx: boolean }) {
  return <p className="flex gap-4 text-[11px] text-slate-600"><span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-brand-navy" />{first}</span><span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t border-dashed border-slate-500" />National average{approx ? " (≈)" : ""}</span></p>;
}

export const STATUS_UI: Record<PlanSkillRef["status"], { dot: string; label: string; chip: string }> = {
  MASTERED: { dot: "bg-emerald-500", label: "mastered", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  PRACTISING: { dot: "bg-amber-400", label: "practising", chip: "bg-amber-50 text-amber-900 ring-amber-200" },
  NEW: { dot: "bg-slate-300", label: "not started", chip: "bg-slate-50 text-slate-700 ring-slate-200" },
};

/** A platform skill linked to a statement; a practice link for the student. */
export function SkillChip({ k, link, hub = false }: { k: PlanSkillRef; link: boolean; hub?: boolean }) {
  const ui = STATUS_UI[k.status];
  if (hub) return <Link href={`/skill/${k.id}`} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 hover:ring-brand-teal ${ui.chip}`}><span className={`inline-block h-2 w-2 rounded-full ${ui.dot}`} aria-hidden="true" /> {k.name}</Link>;
  const inner = <><span className={`inline-block h-2 w-2 rounded-full ${ui.dot}`} aria-hidden="true" /> {k.name}{k.status !== "NEW" && <span className="sr-only"> ({ui.label})</span>}</>;
  return link
    ? <Link href={`/practice/${k.id}?from=map`} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 hover:ring-brand-teal ${ui.chip}`}>{inner}</Link>
    : <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 ${ui.chip}`}>{inner}</span>;
}

export function StatusLegend() {
  return <p className="flex flex-wrap gap-3 text-xs text-slate-600">{(["MASTERED", "PRACTISING", "NEW"] as const).map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={`inline-block h-2 w-2 rounded-full ${STATUS_UI[k].dot}`} />{STATUS_UI[k].label}</span>)}</p>;
}

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
