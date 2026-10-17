/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { BySourceReport, Trend } from "../../server/skills/skills-by-source";

const ARROW: Record<Trend, string> = { UP: "↑", DOWN: "↓", FLAT: "→" };
const ARROW_LABEL: Record<Trend, string> = { UP: "improving", DOWN: "declining", FLAT: "stable" };
const ARROW_TONE: Record<Trend, string> = { UP: "text-emerald-700", DOWN: "text-red-700", FLAT: "text-slate-500" };
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

/**
 * ⭐ Skills by source: each source's star/mastery table (existing shape), a progress-direction
 * table of simple arrows underneath it (↑ improving / → stable / ↓ declining, from the same
 * paired skill growth the class/student growth reports use), and a cross-source summary.
 */
export function BySourceView({ r }: { r: BySourceReport }) {
  return (
    <section className="space-y-5" aria-labelledby="by-source-h">
      <h2 id="by-source-h" className="text-xl font-extrabold text-brand-navy">⭐ Skills by source</h2>
      {r.groups.length === 0 && <p className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">No practised skills yet.</p>}
      {r.groups.map((g) => (
        <div key={g.source} className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 print:break-inside-avoid">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-brand-navy">{g.label}</h3>
            <span className="text-sm font-semibold text-amber-600" aria-label={`${g.stars} of 5 stars`}>
              {g.avgMastery !== null ? <>{stars(g.stars)} <span className="text-slate-600">avg mastery {g.avgMastery}</span></> : <span className="text-slate-500">No data yet</span>}
            </span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2">Skill</th><th className="pe-2">Mastery</th><th className="pe-2">Band</th><th className="pe-2">Attempts</th><th>Accuracy</th></tr></thead>
              <tbody>
                {g.skills.map((k) => (
                  <tr key={k.skillId} className="border-b last:border-0">
                    <td className="py-1 pe-2">{k.name}</td>
                    <td className="pe-2 tabular-nums text-amber-600" title={`${k.score}/100`}>{stars(k.stars)} <span className="text-slate-600">{k.score}</span></td>
                    <td className="pe-2 text-slate-600">{k.band}</td>
                    <td className="pe-2 tabular-nums">{k.attempts}</td>
                    <td className="tabular-nums">{k.accuracyPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4 className="mt-4 text-sm font-bold text-brand-navy">📈 Progress direction</h4>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2">Skill</th><th className="pe-2">Trend</th><th>Change</th></tr></thead>
              <tbody>
                {g.skills.map((k) => (
                  <tr key={k.skillId} className="border-b last:border-0">
                    <td className="py-1 pe-2">{k.name}</td>
                    <td className={`pe-2 text-lg font-bold ${k.trend ? ARROW_TONE[k.trend] : "text-slate-400"}`} title={k.trend ? ARROW_LABEL[k.trend] : "not enough data yet"}>
                      {k.trend ? ARROW[k.trend] : "—"}
                    </td>
                    <td className="tabular-nums text-slate-600">{k.trendValue !== null ? `${k.trendValue >= 0 ? "+" : ""}${k.trendValue}` : "not enough data yet"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 print:break-inside-avoid">
        <h3 className="text-lg font-bold text-brand-navy">Cross-source summary</h3>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["Skills", r.summary.totalSkills], ["Avg mastery", r.summary.avgMastery ?? "—"], ["Mastered", r.summary.mastered], ["Needs support", r.summary.needsSupport],
            ["↑ Improving", r.summary.up], ["↓ Declining", r.summary.down], ["→ Stable", r.summary.flat],
          ] as const).map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{l}</dt><dd className="text-xl font-extrabold text-brand-navy">{v}</dd></div>
          ))}
        </dl>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2">Source</th><th className="pe-2">Avg mastery</th><th className="pe-2">Mastered</th><th className="pe-2">Developing</th><th>Needs support</th></tr></thead>
            <tbody>
              {r.groups.map((g) => (
                <tr key={g.source} className="border-b last:border-0">
                  <td className="py-1 pe-2">{g.label}</td><td className="pe-2 tabular-nums">{g.avgMastery ?? "—"}</td>
                  <td className="pe-2 tabular-nums">{g.mastered}</td><td className="pe-2 tabular-nums">{g.developing}</td><td className="tabular-nums">{g.needsSupport}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
