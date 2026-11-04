import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { diagnosticAnalysisForClass, diagnosticAnalysisForStudent, INVALID_ACTION } from "@/server/reports/school-reports";
import { localeFrom, t, word, type Locale } from "@/i18n/school-reports";
import type { I18nKey } from "@/i18n/school-reports/en";

/** t() with {placeholders} */
const tv = (L: Locale, key: I18nKey, vars: Record<string, string | number> = {}) => t(L, key).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
/** a domain's prescription in the reader's language (the service keys it by domain code) */
const prescriptionOf = (L: Locale, domain: string) => { const k = `diagnostic.prescription.${domain}` as I18nKey; return t(L, k) ?? t(L, "diagnostic.prescription.default"); };

export const metadata = { title: "Diagnostic Analysis" };

/** 🩺 Diagnostic Analysis report: one student's tier/domains/recommendations, or the whole class grouped by tier. */
export default async function DiagnosticAnalysisReportPage({ searchParams }: { searchParams: Promise<{ studentId?: string; classId?: string; view?: string; lang?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const L = localeFrom(sp.lang);
  const studentId = String(sp.studentId ?? "");
  const classId = String(sp.classId ?? "");
  const view = sp.view === "class" ? "class" : "student";
  let d: Awaited<ReturnType<typeof diagnosticAnalysisForStudent>> | null = null;
  let cls: Awaited<ReturnType<typeof diagnosticAnalysisForClass>> | null = null;
  let error: string | null = null;
  try {
    if (view === "class") { if (classId) cls = await diagnosticAnalysisForClass(repo, actor, classId); }
    else if (studentId) d = await diagnosticAnalysisForStudent(repo, actor, studentId);
  } catch (e) { if (e instanceof ForbiddenError) error = e.message; else throw e; }
  const q = (extra: Record<string, string>) => `/school-reports/diagnostic-analysis?${new URLSearchParams({ studentId, classId, view, lang: L, ...extra })}`;
  const pill = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-bold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <PageHeader back={{ href: `/school-reports?studentId=${studentId}&classId=${classId}&lang=${L}`, label: t(L, "common.back") }} icon="🩺" title={t(L, "diagnostic.title")}>
          {(d?.takenAt || cls) && <PrintButton />}
        </PageHeader>
        <nav className="mb-5 flex flex-wrap gap-2" aria-label={t(L, "diagnostic.view.student")}>
          <Link href={q({ view: "student" })} className={pill(view === "student")}>{t(L, "diagnostic.view.student")}</Link>
          <Link href={q({ view: "class" })} className={pill(view === "class")}>{t(L, "diagnostic.view.class")}</Link>
        </nav>
      </div>
      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{error}</p>}

      {view === "student" && (
        <>
          {!error && !d && <p className="text-slate-600">{t(L, "common.noData")}</p>}
          {d && !d.takenAt && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{d.invalidNewer ? `${d.invalidNewer.slice(0, 10)} · ${t(L, "diagnostic.notTaken.invalid")}` : t(L, "diagnostic.noResult")}</p>}
          {d && d.takenAt && (
            <article className="space-y-6">
              <header className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:shadow-none">
                <h1 className="text-2xl font-extrabold text-brand-navy">{t(L, "diagnostic.title")} – {d.name}</h1>
                <p className="mt-1 text-slate-600">{t(L, "common.grade")} {d.grade} · {t(L, "common.class")} {d.className ?? "—"} · {t(L, "common.studentNumber")} {d.studentNumber} · {d.takenAt.slice(0, 10)} · {tv(L, "diagnostic.questions", { n: d.questions })}</p>
              </header>
              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
                <h2 className="text-xl font-extrabold text-brand-navy">📊 {t(L, "diagnostic.executiveSummary")}</h2>
                {d.invalidNewer && <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 ring-1 ring-rose-200">⚠️ {tv(L, "diagnostic.invalidNewer", { date: d.invalidNewer.slice(0, 10) })}</p>}
                <p className="mt-2 text-slate-700">{t(L, "diagnostic.overall")}: <b>{word(L, d.proficiency ?? "")}</b></p>
                {d.tier && (
                  <div className="mt-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <p className="font-bold text-brand-navy">{t(L, "diagnostic.tier")}: {t(L, `diagnostic.tier.${d.tier}` as I18nKey)}</p>
                    <p className="mt-1 text-sm text-slate-700">{t(L, "diagnostic.strategy")}: {t(L, `diagnostic.strategy.${d.tier}` as I18nKey)}</p>
                  </div>
                )}
                {d.adaptive && <p className="mt-2 text-xs text-slate-500">{t(L, "diagnostic.scoreNote")}</p>}
              </section>
              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
                <h2 className="text-xl font-extrabold text-brand-navy">🧭 {t(L, "diagnostic.domainBreakdown")}</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2">{t(L, "diagnostic.col.domain")}</th><th className="pe-2">{t(L, "diagnostic.col.level")}</th><th className="pe-2">{t(L, "diagnostic.score")}</th>{d.thetaMeasured && <th className="pe-2">{t(L, "diagnostic.col.theta")}</th>}<th className="pe-2">{t(L, "diagnostic.col.items")}</th><th>{t(L, "diagnostic.col.prescription")}</th></tr></thead>
                    <tbody>
                      {d.domains.map((x) => (
                        <tr key={x.domain} className="border-b last:border-0">
                          <td className="py-1 pe-2 font-semibold">{word(L, x.label)}</td><td className="pe-2">{word(L, x.level)}</td><td className="pe-2 tabular-nums">{x.percentLike}{d.adaptive || d.thetaMeasured ? "" : "%"}</td>{d.thetaMeasured && <td className="pe-2 tabular-nums">{x.theta}</td>}<td className="pe-2 tabular-nums">{x.items}</td><td className="text-slate-700">{prescriptionOf(L, x.domain)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {d.domains.length === 0 && <p className="mt-2 text-sm text-slate-600">{t(L, "common.noData")}</p>}
                </div>
                {d.notMeasured.length > 0 && <p className="mt-3 text-sm text-slate-500">{t(L, "diagnostic.notMeasured")}: {d.notMeasured.map((x) => word(L, x)).join(", ")}</p>}
              </section>
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
                  <h2 className="text-lg font-extrabold text-brand-navy">💪 {t(L, "diagnostic.strengths")}</h2>
                  {d.strengths.length === 0 ? <p className="mt-2 text-sm text-slate-600">{t(L, "common.noData")}</p> : <ul className="mt-2 ms-4 list-disc text-sm">{d.strengths.map((x) => <li key={x}>{word(L, x)}</li>)}</ul>}
                  <h2 className="mt-5 text-lg font-extrabold text-brand-navy">🎯 {t(L, "diagnostic.growthAreas")}</h2>
                  {d.growthAreas.length === 0 ? <p className="mt-2 text-sm text-slate-600">{t(L, "common.noData")}</p> : <ul className="mt-2 ms-4 list-disc text-sm">{d.growthAreas.map((x) => <li key={x}>{word(L, x)}</li>)}</ul>}
                </section>
                <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
                  {d.noSkillData ? <p className="text-sm text-slate-600">ℹ️ {t(L, "diagnostic.noSkillData")}</p> : <>
                  <h2 className="text-lg font-extrabold text-brand-navy">▶️ {t(L, "diagnostic.recommended")}</h2>
                  {d.recommendedSkills.length === 0 ? <p className="mt-2 text-sm text-slate-600">{t(L, "diagnostic.noSkillsOpen")}</p> : <ul className="mt-2 ms-4 list-disc text-sm" dir="ltr">{d.recommendedSkills.map((x) => <li key={x.skillId}>{x.name}</li>)}</ul>}
                  <h2 className="mt-5 text-lg font-extrabold text-brand-navy">🚨 {t(L, "diagnostic.support")}</h2>
                  {d.supportSkills.length === 0 ? <p className="mt-2 text-sm text-slate-600">{t(L, "diagnostic.noSkillsOpen")}</p> : <ul className="mt-2 ms-4 list-disc text-sm" dir="ltr">{d.supportSkills.map((x) => <li key={x.skillId}>{x.name}</li>)}</ul>}
                  </>}
                </section>
              </div>
            </article>
          )}
        </>
      )}

      {view === "class" && (
        <>
          {!error && !cls && <p className="text-slate-600">{t(L, "diagnostic.noClass")}</p>}
          {cls && (
            <article className="space-y-6">
              <header className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:shadow-none">
                <h1 className="text-2xl font-extrabold text-brand-navy">{t(L, "diagnostic.title")} – {cls.className}</h1>
                <p className="mt-1 text-slate-600">{t(L, "common.grade")} {cls.grade}</p>
              </header>
              {cls.tiers.every((g) => g.students.length === 0) && cls.notTaken.length === 0 && <p className="text-slate-600">{t(L, "common.noData")}</p>}
              {cls.tiers.map((g) => g.students.length > 0 && (
                <section key={g.tier} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
                  <h2 className="text-xl font-extrabold text-brand-navy">{t(L, `diagnostic.tier.${g.tier}` as I18nKey)} <span className="text-base font-normal text-slate-500">· {g.students.length}</span></h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2">{t(L, "diagnostic.names")}</th>{cls!.domains.map((dm) => <th key={dm} className="pe-2">{word(L, dm)}</th>)}</tr></thead>
                      <tbody>
                        {g.students.map((st) => (
                          <tr key={st.studentId} className="border-b last:border-0">
                            <td className="py-1 pe-2 font-semibold">{st.name}</td>
                            {cls!.domains.map((dm) => <td key={dm} className="pe-2 text-slate-700">{st.domainText[dm] ? word(L, st.domainText[dm]) : "—"}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
              {cls.notTaken.length > 0 && (
                <section className="rounded-3xl bg-amber-50 p-6 ring-1 ring-amber-200 print:break-inside-avoid">
                  <h2 className="text-lg font-extrabold text-amber-900">⏳ {t(L, "diagnostic.notTakenGroup")} <span className="text-base font-normal">· {cls.notTaken.length}</span></h2>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-left text-sm text-amber-900">
                      <thead><tr className="border-b border-amber-200"><th className="py-1 pe-2">{t(L, "diagnostic.names")}</th><th>{t(L, "diagnostic.notTaken.action")}</th></tr></thead>
                      <tbody>{cls.notTaken.map((x) => (<tr key={x.studentId} className="border-b border-amber-100 last:border-0"><td className="py-1 pe-2 font-semibold">{x.name}</td><td>{x.action === INVALID_ACTION ? t(L, "diagnostic.notTaken.invalid") : t(L, "diagnostic.notTaken.default")}</td></tr>))}</tbody>
                    </table>
                  </div>
                </section>
              )}
            </article>
          )}
        </>
      )}
    </AppShell>
  );
}
