import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReportHeader, ReportIntro, ReportSummary } from "@/components/report-kit";
import { hubSummary } from "@/lib/report-summaries";
import { LineIcon } from "@/components/ui/line-icon";
import { hubCards, MOVED_REPORTS, openReportUrl, REPORT_CATEGORIES, REPORT_PERIODS, reportByKey, type HubCard, type ReportPeriod } from "@/components/teacher/report-catalog";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { readableClasses } from "@/server/teacher/coordinators";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { canSeeNafsCached } from "@/server/teacher/nafs-access";
import { weeklySummary } from "@/server/insights/class-compare";
import { teacherHomeSummary } from "@/server/teacher/needs-attention";
import { favoriteReportsFor } from "@/server/teacher/favorites";
import { PinnedReports } from "@/components/teacher/report-favorites";
import { watchedStudentCount } from "@/server/teacher/watchlist";

export const metadata = { title: "Reports" };

type SP = { report?: string; classId?: string; studentId?: string; period?: string; msg?: string };

/**
 * 📊 Reports: the ONE place for every report, in four groups — My class · Students · Programs · Follow-up — with the
 * teacher's week in two lines on top ("This week: 12 new stars · 3 students need review · weakest class skill:
 * Inference"). A card opens its report AT ONCE as a full page; the bar on top of it (src/components/teacher/report-bar.tsx)
 * switches the class / student, the date range (this term by default), downloads it and sends it to the family. Old
 * wizard addresses (?report=…) and the merged cards open the page that has them now. Access: readable classes only.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const cid = classes.find((c) => c.id === sp.classId)?.id ?? classes[0]?.id ?? "";

  // ?report=… (old wizard links, a student-only report for another class): open the report itself
  if (sp.report) {
    const moved = MOVED_REPORTS[sp.report];
    if (moved) redirect(cid && moved !== "/teacher/students" ? `${moved}?classId=${encodeURIComponent(cid)}` : moved);
    const r = reportByKey(sp.report);
    if (r && cid) {
      const members = r.studentUrl ? await classMembers(repo, cid) : [];
      const names = !r.classUrl && members.length ? await studentNames(repo, members) : new Map<string, { name: string }>();
      const first = [...members].sort((a, b) => (names.get(a)?.name ?? "").localeCompare(names.get(b)?.name ?? ""))[0];
      const period = REPORT_PERIODS.some((p) => p.key === sp.period) ? (sp.period as ReportPeriod) : undefined;
      const url = openReportUrl(r, { classId: cid, studentId: sp.studentId && members.includes(sp.studentId) ? sp.studentId : undefined, period, firstStudent: first });
      if (url) redirect(url);
    }
  }

  const [me, { t }, nafs, week, attention, favorites, watchedCount] = await Promise.all([
    getActor(), getT(), canSeeNafsCached(repo, actor).catch(() => false), weeklySummary(repo, actor).catch(() => null),
    teacherHomeSummary(repo, actor).catch(() => ({ needsAttention: 0 })),
    favoriteReportsFor(repo, actor).catch(() => []),
    watchedStudentCount(repo, actor).catch(() => 0),
  ]);
  const cards = hubCards({ nafs: nafs || actor.role !== "TEACHER" });
  // 🚫 r91: Early warning / Enrichment counts dropped from here — earlyWarning()'s full scan and
  // excellingStudentCount() blew this page's DB-call budget (43 vs 18). Only "Needs attention" (already cheap,
  // already used on /teacher) keeps a live number; the other two are quick links without a count.
  const daily = [
    { label: "Needs attention", value: attention.needsAttention, line: "alert" as const, href: `/teacher/reports/needs-attention${cid ? `?${new URLSearchParams([["classId", cid]])}` : ""}`, reportKey: "NEEDS_ATTENTION" as const },
    { label: "Early warning", value: null as number | null, line: "alert" as const, href: "/teacher/reports/early-warning", reportKey: "EARLY_WARNING" as const },
    { label: "Enrichment opportunities", value: null as number | null, line: "sparkle" as const, href: `/teacher/plans?${new URLSearchParams([["kind", "ENRICHMENT"], ...(cid ? [["classId", cid]] : [])])}`, reportKey: "ENRICHMENT" as const },
  ];
  const hrefOf = (c: HubCard) => {
    if (c.link) return c.link.href(cid);
    const r = c.report!;
    return r.classUrl && cid ? openReportUrl(r, { classId: cid })! : `/teacher/reports?${new URLSearchParams({ report: r.key, ...(cid ? { classId: cid } : {}) })}`;
  };
  return (
    <AppShell name={String(me!.user.displayName)}>
      <ReportHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} title="Reports" print={false}
        subtitle={t("Every report in one place: your class, each student, the programs and the follow-up.")} />
      <ReportIntro text="Every report in one place; each report ends with a short summary and the next steps." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {week && (
        <section aria-label={t("This week")} data-weekly-summary className="mb-6 rounded-2xl bg-gradient-to-r from-teal-50 to-white px-5 py-4 ring-1 ring-teal-200">
          <p className="font-semibold text-brand-navy">{t("This week: {stars} new stars · {review} students need review · weakest class skill: {skill}", { stars: week.newStars, review: week.needReview, skill: week.weakest ?? "—" })}</p>
          <p className="mt-1 text-sm text-slate-600">{t("Practice: {minutes} minutes by {active} of {total} students.", { minutes: week.minutes, active: week.active, total: week.students })}</p>
        </section>
      )}
      <section aria-label={t("Daily check")} data-daily-check className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold tracking-tight text-brand-navy"><LineIcon name="alert" className="h-5 w-5 text-brand-teal" />{t("Daily check")}</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {daily.map((d) => (
            <li key={d.label}>
              <Link prefetch={false} href={d.href} data-daily={d.label}
                className="group flex h-full items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-px hover:shadow-card hover:ring-brand-teal/60">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-50 text-brand-navy ring-1 ring-slate-200 group-hover:text-brand-teal"><LineIcon name={d.line} /></span>
                <span className="min-w-0">
                  {d.value !== null && <span className="block text-2xl font-bold text-brand-navy">{d.value}</span>}
                  <span className="block text-sm leading-snug text-slate-500">{t(d.label)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <PinnedReports favorites={favorites} />
      {actor.role === "TEACHER" && (
        <p className="mb-6">
          <Link prefetch={false} href="/teacher/watchlist" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-navy hover:underline">
            <LineIcon name="search" className="h-4 w-4" />{t("Watchlist")}{watchedCount > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-xs tabular-nums text-slate-600" dir="ltr">{watchedCount}</span>}
          </Link>
        </p>
      )}
      {!classes.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("You do not teach any class yet.")}</p> : (
        <div className="space-y-8">
          {REPORT_CATEGORIES.map((c) => (
            <section key={c.key} aria-labelledby={`cat-${c.key}`} data-group={c.key}>
              <div className="mb-3 flex items-baseline gap-3 border-b border-slate-200 pb-2">
                <h2 id={`cat-${c.key}`} className="flex items-center gap-2 text-base font-semibold tracking-tight text-brand-navy">
                  <LineIcon name={c.line} className="h-5 w-5 text-brand-teal" />{t(c.key)}
                </h2>
                <p className="text-sm text-slate-500">{t(c.hint)}</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cards.filter((x) => x.category === c.key).map((x) => (
                  <li key={x.key}>
                    <Link prefetch={false} href={hrefOf(x)} data-report={x.key}
                      className="group flex h-full min-h-24 items-start gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-px hover:shadow-card hover:ring-brand-teal/60">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-50 text-brand-navy ring-1 ring-slate-200 group-hover:text-brand-teal"><LineIcon name={x.line} /></span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-800 group-hover:text-brand-navy">{t(x.title)}</span>
                        <span className="mt-0.5 block text-sm leading-snug text-slate-500">{t(x.hint)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <ReportSummary summary={hubSummary(week, { classId: cid || null, admin: actor.role !== "TEACHER" })} />
    </AppShell>
  );
}
