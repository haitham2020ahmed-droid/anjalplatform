import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { BAND_RULE, personalPlan, type PersonalPlan, type PlanGoal } from "@/server/map/personal-plan";
import { classProfile } from "@/server/map/nwea-reports";
import { InstructionalAreaPercentiles } from "@/components/map/instructional-area-percentiles";
import { personalizedPlanForStudent } from "@/server/reports/school-reports";
import { localeFrom, t } from "@/i18n/school-reports";

export const metadata = { title: "Personalized Plan" };
const TITLE = { BELOW: "🟠 Below level", ON: "🔵 On level", ABOVE: "🟢 Above level" } as const;

/** "Instructional Areas": every goal area's own RIT (not just the top goals), weakest first — the whole class's
 *  average, or (no `students` column) one student's own score. Shared by the student and class views. */
function InstructionalAreas({ rows, L, classAverageRit, nationalAverageRit, scope }: { rows: PersonalPlan["areaBreakdown"]; L: "en" | "ar"; classAverageRit: number | null; nationalAverageRit: number | null; scope: "class" | "student" }) {
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((x) => x.meanRit ?? 0), classAverageRit ?? 0);
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
      <h2 className="text-lg font-extrabold text-brand-navy">📈 {t(L, "personalizedPlan.instructionalAreas")} <span className="text-base font-normal text-slate-500">— {t(L, scope === "class" ? "personalizedPlan.wholeClass" : "personalizedPlan.thisStudent")}</span></h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500">
            <th className="py-1 pe-2">{t(L, "personalizedPlan.instructionalAreas.area")}</th>
            <th className="pe-2">{t(L, scope === "class" ? "personalizedPlan.classAverage" : "personalizedPlan.instructionalAreas.rit")}</th>
            {scope === "class" && <th className="pe-2">{t(L, "personalizedPlan.instructionalAreas.students")}</th>}
            <th>{t(L, "personalizedPlan.instructionalAreas.chart")}</th>
          </tr></thead>
          <tbody>
            {rows.map((a) => {
              const pct = a.meanRit !== null ? Math.min(100, Math.max(4, Math.round((100 * a.meanRit) / max))) : 0;
              const weak = a.meanRit !== null && classAverageRit !== null && a.meanRit < classAverageRit;
              return (
                <tr key={a.area} className="border-b last:border-0">
                  <td className="py-1.5 pe-2 font-semibold">{a.area}</td>
                  <td className="pe-2 tabular-nums">{a.meanRit ?? "—"}</td>
                  {scope === "class" && <td className="pe-2 tabular-nums text-slate-500">{a.students}</td>}
                  <td className="w-1/3">
                    {a.meanRit !== null && <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${weak ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} /></div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {nationalAverageRit !== null && <p className="mt-3 text-xs text-slate-500">{t(L, "personalizedPlan.instructionalAreas.nationalNote")} {nationalAverageRit}.</p>}
    </section>
  );
}

const PERCENTILE_COLOR: Record<PersonalPlan["percentileDistribution"][number]["range"], string> = {
  ">80": "bg-blue-700", "61-80": "bg-emerald-500", "41-60": "bg-yellow-400", "21-40": "bg-orange-400", "<21": "bg-red-800",
};
const PERCENTILE_LABEL: Record<PersonalPlan["percentileDistribution"][number]["range"], string> = {
  ">80": ">80%", "61-80": "61–80%", "41-60": "41–60%", "21-40": "21–40%", "<21": "<21%",
};

/** "Most students scored below/above the 50th percentile" bar chart (NWEA's own 5 national-percentile ranges) —
 *  whole-class only (a single student has only one percentile, nothing to distribute). Recomputed live from
 *  `cls.percentileDistribution`, so it tracks the current roster and latest MAP scores automatically. */
function PercentileDistribution({ rows, L }: { rows: PersonalPlan["percentileDistribution"]; L: "en" | "ar" }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  if (!total) return null;
  const below = (rows.find((r) => r.range === "<21")?.count ?? 0) + (rows.find((r) => r.range === "21-40")?.count ?? 0);
  const above = (rows.find((r) => r.range === "61-80")?.count ?? 0) + (rows.find((r) => r.range === ">80")?.count ?? 0);
  const titleKey = below > above ? "personalizedPlan.percentileDistribution.title.below" : above > below ? "personalizedPlan.percentileDistribution.title.above" : "personalizedPlan.percentileDistribution.title.mixed";
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
      <h2 className="text-lg font-extrabold text-brand-navy">📊 {t(L, titleKey)}</h2>
      <p className="mt-1 text-sm text-slate-500">{t(L, "personalizedPlan.percentileDistribution.subtitle")}</p>
      <div className="mt-4 space-y-2">
        {rows.map((r) => {
          const pct = Math.round((100 * r.count) / max);
          return (
            <div key={r.range} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0 text-end font-semibold text-slate-700">{PERCENTILE_LABEL[r.range]}</span>
              <span className={`h-4 w-4 shrink-0 rounded-sm ${PERCENTILE_COLOR[r.range]}`} />
              <div className="h-7 flex-1 overflow-hidden rounded bg-slate-50 ring-1 ring-slate-200">
                {r.count > 0 && <div className={`h-full ${PERCENTILE_COLOR[r.range]}`} style={{ width: `${Math.max(pct, 4)}%` }} />}
              </div>
              <span className="w-6 shrink-0 text-end font-bold tabular-nums text-slate-700">{r.count}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

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
          {g.continuumFocus.length > 0 && (
            <div className="ms-4 mt-1 rounded-lg bg-sky-50 p-2 text-xs ring-1 ring-sky-100">
              <p className="font-semibold text-sky-900">📘 {t(L, "personalizedPlan.continuumFocus")}</p>
              <ul className="ms-4 list-disc text-sky-900">
                {g.continuumFocus.map((f, i) => <li key={i}>{f.standards.length > 0 && <code className="me-1 text-sky-700">{f.standards.join(", ")}</code>}{f.text}</li>)}
              </ul>
            </div>
          )}
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
  // 📊 "Instructional Area Achievement Percentiles" for the whole-class view only (the student view already gets its
  // own, from `p.areaPercentiles`) — needs the comprehensive MAP file (each area's own band), so this is best-effort:
  // no comprehensive file imported, or no class access, just leaves the chart off, never the page.
  const classPercentiles = view === "class" && classId ? await classProfile(repo, actor, classId, subject).catch(() => null) : null;
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
                {p.percentile !== null && <p className="mt-2 max-w-md text-xs text-slate-500">{t(L, "personalizedPlan.percentileNote")}</p>}
              </header>
              <InstructionalAreas rows={p.areaBreakdown} L={L} classAverageRit={null} nationalAverageRit={null} scope="student" />
              <InstructionalAreaPercentiles rows={p.areaPercentiles} L={L} />
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
                  {cls.classAverageRit !== null && <span> · {t(L, "personalizedPlan.classAverage")}: <b className="text-brand-navy">{cls.classAverageRit}</b></span>}
                  {cls.nationalAverageRit !== null && <span> · {t(L, "personalizedPlan.nationalAverage")}: <b className="text-emerald-700">{cls.nationalAverageRit}</b></span>}
                  {cls.notTested.length > 0 && <span className="text-amber-700"> · {cls.notTested.length} {t(L, "personalizedPlan.notTested")}</span>}
                </p>
              </header>
              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
                <h2 className="text-lg font-extrabold text-brand-navy">📊 {t(L, "personalizedPlan.mapLevels")}</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b text-slate-500">
                      <th className="py-1 pe-2">{t(L, "personalizedPlan.mapLevels.tier")}</th>
                      <th className="pe-2">{t(L, "personalizedPlan.mapLevels.rule")}</th>
                      <th className="pe-2">{t(L, "personalizedPlan.mapLevels.ritRange")}</th>
                      <th className="pe-2">{t(L, "personalizedPlan.mapLevels.students")}</th>
                      <th>{t(L, "common.class")}</th>
                    </tr></thead>
                    <tbody>
                      {cls.bands.map((b) => {
                        const bandMid = b.students.length ? Math.round(b.students.reduce((n, st) => n + st.rit, 0) / b.students.length) : null;
                        const pct = bandMid !== null && cls.classAverageRit ? Math.min(100, Math.max(6, Math.round((bandMid / (cls.classAverageRit * 1.3)) * 100))) : 0;
                        const DOT = { BELOW: "bg-amber-500", ON: "bg-sky-500", ABOVE: "bg-emerald-500" } as const;
                        return (
                          <tr key={b.band} className="border-b last:border-0">
                            <td className="py-1.5 pe-2 font-semibold">{TITLE[b.band]}</td>
                            <td className="pe-2 text-slate-600">{BAND_RULE[b.band]}</td>
                            <td className="pe-2 tabular-nums">{b.ritRange ?? "—"}</td>
                            <td className="pe-2 tabular-nums">{b.students.length}</td>
                            <td className="w-1/3">
                              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${DOT[b.band]}`} style={{ width: `${pct}%` }} /></div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
              <PercentileDistribution rows={cls.percentileDistribution} L={L} />
              {classPercentiles && <InstructionalAreaPercentiles rows={classPercentiles.areas} L={L} />}
              <InstructionalAreas rows={cls.areaBreakdown} L={L} classAverageRit={cls.classAverageRit} nationalAverageRit={cls.nationalAverageRit} scope="class" />
              {cls.bands.some((b) => b.students.length > 0) && <p className="-mb-2 max-w-2xl text-xs text-slate-500">ℹ️ {t(L, "personalizedPlan.percentileNote")}</p>}
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
