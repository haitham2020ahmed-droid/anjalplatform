import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { BySourceView } from "@/components/skills/by-source-view";
import { resolvePeriod } from "@/analytics/periods";
import { loadCalendar } from "@/server/analytics/calendar";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { finalReportForStudent, finalReportsForClass, type FinalReport } from "@/server/reports/school-reports";
import { localeFrom, t, type Locale } from "@/i18n/school-reports";

export const metadata = { title: "Final Report" };
const BAND_TITLE: Record<string, string> = { BELOW: "🟠 Below level", ON: "🔵 On level", ABOVE: "🟢 Above level" };

/** One student's Final Report body — shared by the single-student view and each entry of the whole-class view. */
function FinalReportArticle({ r, L, breakBefore }: { r: FinalReport; L: Locale; breakBefore?: boolean }) {
  return (
    <article className={`space-y-6 ${breakBefore ? "print:break-before-page" : ""}`}>
      <header className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:shadow-none">
        <h1 className="text-2xl font-extrabold text-brand-navy">{t(L, "finalReport.title")} – {r.name}</h1>
        <p className="mt-1 text-slate-600">{t(L, "common.grade")} {r.grade} · {t(L, "common.class")} {r.className ?? "—"} · {t(L, "common.studentNumber")} {r.studentNumber}</p>
      </header>

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
        <h2 className="text-xl font-extrabold text-brand-navy">📊 {t(L, "finalReport.summary")}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["Questions", r.kpis.questions], ["Accuracy", r.kpis.accuracyPct !== null ? `${r.kpis.accuracyPct}%` : "—"], ["Minutes", r.kpis.minutes],
            ["Skills mastered", r.kpis.skillsMastered], ["Developing", r.kpis.skillsDeveloping], ["Needs support", r.kpis.skillsNeedingSupport],
            ["Curriculum progress", `${r.kpis.curriculumProgressPct}%`], ["Paired growth", r.kpis.pairedGrowth !== null ? `${r.kpis.pairedGrowth >= 0 ? "+" : ""}${r.kpis.pairedGrowth}` : "—"],
          ] as const).map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{l}</dt><dd className="text-xl font-extrabold text-brand-navy">{v}</dd></div>
          ))}
        </dl>
        <p className={`mt-4 rounded-xl px-4 py-3 text-sm ring-1 ${r.regressionSignal ? "bg-red-50 text-red-800 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`}>
          {r.regressionSignal ? t(L, "finalReport.regression.on") : t(L, "finalReport.regression.off")}
        </p>
      </section>

      {r.alerts.length > 0 && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
          <h2 className="text-lg font-extrabold text-brand-navy">🚨 {t(L, "finalReport.alerts")}</h2>
          <ul className="mt-2 space-y-2 text-sm">{r.alerts.map((a, i) => <li key={i} className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200"><p className="font-semibold text-amber-900">{a.message}</p><p className="text-amber-800">{a.nextAction}</p></li>)}</ul>
        </section>
      )}

      {r.domains.length > 0 && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
          <h2 className="text-lg font-extrabold text-brand-navy">🧭 {t(L, "finalReport.domains")}</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">{r.domains.map((x) => <li key={x.label} className="flex justify-between py-1.5"><span>{x.label}</span><span className="font-semibold text-slate-700">{x.level}</span></li>)}</ul>
        </section>
      )}

      {r.plans.length > 0 && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
          <h2 className="text-lg font-extrabold text-brand-navy">📋 {t(L, "finalReport.plans")}</h2>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {r.plans.map((p) => (
              <div key={p.subject} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="font-bold text-brand-navy">{p.subject === "READING" ? t(L, "common.subject.reading") : t(L, "common.subject.language")} {p.band && <span className="font-normal text-slate-500">· {BAND_TITLE[p.band]}</span>}</p>
                {p.goals.length > 0 && <p className="mt-1 text-sm text-slate-700"><b>Goals:</b> {p.goals.join(" · ")}</p>}
                {p.strengths.length > 0 && <p className="mt-1 text-sm text-slate-700"><b>Strengths:</b> {p.strengths.join(" · ")}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {r.map.length > 0 && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
          <h2 className="text-lg font-extrabold text-brand-navy">🗺️ {t(L, "finalReport.map")}</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2">Date</th><th className="pe-2">Subject</th><th className="pe-2">Goal area</th><th className="pe-2">RIT</th><th>Percentile</th></tr></thead>
              <tbody>{r.map.map((m, i) => <tr key={i} className="border-b last:border-0"><td className="py-1 pe-2">{m.date.slice(0, 10)}</td><td className="pe-2">{m.subject}</td><td className="pe-2">{m.goal ?? "—"}</td><td className="pe-2 tabular-nums">{m.rit}</td><td className="tabular-nums">{m.percentile ?? "—"}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      {r.diagnostic?.takenAt && (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
          <h2 className="text-lg font-extrabold text-brand-navy">🩺 {t(L, "finalReport.diagnostic")}</h2>
          <p className="mt-1 text-sm text-slate-600">{r.diagnostic.proficiency} · {r.diagnostic.takenAt.slice(0, 10)} · {r.diagnostic.questions} questions</p>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">{r.diagnostic.domains.map((x) => <li key={x.domain} className="flex justify-between py-1.5"><span>{x.label}</span><span className="font-semibold text-slate-700">{x.level}</span></li>)}</ul>
        </section>
      )}

      <BySourceView r={r.bySource} />
    </article>
  );
}

/** 🗒️ Final Report: the single most complete document, for one student — or every student of the class, one after another. */
export default async function FinalReportPage({ searchParams }: { searchParams: Promise<{ studentId?: string; classId?: string; view?: string; lang?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const L = localeFrom(sp.lang);
  const studentId = String(sp.studentId ?? "");
  const classId = String(sp.classId ?? "");
  const view = sp.view === "class" ? "class" : "student";
  let r: FinalReport | null = null;
  let cls: Awaited<ReturnType<typeof finalReportsForClass>> | null = null;
  let error: string | null = null;
  try {
    if (view === "class") {
      if (classId) {
        const klass = await repo.findUnique("Class", { id: classId });
        if (!klass) throw new ForbiddenError("Not found.");
        const period = resolvePeriod("SCHOOL_YEAR", await loadCalendar(repo, String(klass.schoolId)));
        cls = await finalReportsForClass(repo, actor, classId, period);
      }
    } else if (studentId) {
      const st = await repo.findUnique("Student", { id: studentId });
      if (!st) throw new ForbiddenError("Not found.");
      const period = resolvePeriod("SCHOOL_YEAR", await loadCalendar(repo, String(st.schoolId)));
      r = await finalReportForStudent(repo, actor, studentId, period);
    }
  } catch (e) { if (e instanceof ForbiddenError) error = e.message; else throw e; }
  const q = (extra: Record<string, string>) => `/school-reports/final-report?${new URLSearchParams({ studentId, classId, view, lang: L, ...extra })}`;
  const pill = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-bold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <PageHeader back={{ href: `/school-reports?studentId=${studentId}&classId=${classId}&lang=${L}`, label: t(L, "common.back") }} icon="🗒️" title={t(L, "finalReport.title")}>
          {(r || cls) && <PrintButton />}
        </PageHeader>
        <nav className="mb-5 flex flex-wrap gap-2" aria-label={t(L, "finalReport.view.student")}>
          <Link href={q({ view: "student" })} className={pill(view === "student")}>{t(L, "finalReport.view.student")}</Link>
          <Link href={q({ view: "class" })} className={pill(view === "class")}>{t(L, "finalReport.view.class")}</Link>
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
