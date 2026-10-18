import { AppShell } from "@/components/app-shell";
import { AtAGlance, Callout, InfoTip, ReportHeader, ReportIntro, ReportSection, ReportSummary, ReportTable } from "@/components/report-kit";
import { growthTotals, signed, termReportSummary } from "@/lib/report-summaries";
import { GLOSSARY } from "@/lib/report-columns";
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
  // r72 audit: each student once (a student in two classes counted twice), "% met" out of the students with an expected growth
  const gt = growthTotals(growth);
  const tested = gt.tested, met = gt.met;
  const handledPct = d.totals.alertsOpen + d.totals.alertsHandled ? Math.round((100 * d.totals.alertsHandled) / (d.totals.alertsOpen + d.totals.alertsHandled)) : null;
  const box = "rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 break-inside-avoid";
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/admin", label: "Home" }} icon="🧾" title="English Department · End-of-Term Report" subtitle="Practice and work, MAP growth, the practice test and follow-up — one page for the school leadership."
        who="Al-Anjal Private Schools" when={`Prepared ${new Date().toISOString().slice(0, 10)}`} />
      <ReportIntro text="One page for the school leadership: practice, MAP growth, the practice test and follow-up." />
      <AtAGlance items={[
        { icon: "👩‍🎓", label: "Students", value: d.totals.students },
        { icon: "🙋", label: "Practised this week", value: `${d.totals.students ? Math.round((100 * d.totals.active) / d.totals.students) : 0}%`, meaning: "of students answered at least one question" },
        { icon: "🌱", label: "MAP growth met (Reading)", value: gt.pct === null ? "—" : `${gt.pct}%`, meaning: gt.measured ? `${met} of ${gt.measured} tested students` : "after the Winter / Spring MAP", tone: gt.pct === null ? "neutral" : gt.pct >= 50 ? "good" : "warn" },
        { icon: "✅", label: "Alerts handled", value: handledPct === null ? "—" : `${handledPct}%`, meaning: "alerts a teacher followed up", tone: handledPct === null ? "neutral" : handledPct >= 80 ? "good" : "warn" },
      ]} />
      <Callout kind="next" items={[
        ...d.weakest.filter((g) => g.skills.length).map((g) => `Grade ${g.grade}: reteach ${g.skills[0].name} (${g.skills[0].accuracy}%).`),
        d.classes.filter((c) => c.alertsOpen).length ? `${d.classes.filter((c) => c.alertsOpen).length} classes still have open alerts.` : null,
      ]} />
      <section className={`${box} mt-5`}>
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-navy">📈 MAP Reading Growth by Class <InfoTip text={GLOSSARY["MAP Reading Growth by Class"]} /></h2>
        {!tested ? <p className="mt-1 text-slate-600">No Winter / Spring scores yet.</p> : <div className="rk-box mt-2"><table className="min-w-full text-left text-sm"><thead><tr><th className="py-1">Class</th><th>Tested <InfoTip text={GLOSSARY["Tested (MAP growth)"]} /></th><th>Met growth <InfoTip text={GLOSSARY.Met} /></th><th>Average growth <InfoTip text={GLOSSARY.Growth} /></th><th>Expected <InfoTip text={GLOSSARY["Expected by now"]} /></th></tr></thead><tbody>{growth.filter((c) => c.tested).map((c) => <tr key={c.classId} className="border-b last:border-0"><td className="py-1.5 font-semibold">G{c.grade} · {c.className}</td><td>{c.tested}</td><td>{c.measured ? `${c.met} of ${c.measured} (${Math.round((100 * c.met) / c.measured)}%)` : "—"}</td><td dir="ltr">{signed(c.avgGrowth)}</td><td dir="ltr">{signed(c.avgProjected)}</td></tr>)}</tbody></table></div>}
      </section>
      {sim && (
        <section className={`${box} mt-5`}>
          <h2 className="flex items-center gap-2 text-lg font-bold text-brand-navy">🧭 {sim.title} (Reading) <InfoTip text={GLOSSARY["Practice test"]} /></h2>
          <div className="rk-box mt-2"><table className="min-w-full text-left text-sm"><thead><tr><th className="py-1">Class</th><th>Finished</th><th>Average</th><th>On track</th><th>Need support</th></tr></thead><tbody>{sim.classes.map((c) => <tr key={c.classId} className="border-b last:border-0"><td className="py-1.5 font-semibold">G{c.grade} · {c.className}</td><td>{c.done}/{c.members}</td><td>{c.avg ?? "—"}</td><td>{c.onTrack}</td><td>{c.offTrack}</td></tr>)}</tbody></table></div>
        </section>
      )}
      {/* r72: the main table cut to what the leadership needs (5 columns); the rest behind "More details" */}
      <ReportSection title="Classes This Week" icon="🏫" className="mt-5">
        <ReportTable label="Classes This Week"
          cols={[{ key: "c", label: "Class" }, { key: "t", label: "Teacher" }, { key: "p", label: "Practised (week)", num: true }, { key: "acc", label: "Accuracy", num: true }, { key: "ao", label: "Alerts open", num: true },
            { key: "s", label: "Students", num: true, more: true }, { key: "d", label: "Tasks done", num: true, more: true }, { key: "l", label: "Late", num: true, more: true }, { key: "h", label: "Handled", num: true, more: true }]}
          rows={d.classes.map((c) => ({
            id: c.classId, flag: c.activePct < 50 ? "warn" as const : undefined,
            sort: { c: `${c.grade} ${c.className}`, p: c.activePct, acc: c.accuracy, ao: c.alertsOpen, s: c.students, d: c.done, l: c.late, h: c.alertsHandled },
            cells: { c: <b className="text-brand-navy">G{c.grade} · {c.className}</b>, t: c.teacher, p: `${c.activePct}%`, acc: c.accuracy === null ? "—" : `${c.accuracy}%`, ao: c.alertsOpen, s: c.students, d: c.done, l: c.late, h: c.alertsHandled },
          }))} />
      </ReportSection>
      <section className="mt-5 grid gap-3 md:grid-cols-3">{d.weakest.map((g) => <div key={g.grade} className={box}><h3 className="flex items-center gap-1 font-bold text-brand-navy">Grade {g.grade}: skills to reteach <InfoTip text={GLOSSARY["Hardest skills"]} /></h3>{!g.skills.length ? <p className="text-sm text-slate-500">Not enough answers yet.</p> : <ol className="mt-1 list-decimal ps-5 text-sm">{g.skills.map((k) => <li key={k.skillId}>{k.name} — {k.accuracy}%</li>)}</ol>}</div>)}</section>
      <ReportSummary summary={termReportSummary(d, gt)} />
    </AppShell>
  );
}
