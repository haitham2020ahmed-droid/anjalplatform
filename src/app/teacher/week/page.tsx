import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { FirstWeekChecklist } from "@/components/teacher/checklist";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { onboarding, weekSuggestions } from "@/server/teacher/week-plan";
import { classTickets, classWeek } from "@/server/teacher/classroom";
import { pickerSkills } from "@/server/teacher/worksheet";
import { myWeek } from "@/server/teacher/my-week";
import { classGoalAction, exitTicketAction, planNextWeekAction, rhythmAction } from "./actions";

export const metadata = { title: "My week" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

/**
 * 📅 My Week, one simple page for one class: this week's plan day by day (Sunday → Thursday), what is due (with how
 * many finished), who has not started, and the Live Challenges planned. One primary button: Plan next week.
 * The class goal, the weekly rhythm and the exit ticket are folded under "More for this week".
 */
export default async function WeekPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const { t, lang } = await getT();
  const sp = await searchParams;
  const [sug, ob] = await Promise.all([weekSuggestions(repo, actor), actor.role === "TEACHER" ? onboarding(repo, actor) : Promise.resolve(null)]);
  const classId = sug.some((c) => c.classId === sp.classId) ? String(sp.classId) : sug[0]?.classId ?? "";
  const cur = sug.find((c) => c.classId === classId);
  const [w, wk, tickets, skills] = classId
    ? await Promise.all([myWeek(repo, actor, classId), classWeek(repo, actor, classId), classTickets(repo, actor, classId), pickerSkills(repo, actor)])
    : [null, null, [], []];
  const klass = classId ? await repo.findUnique("Class", { id: classId }) : null;
  const grade = klass ? Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0) : 0;
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const card = "min-w-0 rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80";
  const box = "min-h-11 rounded-lg border border-slate-300 px-2 py-1.5";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="📅" title="My Week" subtitle={t("This week for your class: the plan for each day, what is due, who has not started and the Live Challenges.")}>
        {classId && <form action={planNextWeekAction}><input type="hidden" name="classId" value={classId} /><button className="inline-flex min-h-12 items-center rounded-2xl bg-brand-navy px-6 font-semibold text-white hover:bg-brand-purple">{t("Plan next week")}</button></form>}
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {ob && !ob.hidden && ob.done < ob.steps.length && <FirstWeekChecklist steps={ob.steps} back="/teacher/week" />}
      {!sug.length || !w ? <EmptyState icon="🏫" title="You do not teach a class yet." text="Ask the school admin to add your class." /> : (
        <>
          {sug.length > 1 && <nav aria-label={t("Classes")} className="mb-5 flex flex-wrap gap-2">{sug.map((c) => <Link key={c.classId} prefetch={false} href={`/teacher/week?classId=${c.classId}`} className={chip(c.classId === classId)}><bdi>{c.className}</bdi></Link>)}</nav>}

          <section aria-labelledby="days-h">
            <h2 id="days-h" className="mb-3 text-xl font-semibold text-brand-navy">{t("The plan for each day")}</h2>
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {w.days.map((d, i) => (
                <li key={d.date} className={`${card} ${d.date === today ? "ring-2 ring-brand-teal" : ""}`}>
                  <p className="font-semibold text-brand-navy">{t(WEEKDAYS[i])} <span className="text-sm font-normal text-slate-500">{day(d.date)}</span></p>
                  {d.items.length === 0 ? <p className="mt-2 text-sm text-slate-500"><span aria-hidden="true">🌤️ </span>{t("Nothing planned")}</p> : (
                    <ul className="mt-2 space-y-1.5">
                      {d.items.map((x) => (
                        <li key={`${x.kind}-${x.id}`}>
                          <Link prefetch={false} href={x.href} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                            <span className={`me-1 rounded px-1.5 text-xs font-semibold ${x.kind === "DUE" ? "bg-orange-50 text-orange-800" : "bg-sky-50 text-sky-800"}`}>{t(x.kind === "DUE" ? "Due" : "Starts")}</span>
                            <span className="text-slate-800">{x.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <section className={card} aria-labelledby="due-h">
              <h2 id="due-h" className="text-lg font-semibold text-brand-navy">{t("Due this week")}</h2>
              {w.due.length === 0 ? <p className="mt-2 text-slate-500">{t("Nothing is due this week.")}</p> : (
                <ul className="mt-2 space-y-2">{w.due.map((x) => (
                  <li key={x.id}><Link prefetch={false} href={x.href} className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 hover:bg-white hover:ring-1 hover:ring-brand-teal">
                    <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{x.title}</span><span className="text-xs text-slate-500">{day(x.dueAt.slice(0, 10))}</span></span>
                    <span dir="ltr" className="shrink-0 text-sm font-semibold tabular-nums text-brand-navy">{x.done} / {x.total}</span>
                  </Link></li>
                ))}</ul>
              )}
            </section>
            <section className={card} aria-labelledby="ns-h">
              <h2 id="ns-h" className="text-lg font-semibold text-brand-navy">{t("Not started yet")} <span className="text-base font-normal text-slate-500">· {w.notStarted.length}</span></h2>
              {w.notStarted.length === 0 ? <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-800"><span aria-hidden="true">🎉 </span>{t("Everyone has started. Well done!")}</p> : (
                <ul className="mt-2 space-y-1.5">{w.notStarted.slice(0, 15).map((x) => (
                  <li key={x.studentId}><Link prefetch={false} href={`/teacher/students/${x.studentId}`} className="block rounded-lg px-2 py-1.5 hover:bg-slate-50"><bdi className="font-medium text-slate-900">{x.name}</bdi><span className="block truncate text-xs text-slate-500">{x.titles.join(" · ")}</span></Link></li>
                ))}</ul>
              )}
              {w.notStarted.length > 15 && <Link prefetch={false} href={`/teacher/attention?kind=not-started&classId=${classId}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-teal underline">{t("See all")}</Link>}
            </section>
            <section className={card} aria-labelledby="games-h">
              <h2 id="games-h" className="text-lg font-semibold text-brand-navy">{t("Live Challenges this week")}</h2>
              {w.games.length === 0 ? <p className="mt-2 text-slate-500">{t("No Live Challenge planned yet.")}</p> : (
                <ul className="mt-2 space-y-1.5">{w.games.map((g) => (
                  <li key={g.id}><Link prefetch={false} href={g.href} className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"><span className="truncate">{g.title}</span><span className="shrink-0 text-xs text-slate-500">{g.status === "FINISHED" ? t("Played") : t("Planned")} · {day(g.when.slice(0, 10))}</span></Link></li>
                ))}</ul>
              )}
              <Link prefetch={false} href={`/teacher/games?classId=${classId}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-teal underline">{t("Plan a Live Challenge")}</Link>
            </section>
          </div>

          {cur && cur.suggestions.length > 0 && (
            <section className={`${card} mt-6`} aria-labelledby="sug-h">
              <h2 id="sug-h" className="text-lg font-semibold text-brand-navy">{t("Suggested for next week")}</h2>
              <ul className="mt-2 space-y-2">{cur.suggestions.map((x, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"><span>{x.text}</span>{x.href && <Link prefetch={false} href={x.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-teal underline">{t("Open")}</Link>}</li>)}</ul>
            </section>
          )}

          {wk && (
            <details className={`${card} mt-6`}>
              <summary className="min-h-11 cursor-pointer content-center text-lg font-semibold text-brand-navy">{t("More for this week")}</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <section>
                  <h3 className="font-semibold text-brand-navy">{t("Class Goal This Week")}</h3>
                  {wk.goal && <p className="mt-1 text-2xl font-semibold text-brand-navy" dir="ltr">{wk.goal.progress} / {wk.goal.target}</p>}
                  <form action={classGoalAction} className="mt-2 space-y-2 text-sm">
                    <input type="hidden" name="classId" value={classId} />
                    <div className="flex gap-2"><input name="target" type="number" min={5} max={20000} defaultValue={wk.goal?.target ?? 300} className={`${box} w-24`} aria-label={t("Target")} />
                      <select name="kind" defaultValue={wk.goal?.kind ?? "ANSWERS"} className={box} aria-label={t("Kind")}><option value="ANSWERS">{t("answers")}</option><option value="TASKS">{t("tasks done")}</option><option value="MINUTES">{t("minutes")}</option></select></div>
                    <input name="title" maxLength={160} defaultValue={wk.goal?.title ?? ""} aria-label={t("Title")} className={`${box} w-full`} />
                    <button className="min-h-11 rounded-lg bg-white px-3 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Save goal")}</button>
                  </form>
                </section>
                <section>
                  <h3 className="font-semibold text-brand-navy">{t("Weekly Rhythm")}</h3>
                  {wk.rhythm && <p className="mt-1 text-sm text-slate-600">{t("{n} of {m} students on rhythm this week.", { n: wk.onRhythm, m: wk.members })}</p>}
                  <form action={rhythmAction} className="mt-2 flex flex-wrap items-end gap-2 text-sm">
                    <input type="hidden" name="classId" value={classId} />
                    <label>{t("Days / week")}<select name="days" defaultValue={wk.rhythm?.days ?? 3} className={`${box} block`}><option value="0">{t("off")}</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                    <label>{t("Minutes")}<input name="minutes" type="number" min={5} max={90} defaultValue={wk.rhythm?.minutes ?? 15} className={`${box} block w-20`} /></label>
                    <button className="min-h-11 rounded-lg bg-white px-3 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Save")}</button>
                  </form>
                </section>
                <section>
                  <h3 className="font-semibold text-brand-navy">{t("Exit Ticket")}</h3>
                  <form action={exitTicketAction} className="mt-2 space-y-2 text-sm">
                    <input type="hidden" name="classId" value={classId} />
                    <select name="skillId" required className={`${box} w-full`} aria-label={t("Skill")}><option value="">{t("Choose today’s skill…")}</option>{skills.filter((k) => k.grade === grade).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
                    <button className="min-h-11 rounded-lg bg-white px-3 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Open the exit ticket")}</button>
                  </form>
                  {tickets.length > 0 && <ul className="mt-3 space-y-1 text-sm">{tickets.slice(0, 5).map((x) => <li key={x.id}><Link prefetch={false} href={`/teacher/exit/${x.id}`} className="text-brand-teal underline">{x.title}</Link> <span className="text-slate-500">· {x.createdAt.slice(0, 10)}</span></li>)}</ul>}
                </section>
              </div>
            </details>
          )}
        </>
      )}
    </AppShell>
  );
}
