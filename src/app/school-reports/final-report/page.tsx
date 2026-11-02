import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { BySourceView } from "@/components/skills/by-source-view";
import { InstructionalAreaPercentiles } from "@/components/map/instructional-area-percentiles";
import { resolvePeriod, type PeriodName } from "@/analytics/periods";
import { loadCalendar } from "@/server/analytics/calendar";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { finalReportForStudent, finalReportsForClass, type FinalReport } from "@/server/reports/school-reports";
import { localeFrom, t, word, type Locale } from "@/i18n/school-reports";
import type { I18nKey } from "@/i18n/school-reports/en";

export const metadata = { title: "Final Report" };

/** the periods a teacher can choose (school year by default, as before) */
const PERIODS: PeriodName[] = ["LAST_30_DAYS", "TERM", "SEMESTER", "SCHOOL_YEAR"];
const periodOf = (v: string | undefined): PeriodName => (PERIODS.includes(v as PeriodName) ? (v as PeriodName) : "SCHOOL_YEAR");

/** t() with {placeholders} */
const tv = (L: Locale, key: I18nKey, vars: Record<string, string | number> = {}) => t(L, key).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

// the fixed level / domain / proficiency words (Literature, Informational Text, Language, Foundational Skills, the
// Diagnostic Test's proficiency sentence, Advanced / Proficient / Approaching / Intensive…) are translated by word()
// in src/i18n/school-reports — the same map as the Diagnostic Analysis page.

const TREND_TONE = { UP: "bg-emerald-50 text-emerald-800 ring-emerald-200", SAME: "bg-slate-50 text-slate-700 ring-slate-200", DOWN: "bg-amber-50 text-amber-900 ring-amber-200" } as const;

/** One student's Final Report body — shared by the single-student view and each entry of the whole-class view. */
function FinalReportArticle({ r, L, breakBefore }: { r: FinalReport; L: Locale; breakBefore?: boolean }) {
  const subjectName = (sub: string) => (sub === "READING" ? t(L, "common.subject.reading") : sub === "LANGUAGE" ? t(L, "common.subject.language") : sub);
  const nextStep = (rule: string, text: string) => {
    const key = `finalReport.next.${rule}` as I18nKey;
    const v = L === "ar" ? t(L, key) : undefined;
    return v ?? text;
  };
  const kpis: [string, string | number][] = [
    [t(L, "finalReport.kpi.questions"), r.kpis.questions],
    [t(L, "finalReport.kpi.accuracy"), r.kpis.accuracyPct !== null ? `${r.kpis.accuracyPct}%` : "—"],
    [t(L, "finalReport.kpi.minutes"), r.kpis.minutes],
    [t(L, "finalReport.kpi.newStars"), r.kpis.newStars],
    [t(L, "finalReport.kpi.mastered"), r.kpis.skillsMastered],
    [t(L, "finalReport.kpi.developing"), r.kpis.skillsDeveloping],
    [t(L, "finalReport.kpi.support"), r.kpis.skillsNeedingSupport],
    [t(L, "finalReport.kpi.curriculum"), r.kpis.curriculumProgressPct !== null ? `${r.kpis.curriculumProgressPct}%` : "—"],
  ];
  const g = r.starChange;
  return (
    <article className={`space-y-6 ${breakBefore ? "print:break-before-page" : ""}`}>
      <header className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:shadow-none">
        <h1 className="text-2xl font-extrabold text-brand-navy">{t(L, "finalReport.title")} – {r.name}</h1>
        <p className="mt-1 text-slate-600">{t(L, "common.grade")} {r.grade} · {t(L, "common.class")} {r.className ?? "—"} · {t(L, "common.studentNumber")} {r.studentNumber}</p>
        <p className="mt-1 text-sm text-slate-500">{t(L, "finalReport.period")}: {t(L, `finalReport.period.${r.period.name}` as I18nKey) ?? r.period.label} ({r.period.from} – {r.period.to})</p>
      </header>

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
        <h2 className="text-xl font-extrabold text-brand-navy">📊 {t(L, "finalReport.summary")}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{l}</dt><dd className="text-xl font-extrabold text-brand-navy">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">{t(L, "finalReport.numbersNote")}</p>
        {(r.otherAnswers.tests > 0 || r.otherAnswers.other > 0) && <p className="mt-1 text-xs text-slate-500">{tv(L, "finalReport.otherAnswers", { tests: r.otherAnswers.tests, other: r.otherAnswers.other })}</p>}
        <div className={`mt-4 rounded-xl px-4 py-3 text-sm ring-1 ${g.practised ? TREND_TONE[g.trend] : TREND_TONE.SAME}`}>
          <p className="font-bold">{t(L, "finalReport.growth.title")}</p>
          {g.practised
            ? <><p className="mt-1">{t(L, `finalReport.growth.${g.trend}` as I18nKey)}</p><p className="mt-1">{tv(L, "finalReport.growth.line", { gained: g.gained, review: g.toReview, up: g.up, down: g.down })}</p></>
            : <p className="mt-1">{t(L, "finalReport.growth.none")}</p>}
        </div>
      </section>

      {r.alerts.length > 0 && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
          <h2 className="text-lg font-extrabold text-brand-navy">🚨 {t(L, "finalReport.alerts")}</h2>
          <ul className="mt-2 space-y-2 text-sm">{r.alerts.map((a, i) => (
            <li key={i} className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <p className="font-semibold text-amber-900" dir="auto">{a.message}</p>
              {nextStep(a.rule, a.nextAction) && <p className="text-amber-800"><b>{t(L, "finalReport.nextStep")}</b> {nextStep(a.rule, a.nextAction)}</p>}
            </li>
          ))}</ul>
        </section>
      )}

      {(r.plans.length > 0 || r.missingPlans.length > 0) && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
          <h2 className="text-lg font-extrabold text-brand-navy">📋 {t(L, "finalReport.plans")}</h2>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {r.plans.map((p) => (
              <div key={p.subject} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="font-bold text-brand-navy">{subjectName(p.subject)} {p.band && <span className="font-normal text-slate-500">· {t(L, `finalReport.band.${p.band}` as I18nKey)}</span>}</p>
                {p.goals.length > 0 && <p className="mt-1 text-sm text-slate-700"><b>{t(L, "finalReport.goals")}</b> <span dir="ltr">{p.goals.join(" · ")}</span></p>}
                {p.strengths.length > 0 && <p className="mt-1 text-sm text-slate-700"><b>{t(L, "finalReport.strengths")}</b> <span dir="ltr">{p.strengths.join(" · ")}</span></p>}
              </div>
            ))}
          </div>
          {r.missingPlans.length > 0 && <ul className="mt-2 space-y-1 text-sm text-slate-500">{r.missingPlans.map((m) => <li key={m.subject}>ℹ️ {tv(L, `finalReport.noPlan.${m.reason}` as I18nKey, { subject: subjectName(m.subject) })}</li>)}</ul>}
        </section>
      )}
      {r.plans.map((p) => <InstructionalAreaPercentiles key={p.subject} rows={p.areaPercentiles} L={L} scope="student" />)}

      {r.map.length > 0 && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
          <h2 className="text-lg font-extrabold text-brand-navy">🗺️ {t(L, "finalReport.map")}</h2>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            {r.map.map((m) => (
              <div key={m.subject} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="font-bold text-brand-navy">{subjectName(m.subject)}</p>
                {m.tests.length > 0 && (
                  <table className="mt-2 w-full text-start text-sm">
                    <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2 text-start">{t(L, "finalReport.map.date")}</th><th className="pe-2 text-start">{t(L, "finalReport.map.rit")}</th><th className="text-start">{t(L, "finalReport.map.percentile")}</th></tr></thead>
                    <tbody>{m.tests.map((x) => <tr key={x.date} className="border-b last:border-0"><td className="py-1 pe-2 tabular-nums">{x.date}</td><td className="pe-2 tabular-nums">{x.rit}</td><td className="tabular-nums">{x.percentile ?? "—"}</td></tr>)}</tbody>
                  </table>
                )}
                {m.change !== null && <p className="mt-2 text-sm font-semibold text-slate-700">{tv(L, "finalReport.map.change", { n: `${m.change >= 0 ? "+" : ""}${m.change}` })}</p>}
                {m.areas.length > 0 && (
                  <div className="mt-2 text-sm">
                    <p className="text-slate-500">{t(L, "finalReport.map.areas")}</p>
                    <ul className="mt-1 divide-y divide-slate-100">{m.areas.map((x) => <li key={x.goal} className="flex justify-between py-1"><span dir="ltr">{x.goal}</span><span className="tabular-nums text-slate-700">{x.rit}{x.percentile !== null ? ` · ${x.percentile}` : ""}</span></li>)}</ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {r.diagnostic && !r.diagnostic.takenAt && r.diagnostic.invalidNewer && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
          <h2 className="text-lg font-extrabold text-brand-navy">🩺 {t(L, "finalReport.diagnostic")}</h2>
          <p className="mt-1 text-sm text-rose-800">{r.diagnostic.invalidNewer.slice(0, 10)} · {t(L, "diagnostic.notTaken.invalid")}</p>
        </section>
      )}
      {r.diagnostic?.takenAt && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
          <h2 className="text-lg font-extrabold text-brand-navy">🩺 {t(L, "finalReport.diagnostic")}</h2>
          <p className="mt-1 text-sm text-slate-600">{r.diagnostic.proficiency ? `${word(L, r.diagnostic.proficiency)} · ` : ""}{r.diagnostic.takenAt.slice(0, 10)} · {tv(L, "finalReport.questions", { n: r.diagnostic.questions })}</p>
          {r.diagnostic.tier && <p className="mt-1 text-sm font-semibold text-brand-navy">{t(L, "diagnostic.tier")}: {t(L, `diagnostic.tier.${r.diagnostic.tier}` as I18nKey)}</p>}
          {r.diagnostic.invalidNewer && <p className="mt-1 text-sm text-rose-800">⚠️ {tv(L, "diagnostic.invalidNewer", { date: r.diagnostic.invalidNewer.slice(0, 10) })}</p>}
          <ul className="mt-2 divide-y divide-slate-100 text-sm">{r.diagnostic.domains.map((x) => <li key={x.domain} className="flex justify-between py-1.5"><span>{word(L, x.label)}</span><span className="font-semibold text-slate-700">{word(L, x.level)}</span></li>)}</ul>
        </section>
      )}

      <BySourceView r={r.bySource} lang={L} />
    </article>
  );
}

/** 🗒️ Final Report: the single most complete document, for one student — or every student of the class, one after another. */
export default async function FinalReportPage({ searchParams }: { searchParams: Promise<{ studentId?: string; classId?: string; view?: string; lang?: string; period?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const L = localeFrom(sp.lang);
  const studentId = String(sp.studentId ?? "");
  const classId = String(sp.classId ?? "");
  const view = sp.view === "class" ? "class" : "student";
  const periodName = periodOf(sp.period);
  let r: FinalReport | null = null;
  let cls: Awaited<ReturnType<typeof finalReportsForClass>> | null = null;
  let error: string | null = null;
  try {
    if (view === "class") {
      if (classId) {
        const klass = await repo.findUnique("Class", { id: classId });
        if (!klass) throw new ForbiddenError("Not found.");
        const period = resolvePeriod(periodName, await loadCalendar(repo, String(klass.schoolId)));
        cls = await finalReportsForClass(repo, actor, classId, period);
      }
    } else if (studentId) {
      const st = await repo.findUnique("Student", { id: studentId });
      if (!st) throw new ForbiddenError("Not found.");
      const period = resolvePeriod(periodName, await loadCalendar(repo, String(st.schoolId)));
      r = await finalReportForStudent(repo, actor, studentId, period, { classId: classId || undefined });
    }
  } catch (e) { if (e instanceof ForbiddenError) error = e.message; else throw e; }
  const q = (extra: Record<string, string>) => `/school-reports/final-report?${new URLSearchParams({ studentId, classId, view, lang: L, period: periodName, ...extra })}`;
  const pill = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-bold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <PageHeader back={{ href: `/school-reports?studentId=${studentId}&classId=${classId}&lang=${L}`, label: t(L, "common.back") }} icon="🗒️" title={t(L, "finalReport.title")}>
          {(r || cls) && <PrintButton />}
        </PageHeader>
        <nav className="mb-3 flex flex-wrap gap-2" aria-label={t(L, "finalReport.view.student")}>
          <Link href={q({ view: "student" })} className={pill(view === "student")}>{t(L, "finalReport.view.student")}</Link>
          <Link href={q({ view: "class" })} className={pill(view === "class")}>{t(L, "finalReport.view.class")}</Link>
        </nav>
        <nav className="mb-5 flex flex-wrap items-center gap-2" aria-label={t(L, "finalReport.period")}>
          <span className="text-sm font-semibold text-slate-600">{t(L, "finalReport.period")}:</span>
          {PERIODS.map((p) => <Link key={p} href={q({ period: p })} className={pill(periodName === p)}>{t(L, `finalReport.period.${p}` as I18nKey)}</Link>)}
        </nav>
      </div>
      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{error}</p>}
      {view === "student" && !error && !r && <p className="text-slate-600">{t(L, "common.noData")}</p>}
      {view === "student" && r && <FinalReportArticle r={r} L={L} />}
      {view === "class" && !error && !cls && <p className="text-slate-600">{t(L, "finalReport.noClass")}</p>}
      {view === "class" && cls && (
        cls.reports.length === 0
          ? <p className="text-slate-600">{t(L, "common.noData")}</p>
          : <div className="space-y-10">{cls.reports.map((one, i) => <FinalReportArticle key={one.studentId} r={one} L={L} breakBefore={i > 0} />)}</div>
      )}
    </AppShell>
  );
}
