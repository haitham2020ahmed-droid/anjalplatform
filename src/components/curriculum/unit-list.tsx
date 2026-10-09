/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { StudentCurriculum } from "../../server/queries/student-curriculum";

/** Grade overview: the book, then the six units in order with progress and the texts read in each. */
export function UnitList({ curriculum, firstName, needsPlacement = false }: { curriculum: StudentCurriculum; firstName: string; needsPlacement?: boolean }) {
  const c = curriculum;
  return (
    <div>
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Welcome back, {firstName}</h1>
        <p className="mt-1 text-lg text-slate-600">Grade {c.grade} English, {c.bookTitle}{c.edition ? ` (${c.edition})` : ""}</p>
      </header>
      {needsPlacement && (
        <a href="/student/placement" className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-brand-navy p-5 text-white hover:bg-brand-purple">
          <span><span className="block text-lg font-semibold">Take the Diagnostic Test</span><span className="text-white/80">About 50 questions. It shows your strengths and starts your practice at the right level.</span></span>
          <span className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy">Start the check</span>
        </a>
      )}
      <ol className="mt-8 space-y-4">
        {c.units.map((u) => (
          <li key={u.unitId}>
            <a href={`/student/unit/${u.unitId}`}
              className={[
                "group grid gap-4 rounded-2xl border-l-8 bg-white p-5 shadow-sm ring-1 ring-slate-200 hover:ring-brand-teal md:grid-cols-[8rem_minmax(0,1fr)_14rem] md:items-center",
                u.isCurrent ? "border-brand-teal" : u.progressPct >= 70 ? "border-brand-gold" : "border-slate-300",
              ].join(" ")}>
              <div>
                <span className="block text-sm text-slate-500">Unit</span>
                <span className="block text-4xl font-bold leading-none text-brand-navy">{u.number}</span>
                {u.isCurrent && <span className="mt-2 inline-block rounded-md bg-brand-teal/15 px-2 py-0.5 text-sm font-medium text-teal-800">You are here</span>}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">Texts you read</p>
                <ul className="mt-1 space-y-0.5 text-slate-800">
                  {u.lessons.slice(0, 3).map((l) => <li key={l} className="truncate">{l}</li>)}
                </ul>
              </div>
              <div>
                <div className="h-2.5 w-full rounded-full bg-slate-200">
                  <div className={["h-2.5 rounded-full", u.progressPct >= 70 ? "bg-brand-gold" : "bg-brand-teal"].join(" ")} style={{ width: `${Math.max(u.progressPct, 2)}%` }} />
                </div>
                <p className="mt-1.5 text-sm text-slate-600">{u.proficientOrBetter} of {u.skills} skills at Proficient{u.mastered ? `, ${u.mastered} mastered` : ""}</p>
              </div>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
