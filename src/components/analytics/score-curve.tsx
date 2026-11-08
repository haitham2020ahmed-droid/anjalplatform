/**
 * 📈 The mastery % after every answer (Questions Log, IXL's SmartScore chart): one line over the answers, each
 * session in its own shade, a dashed line at 80 (the ⭐ target band). Server-rendered SVG, no script.
 */
type T = (s: string, v?: Record<string, string | number>) => string;
const plain: T = (s, v) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v && k in v ? String(v[k]) : m));
const SHADES = ["#14b8a6", "#1f3a68", "#8b5cf6", "#f59e0b", "#22c55e", "#3b82f6"];

export function ScoreCurve({ points, t = plain }: { points: { n: number; score: number; session: number }[]; t?: T }) {
  if (points.length < 2) return <p className="text-sm text-slate-500">{t("The curve shows after a few answers.")}</p>;
  const W = 640, H = 180, L = 30, R = 10, Tp = 10, B = 24;
  const n0 = points[0].n, n1 = points[points.length - 1].n, span = Math.max(1, n1 - n0);
  const x = (n: number) => L + ((n - n0) / span) * (W - L - R);
  const y = (v: number) => Tp + (1 - v / 100) * (H - Tp - B);
  const sessions = [...new Set(points.map((p) => p.session))];
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[320px]" role="img" aria-label={t("Mastery after each answer")} data-score-curve={points.length}>
        {[0, 50, 80, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 80 ? "#f59e0b" : "#e2e8f0"} strokeDasharray={v === 80 ? "4 3" : undefined} />
            <text x={L - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#64748b">{v}</text>
          </g>
        ))}
        {sessions.map((si, k) => {
          const pts = points.filter((p) => p.session === si);
          const color = SHADES[k % SHADES.length];
          return (
            <g key={si}>
              <polyline fill="none" stroke={color} strokeWidth="2" points={pts.map((p) => `${x(p.n)},${y(p.score)}`).join(" ")} />
              {pts.map((p) => <circle key={p.n} cx={x(p.n)} cy={y(p.score)} r="2.5" fill={color}><title>{t("Answer {n}: {score}%", { n: p.n, score: p.score })}</title></circle>)}
            </g>
          );
        })}
        <text x={L} y={H - 6} fontSize="9" fill="#64748b">{t("Answer {n}", { n: n0 })}</text>
        <text x={W - R} y={H - 6} fontSize="9" textAnchor="end" fill="#64748b">{t("Answer {n}", { n: n1 })}</text>
      </svg>
      <p className="mt-1 text-xs text-slate-600">{t("Each colour is one session. The dashed line is 80%.")}</p>
    </div>
  );
}
