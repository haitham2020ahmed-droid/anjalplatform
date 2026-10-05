/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ClassComparison, StandardRow } from "../../server/analytics/reports";
import { BarList } from "../charts/bar-chart";
import { LineChart } from "../charts/line-chart";

const PERIODS: [string, string][] = [["LAST_7_DAYS", "Last 7 days"], ["LAST_30_DAYS", "Last 30 days"], ["TERM", "This term"], ["SEMESTER", "Semester"], ["SCHOOL_YEAR", "School year"]];
const v = (x: number | null, suffix = "") => (x === null ? "–" : `${x}${suffix}`);

export function ClassAnalyticsView({ className, classHref, period, periodKey, c, standards, notAssessed }: {
  className: string; classHref: string; period: string; periodKey: string; c: ClassComparison; standards: StandardRow[]; notAssessed: number;
}) {
  const g = c.classGrowth;
  return (
    <div>
      <a href={classHref} className="text-sm font-medium text-brand-teal hover:underline">Back to class</a>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-navy">Class {className}: progress and growth</h1>
      <nav aria-label="Reporting period" className="mt-4 flex flex-wrap gap-2">
        {PERIODS.map(([k, l]) => (
          <a key={k} href={`?period=${k}`} aria-current={k === periodKey ? "page" : undefined}
            className={["rounded-lg px-3 py-1.5 text-sm font-medium", k === periodKey ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"].join(" ")}>{l}</a>
        ))}
      </nav>
      <p className="mt-2 text-sm text-slate-500">Showing {period}. All scores are this platform&apos;s own measures, not MAP or other official scores.</p>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Average mastery by month</h2>
          <LineChart title="Class average mastery by month" labels={g.series.map((p) => p.label)} series={[{ name: "Class average", color: "#1fa3a3", points: g.series.map((p) => p.mastery) }]} />
        </div>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Growth this period</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4">
            <div><dt className="text-sm text-slate-500">Average growth</dt><dd className="text-3xl font-bold tabular-nums text-brand-navy">{g.meanGrowth === null ? "–" : `${g.meanGrowth > 0 ? "+" : ""}${g.meanGrowth}`}</dd></div>
            <div><dt className="text-sm text-slate-500">Median growth</dt><dd className="text-3xl font-bold tabular-nums text-brand-navy">{g.medianGrowth === null ? "–" : `${g.medianGrowth > 0 ? "+" : ""}${g.medianGrowth}`}</dd></div>
            <div className="col-span-2"><dt className="text-sm text-slate-500">Students with practice data</dt><dd className="tabular-nums text-slate-800">{g.withData} of {g.students}</dd></div>
          </dl>
          <h3 className="mt-5 font-semibold text-brand-navy">Spread of mastery</h3>
          <div className="mt-2"><BarList items={c.distribution.map((d) => ({ label: d.label, value: d.count }))} /></div>
          <p className="mt-2 text-sm text-slate-500">Median {v(c.masterySummary.median)}, middle half {v(c.masterySummary.p25)}–{v(c.masterySummary.p75)}</p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">How the class compares</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500"><tr>{["Group", "Students with data", "Average mastery", "Accuracy", "Average growth"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.label} className="border-t border-slate-100">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-brand-navy">{r.label}</th>
                  <td className="px-3 py-2 tabular-nums">{r.studentsWithData}</td>
                  {r.suppressed ? <td colSpan={3} className="px-3 py-2 text-slate-500">Hidden: fewer than 5 students have data (protects privacy)</td> : (
                    <><td className="px-3 py-2 tabular-nums">{v(r.avgMastery)}</td><td className="px-3 py-2 tabular-nums">{v(r.accuracyPct, "%")}</td><td className="px-3 py-2 tabular-nums">{r.meanGrowth === null ? "–" : `${r.meanGrowth > 0 ? "+" : ""}${r.meanGrowth}`}</td></>
                  )}
                </tr>
              ))}
              {c.external.map((e) => (
                <tr key={e.scope} className="border-t border-slate-100">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-brand-navy">{e.scope === "NATIONAL" ? "National" : "District"}</th>
                  <td colSpan={4} className="px-3 py-2 text-slate-600">{e.available ? `${e.value} (${e.metric === "ACCURACY_PCT" ? "accuracy" : "average mastery"}), source: ${e.source}` : e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Skill growth</h2>
          <p className="text-sm text-slate-500">Each skill compared with its own starting point, averaged over the students who practised it.</p>
          <div className="mt-3"><BarList items={g.skills.slice(0, 8).map((s) => ({ label: s.name, value: Math.max(0, s.meanGrowth) }))} suffix=" pts" /></div>
          {g.skills.length === 0 && <p className="mt-2 text-slate-600">Growth appears after students practise a skill at least twice.</p>}
        </section>
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Standards</h2>
          <p className="text-sm text-slate-500">Accuracy by Common Core standard, lowest first. {notAssessed} grade standards have no questions answered yet.</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {standards.map((s) => (
              <li key={s.code} className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3 py-2">
                <span><span className="font-semibold text-brand-navy">{s.short}</span> <span className="text-slate-600">{s.description.slice(0, 110)}{s.description.length > 110 ? "…" : ""}</span></span>
                <span className="text-right tabular-nums">{s.accuracyPct}%<br /><span className="text-xs text-slate-500">{s.attempts} answers</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
