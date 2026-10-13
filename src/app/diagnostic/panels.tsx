import { NameList } from "@/components/name-list";
import Link from "next/link";
import type { BenchCell, ClassBenchmark } from "@/server/diagnostic/report";
import type { ClassGrowth, StudentGrowth, GrowthSummary } from "@/server/diagnostic/growth";
import { PERIODS, PERIOD_LABEL, type Period } from "@/server/diagnostic/test";

const flag = (met: boolean) => (met ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-rose-200");
const fmtDelta = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x > 0 ? "+" : ""}${x}`);
const deltaColor = (x: number | null | undefined) => (x === null || x === undefined ? "text-slate-500" : x > 0 ? "text-emerald-700" : x < 0 ? "text-rose-700" : "text-slate-700");
const LEVEL_NAME = { ABOVE: "Exceeding", ON: "Meeting", BELOW: "Approaching" } as const;

/** 🎯 Benchmark categories of a class: raw + %, the 80% target, and a reteach link for each weak category. */
export function BenchmarkPanel({ b }: { b: ClassBenchmark }) {
  if (!b.categories.length) return null;
  return (
    <section aria-labelledby="bench-h" className="mx-auto mb-6 max-w-6xl rounded-3xl bg-white p-5 ring-1 ring-slate-200 print:ring-0">
      <h2 id="bench-h" className="text-xl font-bold text-brand-navy">🎯 Benchmark categories · target {b.target}%</h2>
      <p className="text-sm text-slate-600">{b.scope} · raw score (correct / answered) and % for each category. A category under {b.target}% links to its weakest skills in the Question Bank.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-1">Category</th><th className="text-right">Raw</th><th className="text-right">%</th><th className="pl-3">Target</th><th className="text-right">Students under {b.target}%</th><th className="pl-3">Weakest standards</th><th className="pl-3 print:hidden">Reteach</th></tr></thead>
          <tbody>
            {b.categories.map((c) => (
              <tr key={c.key} className="border-t border-slate-100 align-top">
                <td className="py-2 font-semibold">{c.label}</td>
                <td className="text-right tabular-nums">{c.correct}/{c.total}</td>
                <td className="text-right font-bold tabular-nums">{c.pct}%</td>
                <td className="pl-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${flag(c.met)}`}>{c.met ? "Met" : "Below target"}</span></td>
                <td className="text-right tabular-nums">{c.belowTarget}/{c.students}</td>
                <td className="pl-3 text-slate-700">{c.weakest.map((w) => `${w.code} ${w.label} (${w.pct}%)`).join(" · ")}</td>
                <td className="pl-3 print:hidden">{c.met ? <span className="text-slate-400">—</span> : c.reteach.length ? (
                  <ul className="space-y-1">{c.reteach.map((r) => <li key={r.skillId}><Link href={r.href} className="font-semibold text-brand-purple underline">Reteach: {r.name}</Link></li>)}</ul>
                ) : <span className="text-slate-500">No linked skill found</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {b.students.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer font-semibold text-brand-navy">Students by category</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th className="py-1">Student</th>{b.categories.map((c) => <th key={c.key} className="text-right">{c.label}</th>)}</tr></thead>
              <tbody>{b.students.map((st) => <tr key={st.id} className="border-t border-slate-100"><td className="py-1">{st.name}</td>{b.categories.map((c) => { const x = st.categories[c.key]; return <td key={c.key} className={`text-right tabular-nums ${x && !x.met ? "font-bold text-rose-700" : ""}`}>{x ? `${x.correct}/${x.total} · ${x.pct}%` : "—"}</td>; })}</tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

/** One student's benchmark categories. */
export function StudentBenchmarkPanel({ cells, target = 80 }: { cells: BenchCell[]; target?: number }) {
  if (!cells.length) return null;
  return (
    <section aria-labelledby="sbench-h" className="mx-auto mb-5 max-w-4xl rounded-3xl bg-white p-5 ring-1 ring-slate-200">
      <h2 id="sbench-h" className="text-lg font-bold text-brand-navy">🎯 Benchmark categories · target {target}%</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {cells.map((c) => <li key={c.key} className={`flex items-center justify-between rounded-xl px-3 py-2 ring-1 ${flag(c.met)}`}><span className="font-semibold">{c.label}</span><span className="tabular-nums">{c.correct}/{c.total} · <strong>{c.pct}%</strong></span></li>)}
      </ul>
    </section>
  );
}

function SeriesTable({ title, rows, periods }: { title: string; rows: { key: string; label: string; values: Partial<Record<Period, number | null>>; delta: number | null }[]; periods: Period[] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-slate-500"><th className="py-1">{title}</th>{periods.map((p) => <th key={p} className="text-right">{p}</th>)}<th className="text-right">Change</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-slate-100"><td className="py-1">{r.label}</td>{periods.map((p) => <td key={p} className="text-right tabular-nums">{r.values[p] ?? "—"}</td>)}<td className={`text-right font-bold tabular-nums ${deltaColor(r.delta)}`}>{fmtDelta(r.delta)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** 📈 Class growth BOY → MOY → EOY. */
export function ClassGrowthPanel({ g }: { g: ClassGrowth }) {
  const periods = g.periods;
  if (!g.tests.length) return <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No Diagnostic results for Grade {g.grade} in {g.year} yet.</p>;
  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">📈 {g.scope} · {g.year}</h2>
        <p className="text-sm text-slate-600">Tests: {g.tests.map((t) => `${t.period} (${PERIOD_LABEL[t.period]})`).join(" → ")}. Scores are on the Diagnostic scale (On grade level = 60–84).</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {PERIODS.map((p) => (
            <div key={p} className={`rounded-2xl p-4 ring-1 ${g.levels[p] ? "bg-slate-50 ring-slate-200" : "bg-slate-50/50 ring-slate-100 text-slate-400"}`}>
              <p className="text-sm font-semibold">{p} · {PERIOD_LABEL[p]}</p>
              {g.levels[p] ? <><p className="text-2xl font-bold tabular-nums text-brand-navy">{g.mean[p] ?? "—"}</p><p className="text-xs">Approaching {g.levels[p]!.BELOW} · Meeting {g.levels[p]!.ON} · Exceeding {g.levels[p]!.ABOVE}</p></> : <p className="text-sm">Not taken yet</p>}
            </div>
          ))}
        </div>
      </section>
      {periods.length >= 2 && (
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200"><SeriesTable title="Strand (class average)" periods={periods} rows={g.strands.map((x) => ({ key: x.strand, label: x.label, values: x.values, delta: x.delta }))} /></div>
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200"><SeriesTable title="Standard (class average)" periods={periods} rows={g.standards.map((x) => ({ key: x.anchor, label: `${x.anchor} ${x.label}`, values: x.values, delta: x.delta }))} /></div>
        </section>
      )}
      <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="font-bold text-brand-navy">Students</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-1">Student</th>{PERIODS.map((p) => <th key={p} className="text-right">{p}</th>)}<th className="text-right">BOY→MOY</th><th className="text-right">MOY→EOY</th><th className="text-right">Total</th><th className="pl-3">Level</th></tr></thead>
            <tbody>{g.students.map((st) => <StudentRow key={st.id} st={st} />)}</tbody>
          </table>
        </div>
      </section>
      <section className="rounded-3xl bg-rose-50 p-5 ring-1 ring-rose-200">
        <h3 className="font-bold text-rose-900">Did not grow ({g.notGrowing.length})</h3>
        <p className="mt-1 text-sm text-rose-900">{g.notGrowing.length ? <NameList items={g.notGrowing.map((st) => ({ name: st.name, note: `(${fmtDelta(st.deltas.total)})` }))} /> : periods.length >= 2 ? "Every student with two results grew. 🎉" : "Growth shows once a second test (MOY or EOY) has results."}</p>
      </section>
    </div>
  );
}

function StudentRow({ st }: { st: StudentGrowth }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="py-1">{st.name}</td>
      {PERIODS.map((p) => <td key={p} className="text-right tabular-nums">{st.scores[p]?.pct ?? "—"}</td>)}
      <td className={`text-right tabular-nums ${deltaColor(st.deltas.boyMoy)}`}>{fmtDelta(st.deltas.boyMoy)}</td>
      <td className={`text-right tabular-nums ${deltaColor(st.deltas.moyEoy)}`}>{fmtDelta(st.deltas.moyEoy)}</td>
      <td className={`text-right font-bold tabular-nums ${deltaColor(st.deltas.total)}`}>{fmtDelta(st.deltas.total)}</td>
      <td className="pl-3">{st.levelFrom && st.levelTo && st.levelFrom !== st.levelTo ? `${LEVEL_NAME[st.levelFrom]} → ${LEVEL_NAME[st.levelTo]}` : st.levelTo ? LEVEL_NAME[st.levelTo] : "—"}</td>
    </tr>
  );
}

/** 📈 One student's growth across the year. */
export function StudentGrowthPanel({ g }: { g: StudentGrowth & { year: string; strands: GrowthSummary["strands"]; standards: GrowthSummary["standards"] } }) {
  const periods = PERIODS.filter((p) => g.scores[p]);
  return (
    <section aria-labelledby="sgrowth-h" className="mx-auto mb-5 max-w-4xl rounded-3xl bg-white p-5 ring-1 ring-slate-200">
      <h2 id="sgrowth-h" className="text-lg font-bold text-brand-navy">📈 Growth this year ({g.year})</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {PERIODS.map((p) => <li key={p} className="rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-200"><p className="text-xs font-semibold text-slate-600">{p} · {PERIOD_LABEL[p]}</p><p className="text-xl font-bold tabular-nums text-brand-navy">{g.scores[p]?.pct ?? "—"}</p><p className="text-xs text-slate-600">{g.scores[p] ? LEVEL_NAME[g.scores[p]!.level] : "Not taken"}</p></li>)}
      </ul>
      {periods.length >= 2 ? (
        <>
          <p className={`mt-3 font-semibold ${deltaColor(g.deltas.total)}`}>Change: {fmtDelta(g.deltas.total)} points{g.grew === false ? " — did not grow; plan extra support." : ""}</p>
          <div className="mt-3"><SeriesTable title="Strand" periods={periods} rows={g.strands.map((x) => ({ key: x.strand, label: x.label, values: x.values, delta: x.delta }))} /></div>
        </>
      ) : <p className="mt-3 text-sm text-slate-600">Growth shows once the student has a second Diagnostic result (MOY or EOY).</p>}
    </section>
  );
}
