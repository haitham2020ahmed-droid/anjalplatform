import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Callout, Meter, ReportHeader } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { reportCategories } from "@/server/student/student-home";
import { studentWeek } from "@/server/teacher/classroom";
import { streakAndPoints } from "@/server/student/streak";
import { classChallenge } from "@/server/teacher/extras";
import { listCertificates } from "@/server/motivation/certificates";
import { CertificateList } from "@/components/motivation/certificate-list";
import { setMyGoalAction } from "@/app/student/goal-actions";
import { getT } from "@/i18n/server";
import type { Row } from "@/server/seeding/repo";

export const metadata = { title: "My Reports" };

const bar = (p: number, total: number) => (
  <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(p, total)}>
    <div className="h-full rounded-full bg-brand-teal" style={{ width: `${Math.min(100, Math.round((100 * p) / Math.max(1, total)))}%` }} />
  </div>
);

/**
 * 📊 My Reports (UI reorg Phase 2): the student's own reports in clear categories (existing pages only), and
 * "My week" — my goal, our class goal, practice days, streak, the class challenge and the question of the day
 * (moved here from the old home so the home stays simple; nothing removed).
 */
export default async function MyReportsPage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const sid = actor.studentId!;
  const student = await repo.findUnique("Student", { id: sid });
  const [{ t }, wk, streak, certificates, challenge] = await Promise.all([
    getT(), studentWeek(repo, actor).catch(() => null), streakAndPoints(repo, sid), listCertificates(repo, actor).catch(() => []),
    student?.gradeId ? classChallenge(repo, String(student.schoolId), String(student.gradeId)).catch(() => []) : Promise.resolve([] as Awaited<ReturnType<typeof classChallenge>>),
  ]);
  const mine = (await repo.findMany("ClassMembership", { studentId: sid, leftAt: null }, { select: ["classId"], take: 1 }))[0] as Row | undefined;
  const cats = reportCategories(sid);
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/student", label: "Home" }} icon="📊" title="My Reports" subtitle={t("All my reports in one place")} who={String(me.displayName)} />
      {wk && (
        <Callout kind="praise" title="My week" className="mb-5" items={[
          t("This week: {a} answers · {m} min", { a: wk.answers, m: wk.minutes }),
          streak.streak ? t("{n}-day streak", { n: streak.streak }) + " 🔥" : t("Practise a little every day."),
        ]} />
      )}

      <section id="my-week" aria-labelledby="my-week-h" className="scroll-mt-24 rounded-3xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
        <h2 id="my-week-h" className="text-xl font-semibold text-brand-navy">📅 {t("My Week")}</h2>
        {sp.goal && <p className="mt-1 text-sm text-emerald-800">{String(sp.goal).slice(0, 200)}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-orange-50 px-3 py-1 font-semibold text-orange-900 ring-1 ring-orange-200">🔥 {t("{n}-day streak", { n: streak.streak })}</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-900 ring-1 ring-amber-200">⭐ {t("{n} points", { n: streak.points.toLocaleString("en") })}</span>
        </div>
        {wk && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <h3 className="font-semibold text-brand-navy">🎯 {t("My goal this week")}</h3>
              {wk.mine ? (
                <><p className="mt-1 text-2xl font-semibold text-brand-navy">{wk.mine.progress} / {wk.mine.target} <span className="text-base font-normal text-slate-500">{t(wk.mine.kind === "MINUTES" ? "minutes" : "answers")}</span> {wk.mine.done ? "🎉" : ""}</p>{bar(wk.mine.progress, wk.mine.target)}</>
              ) : (
                <form action={setMyGoalAction} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <input name="target" type="number" min={5} max={600} defaultValue={50} aria-label={t("My goal this week")} className="min-h-11 w-20 rounded-lg border border-slate-300 px-2" />
                  <select name="kind" aria-label={t("My goal this week")} className="min-h-11 rounded-lg border border-slate-300 px-2"><option value="ANSWERS">{t("answers")}</option><option value="MINUTES">{t("minutes")}</option></select>
                  <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Set my goal")}</button>
                </form>
              )}
              <p className="mt-2 text-xs text-slate-500">{t("This week: {a} answers · {m} min", { a: wk.answers, m: wk.minutes })}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <h3 className="font-semibold text-brand-navy">👥 {t("Our class goal")}</h3>
              {wk.klass ? <><p className="mt-1 text-2xl font-semibold text-brand-navy">{wk.klass.progress} / {wk.klass.target} {wk.klass.done ? "🎉" : ""}</p>{bar(wk.klass.progress, wk.klass.target)}</> : <p className="mt-1 text-sm text-slate-500">{t("Nothing here yet")}</p>}
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <h3 className="font-semibold text-brand-navy">📅 {t("Practice days")}</h3>
              {wk.rhythm ? <><p className="mt-1 text-2xl font-semibold text-brand-navy">{wk.rhythm.daysDone} / {wk.rhythm.days}</p><Meter className="mt-2" value={wk.rhythm.daysDone} total={wk.rhythm.days} /></> : <p className="mt-1 text-sm text-slate-500">{t("Practise a little every day.")}</p>}
            </div>
          </div>
        )}
        {/* the Question of the Day is on the home page now, under the welcome line (Games Part 3) */}
        {challenge.length > 0 && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {challenge.length > 0 && (
              <div className="rounded-2xl bg-indigo-50/60 p-4 ring-1 ring-indigo-100">
                <h3 className="font-semibold text-brand-navy">🏁 {t("Class challenge this week")}</h3>
                <ol className="mt-2 space-y-1">{challenge.map((c) => <li key={c.classId} className={`flex items-center justify-between rounded-xl px-3 py-1.5 ${c.classId === mine?.classId ? "bg-indigo-600 font-semibold text-white" : "bg-white ring-1 ring-slate-200"}`}><span>{c.rank}. <bdi>{c.name}</bdi></span><span className="tabular-nums">{c.perStudent}</span></li>)}</ol>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 📜 My Certificates (Games Part 3): automatic (level up, finished plan) and from my teacher */}
      <section id="certificates" aria-labelledby="cert-h" className="mt-6 scroll-mt-24 rounded-3xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
        <h2 id="cert-h" className="text-xl font-semibold text-brand-navy">📜 {t("My Certificates")}</h2>
        <CertificateList items={certificates} empty={t("No certificates yet. Move up a level or finish a plan to get one!")} />
      </section>

      {cats.map((c) => (
        <section key={c.title} aria-label={t(c.title)} className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-brand-navy"><span aria-hidden="true">{c.icon}</span>{t(c.title)}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {c.links.map((l) => (
              <li key={l.href}><Link prefetch={false} href={l.href} className="lift flex min-h-20 items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 hover:ring-brand-teal">
                <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-50 text-2xl ring-1 ring-slate-100">{l.icon}</span>
                <span className="min-w-0"><span className="block font-semibold text-brand-navy">{t(l.label)}</span><span className="block text-sm text-slate-600">{t(l.hint)}</span></span>
              </Link></li>
            ))}
          </ul>
        </section>
      ))}
    </AppShell>
  );
}
