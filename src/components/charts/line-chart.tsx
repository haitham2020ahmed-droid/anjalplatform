/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * Minimal server-rendered SVG line chart (0–100 scale) with an accessible data table.
 * Why not a chart library: renders on the server, works offline, no client JS, accessible.
 */
export interface LineSeries {
  name: string;
  color: string;
  points: (number | null)[];
}

export function LineChart({ labels, series, title, height = 220 }: { labels: string[]; series: LineSeries[]; title: string; height?: number }) {
  const W = 640, H = height, L = 40, R = 16, T = 16, B = 32;
  const x = (i: number) => L + (labels.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (labels.length - 1));
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="#64748b">{g}</text>
          </g>
        ))}
        {labels.map((l, i) => <text key={l} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="#64748b">{l}</text>)}
        {series.map((s) => {
          const pts = s.points.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
          const segs: string[] = [];
          let cur = "";
          for (const p of pts) {
            if (!p) { if (cur) segs.push(cur); cur = ""; continue; }
            cur += `${cur ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
          }
          if (cur) segs.push(cur);
          return (
            <g key={s.name}>
              {segs.map((d, i) => <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />)}
              {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={4} fill="#fff" stroke={s.color} strokeWidth={2.5} />)}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="mt-1 flex flex-wrap gap-4 text-sm text-slate-600">
          {series.map((s) => <span key={s.name} className="flex items-center gap-2"><span className="h-1 w-5 rounded" style={{ background: s.color }} />{s.name}</span>)}
        </figcaption>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th scope="col">Month</th>{series.map((s) => <th key={s.name} scope="col">{s.name}</th>)}</tr></thead>
        <tbody>{labels.map((l, i) => <tr key={l}><th scope="row">{l}</th>{series.map((s) => <td key={s.name}>{s.points[i] ?? "no data"}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}
