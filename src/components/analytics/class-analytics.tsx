/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ClassComparison, StandardRow } from "../../server/analytics/reports";
import { BarList } from "../charts/bar-chart";
import { LineChart } from "../charts/line-chart";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable } from "../report-kit";

const PERIODS: [string, string][] = [["LAST_7_DAYS", "Last 7 days"], ["LAST_30_DAYS", "Last 30 days"], ["TERM", "This term"], ["SEMESTER", "Semester"], ["SCHOOL_YEAR", "School year"]];
const v = (x: number | null, suffix = "") => (x === null ? "–" : `${x}${suffix}`);

export function ClassAnalyticsView({ className, classHref, period, periodKey, c, standards, notAssessed }: {
  className: string; classHref: string; period: string; periodKey: string; c: ClassComparison; standards: StandardRow[]; notAssessed: number;
}) {
  const g = c.classGrowth;
  return (
    <div>
      <ReportHeader back={{ href: classHref, label: "Back to class" }} icon="📈" title={`Class ${className}: progress and growth`}
        subtitle="All scores are this platform's own measures, not MAP or other official scores."
        who={className} when={period}
        filters={<nav aria-label="Reporting period" className="flex flex-wrap gap-2">
          {PERIODS.map(([k, l]) => (
            <a key={k} href={`?period=${k}`} aria-current={k === periodKey ? "page" : undefined}
              className={["rounded-full px-4 py-1.5 text-sm font-semibold", k === periodKey ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"].join(" ")}>{l}</a>
          ))}
        </nav>} />
      <AtAGlance items={[
        { icon: "📈", label: "Average growth", value: g.meanGrowth === null ? "–" : `${g.meanGrowth > 0 ? "+" : ""}${g.meanGrowth}`, meaning: "mastery points gained this period", tone: g.meanGrowth === null ? "neutral" : g.meanGrowth > 0 ? "good" : g.meanGrowth < 0 ? "bad" : "neutral" },
        { icon: "➗", label: "Median growth", value: g.medianGrowth === null ? "–" : `${g.medianGrowth > 0 ? "+" : ""}${g.medianGrowth}`, meaning: "the middle student's growth" },
        { icon: "👩‍🎓", label: "Students with practice data", value: `${g.withData} of ${g.students}`, tone: g.withData < g.students ? "warn" : "good" },
        { icon: "🎯", label: "Median mastery", value: v(c.masterySummary.median), meaning: `middle half ${v(c.masterySummary.p25)}–${v(c.masterySummary.p75)}` },
      ]} />
      <Callout kind="next" className="mb-5" items={[
        standards[0] ? <>Reteach the lowest standard: <b>{standards[0].short}</b> ({standards[0].accuracyPct}%)</> : null,
        g.withData < g.students ? `${g.students - g.withData} students have no practice data yet: ask them to practise this week.` : null,
      ]} />
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Average Mastery by Month</h2>
          <LineChart title="Class average mastery by month" labels={g.series.map((p) => p.label)} series={[{ name: "Class average", color: "#1fa3a3", points: g.series.map((p) => p.mastery) }]} />
        </div>
        <div className="rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Growth This Period</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4">
            <div><dt className="text-sm text-slate-500">Average growth</dt><dd className="text-3xl font-bold tabular-nums text-brand-navy">{g.meanGrowth === null ? "–" : `${g.meanGrowth > 0 ? "+" : ""}${g.meanGrowth}`}</dd></div>
            <div><dt className="text-sm text-slate-500">Median growth</dt><dd className="text-3xl font-bold tabular-nums text-brand-navy">{g.medianGrowth === null ? "–" : `${g.medianGrowth > 0 ? "+" : ""}${g.medianGrowth}`}</dd></div>
            <div className="col-span-2"><dt className="text-sm text-slate-500">Students with practice data</dt><dd className="tabular-nums text-slate-800">{g.withData} of {g.students}</dd></div>
          </dl>
          <h3 className="mt-5 font-semibold text-brand-navy">Spread of Mastery</h3>
          <div className="mt-2"><BarList items={c.distribution.map((d) => ({ label: d.label, value: d.count }))} /></div>
          <p className="mt-2 text-sm text-slate-500">Median {v(c.masterySummary.median)}, middle half {v(c.masterySummary.p25)}–{v(c.masterySummary.p75)}</p>
        </div>
      </section>

      <ReportSection title="How the Class Compares" icon="⚖️" className="mt-6">
        <ReportTable label="How the Class Compares"
          cols={[{ key: "g", label: "Group" }, { key: "n", label: "Students with data", num: true }, { key: "m", label: "Average mastery", num: true }, { key: "a", label: "Accuracy", num: true }, { key: "gr", label: "Average growth", num: true }]}
          rows={[
            ...c.rows.map((r) => ({ id: r.label, sort: { m: r.suppressed ? null : r.avgMastery, a: r.suppressed ? null : r.accuracyPct, gr: r.suppressed ? null : r.meanGrowth },
              cells: r.suppressed ? { g: <span className="text-brand-navy">{r.label}</span>, n: r.studentsWithData, m: <span className="text-slate-500">Hidden: fewer than 5 students have data (protects privacy)</span>, a: "", gr: "" }
                : { g: <span className="text-brand-navy">{r.label}</span>, n: r.studentsWithData, m: v(r.avgMastery), a: v(r.accuracyPct, "%"), gr: r.meanGrowth === null ? "–" : `${r.meanGrowth > 0 ? "+" : ""}${r.meanGrowth}` } })),
            ...c.external.map((e) => ({ id: e.scope, cells: { g: <span className="text-brand-navy">{e.scope === "NATIONAL" ? "National" : "District"}</span>, n: "", m: <span className="text-slate-600">{e.available ? `${e.value} (${e.metric === "ACCURACY_PCT" ? "accuracy" : "average mastery"}), source: ${e.source}` : e.message}</span>, a: "", gr: "" } })),
          ]} />
      </ReportSection>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Skill Growth</h2>
          <p className="text-sm text-slate-500">Each skill compared with its own starting point, averaged over the students who practised it.</p>
          <div className="mt-3"><BarList items={g.skills.slice(0, 8).map((s) => ({ label: s.name, value: Math.max(0, s.meanGrowth) }))} suffix=" pts" /></div>
          {g.skills.length === 0 && <p className="mt-2 text-slate-600">Growth appears after students practise a skill at least twice.</p>}
        </section>
        <section className="rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Standards</h2>
          <p className="text-sm text-slate-500">Accuracy by Common Core standard, lowest first. {notAssessed} grade standards have no questions answered yet.</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {standards.map((s) => (
              <li key={s.code} className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3 py-2">
                <span><span className="font-semibold text-brand-navy">{s.short}</span> <span className="text-slate-600">{s.description.slice(0, 110)}{s.description.length > 110 ? "…" : ""}</span></span>
                <span className={`text-end font-semibold tabular-nums ${s.accuracyPct >= 80 ? "text-emerald-700" : s.accuracyPct >= 60 ? "text-amber-700" : "text-red-700"}`}>{s.accuracyPct < 60 ? "! " : ""}{s.accuracyPct}%<br /><span className="text-xs text-slate-500">{s.attempts} answers</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
