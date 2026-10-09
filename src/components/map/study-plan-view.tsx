import type { StudyArea, StudyPlanDoc } from "@/server/map/map-reports";
import { ReportHead, ReportPage, SkillChip, StatusLegend, ordinal } from "./report-ui";

const subjectName = (s: string) => (s === "READING" ? "Reading" : "Language Usage");
const STAGE_STYLE = {
  DEVELOP: { bar: "bg-brand-teal", text: "text-brand-teal", note: "Ready to learn now: the student's own RIT band. Most of the practice goes here." },
  REINFORCE: { bar: "bg-amber-400", text: "text-amber-700", note: "From the band below (no longer listed in the student's band): these should be secure — practise the ones not mastered yet." },
  INTRODUCE: { bar: "bg-brand-purple", text: "text-brand-purple", note: "New in the band above: the next step once Develop is going well." },
} as const;

/** 🧭 A student's Personal Study Plan: a cover with the RIT of every goal area, then one section per goal area. */
export function StudyPlanView({ d, first = true, link = false, hub = false }: { d: StudyPlanDoc; first?: boolean; link?: boolean; hub?: boolean }) {
  return (
    <>
      <ReportPage first={first} className="overflow-hidden !p-0">
        <div className="bg-gradient-to-br bg-linear-to-br from-brand-navy via-brand-navy to-brand-teal px-10 pb-12 pt-10 text-white print:px-10">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-200">{d.student.school}</p>
          <h1 className="mt-10 text-4xl font-black leading-tight">{d.student.name}&apos;s<br />Personal Study Plan</h1>
          <p className="mt-2 text-2xl font-light">MAP Growth · {subjectName(d.subject)}</p>
          <p className="mt-6 text-sm text-teal-100">{d.term ?? "No MAP term yet"} · Grade {d.student.grade}{d.student.className ? ` · ${d.student.className}` : ""}{d.student.number ? ` · ID ${d.student.number}` : ""}</p>
        </div>
        <div className="p-8 print:px-10">
          {d.overall ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Tile label="Overall RIT" value={String(d.overall.rit)} sub={d.overall.percentile !== null ? `${ordinal(d.overall.percentile)} percentile · ${d.overall.descriptor}` : ""} />
              <Tile label="Spring goal" value={d.overall.projection ? String(d.overall.projection) : "—"} sub={d.overall.projection ? `+${d.overall.projection - d.overall.rit} RIT to grow` : "from the Fall test"} />
              <Tile label="Plan" value={`${d.areas.reduce((t, a) => t + a.skillsLinked, 0)} skills`} sub={`${d.areas.reduce((t, a) => t + a.skillsMastered, 0)} mastered so far`} />
            </div>
          ) : <p className="text-slate-600">No {subjectName(d.subject)} MAP score yet.</p>}
          <h2 className="mt-6 text-lg font-bold text-brand-navy">Goal areas — weakest first</h2>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2">Goal area</th><th>RIT</th><th>Level</th><th>Ready to learn</th><th>Skills mastered</th></tr></thead>
            <tbody>{d.areas.map((a) => (
              <tr key={a.group} className="border-b last:border-0">
                <td className="py-2 font-semibold text-slate-800">{a.icon} {a.name}{a.focus && <span className="ms-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-800">focus</span>}</td>
                <td className="tabular-nums">{a.rit ?? "—"}{a.rit !== null && !a.fromGoal && <span className="text-xs text-slate-400" title="No goal-area score: the overall RIT is used"> *</span>}</td>
                <td>{a.descriptor ?? "—"}</td>
                <td>{a.stages.find((x) => x.key === "DEVELOP")?.range ?? "—"}</td>
                <td className="tabular-nums">{a.skillsLinked ? `${a.skillsMastered} / ${a.skillsLinked}` : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
          {d.areas.some((a) => a.rit !== null && !a.fromGoal) && <p className="mt-2 text-xs text-slate-500">* No goal-area score in the MAP file: the overall RIT is used for this area.</p>}
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">
            <p className="font-bold text-brand-navy">How to use this plan</p>
            <ol className="mt-1 list-decimal space-y-0.5 ps-5">
              <li><b>Develop</b> — what {d.student.first} is ready to learn now. Start here, focus areas first.</li>
              {d.source === "CONTINUUM" && <li><b>Reinforce</b> — the band below: practise the skills not mastered yet.</li>}
              {d.source === "CONTINUUM" && <li><b>Introduce</b> — the band above: the next step.</li>}
              <li>Each statement lists the platform skills that practise it. The colour shows {d.student.first}&apos;s progress; practice adapts to the right level.</li>
            </ol>
            <div className="mt-2"><StatusLegend /></div>
          </div>
        </div>
      </ReportPage>
      {d.areas.filter((a) => a.stages.length).map((a) => <AreaPages key={a.group} a={a} d={d} link={link} hub={hub} />)}
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="text-3xl font-black text-brand-navy tabular-nums">{value}</p><p className="text-xs text-slate-600">{sub}</p></div>;
}

function AreaPages({ a, d, link, hub }: { a: StudyArea; d: StudyPlanDoc; link: boolean; hub: boolean }) {
  const order = ["DEVELOP", "REINFORCE", "INTRODUCE"] as const;
  return (
    <ReportPage>
      <ReportHead s={d.student} title={`Personal Study Plan · ${subjectName(d.subject)}`} term={d.term} />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-3xl font-black text-brand-navy">{a.icon} {a.name}</h2>
        <p className="text-sm text-slate-600">RIT <b className="text-lg text-brand-navy">{a.rit}</b>{a.descriptor ? ` · ${a.descriptor}` : ""}{a.percentile !== null ? ` (${ordinal(a.percentile)} percentile)` : ""}{!a.fromGoal ? " · overall RIT" : ""}</p>
      </div>
      {order.map((k) => a.stages.find((x) => x.key === k)).filter((x) => x).map((st) => {
        const ui = STAGE_STYLE[st!.key];
        let n = 0;
        return (
          <section key={st!.key} className="mt-5">
            <div className="flex break-after-avoid items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
              <h3 className={`text-lg font-bold ${ui.text}`}><span className={`me-2 inline-block h-3 w-3 rounded-sm align-middle ${ui.bar}`} />{st!.title} · {st!.range}</h3>
              <p className="text-xs text-slate-500">{st!.shown < st!.total ? `${st!.shown} of ${st!.total} statements` : `${st!.total} statement(s)`}</p>
            </div>
            <p className="mt-1 break-after-avoid text-xs text-slate-500">{ui.note}</p>
            <table className="mt-2 w-full text-sm">
              <thead><tr className="bg-brand-navy text-left text-xs uppercase tracking-wide text-white print:bg-brand-navy"><th className="w-[30%] px-3 py-1.5">Sub-topic</th><th className="px-3 py-1.5">{d.source === "CONTINUUM" ? "Ready to learn · platform skills" : "Platform skills"}</th></tr></thead>
              <tbody>{st!.topics.map((t) => (
                <tr key={t.name} className="border-b border-slate-200 align-top">
                  <td className="px-3 py-2 font-semibold text-slate-800">{t.name}</td>
                  <td className="px-3 py-2">
                    <ol className="space-y-1.5">{t.statements.map((x, i) => { n++; return (
                      <li key={i} className="break-inside-avoid">
                        {d.source === "CONTINUUM" ? <>
                          <p><span className="me-1 font-semibold text-slate-500">{n}.</span>{x.text}{x.standards.length > 0 && <span className="ms-1 text-[10px] text-slate-400">{x.standards.join(" ")}</span>}</p>
                          {x.skills.length > 0 && <div className="mt-0.5 flex flex-wrap gap-1 ps-4">{x.skills.map((k) => <SkillChip key={k.id} k={k} link={link} hub={hub} />)}</div>}
                        </> : <div className="flex items-center gap-2"><span className="font-semibold text-slate-500">{n}.</span>{x.skills.map((k) => <SkillChip key={k.id} k={k} link={link} hub={hub} />)}</div>}
                      </li>
                    ); })}</ol>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </section>
        );
      })}
      <div className="mt-4"><StatusLegend /></div>
    </ReportPage>
  );
}
