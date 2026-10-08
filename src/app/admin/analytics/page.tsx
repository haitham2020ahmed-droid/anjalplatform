import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { resolvePeriod } from "@/analytics/periods";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { loadCalendar } from "@/server/analytics/calendar";
import { standardsReport } from "@/server/analytics/reports";
import { teacherClasses } from "@/server/teacher/queries";
import { ReportDownloads } from "@/components/reports/report-downloads";

/** School analytics: standards across the school, and each class's progress page. */
export default async function SchoolAnalytics() {
  const actor = await requireActor({ permission: "analytics:school" });
  const me = (await getActor())!.user;
  const period = resolvePeriod("SCHOOL_YEAR", await loadCalendar(repo, actor.schoolId));
  const s = await standardsReport(repo, actor, { school: true }, period);
  const classes = await teacherClasses(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <h1 className="text-3xl font-bold text-brand-navy">School analytics</h1>
      <p className="mt-1 text-slate-600">{period.label}. Platform measures only; imported MAP data appears on student profiles.</p>
      <ReportDownloads title="School summary report (this school year)" report={{ kind: "school", period: "SCHOOL_YEAR" }} />
      <ReportDownloads title="School standards report (this school year)" report={{ kind: "standards", scope: "school", period: "SCHOOL_YEAR" }} />
      <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">Class progress</h2>
        <ul className="mt-3 grid gap-2 md:grid-cols-4">{classes.map((c) => <li key={c.classId}><Link href={`/teacher/classes/${c.classId}/analytics?period=SCHOOL_YEAR`} className="block rounded-lg px-3 py-2 ring-1 ring-slate-200 hover:ring-brand-teal">Grade {c.grade}, {c.name}</Link></li>)}</ul>
      </section>
      <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">Standards across the school</h2>
        <p className="text-sm text-slate-500">Lowest accuracy first. {s.notAssessed} standards have no answers yet.</p>
        <ul className="mt-3 divide-y divide-slate-100">{s.rows.map((r) => <li key={r.code} className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 py-2"><span><span className="font-semibold text-brand-navy">{r.short}</span> <span className="text-slate-600">{r.description.slice(0, 120)}</span></span><span className="text-right tabular-nums">{r.accuracyPct}%<br /><span className="text-xs text-slate-500">{r.students} students</span></span></li>)}</ul>
      </section>
    </AppShell>
  );
}
