"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useT } from "@/i18n/client";
import { BAND, shares, type BandKey } from "./tokens";

export interface BandPart { key: BandKey; value: number; label?: string }

/** Colour swatch + mark + words + count (+ %): the key that goes with every coloured bar or chart. */
export function Legend({ parts, showPct = true, className = "" }: { parts: BandPart[]; showPct?: boolean; className?: string }) {
  const t = useT();
  const pct = shares(parts.map((p) => p.value));
  return (
    <ul className={`rk-legend flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-700 ${className}`} data-rk="legend">
      {parts.map((p, i) => {
        const b = BAND[p.key];
        return (
          <li key={p.key + i} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`grid h-4 w-4 place-items-center rounded text-[9px] font-bold leading-none text-white ${b.bg}`}>{b.mark}</span>
            <span className="font-semibold">{t(p.label ?? b.label)}</span>
            <span className="tabular-nums text-slate-600" dir="ltr">{p.value}{showPct ? ` (${pct[i]}%)` : ""}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One stacked bar for a distribution (Below / On / Above, Tier 1 / 2 / 3, done / late…), with the % written in
 * each wide-enough part and a legend underneath — colour + text, never colour alone.
 */
export function BandBar({ parts, label, legend = true, height = "h-7", className = "" }: { parts: BandPart[]; label?: string; legend?: boolean; height?: string; className?: string }) {
  const t = useT();
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  const pct = shares(parts.map((p) => p.value));
  const text = parts.map((p, i) => `${t(p.label ?? BAND[p.key].label)} ${p.value} (${pct[i]}%)`).join(", ");
  return (
    <div className={`rk-bandbar min-w-0 ${className}`} data-rk="bandbar">
      {label && <p className="mb-1 text-sm font-semibold text-slate-700">{t(label)}</p>}
      <div role="img" aria-label={`${label ? t(label) + ": " : ""}${text}`} className={`flex w-full overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 ${height}`} dir="ltr">
        {total > 0 && parts.map((p, i) => pct[i] > 0 && (
          <span key={p.key + i} className={`flex items-center justify-center text-xs font-bold text-white ${BAND[p.key].bg}`} style={{ width: `${pct[i]}%` }} title={`${t(p.label ?? BAND[p.key].label)}: ${p.value}`}>
            {pct[i] >= 9 ? <span className="drop-shadow-sm">{BAND[p.key].mark} {pct[i]}%</span> : null}
          </span>
        ))}
      </div>
      {legend && <Legend parts={parts} className="mt-2" />}
    </div>
  );
}

/** A small coloured pill with the band's mark and words (for table cells). */
export function BandPill({ band, label, className = "" }: { band: BandKey; label?: string; className?: string }) {
  const t = useT();
  const b = BAND[band];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${b.soft} ${b.text} ${className}`}><span aria-hidden="true">{b.mark}</span>{t(label ?? b.label)}</span>;
}
