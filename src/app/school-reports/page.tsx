import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { schoolReportsRoster } from "@/server/reports/school-reports";
import { LANG_NAMES, localeFrom, t } from "@/i18n/school-reports";

export const metadata = { title: "School Reports" };

/** 🗒️ School Reports: pick a class and student, then open one of the three per-student reports. */
export default async function SchoolReportsPage({ searchParams }: { searchParams: Promise<{ classId?: string; studentId?: string; lang?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const L = localeFrom(sp.lang);
  const roster = await schoolReportsRoster(repo, actor);
  const classId = roster.some((c) => c.classId === sp.classId) ? String(sp.classId) : (roster[0]?.classId ?? "");
  const klass = roster.find((c) => c.classId === classId) ?? null;
  const studentId = klass?.students.some((s) => s.studentId === sp.studentId) ? String(sp.studentId) : (klass?.students[0]?.studentId ?? "");
  const q = (extra: Record<string, string>) => `/school-reports?${new URLSearchParams({ classId, studentId, lang: L, ...extra })}`;
  const reports = [
    { href: "personalized-plan", icon: "📋", title: t(L, "schoolReports.personalizedPlan"), hint: t(L, "schoolReports.personalizedPlan.hint") },
    { href: "diagnostic-analysis", icon: "🩺", title: t(L, "schoolReports.diagnosticAnalysis"), hint: t(L, "schoolReports.diagnosticAnalysis.hint") },
    { href: "final-report", icon: "🗒️", title: t(L, "schoolReports.finalReport"), hint: t(L, "schoolReports.finalReport.hint") },
  ];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader icon="🗒️" title={t(L, "schoolReports.title")} subtitle={t(L, "schoolReports.subtitle")}>
        <Link href={q({ lang: L === "ar" ? "en" : "ar" })} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{LANG_NAMES[L === "ar" ? "en" : "ar"]}</Link>
      </PageHeader>
      {roster.length === 0 ? <p className="rounded-3xl bg-white p-8 text-center text-slate-600 ring-1 ring-slate-200">{t(L, "schoolReports.noStudents")}</p> : (
        <>
          <Section title={t(L, "schoolReports.pickClass")} icon="🏫" className="mb-4">
            <nav className="flex flex-wrap gap-2" aria-label={t(L, "schoolReports.pickClass")}>
              {roster.map((c) => (
                <Link key={c.classId} href={q({ classId: c.classId, studentId: "" })} aria-current={c.classId === classId ? "page" : undefined}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold ${c.classId === classId ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>
                  {c.className} <span className="font-normal opacity-70">· G{c.grade}</span>
                </Link>
              ))}
            </nav>
          </Section>
          <Section title={t(L, "schoolReports.pickStudent")} icon="🧑‍🎓" className="mb-6">
            <nav className="flex flex-wrap gap-2" aria-label={t(L, "schoolReports.pickStudent")}>
              {(klass?.students ?? []).map((s) => (
                <Link key={s.studentId} href={q({ studentId: s.studentId })} aria-current={s.studentId === studentId ? "page" : undefined}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold ${s.studentId === studentId ? "bg-brand-teal text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>
                  {s.name}
                </Link>
              ))}
            </nav>
          </Section>
          <div className="grid gap-4 md:grid-cols-3">
            {reports.map((r) => (
              <article key={r.href} className="lift rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <p className="text-3xl">{r.icon}</p>
                <h2 className="mt-2 text-lg font-bold text-brand-navy">{r.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{r.hint}</p>
                {studentId ? (
                  <Link href={`/school-reports/${r.href}?${new URLSearchParams({ studentId, lang: L })}`} className="mt-4 inline-block rounded-xl bg-brand-navy px-4 py-2 text-sm font-bold text-white hover:bg-brand-purple">
                    {t(L, "schoolReports.open")}
                  </Link>
                ) : <p className="mt-4 text-sm text-slate-400">{t(L, "schoolReports.noStudents")}</p>}
              </article>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
