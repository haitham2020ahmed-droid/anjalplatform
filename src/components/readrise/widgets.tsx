/**
 * 🚀 ReadRise display pieces (server-safe, no client JS): the level badge, the weekly-goal ring and the growth chart.
 * "ReadRise Level" is an ESTIMATE on a Lexile-like scale — never called a Lexile here.
 */
export function LevelBadge({ level, size = "md" }: { level: number; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "px-4 py-2 text-3xl" : size === "sm" ? "px-2 py-0.5 text-sm" : "px-3 py-1 text-xl";
  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-xl bg-brand-navy font-bold text-white ${cls}`} title="ReadRise Level (an estimate on a Lexile-like scale)">
      <span>{level}</span>
      <span className="text-[0.55em] font-semibold uppercase tracking-wide text-teal-100">RR</span>
    </span>
  );
}

/** A ring that fills as the week's qualifying readings reach the goal. */
export function GoalRing({ done, goal, size = 92 }: { done: number; goal: number; size?: number }) {
  const r = 38, c = 2 * Math.PI * r, frac = goal > 0 ? Math.min(1, done / goal) : 0;
  const met = done >= goal;
  return (
    <figure className="flex items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 92 92" role="img" aria-label={`Weekly goal: ${done} of ${goal} articles at 75% or more`}>
        <circle cx="46" cy="46" r={r} fill="none" stroke="#e2e8f0" strokeWidth="9" />
        <circle cx="46" cy="46" r={r} fill="none" stroke={met ? "#059669" : "#1fa3a3"} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 46 46)" />
        <text x="46" y="44" textAnchor="middle" className="fill-slate-900" fontSize="20" fontWeight="700">{done}/{goal}</text>
        <text x="46" y="61" textAnchor="middle" className="fill-slate-500" fontSize="10">this week</text>
      </svg>
      <figcaption className="text-sm text-slate-700">
        <span className="block font-semibold text-brand-navy">{met ? "✓ Goal met!" : `${Math.max(0, goal - done)} more to go`}</span>
        Articles at 75%+ on the first try
      </figcaption>
    </figure>
  );
}

export interface GrowthPoint { at: string; level: number }

/**
 * The student's own ReadRise Level over time (a step line: the level holds until it changes), with the projected
 * end-of-year level as a dashed segment. One series → no legend; native tooltips on each point; a table for screen readers.
 */
export function GrowthChart({ points, projected, yearEnd }: { points: GrowthPoint[]; projected: number | null; yearEnd: string | null }) {
  if (!points.length) return <p className="text-sm text-slate-600">Your growth chart starts after your first articles.</p>;
  const now = Date.now();
  const pts = points.map((p) => ({ t: new Date(p.at).getTime(), level: p.level }));
  const lastT = Math.max(now, pts[pts.length - 1].t);
  const endT = projected !== null && yearEnd ? new Date(yearEnd).getTime() : lastT;
  const t0 = pts[0].t, t1 = Math.max(endT, t0 + 86_400_000);
  const levels = [...pts.map((p) => p.level), ...(projected !== null ? [projected] : [])];
  const lo = Math.floor((Math.min(...levels) - 50) / 100) * 100, hi = Math.ceil((Math.max(...levels) + 50) / 100) * 100;
  const W = 560, H = 200, L = 44, R = 12, T = 12, B = 26;
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - B);
  let d = `M${x(pts[0].t)},${y(pts[0].level)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].t)} V${y(pts[i].level)}`;
  d += ` H${x(lastT)}`;
  const ticks: number[] = [];
  const step = hi - lo > 600 ? 200 : 100;
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const fmt = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const last = pts[pts.length - 1];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`ReadRise Level from ${pts[0].level} to ${last.level}${projected !== null ? `, projected ${projected} by the end of the year` : ""}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" className="fill-slate-500">{v}</text>
          </g>
        ))}
        <text x={L} y={H - 6} fontSize="11" className="fill-slate-500">{fmt(t0)}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="11" className="fill-slate-500">{fmt(t1)}</text>
        {projected !== null && <line x1={x(lastT)} y1={y(last.level)} x2={x(endT)} y2={y(projected)} stroke="#5b3fa0" strokeWidth="2" strokeDasharray="5 4" />}
        <path d={d} fill="none" stroke="#1fa3a3" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.level)} r="5" fill="#1fa3a3" stroke="#fff" strokeWidth="2">
            <title>{`${fmt(p.t)}: ${p.level}`}</title>
          </circle>
        ))}
        {projected !== null && (
          <g>
            <circle cx={x(endT)} cy={y(projected)} r="5" fill="#fff" stroke="#5b3fa0" strokeWidth="2"><title>{`Projected (estimate): ${projected}`}</title></circle>
            <text x={x(endT) - 8} y={y(projected) - 9} textAnchor="end" fontSize="11" className="fill-slate-700">{`Projected ${projected} (estimate)`}</text>
          </g>
        )}
        <text x={x(lastT) + 4} y={y(last.level) - 8} fontSize="12" fontWeight="700" className="fill-slate-900">{last.level}</text>
      </svg>
      <table className="sr-only">
        <caption>ReadRise Level over time</caption>
        <thead><tr><th>Date</th><th>Level</th></tr></thead>
        <tbody>{pts.map((p, i) => <tr key={i}><td>{fmt(p.t)}</td><td>{p.level}</td></tr>)}{projected !== null && <tr><td>End of year (projected estimate)</td><td>{projected}</td></tr>}</tbody>
      </table>
    </figure>
  );
}
