/**
 * 🇸🇦 Simple inline SVG charts for the NAFS dashboard (no chart package, server-rendered): a line chart of percents
 * (0–100) over attempts with one line per series, and a small sparkline. Every chart carries its numbers as text too
 * (title / the table next to it), so colour is never the only signal.
 */
export interface LineSeries { name: string; cls: string; dash?: boolean; points: (number | null)[] }

export function LineChart({ labels, series, title, height = 180 }: { labels: string[]; series: LineSeries[]; title: string; height?: number }) {
  const W = 640, H = height, L = 34, R = 10, T = 10, B = 26;
  const n = Math.max(1, labels.length);
  const x = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  const path = (pts: (number | null)[]) => {
    let d = "", pen = false;
    pts.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true; });
    return d.trim();
  };
  const every = Math.max(1, Math.ceil(n / 8));
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <title>{title}</title>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-slate-200" strokeWidth={1} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-slate-500" fontSize={10}>{v}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % every === 0 || i === n - 1) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-500" fontSize={10}>{l}</text>)}
        {series.map((sr) => (
          <g key={sr.name} className={sr.cls}>
            <path d={path(sr.points)} fill="none" stroke="currentColor" strokeWidth={2.5} strokeDasharray={sr.dash ? "6 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
            {sr.points.map((v, i) => v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill="currentColor"><title>{`${sr.name} · ${labels[i]}: ${v}%`}</title></circle>)}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-3 text-xs text-ink-2">
        {series.map((sr) => <span key={sr.name} className="inline-flex items-center gap-1.5"><svg width="22" height="8" aria-hidden="true" className={sr.cls}><line x1="1" x2="21" y1="4" y2="4" stroke="currentColor" strokeWidth={2.5} strokeDasharray={sr.dash ? "5 3" : undefined} /></svg>{sr.name}</span>)}
      </figcaption>
    </figure>
  );
}

/** A tiny trend line (0–100) with its numbers in the title. */
export function Sparkline({ points, label, cls = "text-teal-700" }: { points: (number | null)[]; label: string; cls?: string }) {
  const vals = points.filter((v): v is number => v !== null);
  if (!vals.length) return <span className="text-muted">—</span>;
  const W = 72, H = 22, n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : 2 + (i * (W - 4)) / (n - 1));
  const y = (v: number) => 2 + ((100 - v) * (H - 4)) / 100;
  let d = "", pen = false;
  points.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true; });
  const txt = `${label}: ${vals.join(" → ")}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={txt} className={`inline-block align-middle ${cls}`}>
      <title>{txt}</title>
      <path d={d.trim()} fill="none" stroke="currentColor" strokeWidth={1.8} />
      {points.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={1.8} fill="currentColor" />))}
    </svg>
  );
}
