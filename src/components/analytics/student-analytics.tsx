/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { StudentAnalytics } from "../../server/analytics/reports";
import { DOMAIN_LABEL } from "../../server/assessment/diagnostic";
import { LineChart } from "../charts/line-chart";

function M({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-slate-500">{label}</dt><dd className="text-xl font-bold tabular-nums text-brand-navy">{value}</dd></div>;
}

/** Student analytics (brief §11), internal measures; imported MAP results shown separately. */
export function StudentAnalyticsView({ a }: { a: StudentAnalytics }) {
  const g = a.growth;
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="text-lg font-bold text-brand-navy">Progress: {a.period}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4 lg:grid-cols-6">
        <M label="Questions" value={String(a.questions)} />
        <M label="Correct / incorrect" value={`${a.correct} / ${a.incorrect}`} />
        <M label="Accuracy" value={a.accuracyPct === null ? "–" : `${a.accuracyPct}%`} />
        <M label="Learning time" value={`${a.minutes} min`} />
        <M label="Avg time per question" value={a.avgSeconds === null ? "–" : `${a.avgSeconds}s`} />
        <M label="Sessions completed" value={String(a.sessions)} />
        <M label="Longest session" value={`${a.longestSessionMinutes} min`} />
        <M label="Skills practised" value={String(a.skillsAttempted)} />
        <M label="Mastered / developing" value={`${a.skillsMastered} / ${a.skillsDeveloping}`} />
        <M label="Needing support" value={String(a.skillsNeedingIntervention)} />
        <M label="Ability (θ)" value={a.ability === null ? "–" : String(a.ability)} />
        <M label="Reading range" value={a.readingRange ?? "After placement"} />
        <M label="Best streak correct" value={String(a.streakCorrect.longest)} />
        <M label="Current streak" value={a.streakCorrect.current ? `${a.streakCorrect.current} correct` : a.streakIncorrect.current ? `${a.streakIncorrect.current} incorrect` : "–"} />
        <M label="Highest level correct" value={a.highestLevelCorrect ? `Level ${a.highestLevelCorrect}` : "–"} />
        <M label="Curriculum progress" value={`${a.curriculumProgressPct}%`} />
      </dl>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          <h3 className="font-semibold text-brand-navy">Mastery by month</h3>
          <LineChart title="Average mastery by month" labels={g.series.map((p) => p.label)} series={[{ name: "Average mastery", color: "#1f3a68", points: g.series.map((p) => p.mastery) }]} height={200} />
          <p className="text-sm text-slate-600">Start {g.start ?? "–"}, now {g.current ?? "–"}{g.growth !== null ? `, growth ${g.growth > 0 ? "+" : ""}${g.growth}${g.growthPct !== null ? ` (${g.growthPct > 0 ? "+" : ""}${g.growthPct}%)` : ""}` : ""}.</p>
        </div>
        <div>
          <h3 className="font-semibold text-brand-navy">Growth by skill</h3>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {g.skills.map((s) => <li key={s.skillId} className="flex justify-between py-1.5"><span>{s.name}</span><span className="tabular-nums">{s.start} → {s.now} ({s.growth >= 0 ? "+" : ""}{s.growth})</span></li>)}
          </ul>
          {g.domains.length > 0 && <p className="mt-3 text-sm text-slate-600">By area: {g.domains.map((d) => `${DOMAIN_LABEL[d.domain] ?? d.domain} ${d.growth >= 0 ? "+" : ""}${d.growth}`).join(", ")}</p>}
          <p className="mt-3 text-sm text-slate-600">Unit progress: {a.unitProgress.map((u) => `U${u.unit} ${u.pct}%`).join(", ")}</p>
        </div>
      </div>
      <div className="mt-6 rounded-xl bg-slate-50 p-4">
        <h3 className="font-semibold text-brand-navy">Imported MAP Growth results</h3>
        {a.importedMap.length === 0 ? <p className="mt-1 text-sm text-slate-600">No MAP results have been imported for this student.</p> : (
          <ul className="mt-1 text-sm">{a.importedMap.map((m, i) => <li key={i}>{m.testDate}: {m.subject}{m.goalArea ? `, ${m.goalArea}` : ""}, RIT {m.rit}{m.percentile !== null ? `, percentile ${m.percentile}` : ""}</li>)}</ul>
        )}
        <p className="mt-1 text-xs text-slate-500">Official values from imported files only; never calculated by this platform.</p>
      </div>
    </section>
  );
}
