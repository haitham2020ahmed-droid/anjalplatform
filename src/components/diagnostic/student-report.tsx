import type { StudentDiagnosticReport } from "@/server/diagnostic/report";
import { heat, LEVEL_CHIP, LEVEL_NAME } from "./class-report";

const STATUS = { Strength: "bg-emerald-100 text-emerald-900", Developing: "bg-amber-100 text-amber-900", "Needs support": "bg-rose-100 text-rose-900" } as const;

/** 📄 One student's Diagnostic report (staff, the student and the family see the same page). */
export function StudentDiagnosticView({ r, family }: { r: StudentDiagnosticReport; family: boolean }) {
  const first = r.student.name.split(" ")[0];
  return (
    <article className="mx-auto max-w-4xl space-y-5">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-navy to-indigo-800 p-6 text-white shadow-md print:shadow-none">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Al-Anjal Adaptive ELA · Diagnostic Report</p>
        <h1 className="mt-1 text-3xl font-extrabold">{r.student.name}</h1>
        <p className="text-white/80">{r.student.className} · Grade {r.grade} · {r.year} · taken {r.date}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-white/70">Score</p><p className="text-4xl font-extrabold tabular-nums">{r.pct}%</p><p className="text-xs text-white/70">{r.correct} of {r.total} correct</p></div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-white/70">Starting level</p><p className="mt-1"><span className={`rounded-full px-3 py-1 text-lg font-bold ${LEVEL_CHIP[r.level]}`}>{LEVEL_NAME[r.level]} Level</span></p><p className="mt-2 text-xs text-white/70">{r.tier.name.replace(/^Tier \d · /, "")} · {r.tier.sub}</p></div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-white/70">MAP Reading</p><p className="text-3xl font-extrabold tabular-nums">{r.rit ?? "—"}</p><p className="text-xs text-white/70">RIT (Fall)</p></div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-white/70">Reading fluency</p><p className="text-3xl font-extrabold tabular-nums">{r.wcpm?.value ?? "—"}</p><p className="text-xs text-white/70">{r.wcpm ? `words / minute · goal ~${r.wcpm.benchmark}` : "not checked yet"}</p></div>
        </div>
      </header>

      {r.note && <p className="rounded-3xl bg-amber-50 px-5 py-4 text-amber-950 ring-1 ring-amber-200">💬 <b>From the teacher:</b> {r.note}</p>}

      <section className="grid items-start gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
          <h2 className="text-lg font-bold text-emerald-900">🌟 {family ? `${first}’s strengths` : "Strengths"}</h2>
          {r.strengths.length ? <ul className="mt-2 list-disc space-y-1 ps-5 text-emerald-950">{r.strengths.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-2 text-emerald-950">Strengths will show as the scores grow — every question practised counts.</p>}
        </div>
        <div className="rounded-3xl bg-rose-50 p-5 ring-1 ring-rose-200">
          <h2 className="text-lg font-bold text-rose-900">🎯 Next steps</h2>
          {r.needs.length ? <ul className="mt-2 space-y-2 text-rose-950">{r.needs.map((n) => <li key={n.code}><b>{n.label}</b> <span className="font-mono text-xs">({n.code}, {n.pct}%)</span><span className="block text-sm">{n.objective}</span><span className="block text-sm text-rose-800">Try: {n.tip}</span></li>)}</ul> : <p className="mt-2 text-rose-950">No weak standard — keep going with the curriculum plan.</p>}
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:shadow-none">
        <h2 className="text-lg font-bold text-brand-navy">Strands</h2>
        <div className="mt-3 space-y-3">
          {r.strands.map((x) => (
            <div key={x.strand}>
              <div className="flex justify-between text-sm"><span className="font-semibold text-slate-800">{x.label}</span><span className="tabular-nums"><b>{x.pct}%</b>{x.classPct !== null && <span className="text-slate-500"> · class {x.classPct}%</span>}</span></div>
              <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full ${x.pct >= 75 ? "bg-emerald-500" : x.pct >= 60 ? "bg-sky-500" : x.pct >= 40 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${x.pct}%` }} />
                {x.classPct !== null && <span className="absolute inset-y-0 w-0.5 bg-slate-800" style={{ left: `${x.classPct}%` }} title={`Class average ${x.classPct}%`} />}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">The black mark is the class average.</p>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:shadow-none">
        <h2 className="text-lg font-bold text-brand-navy">Standards</h2>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2">Standard</th><th>Skill</th><th className="text-center">Correct</th><th className="text-center">Score</th><th className="text-center">Class</th><th>Status</th></tr></thead>
          <tbody>
            {r.standards.map((x) => (
              <tr key={x.code} className="border-b border-slate-100">
                <td className="py-2 font-mono text-xs font-bold text-brand-teal">{x.code}</td><td className="text-slate-800">{x.label}</td>
                <td className="text-center tabular-nums">{x.correct}/{x.total}</td>
                <td className="text-center"><span className={`rounded px-2 py-0.5 font-bold tabular-nums ${heat(x.pct)}`}>{Math.round(x.pct)}%</span></td>
                <td className="text-center tabular-nums text-slate-500">{x.classPct === null ? "—" : `${Math.round(x.classPct)}%`}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[x.status]}`}>{x.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-3xl bg-sky-50 p-5 text-sky-950 ring-1 ring-sky-200">
        <h2 className="text-lg font-bold">🏠 {family ? "How to help at home" : "What happens next"}</h2>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
          <li>The platform now starts {first} at <b>{LEVEL_NAME[r.level]} Level</b>; the questions get easier or harder with every answer.</li>
          <li>{family ? `Ask ${first} to open “Today’s plan” on the platform for 15 minutes a day.` : "The weakest standards are in the class support plan and the student’s curriculum plan."}</li>
          <li>{family ? "Read together for 15 minutes and ask: What is the main idea? How do you know?" : "A Weekly Check keeps the level up to date between MAP tests."}</li>
        </ul>
      </section>
      <p className="text-center text-xs text-slate-500">Levels: Above ≥ {r.bands.above}% · On {r.bands.on}–{r.bands.above - 1}% · Below &lt; {r.bands.on}%{r.rapid >= r.total * 0.3 ? ` · ⚡ ${r.rapid} answers were very fast, so this score may be lower than ${first}’s real level.` : ""}</p>
    </article>
  );
}
