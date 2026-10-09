import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { departmentSummary } from "@/server/insights/department";

export const metadata = { title: "Department week" };

/** 🏫 The head of department's week: every class side by side, the hardest skills of each grade, alerts. */
export default async function DepartmentPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const d = await departmentSummary(repo, actor);
  const best = (f: (c: (typeof d.classes)[number]) => number) => Math.max(...d.classes.map(f));
  const tile = (label: string, value: string | number, tone = "text-brand-navy") => <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{label}</dt><dd className={`text-3xl font-bold ${tone}`}>{value}</dd></div>;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🏫" title={`English department · week ${d.week}`} subtitle={`${d.from} → ${d.to}. Practice this week, accuracy, work, MAP and alerts for every class.`}>
        <PrintButton />
        <Link href="/api/department-export" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal print:hidden">⬇ Excel</Link>
      </PageHeader>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {tile("Students", d.totals.students)}
        {tile("Practised this week", `${d.totals.students ? Math.round((100 * d.totals.active) / d.totals.students) : 0}%`)}
        {tile("Answers this week", d.totals.answers.toLocaleString("en"))}
        {tile("Minutes this week", d.totals.minutes.toLocaleString("en"))}
        {tile("Alerts not handled", d.totals.alertsOpen, d.totals.alertsOpen ? "text-red-700" : "text-emerald-700")}
        {tile("Alerts handled", d.totals.alertsHandled, "text-emerald-700")}
      </dl>
      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-xl font-bold text-brand-navy">Class comparison</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="py-2 pe-3">Class</th><th className="px-2">Teacher</th><th className="px-2">Students</th><th className="px-2">Practised (week)</th><th className="px-2">Answers</th><th className="px-2">Minutes</th><th className="px-2">Accuracy</th><th className="px-2">Tasks done</th><th className="px-2">Late</th><th className="px-2">MAP tested</th><th className="px-2">On track</th><th className="px-2">At risk</th><th className="px-2">Alerts open</th><th className="px-2">Handled</th></tr></thead>
            <tbody>{d.classes.map((c) => (
              <tr key={c.classId} className="border-b last:border-0">
                <td className="py-2 pe-3 font-semibold text-brand-navy">G{c.grade} · {c.className}</td><td className="px-2">{c.teacher}</td><td className="px-2 tabular-nums">{c.students}</td>
                <td className={`px-2 tabular-nums ${c.activePct === best((x) => x.activePct) && c.activePct > 0 ? "font-bold text-emerald-700" : c.activePct < 50 ? "text-red-700" : ""}`}>{c.activePct}%</td>
                <td className="px-2 tabular-nums">{c.answersWeek}</td><td className="px-2 tabular-nums">{c.minutesWeek}</td>
                <td className={`px-2 tabular-nums ${c.accuracy !== null && c.accuracy < 60 ? "text-red-700" : ""}`}>{c.accuracy === null ? "—" : `${c.accuracy}%`}</td>
                <td className="px-2 tabular-nums">{c.done}</td><td className={`px-2 tabular-nums ${c.late ? "text-red-700" : ""}`}>{c.late}</td>
                <td className="px-2 tabular-nums">{c.tested}</td><td className="px-2 tabular-nums text-emerald-700">{c.onTrack}</td><td className="px-2 tabular-nums text-red-700">{c.atRisk}</td>
                <td className={`px-2 tabular-nums ${c.alertsOpen ? "font-bold text-red-700" : ""}`}>{c.alertsOpen}{c.oldestOpenDays !== null && c.oldestOpenDays >= 7 ? ` (${c.oldestOpenDays}d)` : ""}</td><td className="px-2 tabular-nums">{c.alertsHandled}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {d.weakest.map((g) => (
          <div key={g.grade} className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="font-bold text-brand-navy">Grade {g.grade}: hardest skills <span className="text-xs font-normal text-slate-500">(last 30 days)</span></h2>
            {!g.skills.length ? <p className="mt-2 text-sm text-slate-500">Not enough answers yet (20+ per skill).</p> : (
              <ol className="mt-2 space-y-1 text-sm">{g.skills.map((k) => <li key={k.skillId} className="flex justify-between gap-2"><span>{k.name}</span><span className={`tabular-nums font-semibold ${k.accuracy < 50 ? "text-red-700" : "text-amber-800"}`}>{k.accuracy}% · {k.students} st.</span></li>)}</ol>
            )}
          </div>
        ))}
      </section>
      <p className="mt-4 text-sm text-slate-500 print:hidden">See every alert and what each teacher did: <Link href="/teacher/alerts?status=ALL" className="font-semibold text-brand-teal underline">Student alerts</Link> · Teachers: <Link href="/admin/teachers" className="font-semibold text-brand-teal underline">Teacher follow-up</Link></p>
    </AppShell>
  );
}
