import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { classVisit } from "@/server/teacher/extras";

export const metadata = { title: "Class visit" };

/** 👀 The head of department looks at a teacher's class as the teacher sees it. Read only: nothing can be changed. */
export default async function VisitPage({ searchParams }: { searchParams: Promise<{ t?: string; c?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { teachers, visit: v } = await classVisit(repo, actor, sp.t ?? null, sp.c ?? null);
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const tile = (l: string, val: string | number, tone = "text-brand-navy") => <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs text-slate-500">{l}</p><p className={`text-2xl font-extrabold ${tone}`}>{val}</p></div>;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="👀" title="Class visit" subtitle="Choose a teacher and a class to see their work as they see it. Read only — nothing can be changed from here, and it is not a live screen or camera."><PrintButton /></PageHeader>
      <nav aria-label="Teachers" className="flex flex-wrap gap-2 print:hidden">{teachers.map((t) => <Link key={t.id} href={`/admin/visit?t=${t.id}`} className={chip(v?.teacher.id === t.id)}>{t.name}</Link>)}</nav>
      {!v ? <p className="mt-5 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">↑ Choose a teacher.</p> : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">{v.classes.map((c) => <Link key={c.id} href={`/admin/visit?t=${v.teacher.id}&c=${c.id}`} className={chip(v.klass?.id === c.id)}>{c.name}</Link>)}<span className="ms-auto text-sm text-slate-500">Last sign-in: {v.teacher.lastLogin ? v.teacher.lastLogin.slice(0, 10) : "never"}</span></div>
          {v.klass && (
            <>
              <h2 className="mt-5 text-2xl font-extrabold text-brand-navy">{v.teacher.name} · {v.klass.name}</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                {tile("Students practised this week", `${v.activeWeek} / ${v.klass.students}`)}
                {tile("Accuracy this week", v.accuracy === null ? "—" : `${v.accuracy}%`)}
                {tile("Alerts open · handled", `${v.alerts.open} · ${v.alerts.handled}`, v.alerts.open ? "text-red-700" : "text-emerald-700")}
                {tile("MAP plans draft · sent", `${v.plans.draft} · ${v.plans.sent}`)}
                {tile("Exit tickets", v.tickets)}{tile("Comments to students", v.comments)}{tile("Class goal this week", v.goals ?? "—")}{tile("Weekly rhythm", v.rhythm ?? "—")}
              </div>
              <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <h3 className="font-bold text-brand-navy">📝 Recent work</h3>
                {!v.work.length ? <p className="mt-1 text-slate-500">Nothing assigned yet.</p> : <ul className="mt-2 divide-y divide-slate-100 text-sm">{v.work.map((w, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5"><Link href={w.href} className="font-semibold text-brand-navy hover:underline">{w.title}</Link><span className="text-slate-600">{w.done}/{w.total} done{w.late ? <span className="text-red-700"> · {w.late} late</span> : ""}{w.dueAt ? ` · due ${w.dueAt.slice(0, 10)}` : ""}</span></li>)}</ul>}
              </section>
              <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <h3 className="font-bold text-brand-navy">🚨 Alerts and what the teacher did</h3>
                {!v.alerts.recent.length ? <p className="mt-1 text-slate-500">No alerts.</p> : <ul className="mt-2 space-y-1 text-sm">{v.alerts.recent.map((a, i) => <li key={i} className="rounded-lg bg-slate-50 px-3 py-1.5"><b>{a.name}</b> · {a.title} — {a.status === "HANDLED" ? <span className="text-emerald-700">✅ {a.action}</span> : <span className="text-red-700">not handled yet</span>}</li>)}</ul>}
              </section>
              <p className="mt-4 text-sm text-slate-500 print:hidden">More: <Link href={`/teacher/progress?classId=${v.klass.id}`} className="font-semibold text-brand-teal underline">Students</Link> · <Link href={`/teacher/map-plans?classId=${v.klass.id}`} className="font-semibold text-brand-teal underline">MAP plans</Link> · <Link href={`/teacher/alerts?classId=${v.klass.id}&status=ALL`} className="font-semibold text-brand-teal underline">Alerts</Link></p>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
