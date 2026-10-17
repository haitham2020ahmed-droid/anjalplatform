import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { diagnosticAnalysisForStudent, TIER_LABEL, TIER_STRATEGY } from "@/server/reports/school-reports";
import { localeFrom, t } from "@/i18n/school-reports";

export const metadata = { title: "Diagnostic Analysis" };

/** 🩺 Diagnostic Analysis report, for one student: tier, domain breakdown, strengths/growth areas, recommendations. */
export default async function DiagnosticAnalysisReportPage({ searchParams }: { searchParams: Promise<{ studentId?: string; lang?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const L = localeFrom(sp.lang);
  const studentId = String(sp.studentId ?? "");
  let d: Awaited<ReturnType<typeof diagnosticAnalysisForStudent>> | null = null;
  let error: string | null = null;
  if (studentId) {
    try { d = await diagnosticAnalysisForStudent(repo, actor, studentId); }
    catch (e) { if (e instanceof ForbiddenError) error = e.message; else throw e; }
  }
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <PageHeader back={{ href: `/school-reports?studentId=${studentId}&lang=${L}`, label: t(L, "common.back") }} icon="🩺" title={t(L, "diagnostic.title")}>
          {d?.takenAt && <PrintButton />}
        </PageHeader>
      </div>
      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{error}</p>}
      {!error && !d && <p className="text-slate-600">{t(L, "common.noData")}</p>}
      {d && !d.takenAt && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{t(L, "diagnostic.noResult")}</p>}
      {d && d.takenAt && (
        <article className="space-y-6">
          <header className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:shadow-none">
            <h1 className="text-2xl font-extrabold text-brand-navy">{t(L, "diagnostic.title")} – {d.name}</h1>
            <p className="mt-1 text-slate-600">{t(L, "common.grade")} {d.grade} · {t(L, "common.class")} {d.className ?? "—"} · {t(L, "common.studentNumber")} {d.studentNumber} · {d.takenAt.slice(0, 10)} · {d.questions} questions</p>
          </header>
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
            <h2 className="text-xl font-extrabold text-brand-navy">📊 {t(L, "diagnostic.executiveSummary")}</h2>
            <p className="mt-2 text-slate-700">Overall proficiency: <b>{d.proficiency}</b></p>
            {d.tier && (
              <div className="mt-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="font-bold text-brand-navy">{t(L, "diagnostic.tier")}: {TIER_LABEL[d.tier]}</p>
                <p className="mt-1 text-sm text-slate-700">{t(L, "diagnostic.strategy")}: {TIER_STRATEGY[d.tier]}</p>
              </div>
            )}
          </section>
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
            <h2 className="text-xl font-extrabold text-brand-navy">🧭 {t(L, "diagnostic.domainBreakdown")}</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2">Domain</th><th className="pe-2">Level</th><th className="pe-2">θ</th><th className="pe-2">Items</th><th>Instructional prescription</th></tr></thead>
                <tbody>
                  {d.domains.map((x) => (
                    <tr key={x.domain} className="border-b last:border-0">
                      <td className="py-1 pe-2 font-semibold">{x.label}</td><td className="pe-2">{x.level}</td><td className="pe-2 tabular-nums">{x.theta}</td><td className="pe-2 tabular-nums">{x.items}</td><td className="text-slate-700">{x.prescription}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.domains.length === 0 && <p className="mt-2 text-sm text-slate-600">{t(L, "common.noData")}</p>}
            </div>
            {d.notMeasured.length > 0 && <p className="mt-3 text-sm text-slate-500">{t(L, "diagnostic.notMeasured")}: {d.notMeasured.join(", ")}</p>}
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
              <h2 className="text-lg font-extrabold text-brand-navy">💪 {t(L, "diagnostic.strengths")}</h2>
              {d.strengths.length === 0 ? <p className="mt-2 text-sm text-slate-600">{t(L, "common.noData")}</p> : <ul className="mt-2 ms-4 list-disc text-sm">{d.strengths.map((x) => <li key={x}>{x}</li>)}</ul>}
              <h2 className="mt-5 text-lg font-extrabold text-brand-navy">🎯 {t(L, "diagnostic.growthAreas")}</h2>
              {d.growthAreas.length === 0 ? <p className="mt-2 text-sm text-slate-600">{t(L, "common.noData")}</p> : <ul className="mt-2 ms-4 list-disc text-sm">{d.growthAreas.map((x) => <li key={x}>{x}</li>)}</ul>}
            </section>
            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
              <h2 className="text-lg font-extrabold text-brand-navy">▶️ {t(L, "diagnostic.recommended")}</h2>
              {d.recommendedSkills.length === 0 ? <p className="mt-2 text-sm text-slate-600">{t(L, "common.noData")}</p> : <ul className="mt-2 ms-4 list-disc text-sm">{d.recommendedSkills.map((x) => <li key={x.skillId}>{x.name}</li>)}</ul>}
              <h2 className="mt-5 text-lg font-extrabold text-brand-navy">🚨 {t(L, "diagnostic.support")}</h2>
              {d.supportSkills.length === 0 ? <p className="mt-2 text-sm text-slate-600">{t(L, "common.noData")}</p> : <ul className="mt-2 ms-4 list-disc text-sm">{d.supportSkills.map((x) => <li key={x.skillId}>{x.name}</li>)}</ul>}
            </section>
          </div>
        </article>
      )}
    </AppShell>
  );
}
