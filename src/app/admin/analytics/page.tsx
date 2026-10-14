import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";
import { resolvePeriod } from "@/analytics/periods";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { loadCalendar } from "@/server/analytics/calendar";
import { schoolDashboard } from "@/server/analytics/school-dashboard";
import { reportHref } from "@/reports/links";
import { InfoTip, ReportIntro, ReportSummary, StandardLabel } from "@/components/report-kit";
import { analyticsSummary } from "@/lib/report-summaries";
import { GLOSSARY } from "@/lib/report-columns";

export const metadata = { title: "School Analytics" };

/**
 * 📊 School Analytics: one dashboard page — KPI cards, two small charts, a card per class, the standards lowest-first,
 * downloads as small buttons. No tabs or nested sections. One pass over the year's answers, kept while unchanged.
 */
export default async function SchoolAnalytics() {
  const actor = await requireActor({ permission: "analytics:school" });
  const me = (await getActor())!.user;
  const [{ t }, cal] = await Promise.all([getT(), loadCalendar(repo, actor.schoolId)]);
  const period = resolvePeriod("SCHOOL_YEAR", cal);
  const d = await schoolDashboard(repo, actor, period);
  const k = d.kpis;
  const n = (v: number) => v.toLocaleString("en");
  const kpis: { icon: LineIconName; label: string; value: string; sub?: string }[] = [
    { icon: "student", label: "Students", value: n(k.students) },
    { icon: "clock", label: "Active this week", value: n(k.activeWeek), sub: t("{n} of {m}", { n: n(k.activeWeek), m: n(k.students) }) },
    { icon: "question", label: "Questions answered", value: n(k.answers) },
    { icon: "target", label: "Accuracy", value: k.accuracy === null ? "—" : `${k.accuracy}%` },
    { icon: "award", label: "Skills mastered", value: n(k.mastered) },
    { icon: "growth", label: "Average mastery", value: k.avgMastery === null ? "—" : `${k.avgMastery}%` },
  ];
  const maxWeek = Math.max(1, ...d.weeks.map((w) => w.answers));
  const quiet = [...d.classes].filter((c) => c.students > 0).sort((a, b) => a.activeWeek / a.students - b.activeWeek / b.students)[0];
  const weakest = d.standards[0];
  const dl = (kind: "school" | "standards", format: "pdf" | "xlsx" | "csv") => reportHref({ kind, format, locale: "en", period: "SCHOOL_YEAR", ...(kind === "standards" ? { scope: "school" as const } : {}) });
  const btn = "inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  const box = "rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="chart" title="School Analytics" subtitle={`${d.period} · ${t("Platform answers only; imported MAP results are on each student's page.")}`}>
        <div className="flex flex-wrap items-center gap-1.5 print:hidden" aria-label={t("Downloads")}>
          <span className="text-xs font-semibold text-slate-500">{t("School summary")}</span>
          {(["pdf", "xlsx", "csv"] as const).map((f) => <a key={`s${f}`} href={dl("school", f)} download className={btn}><LineIcon name="download" className="h-3.5 w-3.5" />{f === "xlsx" ? "Excel" : f.toUpperCase()}</a>)}
          <span className="ms-2 text-xs font-semibold text-slate-500">{t("Standards")}</span>
          {(["pdf", "xlsx", "csv"] as const).map((f) => <a key={`t${f}`} href={dl("standards", f)} download className={btn}><LineIcon name="download" className="h-3.5 w-3.5" />{f === "xlsx" ? "Excel" : f.toUpperCase()}</a>)}
        </div>
      </PageHeader>

      <ReportIntro text="The whole school at a glance: practice, accuracy by grade and class, and the weakest standards." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="kpis">
        {kpis.map((x) => (
          <div key={x.label} className={box}>
            <p className="flex items-center gap-1.5 text-sm text-slate-600"><LineIcon name={x.icon} className="h-4 w-4 text-teal-700" />{t(x.label)}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-brand-navy">{x.value}</p>
            {x.sub && <p className="text-xs text-slate-500">{x.sub}</p>}
          </div>
        ))}
      </div>

      {(quiet || weakest) && (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {quiet && (
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-amber-950 ring-1 ring-amber-200">
              <span>{t("Grade {g} {c}: {n} of {m} students practised this week.", { g: quiet.grade, c: quiet.name, n: quiet.activeWeek, m: quiet.students })}</span>
              <Link href={`/teacher/classes/${quiet.classId}/analytics?period=SCHOOL_YEAR`} className={btn}>{t("Open class")}</Link>
            </li>
          )}
          {weakest && (
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-rose-950 ring-1 ring-rose-200">
              <span>{t("Lowest standard: {s}, {p}% correct.", { s: weakest.short, p: weakest.accuracy })}</span>
              <a href="#standards" className={btn}>{t("See standards")}</a>
            </li>
          )}
        </ul>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <figure className={box} aria-labelledby="chart-weeks">
          <figcaption id="chart-weeks" className="flex items-center gap-1 text-sm font-semibold text-slate-700">{t("Questions answered per week")} <InfoTip text={GLOSSARY["Questions answered per week"]} /></figcaption>
          <div className="mt-3 flex h-28 items-end gap-1.5" role="img" aria-label={d.weeks.map((w) => `${w.label}: ${w.answers}`).join(", ")}>
            {d.weeks.map((w) => (
              <div key={w.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${w.label}: ${n(w.answers)}`}>
                <div className="rounded-t bg-teal-600" style={{ height: `${Math.max(w.answers ? 4 : 0, Math.round((100 * w.answers) / maxWeek))}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5 text-[10px] text-slate-500" aria-hidden="true">{d.weeks.map((w, i) => <span key={w.label} className="min-w-0 flex-1 truncate text-center">{i % 3 === 0 || i === d.weeks.length - 1 ? w.label : ""}</span>)}</div>
        </figure>
        <figure className={box} aria-labelledby="chart-grades">
          <figcaption id="chart-grades" className="flex items-center gap-1 text-sm font-semibold text-slate-700">{t("Accuracy by grade")} <InfoTip text={GLOSSARY["Accuracy by grade"]} /></figcaption>
          <ul className="mt-3 space-y-2">
            {d.grades.map((g) => (
              <li key={g.grade} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
                <span className="text-slate-700">{t("Grade {g}", { g: g.grade })}</span>
                <span className="h-3 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-indigo-500" style={{ width: `${g.accuracy ?? 0}%` }} /></span>
                <span className="text-end font-semibold tabular-nums text-brand-navy">{g.accuracy === null ? "—" : `${g.accuracy}%`}</span>
              </li>
            ))}
            {d.grades.length === 0 && <li className="text-sm text-slate-500">{t("No answers yet.")}</li>}
          </ul>
        </figure>
      </div>

      <h2 className="mt-6 flex items-center gap-1 text-lg font-bold text-brand-navy">{t("Classes")} <InfoTip text={GLOSSARY["Class cards"]} /></h2>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="class-cards">
        {d.classes.map((c) => (
          <li key={c.classId}>
            <Link href={`/teacher/classes/${c.classId}/analytics?period=SCHOOL_YEAR`} className={`${box} block hover:ring-brand-teal`}>
              <p className="font-semibold text-brand-navy">{t("Grade {g}", { g: c.grade })} · {c.name}</p>
              <dl className="mt-2 grid grid-cols-3 gap-1 text-center">
                <div><dt className="text-[11px] text-slate-500">{t("Active")}</dt><dd className="font-bold tabular-nums text-brand-navy">{c.activeWeek}/{c.students}</dd></div>
                <div><dt className="text-[11px] text-slate-500">{t("Accuracy")}</dt><dd className="font-bold tabular-nums text-brand-navy">{c.accuracy === null ? "—" : `${c.accuracy}%`}</dd></div>
                <div><dt className="text-[11px] text-slate-500">{t("Mastery")}</dt><dd className="font-bold tabular-nums text-brand-navy">{c.avgMastery === null ? "—" : `${c.avgMastery}%`}</dd></div>
              </dl>
              <p className="mt-1 text-xs text-slate-500">{t("{n} questions answered", { n: n(c.answers) })}</p>
            </Link>
          </li>
        ))}
        {d.classes.length === 0 && <li className="text-sm text-slate-500">{t("No classes yet.")}</li>}
      </ul>

      <h2 id="standards" className="mt-6 flex items-center gap-1 text-lg font-bold text-brand-navy">{t("Standards, lowest first")} <InfoTip text={GLOSSARY["Standards, lowest first"]} /></h2>
      <p className="text-sm text-slate-600">{t("{n} standards of these grades have no answers yet.", { n: d.notAssessed })}</p>
      <div className={`${box} mt-2 overflow-x-auto`}>
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="py-2">{t("Standard")}</th><th className="w-2/5">{t("Accuracy")} <InfoTip text="Accuracy = % of answers that were right." /></th><th className="text-end">{t("Students")}</th></tr></thead>
          <tbody>
            {d.standards.map((r) => (
              <tr key={r.code} className="border-b align-middle last:border-0">
                <td className="py-2 pe-3"><StandardLabel code={r.short} text={r.description} className="text-brand-navy" /></td>
                <td className="pe-3">
                  <span className="flex items-center gap-2"><span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${r.accuracy < 50 ? "bg-rose-500" : r.accuracy < 70 ? "bg-amber-500" : "bg-teal-600"}`} style={{ width: `${r.accuracy}%` }} /></span><span className="w-10 text-end font-semibold tabular-nums">{r.accuracy}%</span></span>
                </td>
                <td className="text-end tabular-nums">{r.students}</td>
              </tr>
            ))}
            {d.standards.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-slate-500">{t("No standard has 5 answers yet.")}</td></tr>}
          </tbody>
        </table>
      </div>
      <ReportSummary summary={analyticsSummary(d)} />
    </AppShell>
  );
}
