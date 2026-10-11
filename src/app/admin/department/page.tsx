import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable, SimpleBar } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { departmentSummary } from "@/server/insights/department";

export const metadata = { title: "Department week" };

/** 🏫 The head of department's week: every class side by side, the hardest skills of each grade, alerts. */
export default async function DepartmentPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const d = await departmentSummary(repo, actor);
  const best = (f: (c: (typeof d.classes)[number]) => number) => Math.max(...d.classes.map(f));
  const { t } = await getT();
  const behind = [...d.classes].filter((c) => c.alertsOpen && (c.oldestOpenDays ?? 0) >= 7).sort((a, b) => b.alertsOpen - a.alertsOpen);
  const quiet = d.classes.filter((c) => c.activePct < 50);
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/admin", label: "Home" }} icon="🏫" title={`English department · week ${d.week}`} subtitle="Practice this week, accuracy, work, MAP and alerts for every class."
        who={t("Whole school")} when={`${d.from} → ${d.to}`} downloads={[{ href: "/api/department-export", label: "Excel", icon: "⬇", download: false }]} />
      <AtAGlance items={[
        { icon: "👩‍🎓", label: "Students", value: d.totals.students, meaning: t("{n} answers · {m} minutes this week", { n: d.totals.answers.toLocaleString("en"), m: d.totals.minutes.toLocaleString("en") }) },
        { icon: "🙋", label: "Practised this week", value: `${d.totals.students ? Math.round((100 * d.totals.active) / d.totals.students) : 0}%`, meaning: "of students answered at least one question", tone: d.totals.students && d.totals.active / d.totals.students < 0.5 ? "warn" : "good" },
        { icon: "🚨", label: "Alerts not handled", value: d.totals.alertsOpen, meaning: "students a teacher has not followed up yet", tone: d.totals.alertsOpen ? "bad" : "good" },
        { icon: "✅", label: "Alerts handled", value: d.totals.alertsHandled, tone: "good" },
      ]} />
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Callout kind="help" items={[
          ...behind.slice(0, 4).map((c) => <><b>G{c.grade} · {c.className}</b> ({c.teacher}): {t("{n} alerts open, oldest {d} days", { n: c.alertsOpen, d: c.oldestOpenDays ?? 0 })}</>),
          ...quiet.slice(0, 3).map((c) => <><b>G{c.grade} · {c.className}</b>: {t("only {p}% practised this week", { p: c.activePct })}</>),
        ]}>{!behind.length && !quiet.length ? t("Every class is practising and alerts are followed up.") : null}</Callout>
        <Callout kind="next" items={[
          behind[0] ? t("Talk with the teachers whose alerts are open for 7+ days.") : null,
          d.weakest.some((g) => g.skills.length) ? t("Share the hardest skills of each grade (below) at the next department meeting.") : null,
        ]} />
      </div>
      <ReportSection title="Class Comparison" icon="⚖️" hint="Practised (week): ▲ best class in green · under 50% in red.">
        <SimpleBar label="Practised this week" className="mb-5" items={d.classes.map((c) => ({ label: `G${c.grade} · ${c.className}`, value: c.activePct, band: c.activePct >= 80 ? "GOOD" : c.activePct >= 50 ? "OK" : "LOW" }))} />
        <ReportTable label="Class Comparison"
          cols={[{ key: "c", label: "Class" }, { key: "t", label: "Teacher" }, { key: "s", label: "Students", num: true }, { key: "p", label: "Practised (week)", num: true }, { key: "a", label: "Answers", num: true }, { key: "m", label: "Minutes", num: true }, { key: "acc", label: "Accuracy", num: true }, { key: "d", label: "Tasks done", num: true }, { key: "l", label: "Late", num: true }, { key: "mt", label: "MAP tested", num: true }, { key: "o", label: "On track", num: true }, { key: "r", label: "At risk", num: true }, { key: "ao", label: "Alerts open", num: true }, { key: "h", label: "Handled", num: true }]}
          rows={d.classes.map((c) => ({
            id: c.classId, flag: c.alertsOpen && (c.oldestOpenDays ?? 0) >= 7 ? "bad" : c.activePct < 50 ? "warn" : undefined,
            sort: { c: `${c.grade} ${c.className}`, p: c.activePct, acc: c.accuracy, ao: c.alertsOpen },
            cells: { c: <span className="text-brand-navy">G{c.grade} · {c.className}</span>, t: c.teacher, s: c.students,
              p: <span className={c.activePct === best((x) => x.activePct) && c.activePct > 0 ? "font-bold text-emerald-700" : c.activePct < 50 ? "text-red-700" : ""}>{c.activePct === best((x) => x.activePct) && c.activePct > 0 ? "▲ " : ""}{c.activePct}%</span>,
              a: c.answersWeek, m: c.minutesWeek, acc: <span className={c.accuracy !== null && c.accuracy < 60 ? "text-red-700" : ""}>{c.accuracy === null ? "—" : `${c.accuracy}%`}</span>,
              d: c.done, l: <span className={c.late ? "text-red-700" : ""}>{c.late}</span>, mt: c.tested, o: <span className="text-emerald-700">{c.onTrack}</span>, r: <span className="text-red-700">{c.atRisk}</span>,
              ao: <span className={c.alertsOpen ? "font-bold text-red-700" : ""}>{c.alertsOpen}{c.oldestOpenDays !== null && c.oldestOpenDays >= 7 ? ` (${c.oldestOpenDays}d)` : ""}</span>, h: c.alertsHandled },
          }))} />
      </ReportSection>
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {d.weakest.map((g) => (
          <div key={g.grade} className="rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
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
