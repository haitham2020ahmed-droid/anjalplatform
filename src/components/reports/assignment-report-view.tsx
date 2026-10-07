import type { AssignmentReport } from "@/server/student/assigned";

/** Completion report for one assigned skill (student and teacher see the same report). */
export function AssignmentReportView({ r, backHref, backLabel }: { r: AssignmentReport; backHref: string; backLabel: string }) {
  const stat = (label: string, value: string) => <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{label}</dt><dd className="text-xl font-bold text-brand-navy">{value}</dd></div>;
  return (
    <div>
      <p><a href={backHref} className="text-brand-teal hover:underline">← {backLabel}</a></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">{r.skill}</h1>
      <p className="mt-1 text-slate-600">{r.student} · {r.standard ?? "No standard"} · {r.status === "COMPLETED" ? `completed ${r.completedAt?.slice(0, 10) ?? ""}` : "not completed yet"}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Score (mastery)", `${r.score}%`)}{stat("Mastery level", r.masteryLevel)}{stat("Accuracy", r.accuracy === null ? "—" : `${r.accuracy}%`)}
        {stat("Questions answered", String(r.answered))}{stat("Correct answers", String(r.correct))}{stat("Time spent", `${r.timeSpentMin} min`)}
      </dl>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-teal-50 p-4 ring-1 ring-teal-200"><h2 className="font-semibold text-teal-900">Strengths</h2>
          {r.strengths.length ? <ul className="mt-1 list-disc ps-5 text-sm text-teal-900">{r.strengths.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-1 text-sm text-teal-900">Answer a few more questions to see your strengths.</p>}</section>
        <section className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200"><h2 className="font-semibold text-amber-900">Needs practice</h2>
          {r.needsPractice.length ? <ul className="mt-1 list-disc ps-5 text-sm text-amber-900">{r.needsPractice.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-1 text-sm text-amber-900">Nothing stands out. Good work!</p>}</section>
      </div>
      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200"><h2 className="font-semibold text-brand-navy">Recommended next step</h2><p className="mt-1 text-slate-700">{r.nextStep}</p></section>
    </div>
  );
}
