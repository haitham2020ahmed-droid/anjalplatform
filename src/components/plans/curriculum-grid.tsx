import Link from "next/link";
import type { PlanGrid } from "@/server/curriculum-map/curriculum-plan";
import { setUnitsAction } from "@/app/teacher/plans/actions";

const CELL = { COMPLETED: "bg-emerald-500", IN_PROGRESS: "bg-amber-300", STUCK: "bg-red-500", NOT_STARTED: "bg-slate-100" } as const;
const WORD = { COMPLETED: "done", IN_PROGRESS: "working", STUCK: "stuck — needs help", NOT_STARTED: "not started" } as const;

/** 📘 A class's curriculum plan for the teacher: units open/locked/calendar, and every student × every part. */
export function CurriculumGrid({ g, canEdit }: { g: PlanGrid; canEdit: boolean }) {
  const box = "rounded-lg border border-slate-300 px-2 py-1 text-sm";
  const stuck = g.students.flatMap((st) => g.items.filter((it) => st.cells[it.id]?.status === "STUCK").map((it) => ({ st, it })));
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:hidden">
        <h2 className="text-lg font-bold text-brand-navy">🔒 Units &amp; Calendar</h2>
        <p className="text-sm text-slate-600">Students can open only the open units. Give a unit a date and it opens by itself on that day.</p>
        <form action={setUnitsAction} className="mt-3">
          <input type="hidden" name="planId" value={g.planId} />
          <ul className="grid gap-2 md:grid-cols-2">
            {g.units.map((u, i) => {
              const how = g.unitDates[u] && !(g.openUnits ?? []).includes(u) ? "date" : g.unitOpen[u] ? "open" : "locked";
              const n = g.items.filter((x) => x.unit === u);
              return (
                <li key={u} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                  <input type="hidden" name="unit" value={u} />
                  <span className="min-w-0"><span className="font-semibold text-slate-800">{g.unitOpen[u] ? "🟢" : "🔒"} {u}</span><span className="block text-xs text-slate-500">{n.reduce((t, x) => t + x.done, 0)} parts finished · {n.length} parts</span></span>
                  <span className="flex items-center gap-2">
                    <select name={`how-${i}`} defaultValue={how} disabled={!canEdit} className={box} aria-label={`${u}: open or locked`}>
                      <option value="open">Open</option><option value="locked">Locked</option><option value="date">Opens on…</option>
                    </select>
                    <input type="date" name={`date-${i}`} defaultValue={g.unitDates[u] ?? ""} disabled={!canEdit} className={box} aria-label={`${u}: opening date`} />
                  </span>
                </li>
              );
            })}
          </ul>
          {canEdit && <div className="mt-3 flex justify-end"><button className="rounded-xl bg-brand-navy px-5 py-2 font-bold text-white hover:bg-brand-purple">Save units</button></div>}
        </form>
      </section>

      {stuck.length > 0 && (
        <section className="rounded-3xl bg-red-50 p-5 ring-1 ring-red-200">
          <h2 className="text-lg font-bold text-red-800">🆘 Stuck ({stuck.length})</h2>
          <p className="text-sm text-red-900">These students answered 40+ questions in a part without reaching {g.target} correct. A quick talk or a small group helps.</p>
          <ul className="mt-2 grid gap-1 text-sm md:grid-cols-2">{stuck.slice(0, 30).map(({ st, it }) => <li key={st.id + it.id}><Link href={`/teacher/students/${st.id}`} className="font-semibold text-red-800 hover:underline">{st.name}</Link> — {it.unit} · {it.category} <span className="text-red-700">({st.cells[it.id].correct}/{g.target})</span></li>)}</ul>
        </section>
      )}

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-brand-navy">🟩 Class Progress</h2>
          <p className="flex flex-wrap gap-3 text-xs text-slate-600">{(Object.keys(CELL) as (keyof typeof CELL)[]).map((k) => <span key={k} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded ${CELL[k]} ring-1 ring-slate-200`} />{WORD[k]}</span>)}</p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white" />
                {g.units.map((u) => <th key={u} colSpan={g.items.filter((x) => x.unit === u).length} className="whitespace-nowrap rounded bg-slate-100 px-1 py-1 text-left font-semibold text-slate-700">{u.replace(/^(Unit \d+).*/, "$1")}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {g.students.map((st) => (
                <tr key={st.id}>
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-white pe-2 text-left font-medium"><Link href={`/teacher/students/${st.id}`} className="text-brand-navy hover:underline">{st.name}</Link></th>
                  {g.items.map((it) => { const c = st.cells[it.id]; return <td key={it.id} title={`${st.name} · ${it.unit} · ${it.set} · ${it.category}: ${WORD[c.status]} (${c.correct}/${g.target})`} className={`h-4 w-4 min-w-4 rounded-sm ${CELL[c.status]}`} />; })}
                  <td className="ps-2 tabular-nums text-slate-600">{st.done}/{g.items.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">📋 Parts</h2>
        {g.units.map((u) => (
          <div key={u} className="mt-3">
            <p className="font-semibold text-slate-800">{u}</p>
            <ul className="mt-1 grid gap-1 text-sm md:grid-cols-2 lg:grid-cols-3">
              {g.items.filter((x) => x.unit === u).map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5"><span className="min-w-0"><span className="block truncate text-slate-800">{x.category}</span><span className="block truncate text-xs text-slate-500">{x.set}</span></span><span className="shrink-0 text-xs tabular-nums text-slate-600">{x.done}/{g.students.length} done</span></li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
