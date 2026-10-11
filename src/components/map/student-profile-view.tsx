import Link from "next/link";
import type { StudentProfile, TestResult } from "@/server/map/nwea-reports";
import { DESCRIPTOR_NAME } from "@/server/map/nwea-reports";
import { ReportHead, ReportPage, PercentileBar } from "./report-ui";
import { AreaRanges, BandLegend, GrowthBandsChart } from "./nwea-charts";

function Tile({ label, value, sub, tone = "text-brand-navy" }: { label: string; value: string; sub?: string; tone?: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={`text-xl font-extrabold tabular-nums ${tone}`}>{value}</p>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div>;
}
const sign = (v: number) => `${v >= 0 ? "+" : ""}${v}`;

function Tiles({ t, projected }: { t: TestResult; projected: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
      <Tile label="RIT (± error)" value={`${t.rit}${t.se !== null ? ` ±${Math.round(t.se)}` : ""}`} sub={t.ritLow !== null ? `range ${t.ritLow}–${t.ritHigh}` : t.date} />
      <Tile label="Achievement percentile" value={t.percentile !== null ? String(t.percentile) : "—"} sub={t.descriptor ? DESCRIPTOR_NAME[t.descriptor] : undefined} />
      <Tile label="Growth" value={t.growth !== null ? `${sign(t.growth)} RIT` : "—"} sub={t.projectedGrowth !== null ? `projected ${sign(t.projectedGrowth)}${t.met !== null ? ` · ${t.met ? "met ✅" : "not met"}` : ""}` : undefined} tone={t.met === false ? "text-amber-700" : "text-brand-navy"} />
      <Tile label="Growth percentile · CGI" value={t.cgp !== null ? String(t.cgp) : "—"} sub={t.cgi !== null ? `CGI ${t.cgi.toFixed(2)}` : "conditional growth"} />
      <Tile label="Spring goal" value={t.projectedSpring !== null ? String(t.projectedSpring) : "—"} sub={t.typicalGrowth !== null ? `typical growth ${sign(t.typicalGrowth)}` : undefined} />
      <Tile label="Lexile" value={t.lexile !== null ? `${t.lexile}L` : "—"} sub={t.lexileLow !== null ? `range ${t.lexileLow}L–${t.lexileHigh}L` : undefined} />
      <Tile label="Test" value={t.minutes !== null ? `${t.minutes} min` : "—"} sub={t.rapid !== null ? `rapid guessing ${t.rapid}%` : undefined} tone={t.flags.length ? "text-red-700" : "text-brand-navy"} />
      <Tile label="Projected proficiency" value={projected ?? "—"} />
    </div>
  );
}

/** 🧑‍🎓 Student Profile: one page per subject. */
export function StudentProfileView({ d }: { d: StudentProfile }) {
  if (!d.subjects.length) return <ReportPage first><ReportHead s={d.student} title="MAP Growth · Student Profile" term={null} /><div className="mt-6 space-y-2 text-slate-700"><p className="font-semibold">No MAP Growth results for this student yet.</p><p className="text-sm text-slate-600">This is usual for a new student or one who missed the test window. Until a MAP result is entered (MAP Data → upload or manual entry), the platform starts the student at the grade's typical level and uses their own work: the Diagnostic, the Weekly Checks and practice. See the student's Level Story for the evidence the platform has.</p><p className="text-sm print:hidden"><a href={`/teacher/level-story/${d.student.id}`} className="font-semibold text-brand-teal underline">Open the Level Story →</a></p></div></ReportPage>;
  return (
    <>
      {d.subjects.map((x, i) => (
        <ReportPage key={x.subject} first={i === 0}>
          <ReportHead s={d.student} title={`MAP Growth · Student Profile · ${x.name}`} term={x.latest.term} />
          {x.latest.flags.length > 0 && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">⚠️ {x.latest.flags.join(" · ")}</p>}
          <div className="mt-4"><Tiles t={x.latest} projected={x.projected} /></div>
          <div className="mt-5 grid gap-5 md:grid-cols-5 print:grid-cols-5">
            <section className="md:col-span-3 print:col-span-3">
              <h3 className="font-bold text-brand-navy">📈 Growth over time · national percentile bands</h3>
              <GrowthBandsChart points={x.history} title={`${x.name} RIT history`} />
              <BandLegend />
              {x.history.some((p) => !p.exact) && <p className="mt-1 text-[11px] text-slate-400">Some national values are estimated from the NWEA norms.</p>}
            </section>
            <section className="md:col-span-2 print:col-span-2">
              <h3 className="font-bold text-brand-navy">🎯 Achievement</h3>
              {x.latest.percentile !== null && <PercentileBar pct={x.latest.percentile} label={`${x.latest.percentile}th`} />}
              <h3 className="mt-3 font-bold text-brand-navy">🧩 Instructional areas</h3>
              <AreaRanges areas={x.areas} overall={x.latest.rit} />
            </section>
          </div>
          {x.areas.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-1.5">Instructional area</th><th>RIT</th><th>Range</th><th>Descriptor</th><th>Compared to overall</th></tr></thead>
              <tbody>{x.areas.map((a) => (
                <tr key={a.name} className="border-b last:border-0">
                  <td className="py-1.5 font-medium">{a.name}</td><td className="tabular-nums">{a.rit}</td><td className="tabular-nums text-slate-500">{a.low}–{a.high}</td><td>{a.descriptor ? DESCRIPTOR_NAME[a.descriptor] ?? a.descriptor : "—"}</td>
                  <td>{a.relative === "STRENGTH" ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">Relative strength</span> : a.relative === "FOCUS" ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">Suggested area of focus</span> : <span className="text-xs text-slate-400">within the error range</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          <section className="mt-4 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
            <h3 className="font-bold text-sky-950">🛠️ Action plan</h3>
            <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-slate-800">{x.plan.map((p, k) => <li key={k}>{p}</li>)}</ul>
            <p className="mt-2 text-sm print:hidden"><Link href={`/map-report/study-plan/${d.student.id}?subject=${x.subject}`} className="font-semibold text-brand-teal underline">📘 Learning Continuum: Reinforce · Develop · Introduce, with skills to assign →</Link></p>
          </section>
        </ReportPage>
      ))}
    </>
  );
}
