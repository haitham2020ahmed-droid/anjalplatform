import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { schoolAi } from "@/server/predict/school-ai";

export const metadata = { title: "School AI" };

/** 🏫 School AI dashboard: trends, growth predictions, risk by grade, outcomes, what works, and model quality. */
export default async function SchoolAiPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const d = await schoolAi(repo, actor.schoolId!);
  const box = "rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  const t = d.trend, min = Math.min(-0.5, ...t.map((x) => x.theta)), max = Math.max(0.5, ...t.map((x) => x.theta));
  const X = (k: number) => 20 + (t.length > 1 ? (k * 560) / (t.length - 1) : 280), Y = (v: number) => 110 - ((v - min) / (max - min || 1)) * 90;
  const rm = d.models.risk.metrics as { n?: number; aucExpert?: number; aucLearned?: number; useLearned?: boolean } | null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🏫" title="School AI"
        subtitle="Where the school is going: weekly trends, MAP growth predictions and risk by grade, learning outcomes, which interventions work, and how well the platform's own predictions and recommendations perform." />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={box}><p className="text-xs text-slate-500">Skills mastered (all students)</p><p className="text-3xl font-extrabold text-brand-navy">{d.outcomes.mastered}</p></div>
        <div className={box}><p className="text-xs text-slate-500">Practised in the last 14 days</p><p className="text-3xl font-extrabold text-brand-navy">{d.outcomes.practiced14}<span className="text-base font-normal text-slate-500"> / {d.outcomes.students}</span></p></div>
        <div className={box}><p className="text-xs text-slate-500">Weekly Checks (30 days)</p><p className="text-3xl font-extrabold text-brand-navy">{d.outcomes.weeklyChecks}</p><p className="text-xs text-slate-500">{d.outcomes.weeklyAvgChange !== null ? `average ${d.outcomes.weeklyAvgChange >= 0 ? "+" : ""}${d.outcomes.weeklyAvgChange} RIT` : ""}</p></div>
        <div className={box}><p className="text-xs text-slate-500">Advice that worked (when followed)</p><p className="text-3xl font-extrabold text-emerald-700">{d.advice.improvedWhenFollowedPct ?? "—"}{d.advice.improvedWhenFollowedPct !== null ? "%" : ""}</p><p className="text-xs text-slate-500">{d.advice.evaluated} checked recommendations</p></div>
      </section>
      <section className={`mt-4 ${box}`}>
        <h2 className="font-bold text-brand-navy">📈 School trend (average ability, weekly)</h2>
        {t.length >= 2 ? <svg viewBox="0 0 600 130" className="mt-2 h-36 w-full" role="img" aria-label="Average ability by week"><line x1="20" x2="580" y1={Y(0)} y2={Y(0)} stroke="#e2e8f0" /><polyline fill="none" stroke="#4f46e5" strokeWidth="2.5" points={t.map((x, k) => `${X(k)},${Y(x.theta)}`).join(" ")} />{t.map((x, k) => <g key={x.week}><circle cx={X(k)} cy={Y(x.theta)} r="3.5" fill="#4f46e5" /><text x={X(k)} y="126" fontSize="10" textAnchor="middle" fill="#64748b">{x.week.slice(5)}</text></g>)}</svg> : <p className="mt-2 text-sm text-slate-500">The trend appears after two weekly updates (Learning Engine).</p>}
      </section>
      <section className={`mt-4 ${box}`}>
        <h2 className="font-bold text-brand-navy">🔮 Growth predictions and risk by grade</h2>
        <table className="mt-2 w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1">Grade</th><th>Students</th><th>Predicted next MAP (avg)</th><th>Goal (avg)</th><th>On track (50%+)</th><th>High risk</th><th>Medium risk</th></tr></thead>
          <tbody>{d.grades.map((g) => <tr key={g.grade} className="border-b last:border-0"><td className="py-1.5 font-semibold">Grade {g.grade}</td><td>{g.students}</td><td>{g.avgPredicted ?? "—"}</td><td>{g.avgGoal ?? "—"}</td><td>{g.withGoal ? `${g.onTrack} / ${g.withGoal}` : "—"}</td><td className="font-semibold text-red-700">{g.high}</td><td className="text-amber-700">{g.medium}</td></tr>)}</tbody></table>
      </section>
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className={box}>
          <h2 className="font-bold text-brand-navy">🎯 Intervention effectiveness</h2>
          {d.interventions.length ? <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th>Skill</th><th>Groups</th><th>Improved</th><th>Avg change</th></tr></thead><tbody>{d.interventions.map((r) => <tr key={r.skillName} className="border-t"><td className="py-1">{r.skillName}</td><td>{r.groups}</td><td>{r.improvedPct}%</td><td>{r.avgChange > 0 ? "+" : ""}{r.avgChange}</td></tr>)}</tbody></table> : <p className="mt-2 text-sm text-slate-500">No finished intervention groups yet.</p>}
        </article>
        <article className={box}>
          <h2 className="font-bold text-brand-navy">🔁 The platform learning from its results</h2>
          <p className="mt-2 text-sm"><b>Early-warning model:</b> {d.models.risk.source === "LEARNED" ? "learned from this school's MAP outcomes" : "expert weights (it re-fits itself once 50+ students have a MAP outcome)"}{rm?.n ? ` · ${rm.n} examples · ranking quality (AUC) expert ${rm.aucExpert ?? "—"} vs learned ${rm.aucLearned ?? "—"}` : ""}.</p>
          <p className="mt-2 text-sm"><b>Learning-path steps</b> (weights learned from which advice improved mastery): {Object.entries(d.models.actions).map(([k, v]) => `${k.toLowerCase()} ×${v}`).join(" · ")}</p>
          <p className="mt-2 text-sm"><b>Recommendations:</b> {d.advice.made} made in 60 days · followed {d.advice.followedPct ?? "—"}% · improved {d.advice.improvedPct ?? "—"}%.</p>
          <p className="mt-2 text-xs text-slate-500">Questions whose data shows they mislead students are held back from practice automatically (Question Quality).</p>
        </article>
      </section>
    </AppShell>
  );
}
