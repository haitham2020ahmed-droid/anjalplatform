/**
 * 📈 Small fluency charts (plain SVG, no client code, accessible tables). Same look as src/components/charts:
 *   WcpmChart  — official WCPM over time with the 50th percentile of each check's season (dashed line)
 *   TrialChart — repeated-reading trials: WCPM bars with the stretch goal of each trial
 *   ProsodyBars — the four prosody traits as small 1–4 bars
 */
const TRAITS = [["phrasing", "Phrasing"], ["smoothness", "Smoothness"], ["pace", "Pace"], ["intonation", "Expression"]] as const;
const HELP: Record<string, string> = { phrasing: "reading in word groups", smoothness: "few stops and restarts", pace: "like talking", intonation: "voice shows the meaning" };

export function WcpmChart({ points, title, height = 200 }: { points: { label: string; wcpm: number; p50: number | null }[]; title: string; height?: number }) {
  const W = 640, H = height, L = 40, R = 16, T = 14, B = 30;
  const max = Math.max(60, ...points.map((p) => Math.max(p.wcpm, p.p50 ?? 0))) * 1.12;
  const step = max > 160 ? 50 : 25;
  const x = (i: number) => L + (points.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + ((max - v) * (H - T - B)) / max;
  const line = (vals: (number | null)[]) => vals.map((v, i) => (v === null ? "" : `${i && vals[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join("");
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        {Array.from({ length: Math.floor(max / step) + 1 }, (_, k) => k * step).map((g) => (
          <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeWidth={1} /><text x={L - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="#64748b">{g}</text></g>
        ))}
        {points.map((p, i) => <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="#64748b">{p.label}</text>)}
        <path d={line(points.map((p) => p.p50))} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 5" />
        <path d={line(points.map((p) => p.wcpm))} fill="none" stroke="#0d9488" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <g key={i}><circle cx={x(i)} cy={y(p.wcpm)} r={4.5} fill="#fff" stroke="#0d9488" strokeWidth={2.5} /><text x={x(i)} y={y(p.wcpm) - 9} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0f172a">{p.wcpm}</text></g>)}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-sm text-slate-600">
        <span className="flex items-center gap-2"><span className="h-1 w-5 rounded bg-teal-600" />My words correct per minute</span>
        <span className="flex items-center gap-2"><span className="h-0 w-5 border-t-2 border-dashed border-amber-500" />50th percentile (middle of Grade readers)</span>
      </figcaption>
      <table className="sr-only"><caption>{title}</caption><thead><tr><th scope="col">Date</th><th scope="col">WCPM</th><th scope="col">50th percentile</th></tr></thead>
        <tbody>{points.map((p, i) => <tr key={i}><th scope="row">{p.label}</th><td>{p.wcpm}</td><td>{p.p50 ?? "—"}</td></tr>)}</tbody></table>
    </figure>
  );
}

export function TrialChart({ trials, nextGoal, title = "My readings of this passage" }: { trials: { trial: number; wcpm: number; goal: number | null }[]; nextGoal: number | null; title?: string }) {
  const all = [...trials.map((t) => ({ ...t, next: false })), ...(nextGoal !== null ? [{ trial: (trials[trials.length - 1]?.trial ?? 0) + 1, wcpm: 0, goal: nextGoal, next: true }] : [])];
  const max = Math.max(40, ...all.map((t) => Math.max(t.wcpm, t.goal ?? 0))) * 1.15;
  return (
    <figure>
      <div className="flex h-40 items-end gap-3" role="img" aria-label={title}>
        {all.map((t) => (
          <div key={t.trial} className="relative flex h-full flex-1 flex-col items-center justify-end">
            {t.goal !== null && <span className="absolute left-0 right-0 border-t-2 border-dashed border-amber-500" style={{ bottom: `${(100 * t.goal) / max}%` }} title={`Goal ${t.goal}`}><span className="absolute -top-4 right-0 text-[10px] font-bold text-amber-700">🎯{t.goal}</span></span>}
            {t.next ? <span className="mb-1 text-xs font-semibold text-slate-500">next</span>
              : <><span className="text-xs font-bold tabular-nums text-slate-800">{t.wcpm}</span><span className={`w-full rounded-t-lg ${t.goal !== null && t.wcpm >= t.goal ? "bg-emerald-500" : "bg-teal-500"}`} style={{ height: `${(100 * t.wcpm) / max}%` }} /></>}
            <span className="mt-1 text-[11px] text-slate-500">#{t.trial}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-slate-500">Bars: words correct per minute in each reading · 🎯 dashed line: the stretch goal (about 10% more, up to the 50th percentile).</figcaption>
      <table className="sr-only"><caption>{title}</caption><tbody>{trials.map((t) => <tr key={t.trial}><th scope="row">Reading {t.trial}</th><td>{t.wcpm} WCPM</td><td>{t.goal ?? ""}</td></tr>)}</tbody></table>
    </figure>
  );
}

export function ProsodyBars({ scores, reasons, dark = false }: { scores: Partial<Record<string, number | null>>; reasons?: Record<string, string>; dark?: boolean }) {
  return (
    <ul className="space-y-2">
      {TRAITS.map(([k, label]) => { const v = scores[k] ?? null; return (
        <li key={k} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
          <span className={dark ? "text-white/80" : "text-slate-700"} title={HELP[k]}>{label}</span>
          <span className="flex gap-1" aria-hidden="true">{[1, 2, 3, 4].map((n) => <span key={n} className={`h-3 flex-1 rounded-full ${v !== null && n <= v ? (v >= 3 ? "bg-emerald-400" : v === 2 ? "bg-amber-400" : "bg-rose-400") : dark ? "bg-white/15" : "bg-slate-200"}`} />)}</span>
          <span className={`text-right font-bold tabular-nums ${dark ? "text-white" : "text-slate-800"}`}>{v ?? "—"}<span className="text-xs font-normal opacity-60">/4</span></span>
          {reasons?.[k] && <span className={`col-span-3 -mt-1 text-xs ${dark ? "text-white/70" : "text-slate-500"}`}>{reasons[k]}</span>}
        </li>); })}
    </ul>
  );
}
