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

  const [me, { t }, nafs, week] = await Promise.all([getActor(), getT(), canSeeNafsCached(repo, actor).catch(() => false), weeklySummary(repo, actor).catch(() => null)]);
  const cards = hubCards({ nafs: nafs || actor.role !== "TEACHER" });
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
