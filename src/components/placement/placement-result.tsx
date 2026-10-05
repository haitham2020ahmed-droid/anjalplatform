/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { DiagnosticSummary } from "../../server/assessment/diagnostic";

const LEVELS = ["Below grade level", "Approaching grade level", "At grade level", "Above grade level"];

/** Placement results in student-friendly words. Internal estimate, not an official test score. */
export function PlacementResult({ r, firstName }: { r: DiagnosticSummary; firstName: string }) {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Well done, {firstName}. Your starting point is ready.</h1>
      <p className="mt-2 text-lg text-slate-600">You answered {r.questions} questions. This is a starting point for practice, not a grade.</p>

      <section aria-labelledby="areas" className="mt-8 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h2 id="areas" className="text-xl font-bold text-brand-navy">Where you are in each area</h2>
        <ul className="mt-4 space-y-5">
          {r.domains.map((d) => {
            const idx = LEVELS.indexOf(d.level);
            return (
              <li key={d.domain}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-lg font-semibold text-slate-900">{d.label}</span>
                  <span className="text-slate-600">{d.level}</span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1" role="img" aria-label={`${d.label}: ${d.level}`}>
                  {LEVELS.map((l, i) => (
                    <span key={l} className={["h-2.5 first:rounded-l-full last:rounded-r-full", i <= idx ? (idx === 3 ? "bg-brand-gold" : "bg-brand-teal") : "bg-slate-200"].join(" ")} />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        {r.notMeasured.length > 0 && <p className="mt-4 text-sm text-slate-500">Not measured yet (more questions coming): {r.notMeasured.join(", ")}.</p>}
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Your strengths</h2>
          <p className="mt-2 text-slate-700">{r.strong.length ? r.strong.join(", ") : "Keep practising and your strengths will show here."}</p>
        </section>
        <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Areas to grow</h2>
          <p className="mt-2 text-slate-700">{r.growth.length ? r.growth.join(", ") : "No weak areas found. Great start."}</p>
        </section>
      </div>

      {r.startWith.length > 0 && (
        <section className="mt-6 rounded-2xl bg-brand-navy p-6 text-white">
          <h2 className="text-lg font-semibold">Start with these skills</h2>
          <ul className="mt-4 flex flex-wrap gap-3">
            {r.startWith.map((s) => (
              <li key={s.skillId}><a href={`/practice/${s.skillId}`} className="inline-block rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-navy hover:bg-brand-gold">{s.name}</a></li>
            ))}
          </ul>
        </section>
      )}
      {r.support.length > 0 && (
        <p className="mt-4 text-slate-700">Your teacher may also suggest some building-block practice: {r.support.map((s) => s.name).join(", ")}.</p>
      )}
      <a href="/student" className="mt-8 inline-block font-medium text-brand-teal hover:underline">Go to my units</a>
    </div>
  );
}
