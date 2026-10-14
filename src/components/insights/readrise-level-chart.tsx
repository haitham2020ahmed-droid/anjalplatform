import type { TFn } from "@/i18n";

/**
 * 🚀 The student's ReadRise level over time (the student file): placement, then every change, as a step line.
 * Always called "ReadRise level" (never Lexile). Pure SVG, no script; prints.
 */
export function ReadRiseLevelChart({ t, history }: { t: TFn; history: { at: string; level: number }[] }) {
  const pts = history.filter((h) => Number.isFinite(h.level)).map((h) => ({ x: new Date(h.at).getTime(), y: h.level }));
  if (!pts.length) return null;
  const now = Date.now();
  const all = [...pts, { x: Math.max(now, pts[pts.length - 1].x), y: pts[pts.length - 1].y }];
  const W = 560, H = 160, L = 44, R = 12, T = 12, B = 24;
  const minX = all[0].x, maxX = Math.max(minX + 1, all[all.length - 1].x);
  const lo = Math.min(...all.map((p) => p.y)), hi = Math.max(...all.map((p) => p.y));
  const pad = Math.max(25, (hi - lo) * 0.15), y0 = lo - pad, y1 = hi + pad;
  const x = (v: number) => L + ((v - minX) * (W - L - R)) / (maxX - minX);
  const y = (v: number) => T + ((y1 - v) * (H - T - B)) / (y1 - y0);
  let d = `M${x(all[0].x)},${y(all[0].y)}`;
  for (let i = 1; i < all.length; i++) d += ` H${x(all[i].x)} V${y(all[i].y)}`;
  const day = (v: number) => new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const first = pts[0].y, last = pts[pts.length - 1].y, change = last - first;
  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("ReadRise level over time")}>
        {[lo, hi].map((v, i) => <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{Math.round(v)}</text></g>)}
        <path d={d} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={x(p.x)} cy={y(p.y)} r="4" fill="#0f766e" />)}
        <text x={L} y={H - 6} fontSize="11" fill="#64748b">{day(minX)}</text>
        <text x={W - R} y={H - 6} fontSize="11" fill="#64748b" textAnchor="end">{day(maxX)}</text>
      </svg>
      <figcaption className="text-sm text-slate-600">
        {t("ReadRise level")}: <b className="tabular-nums" dir="ltr">{first}</b> → <b className="tabular-nums" dir="ltr">{last}</b>{" "}
        <span className={change > 0 ? "text-emerald-700" : change < 0 ? "text-rose-700" : "text-slate-500"} dir="ltr">({change > 0 ? "+" : ""}{change})</span>
      </figcaption>
    </figure>
  );
}
