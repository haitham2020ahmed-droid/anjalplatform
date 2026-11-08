import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, EmptyState, ReportHeader, toneOfPct } from "@/components/report-kit";
import { AutoRefresh } from "@/components/teacher/auto-refresh";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { liveClass, type LiveStatus } from "@/server/analytics/live-class";

export const metadata = { title: "The class right now" };
export const dynamic = "force-dynamic";

const LOOK: Record<LiveStatus, { icon: string; label: string; card: string }> = {
  HELP: { icon: "🆘", label: "Needs help now", card: "bg-rose-50 ring-rose-300" },
  IDLE: { icon: "⏸️", label: "Stopped", card: "bg-amber-50 ring-amber-200" },
  WORKING: { icon: "✅", label: "Working", card: "bg-emerald-50 ring-emerald-200" },
  AWAY: { icon: "⚪", label: "Not on now", card: "bg-white ring-slate-200" },
};

/**
 * 🟢 The class right now (Nov 2026, IXL "Live Classroom"): for a lab lesson — each student as a card: needs help now
 * (3 wrong in a row), stopped, working, or not on; the skill on their screen; today's questions and accuracy. Help
 * first. The numbers refresh every 20 seconds while the page is open and visible (src/components/teacher/auto-refresh).
 */
export default async function LiveClassPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => String(c.id) === sp.classId) ?? classes[0];
  const v = klass ? await liveClass(repo, actor, String(klass.id)) : null;
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-300 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="🟢" title="The class right now" print={false}
        subtitle="Who is working, who has stopped and who needs help now — for a lab lesson." who={klass ? <bdi>{String(klass.name)}</bdi> : undefined}
        filters={classes.length > 1 ? <div className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} prefetch={false} href={`/teacher/reports/live-class?${new URLSearchParams({ classId: String(c.id) })}`} className={chip(String(c.id) === String(klass?.id))}>{String(c.name)}</Link>)}</div> : undefined} />
      {!v ? <EmptyState icon="🏫" title="You do not teach any class yet." /> : (
        <>
          <div className="mb-4"><AutoRefresh seconds={v.refreshSeconds} at={v.at} /></div>
          <AtAGlance items={[
            { icon: "🆘", label: "Needs help now", value: v.counts.HELP, meaning: "3 wrong answers in a row", tone: v.counts.HELP ? "warn" : "good" },
            { icon: "✅", label: "Working", value: v.counts.WORKING, meaning: "answered in the last 3 minutes" },
            { icon: "⏸️", label: "Stopped", value: v.counts.IDLE, meaning: "nothing in the last 3 minutes", tone: v.counts.IDLE ? "warn" : "neutral" },
            { icon: "✍️", label: "Questions today", value: v.today.answered, meaning: t("{n} students practised today", { n: v.today.active }) },
            { icon: "🎯", label: "Accuracy today", value: v.today.accuracy !== null ? `${v.today.accuracy}%` : "—", tone: toneOfPct(v.today.accuracy) },
          ]} />
          {!v.students.length ? <EmptyState icon="🧑‍🎓" title="No students in this class yet." /> : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-live-students={v.students.length}>
              {v.students.map((x) => {
                const look = LOOK[x.status];
                return (
                  <li key={x.id} className={`rounded-2xl p-4 ring-1 ${look.card}`} data-live-status={x.status}>
                    <div className="flex items-start justify-between gap-2">
                      <Link prefetch={false} href={`/teacher/practice-analytics?${new URLSearchParams({ classId: v.classId, student: x.id, range: "TODAY" })}`} className="font-semibold text-brand-navy hover:underline"><bdi>{x.name}</bdi></Link>
                      <span className="shrink-0 text-sm font-semibold" title={t(look.label)}>{look.icon} {t(look.label)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-700">{x.skill ? <>🧩 {t(x.skill)}</> : <span className="text-slate-400">{t("No practice today")}</span>}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-slate-600">
                      <span>{t("{n} today", { n: x.today.answered })}</span>
                      {x.today.accuracy !== null && <span>{x.today.accuracy}%</span>}
                      {x.minutesAgo !== null && <span>{x.minutesAgo === 0 ? t("just now") : t("{n} min ago", { n: x.minutesAgo })}</span>}
                      {x.guessing && <span className="rounded-full bg-amber-100 px-1.5 font-semibold text-amber-900" title={t("Answering too fast to have read the questions")}>⚡ {t("guessing")}</span>}
                    </div>
                    {x.streak.length > 0 && <p className="mt-2 flex gap-1" aria-label={t("The last answers")}>{x.streak.map((ok, i) => <span key={i} className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"}`} />)}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">{t("🆘 3 wrong answers in a row · ✅ answered in the last 3 minutes · ⏸️ active in the last 15 minutes but nothing in the last 3 · ⚪ nothing in the last 15 minutes. Live games are not counted.")}</p>
        </>
      )}
    </AppShell>
  );
}
