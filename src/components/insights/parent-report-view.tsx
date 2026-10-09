import type { ParentReport } from "@/server/insights/parent-report";

/** 👪 The parent report, in plain words (English). Used by the teacher (preview) and the parent. */
export function ParentReportView({ r }: { r: ParentReport }) {
  const box = "rounded-2xl bg-white p-5 ring-1 ring-slate-200 break-inside-avoid";
  const list = (xs: string[], empty: string) => (xs.length ? <ul className="mt-2 list-disc space-y-1 ps-6">{xs.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-2 text-slate-500">{empty}</p>);
  return (
    <article className="space-y-4 text-slate-800">
      <header className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-6 text-white">
        <p className="text-sm text-white/80">Progress report · {r.date}</p>
        <h1 className="text-3xl font-extrabold"><bdi>{r.name}</bdi></h1>
        <p className="text-white/85">Grade {r.grade}{r.className ? ` · ${r.className}` : ""}</p>
      </header>
      <section className={box}><p className="text-lg">{r.summary.en}</p>
        {r.share.note && <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-teal-900">💬 Teacher: {r.share.note}</p>}</section>
      <section className={`${box} grid gap-3 sm:grid-cols-4`}>
        {([["Questions answered", String(r.practice.answers)], ["Correct", r.practice.accuracy === null ? "—" : `${r.practice.accuracy}%`], ["Practice this month", `${r.practice.minutesMonth} min`], ["Tasks finished", `${r.practice.tasksDone}${r.practice.tasksLate ? ` (${r.practice.tasksLate} late)` : ""}`]] as const).map(([en, v]) => (
          <div key={en} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{en}</p><p className="text-2xl font-extrabold text-brand-navy">{v}</p></div>
        ))}
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <section className={box}><h2 className="font-bold text-brand-navy">✅ Skills Completed</h2>{list(r.completed.slice(0, 12), "None yet — keep practising!")}</section>
        <section className={box}><h2 className="font-bold text-brand-navy">💪 Strengths</h2>{list(r.strengths, "We will see them soon.")}</section>
        <section className={box}><h2 className="font-bold text-brand-navy">🎯 Practise Next</h2>{list(r.practiseNext, "Nothing urgent.")}</section>
      </div>
      {r.map.length > 0 && (
        <section className={box}><h2 className="font-bold text-brand-navy">🗺️ MAP Test</h2>
          <ul className="mt-2 space-y-1">{r.map.map((m) => <li key={m.subject}><b>{m.subject}</b>: Fall {m.fall ?? "—"}{m.latest ? ` → ${m.latestTerm} ${m.latest}` : ""}{m.target ? ` · Spring goal ${m.target}` : ""} — {m.status}</li>)}</ul>
          <p className="mt-2 text-xs text-slate-500">The MAP score (RIT) grows during the year. The goal is the score NWEA expects by Spring.</p>
        </section>
      )}
      {r.mapPlans.length > 0 && (
        <section className={box}><h2 className="font-bold text-brand-navy">📋 MAP Plan</h2>
          {r.mapPlans.map((pl) => (
            <div key={pl.id} className="mt-2">
              <p className="font-semibold">{pl.subject} · {pl.term}{pl.goal ? ` · Spring goal ${pl.goal}` : ""}</p>
              <ul className="mt-1 space-y-1">{pl.items.map((i) => <li key={i.name}>{i.icon} <b>{i.name}</b>{i.skills.length ? `: ${i.skills.join(", ")}` : ""} — {i.done ? "✅ done" : i.progress !== null ? `${i.progress}%` : "to start"}</li>)}</ul>
            </div>
          ))}
          <p className="mt-2 text-xs text-slate-500">The plan practises the MAP areas your child needs most, at the right level.</p>
        </section>
      )}
      {r.comments.length > 0 && (
        <section className={box}><h2 className="font-bold text-brand-navy">💬 Teacher Comments</h2>
          <ul className="mt-2 space-y-2">{r.comments.map((c, i) => <li key={i}><span className="text-xs text-slate-500">{c.date}</span><p className="whitespace-pre-line">{c.body}</p></li>)}</ul>
        </section>
      )}
      {r.badges.length > 0 && <section className={box}><h2 className="font-bold text-brand-navy">🏅 Badges</h2><p className="mt-2 text-2xl">{r.badges.map((b) => <span key={b.name} title={b.name} className="me-2">{b.icon}</span>)}</p></section>}
    </article>
  );
}
