import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { myTests } from "@/server/tests/assessments";
import { EmptyState, SourceTag, BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "My Tests" };
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : null);

/** 📝 My Tests: To Do (with the due date) and Completed (score + date; open to review the answers). */
export default async function MyTestsPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { t: tr } = await getT();
  const v = await myTests(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="📝" title="My Tests" />
      {v.completed.length > 0 && (() => {
        const avg = Math.round(v.completed.reduce((n, x) => n + Number(x.pct ?? 0), 0) / v.completed.length);
        const best = Math.max(...v.completed.map((x) => Number(x.pct ?? 0)));
        return (
          <section aria-label={tr("My test results")} className="mb-6 rounded-3xl bg-gradient-to-br from-emerald-50 to-sky-50 p-5 ring-1 ring-emerald-100 sm:p-6">
            <h2 className="text-xl font-semibold text-brand-navy"><span aria-hidden="true">📊 </span>{tr("My test results")}</h2>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><p className="text-3xl font-bold text-brand-navy tabular-nums">{v.completed.length}</p><p className="text-sm text-slate-600">{tr("Tests finished")}</p></div>
              <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><p className="text-3xl font-bold text-emerald-700 tabular-nums">{avg}%</p><p className="text-sm text-slate-600">{tr("Average score")}</p></div>
              <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><p className="text-3xl font-bold text-amber-600 tabular-nums">{best}%</p><p className="text-sm text-slate-600">{tr("Best score")}</p></div>
            </div>
          </section>
        );
      })()}
      <section className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6">
        <h2 className="text-xl font-semibold text-brand-navy">{tr("To Do")} <span className="ms-1 rounded-full bg-brand-navy px-2.5 py-0.5 text-sm text-white">{v.toDo.length}</span></h2>
        {!v.toDo.length ? <EmptyState compact title="No tests waiting — well done!" className="mt-3" /> : (
          <ul className="mt-3 grid gap-3">
            {v.toDo.map((t, i) => (
              <li key={t.assignmentId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sky-50/70 p-4 ring-1 ring-sky-100">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-brand-navy">{t.title} <SourceTag source={t.tag} size="md" /></p>
                  <p className="text-slate-600">{tr("{n} questions", { n: t.questions })}{t.timeLimitMin ? ` · ${tr("{n} minutes", { n: t.timeLimitMin })}` : ""}{t.dueAt ? ` · ${tr("Due {date}", { date: day(t.dueAt) ?? "" })}` : ""}{t.overdue ? ` · ${tr("Late")}` : ""}{t.startsLater ? ` · ${tr("opens {date}", { date: day(t.openAt) ?? "" })}` : ""}</p>
                </div>
                {t.startsLater ? <span className="text-slate-500">{tr("Not open yet")}</span>
                  : <Link href={`/quiz/${t.assignmentId}`} className={`${i === 0 ? BTN_PRIMARY : BTN_SECONDARY} min-h-12 rounded-2xl px-6 text-lg`}>{tr(t.status === "IN_PROGRESS" ? "Continue" : "Start")}</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-6 rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6">
        <h2 className="text-xl font-semibold text-brand-navy">{tr("Completed")}</h2>
        {!v.completed.length ? <EmptyState compact icon="📝" title="Nothing here yet" text="Your finished tests will appear here." className="mt-3" /> : (
          <ul className="mt-3 grid gap-3">
            {v.completed.map((t) => (
              <li key={t.assignmentId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50/50 p-4 ring-1 ring-emerald-100">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-brand-navy">{t.title} <SourceTag source={t.tag} size="md" /></p>
                  <p className="text-slate-600"><strong className="text-slate-900">{t.pct}%</strong> ({tr("{n} of {total}", { n: t.correct, total: t.questions })}) · {day(t.completedAt)}</p>
                </div>
                <Link href={`/student/tests/${t.assignmentId}`} className={`${BTN_SECONDARY} min-h-12 rounded-2xl px-6 text-lg`}>{tr("Review")}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
