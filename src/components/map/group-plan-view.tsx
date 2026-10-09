import type { GroupPlanDoc } from "@/server/map/map-reports";
import { ReportPage } from "./report-ui";
import { assignGroupAction } from "@/app/map-report/actions";

const subjectName = (s: string) => (s === "READING" ? "Reading" : "Language Usage");

/** 👥 Group Study Plan: per goal area, the students of each RIT band together, what to develop, the linked
 *  skills with how many of the group have mastered each, and one button to send the group its practice. */
export function GroupPlanView({ d }: { d: GroupPlanDoc }) {
  return (
    <>
      {d.areas.map((a, ai) => (
        <ReportPage key={a.group} first={ai === 0}>
          <header id={a.group} className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-brand-navy pb-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-teal">Group Study Plan · {subjectName(d.subject)} · {d.className} · Grade {d.grade}</p>
              <h2 className="text-3xl font-black text-brand-navy">{a.icon} {a.name}</h2>
            </div>
            <p className="text-sm text-slate-600">{d.term ?? ""} · {a.bands.reduce((t, b) => t + b.students.length, 0)} students in {a.bands.length} group(s)</p>
          </header>
          {!a.bands.length && <p className="mt-4 text-slate-500">No student with a score for this goal area.</p>}
          {a.bands.map((b) => (
            <section key={b.key} className="mt-5 rounded-2xl ring-1 ring-slate-200">
              <form action={assignGroupAction}>
                <input type="hidden" name="classId" value={d.classId} /><input type="hidden" name="subject" value={d.subject} /><input type="hidden" name="group" value={a.group} />
                <input type="hidden" name="low" value={b.low} /><input type="hidden" name="high" value={b.high} />
                <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-2xl bg-brand-navy px-4 py-2 text-white">
                  <h3 className="text-lg font-bold">Develop · {b.range}</h3>
                  <p className="text-xs text-teal-100">{b.students.length} student(s){b.shown < b.total ? ` · ${b.shown} of ${b.total} statements (grade-level first)` : ""}{b.reinforceRange ? ` · reinforce ${b.reinforceRange}` : ""}{b.introduceRange ? ` · introduce ${b.introduceRange}` : ""}</p>
                </div>
                <div className="px-4 py-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {b.students.map((x) => <label key={x.id} className="flex items-center gap-1">{d.canAssign && <input type="checkbox" name="student" value={x.id} defaultChecked className="print:hidden" />}<span className="font-semibold text-slate-800">{x.name}</span> <span className="text-xs text-slate-500">{x.rit}{x.fromGoal ? "" : "*"}</span></label>)}
                  </div>
                  <table className="mt-3 w-full text-sm">
                    <tbody>{b.topics.map((t) => (
                      <tr key={t.name} className="border-t border-slate-200 align-top">
                        <td className="w-[28%] py-2 pe-3 font-semibold text-slate-800">{t.name}</td>
                        <td className="py-2">
                          <ul className="space-y-1">{t.statements.map((x, i) => (
                            <li key={i} className="break-inside-avoid">
                              {d.source === "CONTINUUM" && <p>{x.text}{x.standards.length > 0 && <span className="ms-1 text-[10px] text-slate-400">{x.standards.join(" ")}</span>}</p>}
                              <div className="mt-0.5 flex flex-wrap gap-1">{x.skills.map((k) => (
                                <label key={k.id} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                                  {d.canAssign && <input type="checkbox" name="skill" value={k.id} defaultChecked={k.mastered < b.students.length} className="print:hidden" />}
                                  {k.name} <span className={k.mastered === b.students.length ? "text-emerald-700" : "text-slate-400"}>· {k.mastered}/{b.students.length} mastered</span>
                                </label>
                              ))}</div>
                            </li>
                          ))}</ul>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {d.canAssign && b.skillIds.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-amber-50 p-3 text-sm ring-1 ring-amber-200 print:hidden">
                      <label>Questions <input type="number" name="count" min={5} max={40} defaultValue={15} className="mt-1 block w-20 rounded-md border border-slate-300 px-2 py-1" /></label>
                      <label>Due <input type="date" name="dueAt" className="mt-1 block rounded-md border border-slate-300 px-2 py-1" /></label>
                      <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">📤 Send this group its practice</button>
                      <span className="text-xs text-slate-500">Ticked skills · questions of their band and the band above · adapts to each student.</span>
                    </div>
                  )}
                </div>
              </form>
            </section>
          ))}
          {d.noScores.length > 0 && ai === 0 && <p className="mt-3 text-xs text-slate-500">No {subjectName(d.subject)} score yet: {d.noScores.join(", ")}.</p>}
          <p className="mt-3 text-xs text-slate-500">* No goal-area score: the overall RIT is used.</p>
        </ReportPage>
      ))}
    </>
  );
}
