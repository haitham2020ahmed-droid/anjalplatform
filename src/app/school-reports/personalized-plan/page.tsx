import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { BAND_RULE } from "@/server/map/personal-plan";
import { personalizedPlanForStudent } from "@/server/reports/school-reports";
import { localeFrom, t } from "@/i18n/school-reports";

export const metadata = { title: "Personalized Plan" };
const TITLE = { BELOW: "🟠 Below level", ON: "🔵 On level", ABOVE: "🟢 Above level" } as const;

/** 📋 Personalized Plan report, for one student: their MAP band, goals, strengths, resources and monitoring. */
export default async function PersonalizedPlanReportPage({ searchParams }: { searchParams: Promise<{ studentId?: string; subject?: string; lang?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const L = localeFrom(sp.lang);
  const studentId = String(sp.studentId ?? "");
  const subject = sp.subject === "language" ? "LANGUAGE" : "READING";
  let p: Awaited<ReturnType<typeof personalizedPlanForStudent>> | null = null;
  let error: string | null = null;
  if (studentId) {
    try { p = await personalizedPlanForStudent(repo, actor, studentId, subject); }
    catch (e) { if (e instanceof ForbiddenError) error = e.message; else throw e; }
  }
  const q = (extra: Record<string, string>) => `/school-reports/personalized-plan?${new URLSearchParams({ studentId, subject: subject.toLowerCase(), lang: L, ...extra })}`;
  const pill = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-bold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <PageHeader back={{ href: `/school-reports?studentId=${studentId}&lang=${L}`, label: t(L, "common.back") }} icon="📋" title={t(L, "personalizedPlan.title")}>
          {p && <PrintButton />}
        </PageHeader>
        <nav className="mb-5 flex gap-2" aria-label={t(L, "common.subject")}>
          <Link href={q({ subject: "reading" })} className={pill(subject === "READING")}>📖 {t(L, "common.subject.reading")}</Link>
          <Link href={q({ subject: "language" })} className={pill(subject === "LANGUAGE")}>✍️ {t(L, "common.subject.language")}</Link>
        </nav>
      </div>
      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{error}</p>}
      {!error && !p && <p className="text-slate-600">{t(L, "personalizedPlan.noPlan")}</p>}
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
            {p.goals.length === 0 ? <p className="mt-2 text-sm text-slate-600">{t(L, "common.noData")}</p> : (
              <ol className="mt-3 space-y-2 text-sm">
                {p.goals.map((g) => (
                  <li key={g.areaId}>
                    <b>{g.area}</b>{g.meanRit !== null && <span className="text-slate-500"> · mean RIT {g.meanRit}</span>}
                    <ul className="ms-4 list-disc text-slate-700">
                      {g.skills.map((k) => <li key={k.id}>{k.standards.length > 0 && <code className="me-1 text-xs text-emerald-800">{k.standards.join(", ")}</code>}{k.name}</li>)}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
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
    </AppShell>
  );
}
