import { AppShell } from "@/components/app-shell";
import { AtAGlance, Callout, InfoTip, ReportHeader, ReportIntro, ReportSection, ReportSummary, ReportTable } from "@/components/report-kit";
import { growthTotals, signed, termReportSummary } from "@/lib/report-summaries";
import { GLOSSARY } from "@/lib/report-columns";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { departmentSummary } from "@/server/insights/department";
import { growthReport } from "@/server/teacher/extras";
import { schoolResults, windows } from "@/server/map/sim";
import { getT } from "@/i18n/server";

export const metadata = { title: "End-of-term report" };

/** 🧾 One printable report for the school leadership: practice and work, MAP growth, practice test, follow-up. */
export default async function TermReportPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
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
        who="Al-Anjal Private Schools" when={t("Prepared {date}", { date: new Date().toISOString().slice(0, 10) })} />
      <ReportIntro text="One page for the school leadership: practice, MAP growth, the practice test and follow-up." />
      <AtAGlance items={[
        { icon: "👩‍🎓", label: "Students", value: d.totals.students },
        { icon: "🙋", label: "Practised this week", value: `${d.totals.students ? Math.round((100 * d.totals.active) / d.totals.students) : 0}%`, meaning: "of students answered at least one question" },
        { icon: "🌱", label: "MAP growth met (Reading)", value: gt.pct === null ? "—" : `${gt.pct}%`, meaning: gt.measured ? t("{m} of {n} tested students", { m: met, n: gt.measured }) : "after the Winter / Spring MAP", tone: gt.pct === null ? "neutral" : gt.pct >= 50 ? "good" : "warn" },
        { icon: "✅", label: "Alerts handled", value: handledPct === null ? "—" : `${handledPct}%`, meaning: "alerts a teacher followed up", tone: handledPct === null ? "neutral" : handledPct >= 80 ? "good" : "warn" },
      ]} />
      <Callout kind="next" items={[
        // round 4: translatable templates (the skill name stays English content)
        ...d.weakest.filter((g) => g.skills.length).map((g) => <span key={g.grade}>{t("Grade {g}: reteach", { g: g.grade })} <span data-content lang="en">{g.skills[0].name}</span> {t("({n}% correct).", { n: g.skills[0].accuracy })}</span>),
        d.classes.filter((c) => c.alertsOpen).length ? t("{n} classes still have open alerts.", { n: d.classes.filter((c) => c.alertsOpen).length }) : null,
      ]} />
      <section className={`${box} mt-5`}>
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-navy">📈 {t("MAP Reading Growth by Class")} <InfoTip text={GLOSSARY["MAP Reading Growth by Class"]} /></h2>
        {!tested ? <p className="mt-1 text-slate-600">{t("No Winter / Spring scores yet.")}</p> : <div className="rk-box mt-2"><table className="min-w-full text-start text-sm"><thead><tr><th className="py-1">{t("Class")}</th><th>{t("Tested")} <InfoTip text={GLOSSARY["Tested (MAP growth)"]} /></th><th>{t("Met growth")} <InfoTip text={GLOSSARY.Met} /></th><th>{t("Average growth")} <InfoTip text={GLOSSARY.Growth} /></th><th>{t("Expected")} <InfoTip text={GLOSSARY["Expected by now"]} /></th></tr></thead><tbody>{growth.filter((c) => c.tested).map((c) => <tr key={c.classId} className="border-b last:border-0"><td className="py-1.5 font-semibold"><bdi>G{c.grade} · {c.className}</bdi></td><td>{c.tested}</td><td>{c.measured ? t("{m} of {n} ({p}%)", { m: c.met, n: c.measured, p: Math.round((100 * c.met) / c.measured) }) : "—"}</td><td dir="ltr">{signed(c.avgGrowth)}</td><td dir="ltr">{signed(c.avgProjected)}</td></tr>)}</tbody></table></div>}
      </section>
      {sim && (
        <section className={`${box} mt-5`}>
          <h2 className="flex items-center gap-2 text-lg font-bold text-brand-navy">🧭 <span data-content lang="en">{sim.title}</span> ({t("Reading")}) <InfoTip text={GLOSSARY["Practice test"]} /></h2>
          <div className="rk-box mt-2"><table className="min-w-full text-start text-sm"><thead><tr><th className="py-1">{t("Class")}</th><th>{t("Finished")}</th><th>{t("Average")}</th><th>{t("On track")}</th><th>{t("Need support")}</th></tr></thead><tbody>{sim.classes.map((c) => <tr key={c.classId} className="border-b last:border-0"><td className="py-1.5 font-semibold"><bdi>G{c.grade} · {c.className}</bdi></td><td>{c.done}/{c.members}</td><td>{c.avg ?? "—"}</td><td>{c.onTrack}</td><td>{c.offTrack}</td></tr>)}</tbody></table></div>
        </section>
      )}
      {/* r72: the main table cut to what the leadership needs (5 columns); the rest behind "More details" */}
      <ReportSection title="Classes This Week" icon="🏫" className="mt-5">
        <ReportTable label="Classes This Week"
          cols={[{ key: "c", label: "Class" }, { key: "t", label: "Teacher" }, { key: "p", label: "Practised (week)", num: true }, { key: "acc", label: "Accuracy", num: true, hint: "Right ÷ careful practice answers this school year (rapid guesses not counted)." }, { key: "ao", label: "Alerts open", num: true },
            { key: "s", label: "Students", num: true, more: true }, { key: "d", label: "Tasks done", num: true, more: true }, { key: "l", label: "Late", num: true, more: true }, { key: "h", label: "Handled", num: true, more: true }]}
          rows={d.classes.map((c) => ({
            id: c.classId, flag: c.activePct < 50 ? "warn" as const : undefined,
            sort: { c: `${c.grade} ${c.className}`, p: c.activePct, acc: c.accuracy, ao: c.alertsOpen, s: c.students, d: c.done, l: c.late, h: c.alertsHandled },
            cells: { c: <b className="text-brand-navy">G{c.grade} · {c.className}</b>, t: c.teacher, p: `${c.activePct}%`, acc: c.accuracy === null ? "—" : `${c.accuracy}%`, ao: c.alertsOpen, s: c.students, d: c.done, l: c.late, h: c.alertsHandled },
          }))} />
      </ReportSection>
      <section className="mt-5 grid gap-3 md:grid-cols-3">{d.weakest.map((g) => <div key={g.grade} className={box}><h3 className="flex items-center gap-1 font-bold text-brand-navy">{t("Grade {g}: skills to reteach", { g: g.grade })} <InfoTip text={GLOSSARY["Hardest skills"]} /></h3>{!g.skills.length ? <p className="text-sm text-slate-500">{t("Not enough answers yet.")}</p> : <ol className="mt-1 list-decimal ps-5 text-sm">{g.skills.map((k) => <li key={k.skillId}><span data-content lang="en">{k.name}</span> — {t("{n}% correct", { n: k.accuracy })}</li>)}</ol>}</div>)}</section>
      <ReportSummary summary={termReportSummary(d, gt)} />
    </AppShell>
  );
}
