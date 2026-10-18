import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { BAND_RULE, personalPlan, type PlanGoal } from "@/server/map/personal-plan";
import { personalizedPlanForStudent } from "@/server/reports/school-reports";
import { localeFrom, t } from "@/i18n/school-reports";

export const metadata = { title: "Personalized Plan" };
const TITLE = { BELOW: "🟠 Below level", ON: "🔵 On level", ABOVE: "🟢 Above level" } as const;

/** The Academic Goals / Areas of Strength list — shared by the one-student view and each band of the whole-class view. */
function GoalList({ goals, L }: { goals: PlanGoal[]; L: "en" | "ar" }) {
  if (!goals.length) return <p className="mt-2 text-sm text-slate-600">{t(L, "common.noData")}</p>;
  return (
    <ol className="mt-3 space-y-2 text-sm">
      {goals.map((g) => (
        <li key={g.areaId}>
          <b>{g.area}</b>{g.meanRit !== null && <span className="text-slate-500"> · mean RIT {g.meanRit}</span>}
          <ul className="ms-4 list-disc text-slate-700">
            {g.skills.map((k) => <li key={k.id}>{k.standards.length > 0 && <code className="me-1 text-xs text-emerald-800">{k.standards.join(", ")}</code>}{k.name}</li>)}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** 📋 Personalized Plan report: one student's own plan, or the whole class grouped by band (the school's own format). */
export default async function PersonalizedPlanReportPage({ searchParams }: { searchParams: Promise<{ studentId?: string; classId?: string; subject?: string; view?: string; lang?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const L = localeFrom(sp.lang);
  const studentId = String(sp.studentId ?? "");
  const classId = String(sp.classId ?? "");
  const subject = sp.subject === "language" ? "LANGUAGE" : "READING";
  const view = sp.view === "class" ? "class" : "student";
  let p: Awaited<ReturnType<typeof personalizedPlanForStudent>> | null = null;
  let cls: Awaited<ReturnType<typeof personalPlan>> | null = null;
  let error: string | null = null;
  try {
    if (view === "class") { if (classId) cls = await personalPlan(repo, actor, classId, subject); }
    else if (studentId) p = await personalizedPlanForStudent(repo, actor, studentId, subject);
  } catch (e) { if (e instanceof ForbiddenError) error = e.message; else throw e; }
  const q = (extra: Record<string, string>) => `/school-reports/personalized-plan?${new URLSearchParams({ studentId, classId, subject: subject.toLowerCase(), view, lang: L, ...extra })}`;
  const pill = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-bold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <PageHeader back={{ href: `/school-reports?studentId=${studentId}&classId=${classId}&lang=${L}`, label: t(L, "common.back") }} icon="📋" title={t(L, "personalizedPlan.title")}>
          {(p || cls) && <PrintButton />}
        </PageHeader>
        <nav className="mb-3 flex flex-wrap gap-2" aria-label={t(L, "common.subject")}>
          <Link href={q({ subject: "reading" })} className={pill(subject === "READING")}>📖 {t(L, "common.subject.reading")}</Link>
          <Link href={q({ subject: "language" })} className={pill(subject === "LANGUAGE")}>✍️ {t(L, "common.subject.language")}</Link>
        </nav>
        <nav className="mb-5 flex flex-wrap gap-2" aria-label={t(L, "personalizedPlan.view.student")}>
          <Link href={q({ view: "student" })} className={pill(view === "student")}>{t(L, "personalizedPlan.view.student")}</Link>
          <Link href={q({ view: "class" })} className={pill(view === "class")}>{t(L, "personalizedPlan.view.class")}</Link>
          {view === "class" && classId && (
            <a href={`/api/personal-plan-doc?${new URLSearchParams({ classId, subject: subject.toLowerCase() })}`} className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200 hover:ring-emerald-400">
              {t(L, "personalizedPlan.downloadWord")}
            </a>
          )}
        </nav>
      </div>
      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{error}</p>}

      {view === "student" && (
        <>
          {!error && !p && <p className="text-slate-600">{t(L, studentId ? "personalizedPlan.noPlan" : "schoolReports.noStudents")}</p>}
          {p && (!p.goals.length && !p.strengths.length) && (
            <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{t(L, "personalizedPlan.noPlan")}</p>
          )}
          {p && (
            <article className="space-y-6">
              <header className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:shadow-none">
                <h1 className="text-2xl font-extrabold text-brand-navy">{t(L, "personalizedPlan.title")} – {p.name} – {subject === "READING" ? t(L, "common.subject.reading") : t(L, "common.subject.language")}</h1>
                <p className="mt-1 text-slate-600">
                  {t(L, "common.grade")} {p.grade} · {t(L, "common.class")} {p.className} · {t(L, "common.teacher")} {p.teacher || "—"} · {t(L, "common.studentNumber")} {p.studentNumber} · MAP {p.term ?? "—"}
                </p>
                {p.band && (
                  <table className="mt-4 w-full max-w-md text-left text-sm">
                    <thead><tr className="border-b text-slate-500"><th className="py-1">{TITLE[p.band]}</th><th>{t(L, "personalizedPlan.ritScore")}</th><th>{t(L, "personalizedPlan.projection")}</th><th>{t(L, "personalizedPlan.percentile")}</th></tr></thead>
                    <tbody><tr><td className="py-1 font-semibold">{BAND_RULE[p.band]}</td><td className="tabular-nums">{p.rit ?? "—"}</td><td className="tabular-nums">{p.projection ?? "—"}</td><td className="tabular-nums">{p.percentile ?? "—"}</td></tr></tbody>
                  </table>
                )}
              </header>
              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
                <h2 className="text-xl font-extrabold text-brand-navy">🎯 {t(L, "personalizedPlan.goals")}</h2>
                <GoalList goals={p.goals} L={L} />
              </section>
              {p.strengths.length > 0 && (
                <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
                  <h2 className="text-xl font-extrabold text-brand-navy">💪 {t(L, "personalizedPlan.strengths")}</h2>
                  <ul className="mt-3 ms-4 list-disc space-y-1 text-sm">{p.strengths.map((g) => <li key={g.areaId}>{g.area}{g.meanRit !== null && <span className="text-slate-500"> · {g.meanRit}</span>}</li>)}</ul>
                </section>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
                  <h2 className="text-lg font-extrabold text-brand-navy">🧰 {t(L, "personalizedPlan.resources")}</h2>
                  <ul className="mt-3 ms-4 list-disc space-y-1 text-sm">{p.resources.map((r) => <li key={r}>{r}</li>)}</ul>
                </section>
                <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
                  <h2 className="text-lg font-extrabold text-brand-navy">📈 {t(L, "personalizedPlan.monitoring")}</h2>
                  <ul className="mt-3 ms-4 list-disc space-y-1 text-sm">{p.monitoring.map((r) => <li key={r}>{r}</li>)}</ul>
                </section>
              </div>
            </article>
          )}
        </>
      )}

      {view === "class" && (
        <>
          {!error && !cls && <p className="text-slate-600">{t(L, "personalizedPlan.noClass")}</p>}
          {cls && (
            <article className="space-y-6">
              <header className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:shadow-none">
                <h1 className="text-2xl font-extrabold text-brand-navy">{t(L, "personalizedPlan.title")} – {cls.className} – {subject === "READING" ? t(L, "common.subject.reading") : t(L, "common.subject.language")}</h1>
                <p className="mt-1 text-slate-600">
                  {t(L, "common.grade")} {cls.grade} · {t(L, "common.teacher")} {cls.teacher || "—"} · MAP {cls.term ?? "—"}
                  {cls.notTested.length > 0 && <span className="text-amber-700"> · {cls.notTested.length} {t(L, "personalizedPlan.notTested")}</span>}
                </p>
              </header>
              {cls.bands.map((b) => (
                <section key={b.band} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
                  <h2 className="text-xl font-extrabold text-brand-navy">{TITLE[b.band]} <span className="text-base font-normal text-slate-500">· {BAND_RULE[b.band]}{b.ritRange ? ` · RIT ${b.ritRange}` : ""} · {b.students.length} {t(L, "personalizedPlan.studentsInBand")}</span></h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2">{t(L, "personalizedPlan.names")}</th><th className="pe-2">{t(L, "personalizedPlan.ritScore")}</th><th className="pe-2">{t(L, "personalizedPlan.projection")}</th><th>{t(L, "personalizedPlan.percentile")}</th></tr></thead>
                      <tbody>
                        {b.students.length === 0
                          ? <tr><td colSpan={4} className="py-2 text-slate-400">{t(L, "common.noData")}</td></tr>
                          : b.students.map((st) => (
                            <tr key={st.studentId} className="border-b last:border-0">
                              <td className="py-1 pe-2 font-semibold">{st.name}{st.rapidGuess !== null && st.rapidGuess >= 30 && <span className="ms-1 text-xs font-bold text-amber-700">⚠</span>}</td>
                              <td className="pe-2 tabular-nums">{st.rit}</td>
                              <td className="pe-2 tabular-nums">{st.projection ?? "—"}</td>
                              <td className="tabular-nums">{st.percentile ?? "—"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-brand-navy">🎯 {t(L, "personalizedPlan.goals")}</h3>
                  <GoalList goals={b.goals} L={L} />
                  {b.strengths.length > 0 && (
                    <>
                      <h3 className="mt-4 text-sm font-bold text-brand-navy">💪 {t(L, "personalizedPlan.strengths")}</h3>
                      <ul className="mt-1 ms-4 list-disc space-y-1 text-sm">{b.strengths.map((g) => <li key={g.areaId}>{g.area}{g.meanRit !== null && <span className="text-slate-500"> · {g.meanRit}</span>}</li>)}</ul>
                    </>
                  )}
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div><h3 className="text-sm font-bold text-brand-navy">🧰 {t(L, "personalizedPlan.resources")}</h3><ul className="mt-1 ms-4 list-disc space-y-1 text-sm">{b.resources.map((r) => <li key={r}>{r}</li>)}</ul></div>
                    <div><h3 className="text-sm font-bold text-brand-navy">📈 {t(L, "personalizedPlan.monitoring")}</h3><ul className="mt-1 ms-4 list-disc space-y-1 text-sm">{b.monitoring.map((r) => <li key={r}>{r}</li>)}</ul></div>
                  </div>
                </section>
              ))}
            </article>
          )}
        </>
      )}
    </AppShell>
  );
}
