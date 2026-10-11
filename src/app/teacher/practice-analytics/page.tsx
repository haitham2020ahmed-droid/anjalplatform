import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable, toneOfPct } from "@/components/report-kit";
import { getT } from "@/i18n/server";
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
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="📊" title={`Practice Analytics${one ? ` · ${one.name}` : ""}`}
        subtitle="What students practised on the platform: how much, when (at school or at home), which skills, how accuracy changed, and the questions most students missed."
        who={a ? a.scope.className : klass ? String(klass.name) : undefined} when={a ? `${a.from} → ${a.to}` : undefined}
        filters={klass ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {classes.map((c) => <Link key={String(c.id)} href={q({ classId: String(c.id), student: undefined })} className={chip(c.id === klass.id)}>{String(c.name)}</Link>)}
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              {RANGES.map(([k, l]) => <Link key={k} href={q({ range: k, from: undefined, to: undefined })} className={chip(range === k)}>{l}</Link>)}
              <form className="flex flex-wrap items-end gap-2" action="/teacher/practice-analytics">
                <input type="hidden" name="classId" value={String(klass.id)} /><input type="hidden" name="range" value="CUSTOM" />{sp.student && <input type="hidden" name="student" value={sp.student} />}
                <label className="text-xs text-slate-600">From<input type="date" name="from" defaultValue={sp.from ?? period.from.toISOString().slice(0, 10)} className="block rounded-lg border border-slate-300 px-2 py-1" /></label>
                <label className="text-xs text-slate-600">To<input type="date" name="to" defaultValue={sp.to ?? period.to.toISOString().slice(0, 10)} className="block rounded-lg border border-slate-300 px-2 py-1" /></label>
                <button className={chip(range === "CUSTOM")}>Apply</button>
              </form>
              {one && <Link href={q({ student: undefined })} className={chip(false)}>← Whole class</Link>}
            </div>
          </>
        ) : undefined} />
      {!klass ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No class yet.</p> : (
        <>
          {error && <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">⚠️ {error}</p>}
          {a && (
            <>
              <AtAGlance items={[
                { icon: "✍️", label: "Questions", value: a.totals.questions, meaning: a.totals.avgPerStudent !== null && !one ? t("{n} per active student", { n: a.totals.avgPerStudent }) : undefined },
                { icon: "🎯", label: "Accuracy", value: a.totals.accuracy !== null ? `${a.totals.accuracy}%` : "—", meaning: t("{n} correct", { n: a.totals.correct }), tone: toneOfPct(a.totals.accuracy) },
                { icon: "⏱️", label: "Time", value: `${Math.floor(a.totals.minutes / 60)}h ${a.totals.minutes % 60}m`, meaning: "answering questions" },
                { icon: "🙋", label: "Active", value: one ? (one.questions ? t("Yes") : t("No")) : `${a.totals.activeStudents}/${a.totals.students}`, meaning: one ? (one.lastActive ?? "") : "students practised", tone: one ? (one.questions ? "good" : "warn") : a.totals.activeStudents < a.totals.students ? "warn" : "good" },
                { icon: "🏫", label: "At school", value: a.totals.questions ? `${Math.round((100 * a.totals.schoolQuestions) / a.totals.questions)}%` : "—", meaning: t("{n} at home", { n: a.totals.homeQuestions }) },
              ]} />
              <AtAGlance title="Skills" items={[
                { icon: "🧩", label: "Skills", value: a.totals.skills, meaning: "practised" },
                { icon: "✓", label: "Proficient", value: a.totals.proficient, meaning: "skill(s) now", tone: "info" },
                { icon: "⭐", label: "Mastered", value: a.totals.mastered, meaning: "in this range", tone: a.totals.mastered ? "good" : "neutral" },
              ]} />
              <div className="mb-5 grid gap-4 lg:grid-cols-2">
                <Callout kind="help" items={one ? [] : [
                  (() => { const n = a.students.filter((x) => !x.questions); return n.length ? <>{t("Did not practise")}: {n.slice(0, 10).map((x, i) => <span key={x.id}>{i ? ", " : ""}<bdi>{x.name}</bdi></span>)}{n.length > 10 ? ` +${n.length - 10}` : ""}</> : null; })(),
                  (() => { const n = a.students.filter((x) => x.questions && x.accuracy !== null && x.accuracy < 60); return n.length ? <>{t("Under 60% accuracy")}: {n.slice(0, 10).map((x, i) => <span key={x.id}>{i ? ", " : ""}<bdi>{x.name}</bdi></span>)}</> : null; })(),
                ]} />
                <Callout kind="next" items={[
                  (() => { const w = [...a.skills].filter((k) => k.accuracy !== null).sort((x, y) => (x.accuracy ?? 0) - (y.accuracy ?? 0))[0]; return w && (w.accuracy ?? 100) < 60 ? <>{t("Reteach")} <b>{w.name}</b> ({w.accuracy}%)</> : null; })(),
                  a.trouble[0] ? t("Go over the trouble-spot questions below with the class.") : null,
                  !a.totals.questions ? t("No practice in this range yet.") : null,
                ]} />
              </div>
              <div className="grid gap-5 lg:grid-cols-5">
                <ReportSection title="By day" icon="📅" className="lg:col-span-3"><DayBars days={a.days} /></ReportSection>
                <ReportSection title="By skill" icon="🧩" className="lg:col-span-2"><SkillDonut skills={a.skills} />{!a.skills.length && <p className="text-sm text-slate-500">No practice in this range.</p>}</ReportSection>
              </div>
              {a.skills.length > 0 && (
                <ReportSection title="Skills practised" icon="🧩">
                  <ReportTable label="Skills practised"
                    cols={[{ key: "s", label: "Skill" }, { key: "q", label: "Questions", num: true }, { key: "st", label: "Students", num: true }, { key: "m", label: "Time", num: true }, { key: "acc", label: "Accuracy", num: true }]}
                    rows={a.skills.map((k) => ({ id: k.skillId, flag: k.accuracy !== null && k.accuracy < 60 ? "bad" : undefined, sort: { m: k.minutes, acc: k.accuracy }, cells: { s: k.name, q: k.questions, st: k.students, m: `${k.minutes} min`, acc: <span className={`font-semibold ${k.accuracy !== null && k.accuracy < 60 ? "text-red-700" : "text-emerald-700"}`}>{k.accuracy !== null && k.accuracy < 60 ? "! " : ""}{k.accuracy ?? "—"}%</span> } }))} />
                </ReportSection>
              )}
              <section className="rk-section mb-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
                <h2 className="text-lg font-semibold text-brand-navy sm:text-xl">🧑‍🎓 {one ? "Skills" : "Students"}</h2>
                <ul className="mt-2 divide-y divide-slate-100">{a.students.map((x) => (
                  <li key={x.id}>
                    <details open={Boolean(one)} className="group py-2">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-brand-navy"><bdi>{x.name}</bdi>{!one && <Link href={q({ student: x.id })} className="ms-2 text-xs font-normal text-brand-teal underline">open</Link>}</span>
                        <span className="flex flex-wrap gap-3 text-sm tabular-nums text-slate-600"><span>{x.questions} q</span><span>{x.minutes} min</span><span>{x.accuracy ?? "—"}%</span><span>{x.skills} skills</span><span>{x.proficient} proficient</span><span>{x.mastered} mastered</span><span>{x.schoolPct !== null ? `${x.schoolPct}% at school` : ""}</span><span className="text-slate-400">{x.lastActive ?? "not active"}</span></span>
                      </summary>
                      {x.detail.length > 0 && (
                        <div className="rk-box mt-2"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Skill</th><th>Questions</th><th>Time</th><th>Accuracy</th><th>Change (first → last answers)</th><th>Mastery now</th></tr></thead>
                          <tbody>{x.detail.map((d) => <tr key={d.skillId} className="border-t border-slate-100"><td className="py-1">{d.name}</td><td className="tabular-nums">{d.questions}</td><td className="tabular-nums">{d.minutes} min</td><td className="tabular-nums">{d.accuracy ?? "—"}%</td><td className={`tabular-nums ${d.change !== null && d.change < 0 ? "text-red-700" : "text-emerald-700"}`}>{d.change !== null ? `${sign(d.change)} pts` : "—"}</td><td className="tabular-nums">{d.mastery ?? "—"}{d.mastered ? " ⭐" : d.band === "PROFICIENT" ? " ✓" : ""}</td></tr>)}</tbody>
                        </table></div>
                      )}
                    </details>
                  </li>
                ))}</ul>
              </section>
              {a.trouble.length > 0 && (
                <section className="rk-callout mt-5 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
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
