import Link from "next/link";
import type { ClassDiagnosticReport } from "@/server/diagnostic/report";
import { STRAND_LABEL } from "@/server/diagnostic/standards";
import { shareDiagnosticAction } from "@/app/diagnostic/actions";

export const heat = (p: number | null | undefined) => (p === null || p === undefined ? "bg-slate-50 text-slate-400" : p >= 75 ? "bg-emerald-100 text-emerald-900" : p >= 60 ? "bg-sky-100 text-sky-900" : p >= 40 ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-900");
export const LEVEL_CHIP = { ABOVE: "bg-emerald-600 text-white", ON: "bg-sky-600 text-white", BELOW: "bg-rose-500 text-white" } as const;
export const LEVEL_NAME = { ABOVE: "Above", ON: "On", BELOW: "Below" } as const;
const PERF: Record<string, string> = { Strength: "bg-emerald-100 text-emerald-900", Moderate: "bg-sky-100 text-sky-900", Approaching: "bg-amber-100 text-amber-900", "Priority Need": "bg-rose-100 text-rose-900" };
const TIER_TONE = ["border-emerald-400 bg-emerald-50", "border-sky-400 bg-sky-50", "border-amber-400 bg-amber-50", "border-rose-400 bg-rose-50"];

/** ⬇ Download buttons: a real PDF file, Excel workbook (one sheet per table), CSV; print is the browser's. */
export function DownloadBar({ testId, classId, studentId }: { testId: string; classId?: string | null; studentId?: string | null }) {
  const q = (f: string) => `/api/diagnostic/export?testId=${testId}${classId ? `&classId=${classId}` : ""}${studentId ? `&studentId=${studentId}` : ""}&format=${f}`;
  const b = "rounded-xl px-3.5 py-2 text-sm font-semibold ring-1";
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a href={q("pdf")} className={`${b} bg-brand-navy text-white ring-brand-navy hover:bg-brand-purple`}>⬇ PDF report</a>
      <a href={q("xlsx")} className={`${b} bg-white text-emerald-800 ring-emerald-300 hover:bg-emerald-50`}>⬇ Excel</a>
      {!studentId && <a href={q("csv")} className={`${b} bg-white text-slate-700 ring-slate-300 hover:bg-slate-50`}>⬇ CSV</a>}
    </div>
  );
}

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return <h2 className="mb-3 flex items-center gap-3 text-xl font-bold text-brand-navy"><span className="grid h-8 w-8 place-items-center rounded-full bg-brand-navy text-sm text-white">{n}</span>{children}</h2>;
}
const card = "break-inside-avoid rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:shadow-none";

/** 📊 The class (or grade) analysis of a Diagnostic Test. */
export function ClassDiagnosticView({ r, canShare, back }: { r: ClassDiagnosticReport; canShare: boolean; back: string }) {
  const S = r.summary;
  const lv = S.levels; const n = lv.ABOVE + lv.ON + lv.BELOW;
  const notShared = r.students.filter((x) => !x.shared).map((x) => x.id);
  return (
    <div className="space-y-6">
      {/* 1 · executive summary */}
      <section className={card}>
        <H n={1}>Executive Summary</H>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Assessed", `${S.assessed}/${S.roster}`, `${S.notStarted} not started · ${S.inProgress} in progress`],
            ["Mean score", `${S.mean}%`, "all students who finished"],
            ["Median", `${S.median}%`, "half scored above"],
            ["Range", `${S.min}–${S.max}%`, "lowest to highest"],
            ["Avg time", `${S.minutes} min`, S.rapidFlags ? `⚡ ${S.rapidFlags} answered too fast` : "careful work"],
          ].map(([k, v, sub]) => <div key={k} className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</p><p className="text-2xl font-extrabold tabular-nums text-brand-navy">{v}</p><p className="text-xs text-slate-500">{sub}</p></div>)}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-slate-700">Levels</p>
            <div className="mt-1 flex h-7 overflow-hidden rounded-xl text-xs font-bold text-white">
              {(["BELOW", "ON", "ABOVE"] as const).map((k) => lv[k] ? <div key={k} className={`grid place-items-center ${k === "BELOW" ? "bg-rose-500" : k === "ON" ? "bg-sky-600" : "bg-emerald-600"}`} style={{ width: `${(100 * lv[k]) / Math.max(1, n)}%` }}>{LEVEL_NAME[k]} {lv[k]}</div> : null)}
            </div>
            <p className="mt-1 text-xs text-slate-500">Above ≥ {r.bands.above}% · On {r.bands.on}–{r.bands.above - 1}% · Below &lt; {r.bands.on}%. Each student now starts the curriculum at this level.</p>
          </div>
          <ul className="space-y-1.5 text-sm">
            {S.best && <li className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900">🏆 <b>Strongest:</b> {S.best.label} <span className="font-mono text-xs">({S.best.code})</span> — {S.best.pct}%</li>}
            {S.focus.length > 0 && <li className="rounded-xl bg-rose-50 px-3 py-2 text-rose-900">🎯 <b>Priority focus:</b> {S.focus.map((f) => `${f.label} (${f.code}) ${f.pct}%`).join(" · ")}</li>}
            {S.roster - S.assessed > 0 && <li className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">⏳ <b>{S.roster - S.assessed}</b> student(s) have not finished — see section 7.</li>}
          </ul>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {r.strands.map((x) => <div key={x.strand} className="rounded-2xl p-3 ring-1 ring-slate-200"><p className="text-xs font-semibold text-slate-500">{STRAND_LABEL[x.strand]}</p><p className="text-xl font-extrabold tabular-nums text-brand-navy">{x.pct}%</p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${x.pct >= 75 ? "bg-emerald-500" : x.pct >= 60 ? "bg-sky-500" : x.pct >= 40 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${x.pct}%` }} /></div></div>)}
        </div>
      </section>

      {/* 2 · master table */}
      <section className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <H n={2}>Student Performance Master Table</H>
          {canShare && notShared.length > 0 && (
            <form action={shareDiagnosticAction} className="print:hidden">
              <input type="hidden" name="testId" value={r.testId} /><input type="hidden" name="back" value={back} />
              {notShared.map((id) => <input key={id} type="hidden" name="studentId" value={id} />)}
              <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">📤 Share all reports with students &amp; families ({notShared.length})</button>
            </form>
          )}
        </div>
        <p className="mb-2 text-xs text-slate-500">Sorted by overall score. Colours: <span className="rounded bg-emerald-100 px-1">75%+</span> <span className="rounded bg-sky-100 px-1">60–74</span> <span className="rounded bg-amber-100 px-1">40–59</span> <span className="rounded bg-rose-100 px-1">under 40</span>. Pct Rank = share of the group scoring lower.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="sticky left-0 z-10 border-b border-slate-200 bg-white py-2 pe-2">Student</th>
                <th className="border-b border-slate-200 px-1.5">Rank</th><th className="border-b border-slate-200 px-1.5">Overall</th><th className="border-b border-slate-200 px-1.5">Level</th>
                {r.standards.map((x) => <th key={x.code} className="border-b border-slate-200 px-1 text-center" title={x.label}><span className="block whitespace-nowrap font-mono">{x.code}</span><span className="block max-w-[5.5rem] truncate font-normal normal-case">{x.label}</span></th>)}
                <th className="border-b border-slate-200 px-1.5 text-center">MAP RIT</th><th className="border-b border-slate-200 px-1.5 text-center">WCPM</th><th className="border-b border-slate-200 px-1.5 print:hidden" />
              </tr>
            </thead>
            <tbody>
              <tr className="font-semibold">
                <td className="sticky left-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-100 py-1.5 pe-2">Class average</td><td className="border-b border-slate-200 bg-slate-100" /><td className="border-b border-slate-200 bg-slate-100 px-1.5 tabular-nums">{S.mean}%</td><td className="border-b border-slate-200 bg-slate-100" />
                {r.standards.map((x) => <td key={x.code} className={`border-b border-slate-200 px-1 text-center tabular-nums ${heat(x.pct)}`}>{Math.round(x.pct)}</td>)}
                <td className="border-b border-slate-200 bg-slate-100" /><td className="border-b border-slate-200 bg-slate-100" /><td className="border-b border-slate-200 bg-slate-100 print:hidden" />
              </tr>
              {r.students.map((st) => (
                <tr key={st.id} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 min-w-[11rem] whitespace-nowrap border-b border-slate-100 bg-white py-1.5 pe-2"><span className="block font-semibold text-slate-900">{st.name}</span><span className="block text-[11px] text-slate-500">{st.className}{st.rapid >= st.total * 0.3 ? " · ⚡ too fast" : ""}</span></td>
                  <td className="border-b border-slate-100 px-1.5 tabular-nums text-slate-600">{st.rank}</td>
                  <td className="border-b border-slate-100 px-1.5"><b className="tabular-nums">{st.pct}%</b><span className="block text-[11px] text-slate-500">{st.correct}/{st.total}</span></td>
                  <td className="border-b border-slate-100 px-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${LEVEL_CHIP[st.level]}`}>{LEVEL_NAME[st.level]}</span></td>
                  {r.standards.map((x) => <td key={x.code} className={`border-b border-white px-1 text-center tabular-nums ${heat(st.standards[x.code])}`}>{st.standards[x.code] === undefined ? "—" : Math.round(st.standards[x.code])}</td>)}
                  <td className="border-b border-slate-100 px-1.5 text-center tabular-nums">{st.rit ?? "—"}</td>
                  <td className={`border-b border-slate-100 px-1.5 text-center tabular-nums ${st.wcpm !== null && st.wcpm < r.fluency.benchmark * 0.75 ? "font-bold text-rose-700" : ""}`}>{st.wcpm ?? "—"}</td>
                  <td className="border-b border-slate-100 px-1.5 text-end print:hidden"><Link href={`/diagnostic/${r.testId}/student/${st.id}`} className="whitespace-nowrap rounded-lg px-2 py-1 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Report{st.shared ? " ✓" : ""}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3 · standards */}
      <section className={card}>
        <H n={3}>Standards Breakdown &amp; Action Plan</H>
        <div className="space-y-2">
          {[...r.standards].sort((a, b) => a.pct - b.pct).map((x) => (
            <details key={x.code} className="group rounded-2xl ring-1 ring-slate-200 open:bg-slate-50/60" open={x.level === "Priority Need"}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-20 font-mono text-xs font-bold text-brand-teal">{x.code}</span>
                <span className="min-w-0 flex-1 font-semibold text-slate-900">{x.label} <span className="text-xs font-normal text-slate-500">· {STRAND_LABEL[x.strand]} · {x.questions} q.</span></span>
                <span className="flex items-center gap-2"><span className="block h-2 w-28 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full ${x.pct >= 75 ? "bg-emerald-500" : x.pct >= 60 ? "bg-sky-500" : x.pct >= 50 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${x.pct}%` }} /></span><b className="w-12 text-end tabular-nums">{x.pct}%</b></span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PERF[x.level]}`}>{x.level}</span>
                {x.below50 > 0 && <span className="text-xs text-rose-700">{x.below50} under 50%</span>}
              </summary>
              <div className="border-t border-slate-200 px-4 py-3 text-sm">
                <p className="text-slate-800"><b>Objective:</b> {x.objective}</p>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-slate-700">{x.activities.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* 4 · levels */}
      <section className={card}>
        <H n={4}>Levels: Below · On · Above</H>
        <div className="grid gap-3 md:grid-cols-3">
          {(["BELOW", "ON", "ABOVE"] as const).map((k) => {
            const list = r.students.filter((x) => x.level === k);
            return (
              <div key={k} className={`rounded-2xl p-4 ${k === "BELOW" ? "bg-rose-50 ring-1 ring-rose-200" : k === "ON" ? "bg-sky-50 ring-1 ring-sky-200" : "bg-emerald-50 ring-1 ring-emerald-200"}`}>
                <p className="font-bold text-brand-navy">{LEVEL_NAME[k]} Level <span className="text-sm font-normal text-slate-500">· {k === "BELOW" ? `0–${r.bands.on - 1}%` : k === "ON" ? `${r.bands.on}–${r.bands.above - 1}%` : `${r.bands.above}–100%`} · {list.length}</span></p>
                <ol className="mt-2 space-y-0.5 text-sm">{list.map((x) => <li key={x.id} className="flex justify-between gap-2"><span>{x.name}</span><span className="tabular-nums text-slate-600">{x.pct}%</span></li>)}</ol>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5 · tiers */}
      <section className={card}>
        <H n={5}>Performance Tiers &amp; Instructional Strategy</H>
        <div className="grid gap-3 md:grid-cols-2">
          {r.tiers.map((t, i) => (
            <div key={t.key} className={`break-inside-avoid rounded-2xl border-s-4 p-4 ${TIER_TONE[i]}`}>
              <p className="font-bold text-brand-navy">{t.name} <span className="text-sm font-normal text-slate-500">· {t.sub} · {t.band} · {t.students.length} student(s)</span></p>
              <p className="mt-1 text-sm text-slate-700">{t.strategy}</p>
              {t.students.length > 0 && <p className="mt-2 text-sm text-slate-900">{t.students.map((x) => `${x.name} (${x.pct}%)`).join(" · ")}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* 6 · support plan */}
      <section className={card}>
        <H n={6}>8-Week Support Plan</H>
        <p className="-mt-1 mb-3 text-sm text-slate-600">For the students below level or in Tiers 3–4 · one 30-minute small-group session a week · the weakest standards first. Students also get these standards in their curriculum plan at their level.</p>
        {!r.supportPlan.length ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">🎉 No student needs the support plan.</p> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {r.supportPlan.map((w) => (
              <div key={w.week} className="break-inside-avoid rounded-2xl ring-1 ring-slate-200">
                <div className="flex items-center justify-between gap-2 rounded-t-2xl bg-brand-navy px-4 py-2 text-white"><b>Week {w.week}</b><span className="text-sm">{w.code === "REVIEW" ? w.label : <>{w.label} <span className="font-mono text-xs opacity-80">({w.code})</span></>}</span></div>
                <div className="space-y-2 p-4 text-sm">
                  <p><b className="text-slate-700">Objective:</b> {w.objective}</p>
                  <div><b className="text-slate-700">Activities:</b><ul className="mt-0.5 list-disc ps-5 text-slate-700">{w.activities.map((a) => <li key={a}>{a}</li>)}</ul></div>
                  <p><b className="text-slate-700">Targeted students ({w.students.length}):</b> <span className="text-slate-900">{w.students.map((x) => x.name).join(", ")}</span></p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 7 · not taken */}
      <section className={card}>
        <H n={7}>Not Taken Yet</H>
        {!r.notTaken.length ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">✅ Every student has taken the test.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2">Student</th><th>Class</th><th>Status</th><th>Required action</th></tr></thead>
            <tbody>{r.notTaken.map((x) => <tr key={x.id} className="border-b border-slate-100"><td className="py-2 font-medium">{x.name}</td><td>{x.className}</td><td><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${x.status === "In progress" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-700"}`}>{x.status}{x.answered ? ` · ${x.answered} answered` : ""}</span></td><td className="text-slate-700">{x.action}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      {/* 8 · fluency */}
      <section className={card}>
        <H n={8}>Reading Fluency</H>
        <p className="text-sm text-slate-700">Grade {r.grade} benchmark: about <b>{r.fluency.benchmark}</b> words correct per minute (mid-year). {r.fluency.checked} of {r.students.length} students have a fluency check (teacher check or a scored Reading Aloud recording).</p>
        {r.fluency.below.length > 0 ? <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900">🔊 Well below the benchmark: {r.fluency.below.map((x) => `${x.name} (${x.wcpm})`).join(" · ")} — add repeated reading and partner reading.</p> : null}
        <Link href="/teacher/fluency" className="mt-3 inline-block rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal print:hidden">🔊 Record fluency checks</Link>
      </section>

      {/* 9 · items */}
      <section className={card}>
        <H n={9}>Question Analysis</H>
        <p className="-mt-1 mb-2 text-sm text-slate-600">Questions under 30% correct need re-teaching — or a look at the question itself.</p>
        <div className="grid gap-1 text-sm md:grid-cols-2">
          {r.items.map((x) => (
            <div key={x.n} className={`flex items-start gap-2 rounded-lg px-2 py-1 ${x.answered && x.pct < 30 ? "bg-rose-50" : ""}`}>
              <span className="w-6 text-end tabular-nums text-slate-400">{x.n}</span>
              <span className="min-w-0 flex-1 truncate" title={x.stem}><span className="font-mono text-xs text-brand-teal">{x.code}</span> {x.stem}</span>
              <span className={`w-12 rounded text-center text-xs font-bold tabular-nums ${heat(x.answered ? x.pct : null)}`}>{x.answered ? `${Math.round(x.pct)}%` : "—"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
