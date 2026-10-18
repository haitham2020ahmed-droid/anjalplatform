import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, EmptyState, ReportHeader, ReportIntro, ReportSection, ReportSummary, type Glance } from "@/components/report-kit";
import { classCompareSummary } from "@/lib/report-summaries";
import { InsightActions } from "@/components/teacher/insight-actions";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { readableClasses } from "@/server/teacher/coordinators";
import { classMonth, peerCompare, type MonthWindow, type PeerRow } from "@/server/insights/class-compare";

export const metadata = { title: "Class progress" };

/**
 * 📈 Class progress (Reports → My class): the class compared with ITSELF — this month against last month (new stars,
 * skills improved, skills still weak, effort, practice time) — never ranked against other teachers' classes; then
 * each student against their own classmates (teachers and admins only): above / around / below the class middle and
 * growth against the class, with the "weak but growing fast" (encourage) and "strong but flat" (challenge) lists.
 */
export default async function ClassProgressReport({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const [m, peers] = klass ? await Promise.all([classMonth(repo, actor, klass.id), peerCompare(repo, actor, klass.id)]) : [null, null];
  const arrow = (a: number, b: number) => (a > b ? "↑" : a < b ? "↓" : "→");
  const tone = (a: number, b: number): Glance["tone"] => (a > b ? "good" : a < b ? "warn" : "neutral");
  const glance = (a: MonthWindow, b: MonthWindow): Glance[] => [
    { icon: "⭐", label: "New stars", value: `${a.newStars} ${arrow(a.newStars, b.newStars)}`, meaning: t("Last month: {n}", { n: b.newStars }), tone: tone(a.newStars, b.newStars) },
    { icon: "✍️", label: "Effort (answers)", value: `${a.answers} ${arrow(a.answers, b.answers)}`, meaning: t("{n} students practised · last month {m}", { n: a.active, m: b.active }), tone: tone(a.answers, b.answers) },
    { icon: "⏱️", label: "Practice time", value: `${a.minutes}m ${arrow(a.minutes, b.minutes)}`, meaning: t("Last month: {n} minutes", { n: b.minutes }), tone: tone(a.minutes, b.minutes) },
    { icon: "🎯", label: "Accuracy", value: a.accuracy === null ? "—" : `${a.accuracy}%`, meaning: b.accuracy === null ? t("No answers last month") : t("Last month: {n}%", { n: b.accuracy }), tone: a.accuracy !== null && b.accuracy !== null ? tone(a.accuracy, b.accuracy) : "neutral" },
  ];
  const PeerList = ({ rows, empty }: { rows: PeerRow[]; empty: string }) => !rows.length ? <p className="text-sm text-slate-600">{t(empty)}</p> : (
    <ul className="space-y-2">{rows.map((r) => (
      <li key={r.studentId} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <p><Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link> <span className="text-sm text-slate-600">· {r.fasterThan === null ? t("no practice this month") : t("progressing faster than {n}% of classmates", { n: r.fasterThan })}</span></p>
        <InsightActions t={t} target={{ classId: klass!.id, studentId: r.studentId }} only={["plan", "group", "parent"]} className="mt-2" />
      </li>
    ))}</ul>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="📈" title="Class progress" who={klass ? <bdi>{klass.name}</bdi> : undefined}
        subtitle="This class this month, compared with the same class last month. Never ranked against other classes." />
      <ReportIntro text="This class this month against last month, and how each student is growing compared with classmates." />
      {!klass || !m || !peers ? <EmptyState icon="🏫" title="You do not teach any class yet." /> : (
        <>
          <AtAGlance items={glance(m.thisMonth, m.lastMonth)} />
          <p className="mb-4 text-xs text-slate-500">{t("This month = the last 30 days; last month = the 30 days before.")}</p>
          <div className="grid gap-5 lg:grid-cols-2">
            <ReportSection title="Skills improved" icon="📈">
              {!m.improved.length ? <p className="text-sm text-slate-600">{t("No skill improved clearly yet this month.")}</p> : (
                <ul className="divide-y divide-slate-100 text-sm">{m.improved.map((k) => <li key={k.skillId} className="flex justify-between gap-2 py-1.5"><span data-content lang="en">{k.name}</span><span className="tabular-nums text-emerald-700" dir="ltr">{k.from}% → {k.to}%</span></li>)}</ul>
              )}
            </ReportSection>
            <ReportSection title="Skills still weak" icon="🧱">
              {!m.weak.length ? <p className="text-sm text-slate-600">{t("No weak skill this month.")}</p> : (
                <ul className="space-y-2 text-sm">{m.weak.map((k) => (
                  <li key={k.skillId} className="rounded-xl p-2 ring-1 ring-slate-200">
                    <p className="flex justify-between gap-2"><span data-content lang="en">{k.name}</span><span className="text-rose-700"><span className="tabular-nums" dir="ltr">{k.accuracy}%</span>{k.stillWeak ? ` · ${t("also last month")}` : ""}</span></p>
                    <InsightActions t={t} target={{ classId: klass.id, skillId: k.skillId }} only={["reteach", "lesson"]} className="mt-1" />
                  </li>
                ))}</ul>
              )}
            </ReportSection>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <ReportSection title="Weak but growing fast" icon="🌱" hint={t("Encourage them: below the class middle, growing faster than most.")}>
              <PeerList rows={peers.encourage} empty="Nobody in this list right now." />
            </ReportSection>
            <ReportSection title="Strong but flat" icon="🧗" hint={t("Challenge them: above the class middle, no new star this month.")}>
              <PeerList rows={peers.challenge} empty="Nobody in this list right now." />
            </ReportSection>
          </div>
          <ReportSection title="Each student against the class" icon="👥" hint={t("Teachers only: students and parents never see this. One line per student — no numbers to compare by hand.")}>
            <ul className="space-y-2">{peers.rows.map((r) => {
              const pill = r.position === "above" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : r.position === "below" ? "bg-rose-50 text-rose-800 ring-rose-200" : r.position === "around" ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-slate-50 text-slate-600 ring-slate-200";
              const label = r.position === "above" ? "Above the class middle" : r.position === "below" ? "Below the class middle" : r.position === "around" ? "Around the class middle" : "Not enough answers yet";
              return (
                <li key={r.studentId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="min-w-0">
                    <p><Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link> <span className={`ms-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${pill}`}>{t(label)}</span></p>
                    <p className="mt-0.5 text-sm text-slate-600" data-content lang="en">{r.sentence}</p>
                  </div>
                  {r.newStars > 0 && <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200" dir="ltr">⭐ {r.newStars}</span>}
                </li>
              );
            })}</ul>
          </ReportSection>
          <ReportSummary summary={classCompareSummary(m, peers, klass.id)} />
        </>
      )}
    </AppShell>
  );
}
