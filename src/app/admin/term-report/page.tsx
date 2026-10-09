import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
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
  const box = "rounded-2xl bg-white p-5 ring-1 ring-slate-200 break-inside-avoid";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🧾" title="English department · end-of-term report" subtitle={`Prepared ${new Date().toISOString().slice(0, 10)} · Al-Anjal Private Schools`}><PrintButton /></PageHeader>
      <section className="grid gap-3 md:grid-cols-4">
        {[["Students", d.totals.students], ["Practised this week", `${d.totals.students ? Math.round((100 * d.totals.active) / d.totals.students) : 0}%`], ["MAP growth met (Reading)", tested ? `${Math.round((100 * met) / tested)}%` : "—"], ["Alerts handled", handledPct === null ? "—" : `${handledPct}%`]].map(([l, v]) => <div key={String(l)} className={box}><p className="text-xs text-slate-500">{l}</p><p className="text-3xl font-extrabold text-brand-navy">{v}</p></div>)}
      </section>
      <section className={`${box} mt-5`}>
        <h2 className="text-lg font-bold text-brand-navy">📈 MAP Reading growth by class</h2>
        {!tested ? <p className="mt-1 text-slate-600">No Winter / Spring scores yet.</p> : <table className="mt-2 min-w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-1">Class</th><th>Tested</th><th>Met growth</th><th>Average growth</th><th>Expected</th></tr></thead><tbody>{growth.filter((c) => c.tested).map((c) => <tr key={c.classId} className="border-b last:border-0"><td className="py-1.5 font-semibold">G{c.grade} · {c.className}</td><td>{c.tested}</td><td>{c.met} ({Math.round((100 * c.met) / c.tested)}%)</td><td>+{c.avgGrowth}</td><td>+{c.avgProjected ?? "—"}</td></tr>)}</tbody></table>}
      </section>
      {sim && (
        <section className={`${box} mt-5`}>
          <h2 className="text-lg font-bold text-brand-navy">🧭 {sim.title} (Reading)</h2>
          <table className="mt-2 min-w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-1">Class</th><th>Finished</th><th>Average</th><th>On track</th><th>Need support</th></tr></thead><tbody>{sim.classes.map((c) => <tr key={c.classId} className="border-b last:border-0"><td className="py-1.5 font-semibold">G{c.grade} · {c.className}</td><td>{c.done}/{c.members}</td><td>{c.avg ?? "—"}</td><td>{c.onTrack}</td><td>{c.offTrack}</td></tr>)}</tbody></table>
        </section>
      )}
      <section className={`${box} mt-5`}>
        <h2 className="text-lg font-bold text-brand-navy">🏫 Classes this week</h2>
        <table className="mt-2 min-w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-1">Class</th><th>Teacher</th><th>Practised</th><th>Accuracy</th><th>Tasks done</th><th>Late</th><th>Alerts open / handled</th></tr></thead><tbody>{d.classes.map((c) => <tr key={c.classId} className="border-b last:border-0"><td className="py-1.5 font-semibold">G{c.grade} · {c.className}</td><td>{c.teacher}</td><td>{c.activePct}%</td><td>{c.accuracy === null ? "—" : `${c.accuracy}%`}</td><td>{c.done}</td><td>{c.late}</td><td>{c.alertsOpen} / {c.alertsHandled}</td></tr>)}</tbody></table>
      </section>
      <section className="mt-5 grid gap-3 md:grid-cols-3">{d.weakest.map((g) => <div key={g.grade} className={box}><h3 className="font-bold text-brand-navy">Grade {g.grade}: skills to reteach</h3>{!g.skills.length ? <p className="text-sm text-slate-500">Not enough answers yet.</p> : <ol className="mt-1 list-decimal ps-5 text-sm">{g.skills.map((k) => <li key={k.skillId}>{k.name} — {k.accuracy}%</li>)}</ol>}</div>)}</section>
    </AppShell>
  );
}
