import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, BandBar, Callout, ReportHeader, ReportSection, ReportTable } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { coordinatorGrades } from "@/server/teacher/coordinators";
import { gradeSummary } from "@/server/insights/progress";

export const metadata = { title: "Grade summary" };

/** 🏫 Admin and grade coordinators: every class of their grades in numbers. */
export default async function GradeSummaryPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const subject = (await searchParams).subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const allowed = (await coordinatorGrades(repo, actor)).length > 0;
  const grades = allowed ? await gradeSummary(repo, actor, subject) : [];
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  const { t: tr } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="🏫" title="Grade Summary" subtitle="Each class at a glance. Click a class to see its students."
        when={subject === "READING" ? tr("MAP Reading") : tr("MAP Language")}
        filters={<div className="flex flex-wrap gap-2">{(["READING", "LANGUAGE"] as const).map((x) => <Link key={x} href={`/teacher/grade-summary?subject=${x}`} className={chip(x === subject)}>{x === "READING" ? "📖 Reading" : "✏️ Language"}</Link>)}</div>} />
      {!allowed ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">This page is for admins and grade coordinators. An admin can make you a coordinator in Settings → Grade coordinators.</p> : grades.map((g) => {
        const t = g.classes.reduce((a, c) => ({ students: a.students + c.students, tested: a.tested + c.tested, onTrack: a.onTrack + c.onTrack, atRisk: a.atRisk + c.atRisk, active: a.active + c.activeWeek, late: a.late + c.late }), { students: 0, tested: 0, onTrack: 0, atRisk: 0, active: 0, late: 0 });
        const lv = g.classes.reduce((a, c) => ({ BELOW: a.BELOW + c.levels.BELOW, ON: a.ON + c.levels.ON, ABOVE: a.ABOVE + c.levels.ABOVE, NONE: a.NONE + c.levels.NONE }), { BELOW: 0, ON: 0, ABOVE: 0, NONE: 0 });
        const worst = [...g.classes].sort((x, y) => y.atRisk - x.atRisk)[0];
        return (
          <ReportSection key={g.grade} title={tr("Grade {n}", { n: g.grade })} icon="🏫">
            <AtAGlance title={null} items={[
              { icon: "👩‍🎓", label: "Students", value: String(t.students), meaning: tr("{n} MAP tested", { n: t.tested }) },
              { icon: "🙋", label: "Active this week", value: pct(t.active, t.students), meaning: "practised in the last 7 days" },
              { icon: "✅", label: "On track", value: String(t.onTrack), tone: "good" },
              { icon: "⚠️", label: "At risk", value: String(t.atRisk), tone: t.atRisk ? "bad" : "neutral", meaning: worst?.atRisk ? tr("most in {c}", { c: worst.className }) : undefined },
              { icon: "⏰", label: "Late tasks", value: String(t.late), tone: t.late ? "warn" : "neutral" },
            ]} />
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <BandBar label="Levels" parts={[{ key: "BELOW", value: lv.BELOW }, { key: "ON", value: lv.ON }, { key: "ABOVE", value: lv.ABOVE }, { key: "NONE", value: lv.NONE }]} />
              <Callout kind="next" items={[worst?.atRisk ? <>{tr("Start with")} <b>{worst.className}</b>: {tr("{n} students at risk", { n: worst.atRisk })}</> : tr("No class has students at risk."), t.late ? tr("{n} late tasks across the grade.", { n: t.late }) : null]} />
            </div>
            <ReportTable label={tr("Grade {n}", { n: g.grade })}
              cols={[{ key: "c", label: "Class" }, { key: "t", label: "Teacher" }, { key: "s", label: "Students", num: true }, { key: "a", label: "Active (week)", num: true }, { key: "acc", label: "Accuracy", num: true }, { key: "o", label: "On track · at risk", num: true }, { key: "m", label: "MAP Fall → target", num: true }, { key: "l", label: "Levels B · O · A · not set", num: true }, { key: "d", label: "Tasks done · late", num: true }]}
              rows={g.classes.map((c) => ({
                id: c.classId, flag: c.atRisk ? "bad" : undefined, sort: { c: c.className, a: c.students ? c.activeWeek / c.students : null, acc: c.accuracy, o: c.atRisk, m: c.avgFall, l: c.levels.BELOW, d: c.late },
                cells: { c: <Link href={`/teacher/progress?classId=${c.classId}&subject=${subject}`} className="font-semibold text-brand-navy hover:underline">{c.className}</Link>, t: c.teacher, s: c.students, a: pct(c.activeWeek, c.students),
                  acc: c.accuracy === null ? "—" : `${c.accuracy}%`, o: <><span className="text-emerald-700">{c.onTrack}</span> · <span className={c.atRisk ? "font-bold text-red-700" : ""}>{c.atRisk}</span></>,
                  m: c.avgFall ? `${c.avgFall} → ${c.avgTarget ?? "—"}` : "—", l: `${c.levels.BELOW} · ${c.levels.ON} · ${c.levels.ABOVE} · ${c.levels.NONE}`, d: `${c.done} · ${c.late}` },
              }))} />
          </ReportSection>
        );
      })}
    </AppShell>
  );
}
