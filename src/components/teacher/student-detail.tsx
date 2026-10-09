/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { StudentDetail } from "../../server/teacher/queries";

/** One student for the teacher: placement, skills, recent answers, and the engine's decisions (audit trail). */
export function StudentDetailView({ d, classHref }: { d: StudentDetail; classHref: string }) {
  return (
    <div>
      <a href={classHref} className="text-sm font-medium text-brand-teal hover:underline">Back to class</a>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-navy">{d.name}</h1>
      <p className="text-slate-600">Grade {d.grade}{d.className ? `, class ${d.className}` : ""}, student number {d.studentNumber}</p>

      {d.alerts.length > 0 && (
        <section className="mt-6 space-y-2">
          {d.alerts.map((a) => (
            <div key={a.id} className="rounded-xl border-l-4 border-amber-400 bg-white p-4 ring-1 ring-slate-200">
              <p className="font-semibold text-brand-navy">{a.message}</p>
              <p className="mt-1 text-sm text-slate-600">Next step: {a.nextAction}</p>
            </div>
          ))}
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Placement</h2>
          {d.placement ? (
            <>
              <p className="mt-1 text-slate-700">{d.placement.proficiency}, taken {d.placement.takenAt.slice(0, 10)} ({d.placement.questions} questions)</p>
              <ul className="mt-3 divide-y divide-slate-100">{d.placement.domains.map((x) => <li key={x.domain} className="flex justify-between py-1.5"><span>{x.label}</span><span className="text-slate-600">{x.level}</span></li>)}</ul>
            </>
          ) : <p className="mt-1 text-slate-600">Not taken yet.</p>}
        </section>
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Skills Practised</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {d.skills.map((s) => (
              <li key={s.skillId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-1.5">
                <span>{s.name}</span>
                <span className="tabular-nums text-slate-600">{s.band} {s.score}, {s.attempts} answers, {s.accuracyPct}%</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">Recent Answers</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500"><tr>{["When", "Skill", "Question", "Answer", "Result", "Time"].map((h) => <th key={h} scope="col" className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {d.recent.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums">{r.at.slice(5, 16).replace("T", " ")}</td>
                  <td className="px-2 py-2">{r.skill}</td>
                  <td className="max-w-md px-2 py-2">{r.stem}</td>
                  <td className="px-2 py-2">{r.answer}</td>
                  <td className="px-2 py-2">{r.correct ? <span className="font-semibold text-teal-700">Correct</span> : <span className="font-semibold text-amber-800">Incorrect</span>}{r.rapid ? <span className="block text-xs text-slate-500">very fast</span> : null}</td>
                  <td className="px-2 py-2 tabular-nums">{r.seconds}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">Why the Platform Chose Each Question</h2>
        <p className="text-sm text-slate-500">Every adaptive decision is recorded: ability before and after (θ), the question&apos;s difficulty, and the reason.</p>
        <ol className="mt-3 space-y-2">
          {d.decisions.map((x, i) => (
            <li key={i} className="rounded-lg bg-slate-50 p-3 text-sm">
              <span className="tabular-nums text-slate-500">{x.at.slice(5, 16).replace("T", " ")}</span>{" "}
              {x.correct === null ? null : x.correct ? <span className="font-semibold text-teal-700">correct</span> : <span className="font-semibold text-amber-800">incorrect</span>}{" "}
              <span className="tabular-nums text-slate-600">θ {x.fromTheta} → {x.toTheta}{x.masteryAfter !== null ? `, mastery ${x.masteryBefore} → ${x.masteryAfter}` : ""}</span>
              <span className="block text-slate-800">{x.reason}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
