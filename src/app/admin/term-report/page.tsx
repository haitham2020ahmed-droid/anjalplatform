import { AppShell } from "@/components/app-shell";
import { AtAGlance, Callout, ReportHeader } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { departmentSummary } from "@/server/insights/department";
import { growthReport } from "@/server/teacher/extras";
import { schoolResults, windows } from "@/server/map/sim";

export const metadata = { title: "End-of-term report" };

/** 🧾 One printable report for the school leadership: practice and work, MAP growth, practice test, follow-up. */
export default async function TermReportPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const [d, growth, ws] = await Promise.all([departmentSummary(repo, actor), growthReport(repo, actor, "READING"), windows(repo, actor)]);
  const sim = ws[0] ? await schoolResults(repo, actor, ws[0].id, "READING") : null;
  const tested = growth.reduce((t, c) => t + c.tested, 0), met = growth.reduce((t, c) => t + c.met, 0);
  const handledPct = d.totals.alertsOpen + d.totals.alertsHandled ? Math.round((100 * d.totals.alertsHandled) / (d.totals.alertsOpen + d.totals.alertsHandled)) : null;
  const box = "rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 break-inside-avoid";
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/admin", label: "Home" }} icon="🧾" title="English Department · End-of-Term Report" subtitle="Practice and work, MAP growth, the practice test and follow-up — one page for the school leadership."
        who="Al-Anjal Private Schools" when={`Prepared ${new Date().toISOString().slice(0, 10)}`} />
      <AtAGlance items={[
        { icon: "👩‍🎓", label: "Students", value: d.totals.students },
        { icon: "🙋", label: "Practised this week", value: `${d.totals.students ? Math.round((100 * d.totals.active) / d.totals.students) : 0}%`, meaning: "of students answered at least one question" },
        { icon: "🌱", label: "MAP growth met (Reading)", value: tested ? `${Math.round((100 * met) / tested)}%` : "—", meaning: tested ? `${met} of ${tested} tested students` : "after the Winter / Spring MAP", tone: tested ? (met / tested >= 0.5 ? "good" : "warn") : "neutral" },
        { icon: "✅", label: "Alerts handled", value: handledPct === null ? "—" : `${handledPct}%`, meaning: "alerts a teacher followed up", tone: handledPct === null ? "neutral" : handledPct >= 80 ? "good" : "warn" },
      ]} />
      <Callout kind="next" items={[
        ...d.weakest.filter((g) => g.skills.length).map((g) => `Grade ${g.grade}: reteach ${g.skills[0].name} (${g.skills[0].accuracy}%).`),
        d.classes.filter((c) => c.alertsOpen).length ? `${d.classes.filter((c) => c.alertsOpen).length} classes still have open alerts.` : null,
      ]} />
      <section className={`${box} mt-5`}>
        <h2 className="text-lg font-bold text-brand-navy">📈 MAP Reading Growth by Class</h2>
        {!tested ? <p className="mt-1 text-slate-600">No Winter / Spring scores yet.</p> : <div className="rk-box mt-2"><table className="min-w-full text-left text-sm"><thead><tr><th className="py-1">Class</th><th>Tested</th><th>Met growth</th><th>Average growth</th><th>Expected</th></tr></thead><tbody>{growth.filter((c) => c.tested).map((c) => <tr key={c.classId} className="border-b last:border-0"><td className="py-1.5 font-semibold">G{c.grade} · {c.className}</td><td>{c.tested}</td><td>{c.met} ({Math.round((100 * c.met) / c.tested)}%)</td><td>+{c.avgGrowth}</td><td>+{c.avgProjected ?? "—"}</td></tr>)}</tbody></table></div>}
      </section>
      {sim && (
        <section className={`${box} mt-5`}>
          <h2 className="text-lg font-bold text-brand-navy">🧭 {sim.title} (Reading)</h2>
          <div className="rk-box mt-2"><table className="min-w-full text-left text-sm"><thead><tr><th className="py-1">Class</th><th>Finished</th><th>Average</th><th>On track</th><th>Need support</th></tr></thead><tbody>{sim.classes.map((c) => <tr key={c.classId} className="border-b last:border-0"><td className="py-1.5 font-semibold">G{c.grade} · {c.className}</td><td>{c.done}/{c.members}</td><td>{c.avg ?? "—"}</td><td>{c.onTrack}</td><td>{c.offTrack}</td></tr>)}</tbody></table></div>
        </section>
      )}
      <section className={`${box} mt-5`}>
        <h2 className="text-lg font-bold text-brand-navy">🏫 Classes This Week</h2>
        <div className="rk-box mt-2"><table className="min-w-full text-left text-sm"><thead><tr><th className="py-1">Class</th><th>Teacher</th><th>Practised</th><th>Accuracy</th><th>Tasks done</th><th>Late</th><th>Alerts open / handled</th></tr></thead><tbody>{d.classes.map((c) => <tr key={c.classId} className="border-b last:border-0"><td className="py-1.5 font-semibold">G{c.grade} · {c.className}</td><td>{c.teacher}</td><td>{c.activePct}%</td><td>{c.accuracy === null ? "—" : `${c.accuracy}%`}</td><td>{c.done}</td><td>{c.late}</td><td>{c.alertsOpen} / {c.alertsHandled}</td></tr>)}</tbody></table></div>
      </section>
      <section className="mt-5 grid gap-3 md:grid-cols-3">{d.weakest.map((g) => <div key={g.grade} className={box}><h3 className="font-bold text-brand-navy">Grade {g.grade}: skills to reteach</h3>{!g.skills.length ? <p className="text-sm text-slate-500">Not enough answers yet.</p> : <ol className="mt-1 list-decimal ps-5 text-sm">{g.skills.map((k) => <li key={k.skillId}>{k.name} — {k.accuracy}%</li>)}</ol>}</div>)}</section>
    </AppShell>
  );
}
