import type { ClassBandPlanDoc } from "@/server/map/map-reports";
import { ReportPage } from "./report-ui";
import { assignGroupAction } from "@/app/map-report/actions";
import { SourceSelect } from "@/components/assign/source-select";

const subjectName = (s: string) => (s === "READING" ? "Reading" : "Language Usage");
const BAND_STYLE: Record<string, { bar: string; text: string; chip: string }> = {
  BELOW: { bar: "bg-amber-400", text: "text-amber-700", chip: "bg-amber-50 text-amber-900 ring-amber-200" },
  ON: { bar: "bg-brand-teal", text: "text-brand-teal", chip: "bg-teal-50 text-teal-900 ring-teal-200" },
  ABOVE: { bar: "bg-brand-purple", text: "text-brand-purple", chip: "bg-purple-50 text-purple-900 ring-purple-200" },
};

/**
 * 🎯 Class Study Plan grouped by performance band — Below / On / Above level (owner: a full redesign of the old
 * Group Study Plan, inspired by the school's own Personalized Plan document): one combined view with a section per
 * band — who is in it, their RIT range and average growth projection from the actual MAP data, then the skills to
 * develop, pooled across every goal area and sent to the band with one button, same as the old Group plan.
 */
export function ClassBandPlanView({ d }: { d: ClassBandPlanDoc }) {
  return (
    <>
      {d.bands.map((b, bi) => {
        const ui = BAND_STYLE[b.key];
        return (
          <ReportPage key={b.key} first={bi === 0}>
            <header id={b.key} className={`flex flex-wrap items-end justify-between gap-2 border-b-2 pb-2 ${ui.text}`} style={{ borderColor: "currentColor" }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-teal">Personalized Plan · {subjectName(d.subject)} · {d.className} · Grade {d.grade}</p>
                <h2 className="text-3xl font-black text-brand-navy">{b.title} <span className="text-lg font-normal text-slate-500">{b.range}</span></h2>
              </div>
              <p className="text-sm text-slate-600">{d.term ?? ""} · {b.students.length} student(s){b.avgGrowth !== null && <> · average projected growth <b className={ui.text}>{b.avgGrowth >= 0 ? "+" : ""}{b.avgGrowth} RIT</b> to {b.avgProjection}</>}</p>
            </header>

            <table className="mt-3 w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-1.5">Student</th><th>RIT</th><th>Spring projection</th></tr></thead>
              <tbody>{b.students.map((x) => (
                <tr key={x.id} className="border-b last:border-0">
                  <td className="py-1 font-semibold text-slate-800">{x.name}</td>
                  <td className="tabular-nums">{x.rit}</td>
                  <td className="tabular-nums">{x.projection !== null ? `${x.projection} (${x.projection - x.rit >= 0 ? "+" : ""}${x.projection - x.rit})` : "—"}</td>
                </tr>
              ))}</tbody>
            </table>

            {!b.areas.length && <p className="mt-4 text-slate-500">No platform skills yet for this band.</p>}
            {b.areas.map((a) => (
              <section key={a.group} className="mt-5 rounded-2xl ring-1 ring-slate-200">
                <form action={assignGroupAction}>
                  <input type="hidden" name="classId" value={d.classId} /><input type="hidden" name="subject" value={d.subject} /><input type="hidden" name="group" value={a.group} />
                  <input type="hidden" name="low" value={b.low} /><input type="hidden" name="high" value={b.high} />
                  <div className={`flex flex-wrap items-baseline justify-between gap-2 rounded-t-2xl px-4 py-2 text-white ${ui.bar}`}>
                    <h3 className="text-lg font-bold">{a.icon} {a.name}</h3>
                    <p className="text-xs text-white/90">Academic goals{a.shown < a.total ? ` · ${a.shown} of ${a.total} statements (grade-level first)` : ""}</p>
                  </div>
                  <div className="px-4 py-3">
                    {d.canAssign && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {b.students.map((x) => <label key={x.id} className="flex items-center gap-1 print:hidden"><input type="checkbox" name="student" value={x.id} defaultChecked className="print:hidden" /><span className="font-semibold text-slate-800">{x.name}</span></label>)}
                      </div>
                    )}
                    <table className="mt-2 w-full text-sm">
                      <tbody>{a.topics.map((t) => (
                        <tr key={t.name} className="border-t border-slate-200 align-top">
                          <td className="w-[28%] py-2 pe-3 font-semibold text-slate-800">{t.name}</td>
                          <td className="py-2">
                            <ul className="space-y-1">{t.statements.map((x, i) => (
                              <li key={i} className="break-inside-avoid">
                                {x.text && x.text !== x.skills[0]?.name && <p>{x.text}{x.standards.length > 0 && <span className="ms-1 text-[10px] text-slate-400">{x.standards.join(" ")}</span>}</p>}
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
                    {d.canAssign && a.skillIds.length > 0 && (
                      <div className={`mt-3 flex flex-wrap items-end gap-3 rounded-xl p-3 text-sm ring-1 print:hidden ${ui.chip}`}>
                        <label>Questions <input type="number" name="count" min={5} max={40} defaultValue={15} className="mt-1 block w-20 rounded-md border border-slate-300 px-2 py-1" /></label>
                        <label>Start <input type="date" name="startAt" className="mt-1 block rounded-md border border-slate-300 px-2 py-1" /></label>
                        <label>Due <input type="date" name="dueAt" className="mt-1 block rounded-md border border-slate-300 px-2 py-1" /></label>
                        <SourceSelect field="mt-1 block rounded-md border border-slate-300 px-2 py-1 font-normal" className="!text-xs" />
                        <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">📤 Send to {b.title.toLowerCase()}</button>
                        <span className="text-xs text-slate-500">Ticked skills · questions of this band's RIT range · adapts to each student.</span>
                      </div>
                    )}
                  </div>
                </form>
              </section>
            ))}
            {d.noScores.length > 0 && bi === 0 && <p className="mt-3 text-xs text-slate-500">No {subjectName(d.subject)} score yet: {d.noScores.join(", ")}.</p>}
          </ReportPage>
        );
      })}
      {!d.bands.length && <ReportPage first><p className="text-slate-500">No student of this class has a {subjectName(d.subject)} MAP score yet.</p></ReportPage>}
    </>
  );
}
