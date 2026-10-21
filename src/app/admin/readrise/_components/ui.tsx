/** @jsxRuntime automatic */
/** @jsxImportSource react */
/** 🚀 ReadRise staff pages — small shared pieces (server-rendered, no client JS). */
import type { ReactNode } from "react";

export const RR_NOTE = "The ReadRise level is ReadRise's own reading level (an estimate from the reading checks and first-try scores).";
export const btn = "rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple";
export const btnGhost = "rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
export const field = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export function Flash({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{msg}</p>;
}

export function StatusPill({ status }: { status: string }) {
  const on = status === "PUBLISHED";
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${on ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-600"}`}>{on ? "Published" : "Draft"}</span>;
}

export function SourcePill({ source, hidden }: { source: "PLATFORM" | "SCHOOL"; hidden?: boolean }) {
  return (
    <span className="flex shrink-0 gap-1">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${source === "PLATFORM" ? "bg-sky-50 text-sky-900 ring-sky-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>{source === "PLATFORM" ? "Platform" : "School"}</span>
      {hidden && <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-white">Hidden</span>}
    </span>
  );
}

/** A number tile: label, big value, small note. */
export function Stat({ label, value, note, tone = "slate" }: { label: string; value: ReactNode; note?: ReactNode; tone?: "slate" | "teal" | "amber" | "red" }) {
  const ring = { slate: "ring-slate-200", teal: "ring-teal-200", amber: "ring-amber-300", red: "ring-red-200" }[tone];
  return (
    <div className={`rounded-2xl bg-white p-4 ring-1 ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-brand-navy">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export const fmt = (v: number | null | undefined, suffix = "") => (v === null || v === undefined ? "—" : `${v}${suffix}`);
export const signed = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v > 0 ? `+${v}` : String(v));
export const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export interface ScaledSeries { name: string; color: string; points: (number | null)[]; width?: number; dots?: boolean; legend?: boolean }

/**
 * SVG line chart with its own value range (levels 200–1500, or articles per student per week), an optional shaded
 * expected band, and an accessible data table. Thin series (one per student) can be left out of the legend.
 */
export function ScaledLineChart({ labels, series, title, min, max, ticks, band, height = 240, unit = "" }: {
  labels: string[]; series: ScaledSeries[]; title: string; min: number; max: number; ticks: number[]; band?: { low: number; high: number; label: string }; height?: number; unit?: string;
}) {
  const W = 640, H = height, L = 48, R = 16, T = 14, B = 30;
  const span = Math.max(1e-9, max - min);
  const x = (i: number) => L + (labels.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (labels.length - 1));
  const y = (v: number) => T + ((max - Math.min(max, Math.max(min, v))) * (H - T - B)) / span;
  const legend = series.filter((s) => s.legend !== false);
  return (
    <figure className="relative w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        {band && <rect x={L} width={W - L - R} y={y(band.high)} height={Math.max(0, y(band.low) - y(band.high))} fill="#ccfbf1" opacity={0.6} />}
        {ticks.map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="#64748b">{g}</text>
          </g>
        ))}
        {labels.map((l, i) => <text key={`${l}-${i}`} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="#64748b">{l}</text>)}
        {series.map((s) => {
          const pts = s.points.map((v, i) => (v === null ? null : ([x(i), y(v)] as const)));
          const segs: string[] = [];
          let cur = "";
          for (const p of pts) {
            if (!p) { if (cur) segs.push(cur); cur = ""; continue; }
            cur += `${cur ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
          }
          if (cur) segs.push(cur);
          const w = s.width ?? 3;
          return (
            <g key={s.name}>
              {segs.map((d, i) => <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" />)}
              {s.dots !== false && pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={w > 2 ? 4 : 2.5} fill="#fff" stroke={s.color} strokeWidth={2} />)}
            </g>
          );
        })}
      </svg>
      {(legend.length > 1 || band) && (
        <figcaption className="mt-1 flex flex-wrap gap-4 text-sm text-slate-600">
          {legend.map((s) => <span key={s.name} className="flex items-center gap-2"><span className="h-1 w-5 rounded" style={{ background: s.color }} />{s.name}</span>)}
          {band && <span className="flex items-center gap-2"><span className="h-3 w-5 rounded bg-teal-100" />{band.label}</span>}
        </figcaption>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th scope="col">Week</th>{series.map((s) => <th key={s.name} scope="col">{s.name}</th>)}</tr></thead>
        <tbody>{labels.map((l, i) => <tr key={`${l}-${i}`}><th scope="row">{l}</th>{series.map((s) => <td key={s.name}>{s.points[i] === null ? "no data" : `${s.points[i]}${unit}`}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Level distribution: one column per 100 levels; columns inside the expected band are teal. */
export function LevelHistogram({ buckets, title }: { buckets: { from: number; to: number; count: number; inBand: boolean }[]; title: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const label = (b: { from: number; to: number }, i: number) => (i === 0 ? `≤${b.to + 1}` : b.to >= 9999 ? `${b.from}+` : String(b.from));
  return (
    <figure className="relative overflow-hidden">
      <div className="flex h-40 items-end gap-1" role="img" aria-label={title}>
        {buckets.map((b, i) => (
          <div key={b.from} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="text-[11px] font-semibold tabular-nums text-slate-600">{b.count || ""}</span>
            <span className={`w-full rounded-t ${b.inBand ? "bg-teal-500" : "bg-slate-300"}`} style={{ height: `${(100 * b.count) / max}%`, minHeight: b.count ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 border-t border-slate-200 pt-1">
        {buckets.map((b, i) => <span key={b.from} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-500">{label(b, i)}</span>)}
      </div>
      <figcaption className="mt-2 flex items-center gap-2 text-xs text-slate-500"><span className="h-3 w-4 rounded bg-teal-500" />inside the expected band<span className="ms-3 h-3 w-4 rounded bg-slate-300" />outside</figcaption>
      <table className="sr-only"><caption>{title}</caption><tbody>{buckets.map((b, i) => <tr key={b.from}><th scope="row">{label(b, i)}</th><td>{b.count}</td></tr>)}</tbody></table>
    </figure>
  );
}

/** Ticks for a level chart that covers all values (and the band) in steps of 100. */
export function levelRange(values: (number | null)[], band?: { low: number; high: number }): { min: number; max: number; ticks: number[] } {
  const vs = values.filter((v): v is number => v !== null);
  let lo = Math.min(...vs, band?.low ?? Infinity), hi = Math.max(...vs, band?.high ?? -Infinity);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 300; hi = 1600; }
  const min = Math.max(0, Math.floor((lo - 50) / 100) * 100), max = Math.ceil((hi + 50) / 100) * 100;
  const step = max - min > 800 ? 200 : 100;
  const ticks: number[] = [];
  for (let t = min; t <= max; t += step) ticks.push(t);
  return { min, max, ticks };
}
