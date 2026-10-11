import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { resolvePeriod, type PeriodName } from "@/analytics/periods";
import { loadCalendar } from "@/server/analytics/calendar";
import { practiceAnalytics } from "@/server/analytics/practice";
import { DayBars, SkillDonut } from "@/components/analytics/practice-charts";

export const metadata = { title: "Practice Analytics" };
const RANGES: [PeriodName, string][] = [["LAST_7_DAYS", "Last 7 days"], ["LAST_30_DAYS", "Last 30 days"], ["TERM", "This term"], ["SCHOOL_YEAR", "School year"]];
const sign = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v}`);

/** 📊 Practice analytics (IXL-style): usage, by day (school / home), by skill, per student, trouble spots — any date range. */
export default async function PracticeAnalyticsPage({ searchParams }: { searchParams: Promise<{ classId?: string; range?: string; from?: string; to?: string; student?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const range = (sp.range === "CUSTOM" && sp.from && sp.to ? "CUSTOM" : RANGES.find(([k]) => k === sp.range)?.[0] ?? "LAST_30_DAYS") as PeriodName;
  let period; let error = "";
  try { period = resolvePeriod(range, await loadCalendar(repo, actor.schoolId), new Date(), range === "CUSTOM" ? { from: new Date(String(sp.from)), to: new Date(String(sp.to)) } : undefined); }
  catch (e) { error = (e as Error).message; period = resolvePeriod("LAST_30_DAYS", { year: null, terms: [] }); }
  const a = klass ? await practiceAnalytics(repo, actor, { classId: String(klass.id), from: period.from, to: period.to, studentId: sp.student || null }) : null;
  const q = (p: Record<string, string | undefined>) => `/teacher/practice-analytics?${new URLSearchParams(Object.entries({ classId: klass ? String(klass.id) : undefined, range, from: sp.from, to: sp.to, student: sp.student, ...p }).filter(([, v]) => v) as [string, string][])}`;
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-300 hover:ring-brand-teal"}`;
  const one = a?.scope.studentId ? a.students[0] : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="📊" title={`Practice Analytics${one ? ` · ${one.name}` : ""}`}
        subtitle="What students practised on the platform: how much, when (at school or at home), which skills, how accuracy changed, and the questions most students missed." />
      {!klass ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No class yet.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {classes.map((c) => <Link key={String(c.id)} href={q({ classId: String(c.id), student: undefined })} className={chip(c.id === klass.id)}>{String(c.name)}</Link>)}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2 print:hidden">
            {RANGES.map(([k, l]) => <Link key={k} href={q({ range: k, from: undefined, to: undefined })} className={chip(range === k)}>{l}</Link>)}
            <form className="flex flex-wrap items-end gap-2" action="/teacher/practice-analytics">
              <input type="hidden" name="classId" value={String(klass.id)} /><input type="hidden" name="range" value="CUSTOM" />{sp.student && <input type="hidden" name="student" value={sp.student} />}
              <label className="text-xs text-slate-600">From<input type="date" name="from" defaultValue={sp.from ?? period.from.toISOString().slice(0, 10)} className="block rounded-lg border border-slate-300 px-2 py-1" /></label>
              <label className="text-xs text-slate-600">To<input type="date" name="to" defaultValue={sp.to ?? period.to.toISOString().slice(0, 10)} className="block rounded-lg border border-slate-300 px-2 py-1" /></label>
              <button className={chip(range === "CUSTOM")}>Apply</button>
            </form>
            {one && <Link href={q({ student: undefined })} className={chip(false)}>← Whole class</Link>}
            <span className="ms-auto"><PrintButton /></span>
          </div>
          {error && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">⚠️ {error}</p>}
          {a && (
            <>
              <p className="mt-4 text-sm text-slate-500">{a.scope.className} · {a.from} → {a.to}</p>
              <section className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
                {[["Questions", a.totals.questions, a.totals.avgPerStudent !== null && !one ? `${a.totals.avgPerStudent} per active student` : ""], ["Accuracy", a.totals.accuracy !== null ? `${a.totals.accuracy}%` : "—", `${a.totals.correct} correct`], ["Time", `${Math.floor(a.totals.minutes / 60)}h ${a.totals.minutes % 60}m`, "answering"], ["Active", one ? (one.questions ? "Yes" : "No") : `${a.totals.activeStudents}/${a.totals.students}`, one ? (one.lastActive ?? "") : "students"], ["Skills", a.totals.skills, "practised"], ["Proficient", a.totals.proficient, "skill(s) now"], ["Mastered", a.totals.mastered, "in this range"], ["At school", a.totals.questions ? `${Math.round((100 * a.totals.schoolQuestions) / a.totals.questions)}%` : "—", `${a.totals.homeQuestions} at home`]].map(([k, v, sub]) => (
                  <div key={String(k)} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</p><p className="text-2xl font-extrabold tabular-nums text-brand-navy">{v}</p><p className="truncate text-xs text-slate-500">{sub}</p></div>
                ))}
              </section>
              <div className="mt-5 grid gap-5 lg:grid-cols-5">
                <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 lg:col-span-3"><h2 className="mb-2 font-bold text-brand-navy">📅 By day</h2><DayBars days={a.days} /></section>
                <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 lg:col-span-2"><h2 className="mb-2 font-bold text-brand-navy">🧩 By skill</h2><SkillDonut skills={a.skills} />{!a.skills.length && <p className="text-sm text-slate-500">No practice in this range.</p>}</section>
              </div>
              {a.skills.length > 0 && (
                <section className="mt-5 overflow-x-auto rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                  <h2 className="font-bold text-brand-navy">Skills practised</h2>
                  <table className="mt-2 min-w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-1.5">Skill</th><th>Questions</th><th>Students</th><th>Time</th><th>Accuracy</th></tr></thead>
                    <tbody>{a.skills.map((k) => <tr key={k.skillId} className="border-b last:border-0"><td className="py-1.5">{k.name}</td><td className="tabular-nums">{k.questions}</td><td className="tabular-nums">{k.students}</td><td className="tabular-nums">{k.minutes} min</td><td className={`tabular-nums font-semibold ${k.accuracy !== null && k.accuracy < 60 ? "text-red-700" : "text-emerald-700"}`}>{k.accuracy ?? "—"}%</td></tr>)}</tbody>
                  </table>
                </section>
              )}
              <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <h2 className="font-bold text-brand-navy">🧑‍🎓 {one ? "Skills" : "Students"}</h2>
                <ul className="mt-2 divide-y divide-slate-100">{a.students.map((x) => (
                  <li key={x.id}>
                    <details open={Boolean(one)} className="group py-2">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-brand-navy"><bdi>{x.name}</bdi>{!one && <Link href={q({ student: x.id })} className="ms-2 text-xs font-normal text-brand-teal underline">open</Link>}</span>
                        <span className="flex flex-wrap gap-3 text-sm tabular-nums text-slate-600"><span>{x.questions} q</span><span>{x.minutes} min</span><span>{x.accuracy ?? "—"}%</span><span>{x.skills} skills</span><span>{x.proficient} proficient</span><span>{x.mastered} mastered</span><span>{x.schoolPct !== null ? `${x.schoolPct}% at school` : ""}</span><span className="text-slate-400">{x.lastActive ?? "not active"}</span></span>
                      </summary>
                      {x.detail.length > 0 && (
                        <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Skill</th><th>Questions</th><th>Time</th><th>Accuracy</th><th>Change (first → last answers)</th><th>Mastery now</th></tr></thead>
                          <tbody>{x.detail.map((d) => <tr key={d.skillId} className="border-t border-slate-100"><td className="py-1">{d.name}</td><td className="tabular-nums">{d.questions}</td><td className="tabular-nums">{d.minutes} min</td><td className="tabular-nums">{d.accuracy ?? "—"}%</td><td className={`tabular-nums ${d.change !== null && d.change < 0 ? "text-red-700" : "text-emerald-700"}`}>{d.change !== null ? `${sign(d.change)} pts` : "—"}</td><td className="tabular-nums">{d.mastery ?? "—"}{d.mastered ? " ⭐" : d.band === "PROFICIENT" ? " ✓" : ""}</td></tr>)}</tbody>
                        </table>
                      )}
                    </details>
                  </li>
                ))}</ul>
              </section>
              {a.trouble.length > 0 && (
                <section className="mt-5 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
                  <h2 className="font-bold text-amber-950">🚧 Trouble spots · questions most students missed</h2>
                  <ul className="mt-2 space-y-1.5 text-sm">{a.trouble.map((x) => <li key={x.questionId} className="flex flex-wrap justify-between gap-2"><span><span className="text-slate-500">{x.skill}:</span> {x.stem}</span><b className="tabular-nums text-amber-900">{x.missedBy}/{x.tried} missed</b></li>)}</ul>
                </section>
              )}
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
