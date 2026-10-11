/** 📊 Charts for the NWEA-style reports (plain SVG: prints sharply, no library). */
import type { HistoryPoint, ProfileArea } from "@/server/map/nwea-reports";

export const Q_COLORS = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6"];
const Q_FILL = ["#fee2e2", "#ffedd5", "#fef9c3", "#dcfce7", "#dbeafe"];

/** RIT history over the national percentile bands (Low · LoAvg · Avg · HiAvg · High), with the error range. */
export function GrowthBandsChart({ points, title }: { points: HistoryPoint[]; title: string }) {
  const W = 560, H = 230, L = 40, R = 34, T = 14, B = 34;
  const vals = points.flatMap((p) => [p.rit - (p.se ?? 0), p.rit + (p.se ?? 0), ...(p.bands ?? [])]);
  if (!points.length) return null;
  const lo = Math.floor((Math.min(...vals) - 8) / 10) * 10, hi = Math.ceil((Math.max(...vals) + 8) / 10) * 10;
  const x = (i: number) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const withBands = points.map((p, i) => ({ p, i })).filter(({ p }) => p.bands);
  // band polygons between consecutive edges (bottom of the chart → edge 1 → … → top)
  const edge = (k: number) => withBands.map(({ p, i }) => `${x(i)},${y(k < 0 ? lo : k > 3 ? hi : p.bands![k])}`);
  const poly = (k: number) => [...edge(k - 1), ...edge(k).reverse()].join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
      {withBands.length > 0 && [0, 1, 2, 3, 4].map((k) => <polygon key={k} points={poly(k)} fill={Q_FILL[k]} opacity={0.9} />)}
      {Array.from({ length: (hi - lo) / 10 + 1 }, (_, k) => lo + k * 10).map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" /><text x={L - 6} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#64748b">{v}</text></g>)}
      {points.some((p) => p.national !== null) && <polyline points={points.filter((p) => p.national !== null).map((p) => `${x(points.indexOf(p))},${y(p.national!)}`).join(" ")} fill="none" stroke="#64748b" strokeDasharray="4 3" strokeWidth="1.5" />}
      <polyline points={points.map((p, i) => `${x(i)},${y(p.rit)}`).join(" ")} fill="none" stroke="#1f3a68" strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={i}>
          {p.se !== null && <line x1={x(i)} x2={x(i)} y1={y(p.rit - p.se)} y2={y(p.rit + p.se)} stroke="#1f3a68" strokeWidth="5" opacity="0.25" strokeLinecap="round" />}
          <circle cx={x(i)} cy={y(p.rit)} r="4.5" fill="#1f3a68" />
          <text x={x(i)} y={y(p.rit) - 9} fontSize="10" fontWeight="700" textAnchor="middle" fill="#1f3a68">{p.rit}</text>
          <text x={x(i)} y={H - 18} fontSize="9.5" textAnchor="middle" fill="#334155">{p.label}</text>
          <text x={x(i)} y={H - 6} fontSize="8.5" textAnchor="middle" fill="#94a3b8">Gr {p.grade}</text>
        </g>
      ))}
    </svg>
  );
}

export function BandLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
      {["Low", "Low Avg", "Avg", "High Avg", "High"].map((l, i) => <span key={l} className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: Q_FILL[i], border: `1px solid ${Q_COLORS[i]}` }} />{l}</span>)}
      <span className="inline-flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-dashed border-slate-500" />National mean</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-5 rounded bg-brand-navy" />Student RIT (± error)</span>
    </p>
  );
}

/** Instructional areas: each RIT range on one scale, the overall RIT as a line. */
export function AreaRanges({ areas, overall }: { areas: ProfileArea[]; overall: number }) {
  if (!areas.length) return null;
  const all = areas.flatMap((a) => [a.low ?? a.rit, a.high ?? a.rit, overall]);
  const lo = Math.floor((Math.min(...all) - 5) / 5) * 5, hi = Math.ceil((Math.max(...all) + 5) / 5) * 5;
  const LBL = 120, W = 220, x = (v: number) => LBL + ((v - lo) * W) / (hi - lo);
  return (
    <svg viewBox={`0 0 ${LBL + W + 34} ${areas.length * 26 + 20}`} className="w-full" role="img" aria-label="Instructional area RIT ranges">
      <line x1={x(overall)} x2={x(overall)} y1="0" y2={areas.length * 26 + 4} stroke="#1f3a68" strokeDasharray="3 3" />
      <text x={x(overall)} y={areas.length * 26 + 16} fontSize="9" textAnchor="middle" fill="#1f3a68">overall {overall}</text>
      {areas.map((a, i) => (
        <g key={a.name} transform={`translate(0 ${i * 26 + 6})`}>
          <text x="0" y="12" fontSize="10" fill="#334155">{a.name.length > 22 ? `${a.name.slice(0, 21)}…` : a.name}</text>
          <rect x={x(a.low ?? a.rit - 3)} y="2" width={Math.max(4, x(a.high ?? a.rit + 3) - x(a.low ?? a.rit - 3))} height="12" rx="6" fill={a.relative === "STRENGTH" ? "#22c55e" : a.relative === "FOCUS" ? "#f97316" : "#94a3b8"} opacity="0.55" />
          <circle cx={x(a.rit)} cy="8" r="4" fill="#0f172a" />
          <text x={x(a.high ?? a.rit + 3) + 4} y="12" fontSize="9" fill="#475569">{a.rit}</text>
        </g>
      ))}
    </svg>
  );
}

/** Students per achievement quintile (bars). */
export function QuintileBars({ counts, labels }: { counts: number[]; labels: string[] }) {
  const max = Math.max(1, ...counts), total = counts.reduce((t, c) => t + c, 0) || 1;
  return (
    <div className="flex h-40 items-end gap-2" role="img" aria-label={`Students per band: ${counts.join(", ")}`}>
      {counts.map((c, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-bold tabular-nums text-slate-700">{c} · {Math.round((100 * c) / total)}%</span>
          <div className="w-full rounded-t-lg" style={{ height: `${(c / max) * 100}px`, background: Q_COLORS[i] }} />
          <span className="text-center text-[10px] leading-tight text-slate-500">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

/** Achievement percentile × growth (conditional growth percentile): four quadrants. */
export function QuadrantChart({ points }: { points: { name: string; ach: number; growth: number }[] }) {
  const S = 300, P = 30;
  const x = (v: number) => P + (v / 100) * (S - P - 8), y = (v: number) => S - P - (v / 100) * (S - P - 8);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-md" role="img" aria-label="Achievement and growth quadrant chart">
      <rect x={x(50)} y={y(100)} width={x(100) - x(50)} height={y(50) - y(100)} fill="#dcfce7" />
      <rect x={x(0)} y={y(100)} width={x(50) - x(0)} height={y(50) - y(100)} fill="#dbeafe" />
      <rect x={x(50)} y={y(50)} width={x(100) - x(50)} height={y(0) - y(50)} fill="#fef9c3" />
      <rect x={x(0)} y={y(50)} width={x(50) - x(0)} height={y(0) - y(50)} fill="#fee2e2" />
      <text x={x(75)} y={y(95)} fontSize="8" textAnchor="middle" fill="#166534">High ach. · high growth</text>
      <text x={x(25)} y={y(95)} fontSize="8" textAnchor="middle" fill="#1e40af">Low ach. · high growth</text>
      <text x={x(75)} y={y(4)} fontSize="8" textAnchor="middle" fill="#854d0e">High ach. · low growth</text>
      <text x={x(25)} y={y(4)} fontSize="8" textAnchor="middle" fill="#991b1b">Low ach. · low growth</text>
      <line x1={x(0)} x2={x(100)} y1={y(0)} y2={y(0)} stroke="#64748b" /><line x1={x(0)} x2={x(0)} y1={y(0)} y2={y(100)} stroke="#64748b" />
      <text x={x(50)} y={S - 6} fontSize="9" textAnchor="middle" fill="#334155">Achievement percentile</text>
      <text x="10" y={y(50)} fontSize="9" textAnchor="middle" fill="#334155" transform={`rotate(-90 10 ${y(50)})`}>Growth percentile</text>
      {points.map((p, i) => <circle key={i} cx={x(p.ach)} cy={y(p.growth)} r="4" fill="#1f3a68" opacity="0.8"><title>{`${p.name}: achievement ${p.ach}, growth ${p.growth}`}</title></circle>)}
    </svg>
  );
}
