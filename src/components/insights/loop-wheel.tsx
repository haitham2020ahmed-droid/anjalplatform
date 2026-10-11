import type { Stage } from "@/server/insights/learning-loop";

const COLOR = { GOOD: "#10b981", WARN: "#f59e0b", TODO: "#ef4444" } as const;

/** 🔄 The six stages on a wheel, each coloured by how far the class is, with the loop's overall score inside. */
export function LoopWheel({ stages, score, counts }: { stages: Stage[]; score: number; counts: Record<string, number> }) {
  const C = 170, R = 128;
  const pos = (i: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / stages.length; return { x: C + R * Math.cos(a), y: C + R * Math.sin(a), a }; };
  return (
    <svg viewBox="0 0 340 340" className="mx-auto w-full max-w-sm" role="img" aria-label={`Learning loop: ${stages.map((s) => `${s.title} ${s.score}%`).join(", ")}`}>
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" /></marker></defs>
      <circle cx={C} cy={C} r={R} fill="none" stroke="#e2e8f0" strokeWidth="18" />
      {stages.map((st, i) => {
        const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / stages.length + 0.32, a1 = a0 + (2 * Math.PI) / stages.length - 0.64;
        return <path key={`arc${st.key}`} d={`M ${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)}`} fill="none" stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrow)" />;
      })}
      {stages.map((st, i) => {
        const p = pos(i);
        return (
          <g key={st.key}>
            <circle cx={p.x} cy={p.y} r="34" fill="white" stroke={COLOR[st.health]} strokeWidth="5" />
            <text x={p.x} y={p.y - 6} textAnchor="middle" fontSize="16">{st.icon}</text>
            <text x={p.x} y={p.y + 10} textAnchor="middle" fontSize="9" fontWeight="700" fill="#1f3a68">{st.title}</text>
            <text x={p.x} y={p.y + 22} textAnchor="middle" fontSize="9" fill="#475569">{st.score}% · {counts[st.key] ?? 0}</text>
          </g>
        );
      })}
      <circle cx={C} cy={C} r="62" fill="#1f3a68" />
      <text x={C} y={C - 8} textAnchor="middle" fontSize="30" fontWeight="800" fill="white">{score}%</text>
      <text x={C} y={C + 12} textAnchor="middle" fontSize="9" fill="#99f6e4">LOOP HEALTH</text>
      <text x={C} y={C + 26} textAnchor="middle" fontSize="8" fill="#cbd5e1">students at each step</text>
    </svg>
  );
}
