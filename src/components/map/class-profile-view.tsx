import { NameList } from "@/components/name-list";
import Link from "next/link";
import type { ClassProfile } from "@/server/map/nwea-reports";
import { DESCRIPTOR_NAME, GROWTH_MIN_N, QUINTILES, SUBJECT_NAME } from "@/server/map/nwea-reports";
import { QuadrantChart, QuintileBars, Q_COLORS } from "./nwea-charts";

const sign = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v}`);
const DESC_BG: Record<string, string> = { Low: "bg-red-100 text-red-900", LoAvg: "bg-orange-100 text-orange-900", Avg: "bg-yellow-100 text-yellow-900", HiAvg: "bg-green-100 text-green-900", High: "bg-blue-100 text-blue-900" };

/** 👥 Class Profile (NWEA style), one printable document. */
export function ClassProfileView({ d }: { d: ClassProfile }) {
  const card = "rounded-2xl bg-white p-5 ring-1 ring-slate-200 break-inside-avoid";
  const diff = d.meanRit !== null && d.national !== null ? Math.round((d.meanRit - d.national) * 10) / 10 : null;
  const quad = d.students.filter((x) => x.test.percentile !== null && x.test.cgp !== null).map((x) => ({ name: x.name, ach: x.test.percentile!, growth: x.test.cgp! }));
  return (
    <div className="space-y-5">
      <header className="rounded-3xl bg-gradient-to-br from-brand-navy to-indigo-800 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">MAP Growth · Class Profile · {SUBJECT_NAME[d.subject]}</p>
        <h1 className="mt-1 text-3xl font-extrabold">{d.className} <span className="text-lg font-semibold text-white/70">Grade {d.grade} · {d.term || "no term"}</span></h1>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[["Tested", `${d.n}`, d.notTested.length ? `${d.notTested.length} not tested` : "everyone"], ["Mean RIT", d.meanRit !== null ? String(d.meanRit) : "—", `median ${d.medianRit ?? "—"}`], ["National mean", d.national !== null ? `${d.national}${d.nationalExact ? "" : " ≈"}` : "—", diff !== null ? `class ${sign(diff)} RIT` : ""], ["Median percentile", d.medianPct !== null ? String(d.medianPct) : "—", "achievement"], ["Flagged tests", String(d.flagged), "retest to consider"]].map(([k, v, sub]) => (
            <div key={k} className="rounded-2xl bg-white/10 p-3"><p className="text-[11px] uppercase tracking-wide text-white/70">{k}</p><p className="text-2xl font-extrabold tabular-nums">{v}</p><p className="text-xs text-white/70">{sub}</p></div>
          ))}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2 print:grid-cols-2">
        <section className={card}><h2 className="mb-3 font-bold text-brand-navy">📊 Achievement percentile distribution</h2><QuintileBars counts={d.quintiles} labels={QUINTILES} /></section>
        <section className={card}>
          <h2 className="font-bold text-brand-navy">🌍 Class vs national</h2>
          {d.meanRit !== null && d.national !== null ? (
            <div className="mt-4 space-y-3">
              {[["Class mean", d.meanRit, "bg-brand-navy"], [`National mean (Grade ${d.grade})`, d.national, "bg-slate-400"]].map(([l, v, c]) => (
                <div key={String(l)}><div className="flex justify-between text-sm"><span>{l}</span><b className="tabular-nums">{v}</b></div><div className="mt-1 h-3 rounded-full bg-slate-100"><div className={`h-3 rounded-full ${c}`} style={{ width: `${Math.max(5, Math.min(100, ((Number(v) - 150) / 100) * 100))}%` }} /></div></div>
              ))}
              <p className="text-sm text-slate-600">The class is <b>{Math.abs(diff!)} RIT {diff! >= 0 ? "above" : "below"}</b> the national mean for this grade and season.</p>
            </div>
          ) : <p className="mt-2 text-sm text-slate-500">No national value for this grade.</p>}
        </section>
      </div>

      {d.areas.length > 0 && (
        <section className={card}>
          <h2 className="font-bold text-brand-navy">🧩 Instructional areas · how many students in each band</h2>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-1.5">Area</th><th>Mean RIT</th>{["Low", "LoAvg", "Avg", "HiAvg", "High"].map((x, i) => <th key={x} className="text-center"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: Q_COLORS[i] }} /> {DESCRIPTOR_NAME[x]}</th>)}</tr></thead>
            <tbody>{d.areas.map((a) => <tr key={a.name} className="border-b last:border-0"><td className="py-1.5 font-medium">{a.name}</td><td className="tabular-nums">{a.mean ?? "—"}</td>{a.quintiles.map((c, i) => <td key={i} className="text-center tabular-nums">{c || ""}</td>)}</tr>)}</tbody>
          </table>
        </section>
      )}

      <section className={card}>
        <h2 className="font-bold text-brand-navy">🧑‍🎓 Students · test details</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-1.5 pe-2">Student</th><th>RIT ±</th><th>%ile</th>{d.areaNames.map((a) => <th key={a} className="px-1">{a}</th>)}<th>Growth</th><th>CGP</th><th>Goal</th><th>Min</th><th>Rapid</th><th>Projected</th><th /></tr></thead>
            <tbody>{d.students.map((x) => (
              <tr key={x.id} className={`border-b last:border-0 ${x.test.flags.length ? "bg-red-50/60" : ""}`}>
                <td className="py-1.5 pe-2 font-medium"><Link href={`/map-report/profile/${x.id}`} className="hover:underline"><bdi>{x.name}</bdi></Link></td>
                <td className="tabular-nums">{x.test.rit}{x.test.se !== null ? <span className="text-xs text-slate-400"> ±{Math.round(x.test.se)}</span> : ""}</td>
                <td className="tabular-nums">{x.test.percentile ?? "—"}</td>
                {d.areaNames.map((a) => { const v = x.areas[a]; return <td key={a} className="px-1">{v ? <span className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${DESC_BG[v.descriptor ?? ""] ?? "bg-slate-100"}`}>{v.rit}{v.descriptor ? ` ${v.descriptor}` : ""}</span> : "—"}</td>; })}
                <td className="tabular-nums">{sign(x.test.growth)}{x.test.met !== null ? (x.test.met ? " ✅" : " ✖") : ""}</td>
                <td className="tabular-nums">{x.test.cgp ?? "—"}</td>
                <td className="tabular-nums">{x.test.projectedSpring ?? "—"}</td>
                <td className="tabular-nums">{x.test.minutes ?? "—"}</td>
                <td className={`tabular-nums ${x.test.rapid !== null && x.test.rapid >= 30 ? "font-bold text-red-700" : ""}`}>{x.test.rapid !== null ? `${x.test.rapid}%` : "—"}</td>
                <td className="text-xs">{x.projected ?? "—"}</td>
                <td className="text-xs text-red-700">{x.test.flags.length ? "⚠️ retest?" : ""}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {d.notTested.length > 0 && <p className="mt-2 text-sm text-slate-500">Not tested in {d.term}: <NameList items={d.notTested} sep=", " /></p>}
        <p className="mt-2 text-xs text-slate-400">Flags: rapid guessing 30%+, a test under 15 minutes, or a drop larger than twice the error — NWEA suggests checking these scores and maybe a retest.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2 print:grid-cols-2">
        <section className={card}>
          <h2 className="font-bold text-brand-navy">🌱 Growth summary</h2>
          {d.growth.n === 0 ? <p className="mt-2 text-sm text-slate-500">Growth appears once there are two terms (e.g. Fall → Winter) or the NWEA data file includes it.</p> : (
            <>
              <table className="mt-3 w-full text-sm"><tbody>
                {[["Students with growth", String(d.growth.n)], ["Mean observed growth", sign(d.growth.meanObserved)], ["Mean projected growth", sign(d.growth.meanProjected)], ["Met projected growth", d.growth.pctMet !== null ? `${d.growth.pctMet}%` : "—"], ["Median growth percentile", d.growth.medianCgp !== null ? String(d.growth.medianCgp) : "—"]].map(([k, v]) => <tr key={k} className="border-b last:border-0"><td className="py-1.5 text-slate-600">{k}</td><td className="text-right font-bold tabular-nums">{v}</td></tr>)}
              </tbody></table>
              {!d.growth.enough && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Fewer than {GROWTH_MIN_N} students: NWEA advises reading group growth with care.</p>}
            </>
          )}
          {d.proficiency.length > 0 && (
            <>
              <h3 className="mt-4 font-bold text-brand-navy">🎯 Projected proficiency</h3>
              <ul className="mt-1 space-y-1 text-sm">{d.proficiency.map((p) => <li key={p.level} className="flex justify-between"><span>{p.level}</span><b className="tabular-nums">{p.count}</b></li>)}</ul>
            </>
          )}
        </section>
        <section className={card}>
          <h2 className="font-bold text-brand-navy">⊞ Achievement × growth</h2>
          {quad.length ? <QuadrantChart points={quad} /> : <p className="mt-2 text-sm text-slate-500">Needs growth percentiles (two terms or the NWEA data file).</p>}
        </section>
      </div>
    </div>
  );
}
