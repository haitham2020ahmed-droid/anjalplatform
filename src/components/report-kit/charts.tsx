"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import { BAND, pctBand, shares, type BandKey } from "./tokens";

/**
 * Tiny SVG / CSS charts (no chart library: the server has 512 MB). Every chart has a text alternative and its
 * numbers written next to it, so nothing depends on colour or on seeing the picture.
 */

export interface BarItem { label: ReactNode; value: number | null; display?: ReactNode; band?: BandKey | null; href?: string; note?: ReactNode }

/** Horizontal bars, one per row: label · bar · number. `max` defaults to 100 (percentages). */
export function SimpleBar({ items, max = 100, label, unit = "%", bands = true, className = "" }: { items: BarItem[]; max?: number; label?: string; unit?: string; bands?: boolean; className?: string }) {
  const t = useT();
  if (!items.length) return null;
  const top = Math.max(max, ...items.map((i) => i.value ?? 0), 1);
  return (
    <figure className={`rk-bars min-w-0 ${className}`} data-rk="bars">
      {label && <figcaption className="mb-2 text-sm font-semibold text-slate-700">{t(label)}</figcaption>}
      <ul className="space-y-2">
        {items.map((it, i) => {
          const band = it.band === undefined ? (bands && unit === "%" ? pctBand(it.value) : null) : it.band;
          const b = band ? BAND[band] : null;
          const w = it.value === null ? 0 : Math.max(2, Math.round((100 * it.value) / top));
          const name = it.href ? <a href={it.href} className="font-medium text-brand-navy hover:underline">{it.label}</a> : <span className="font-medium text-slate-800">{it.label}</span>;
          return (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)_auto]">
              <span className="min-w-0 truncate text-sm sm:col-auto">{name}{it.note && <span className="block truncate text-xs text-slate-500">{it.note}</span>}</span>
              <span className="order-3 col-span-2 h-3 overflow-hidden rounded-full bg-slate-100 sm:order-none sm:col-span-1" aria-hidden="true" dir="ltr">
                <span className={`block h-full rounded-full ${b ? b.bg : "bg-brand-teal"}`} style={{ width: `${w}%` }} />
              </span>
              <span className="whitespace-nowrap text-end text-sm font-semibold tabular-nums text-slate-800" dir="ltr">
                {b && <span aria-hidden="true" className={`me-1 text-xs ${b.text}`}>{b.mark}</span>}
                {it.display ?? (it.value === null ? "—" : `${it.value}${unit}`)}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/** A small trend line (e.g. weekly accuracy). Gaps (null) are skipped; the last point is marked. */
export function Sparkline({ values, width = 120, height = 32, label, max = 100, min = 0, className = "" }: { values: (number | null)[]; width?: number; height?: number; label: string; max?: number; min?: number; className?: string }) {
  const t = useT();
  const pts = values.map((v, i) => (v === null ? null : [values.length === 1 ? width / 2 : (i * (width - 6)) / (values.length - 1) + 3, height - 3 - ((Math.min(max, Math.max(min, v)) - min) / Math.max(1, max - min)) * (height - 6)] as const));
  const shown = pts.filter((p): p is readonly [number, number] => p !== null);
  const text = `${t(label)}: ${values.map((v) => (v === null ? "–" : String(v))).join(", ")}`;
  if (!shown.length) return <span className="text-xs text-slate-400">—</span>;
  const last = shown[shown.length - 1];
  return (
    <svg role="img" aria-label={text} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={`inline-block overflow-visible align-middle ${className}`} data-rk="sparkline">
      <title>{text}</title>
      <line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="#e2e8f0" strokeDasharray="2 3" />
      <polyline fill="none" stroke="#1fa3a3" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={shown.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} />
      <circle cx={last[0]} cy={last[1]} r="3" fill="#1f3a68" />
    </svg>
  );
}

export interface DonutPart { key: BandKey; value: number; label?: string }

/** A ring chart with the main number in the middle and the legend beside it. */
export function Donut({ parts, center, sub, label, size = 132 }: { parts: DonutPart[]; center?: ReactNode; sub?: ReactNode; label: string; size?: number }) {
  const t = useT();
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  const pct = shares(parts.map((p) => p.value));
  const r = 42, c = 2 * Math.PI * r;
  let off = 0;
  const text = `${t(label)}: ${parts.map((p, i) => `${t(p.label ?? BAND[p.key].label)} ${p.value} (${pct[i]}%)`).join(", ")}`;
  return (
    <figure className="rk-donut flex flex-wrap items-center gap-4" data-rk="donut">
      <svg role="img" aria-label={text} width={size} height={size} viewBox="0 0 100 100" className="shrink-0">
        <title>{text}</title>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        {total > 0 && parts.map((p, i) => {
          const len = (c * Math.max(0, p.value)) / total;
          const el = <circle key={p.key + i} cx="50" cy="50" r={r} fill="none" stroke={BAND[p.key].hex} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 50 50)" />;
          off += len;
          return el;
        })}
        {center !== undefined && <text x="50" y={sub ? 50 : 55} textAnchor="middle" fontSize="20" fontWeight="700" fill="#1f3a68">{center}</text>}
        {sub && <text x="50" y="66" textAnchor="middle" fontSize="9" fill="#475569">{sub}</text>}
      </svg>
      <figcaption className="min-w-0">
        <p className="mb-1 text-sm font-semibold text-slate-700">{t(label)}</p>
        <ul className="space-y-1 text-sm">
          {parts.map((p, i) => (
            <li key={p.key + i} className="flex items-center gap-2">
              <span aria-hidden="true" className={`grid h-4 w-4 place-items-center rounded text-[9px] font-bold text-white ${BAND[p.key].bg}`}>{BAND[p.key].mark}</span>
              <span className="font-semibold text-slate-800">{t(p.label ?? BAND[p.key].label)}</span>
              <span className="tabular-nums text-slate-600" dir="ltr">{p.value} ({pct[i]}%)</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/** One progress meter: "12 of 20" with a bar and the % in words. */
export function Meter({ value, total, label, className = "" }: { value: number; total: number; label?: string; className?: string }) {
  const t = useT();
  const p = total > 0 ? Math.min(100, Math.round((100 * value) / total)) : 0;
  return (
    <div className={`rk-meter ${className}`} data-rk="meter">
      {label && <p className="mb-1 flex justify-between gap-2 text-sm"><span className="font-semibold text-slate-700">{t(label)}</span><span className="tabular-nums text-slate-600" dir="ltr">{value} / {total} · {p}%</span></p>}
      <div role="progressbar" aria-label={label ? t(label) : undefined} aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={Math.min(value, total)} className="h-3 overflow-hidden rounded-full bg-slate-100" dir="ltr">
        <div className="h-full rounded-full bg-brand-teal" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}
