import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { schoolDashboard, type GroupStats } from "@/server/readrise/dashboards";
import { ADMIN_TABS, ReadRiseTabs } from "../_components/tabs";
import { ExportLinks } from "@/components/reports/report-ui";
import { fmt, LevelHistogram, RR_NOTE, ScaledLineChart, signed, Stat } from "../_components/ui";

export const metadata = { title: "ReadRise dashboard" };

const GRADE_COLORS: Record<number, string> = { 4: "#f97316", 5: "#0ea5e9", 6: "#10b981" };
const colorOf = (g: number) => GRADE_COLORS[g] ?? "#8b5cf6";

function MedianCell({ g }: { g: GroupStats }) {
  if (g.medianLevel === null) return <span className="text-slate-400">—</span>;
  const below = g.medianLevel < g.band.low, above = g.medianLevel > g.band.high;
  return (
    <span className={`font-semibold tabular-nums ${below ? "text-red-700" : above ? "text-emerald-700" : "text-teal-800"}`} title={`Expected ${g.band.low}–${g.band.high}`}>
      {g.medianLevel} <span className="text-xs font-normal text-slate-500">{below ? "below" : above ? "above" : "in"} {g.band.low}–{g.band.high}</span>
    </span>
  );
}

/** Tiny 8-week bars (articles per student per week). */
function UsageBars({ usage }: { usage: (number | null)[] }) {
  const m = Math.max(1, ...usage.map((u) => u ?? 0));
  return (
    <span className="inline-flex h-6 items-end gap-0.5" aria-label={`Articles per student per week: ${usage.map((u) => u ?? 0).join(", ")}`}>
      {usage.map((u, i) => <span key={i} className="w-1.5 rounded-sm bg-brand-teal" style={{ height: `${Math.max(u ? 8 : 2, (100 * (u ?? 0)) / m)}%`, opacity: u ? 1 : 0.25 }} />)}
    </span>
  );
}

/** 🚀 ReadRise (admin): school-wide — placed vs not, median vs expected band, growth, weekly usage, goal attainment. */
export default async function ReadRiseDashboard({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "analytics:school" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const d = await schoolDashboard(repo, actor);
  const grade = d.grades.some((g) => g.grade === Number(sp.grade)) ? Number(sp.grade) : null;
  const total = d.grades.reduce((a, g) => ({ students: a.students + g.students, placed: a.placed + g.placed }), { students: 0, placed: 0 });
  const goalWeighted = d.grades.filter((g) => g.goalPct !== null);
  const goalPct = goalWeighted.length ? Math.round(goalWeighted.reduce((a, g) => a + g.goalPct! * g.placed, 0) / Math.max(1, goalWeighted.reduce((a, g) => a + g.placed, 0))) : null;
  const usageNow = d.usage.filter((u): u is number => u !== null);
  const avgUsage = usageNow.length ? Math.round((10 * usageNow.reduce((a, b) => a + b, 0)) / usageNow.length) / 10 : null;
  const classes = d.classes.filter((c) => grade === null || c.grade === grade);
  const gradeRow = grade === null ? null : d.grades.find((g) => g.grade === grade)!;
  const usageSeries = grade === null
    ? [...d.grades.map((g) => ({ name: `Grade ${g.grade}`, color: colorOf(g.grade), points: g.usage })), { name: "Whole school", color: "#1e293b", points: d.usage, width: 4 }]
    : classes.map((c, i) => ({ name: c.name, color: ["#0ea5e9", "#f97316", "#10b981", "#8b5cf6", "#e11d48", "#64748b"][i % 6], points: c.usage }));
  const uMax = Math.max(2, Math.ceil(Math.max(0, ...usageSeries.flatMap((s) => s.points.map((p) => p ?? 0)))));
  const uTicks = Array.from({ length: uMax + 1 }, (_, i) => i);
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Admin" }} icon="📈" title="ReadRise Dashboard"
        subtitle={<>Placement, levels against the expected grade band, growth since placement, weekly reading and the weekly goal (articles with a first-try score of 75%+). <span className="text-xs text-slate-500">{RR_NOTE}</span></>}>
        <ReadRiseTabs items={ADMIN_TABS} current="/admin/readrise/dashboard" />
      </PageHeader>

      <div className="mb-4"><ExportLinks report={{ kind: "readrise", scope: "school", period: "TERM" }} label="ReadRise export (ReadRise Level, estimate)" /></div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students placed" value={`${total.placed} / ${total.students}`} note={`${total.students - total.placed} not placed yet`} tone={total.students - total.placed > 0 ? "amber" : "teal"} />
        <Stat label="Weekly goal met" value={fmt(goalPct, "%")} note="of student-weeks, last 8 weeks" />
        <Stat label="Articles per student" value={fmt(avgUsage)} note="per week, last 8 weeks" />
        <Stat label="Classes" value={d.classes.length} note={`${d.grades.length} grade${d.grades.length === 1 ? "" : "s"}`} />
      </div>

      <nav aria-label="Grade" className="mb-5 flex flex-wrap gap-2">
        <Link href="/admin/readrise/dashboard" className={chip(grade === null)}>All grades</Link>
        {d.grades.map((g) => <Link key={g.grade} href={`/admin/readrise/dashboard?grade=${g.grade}`} className={chip(g.grade === grade)}>Grade {g.grade}</Link>)}
      </nav>

      {d.grades.length === 0 ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No classes yet.</p> : (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Reading per week" icon="📅" hint={grade === null ? "Articles finished (first try) per student, each of the last 8 weeks." : `Grade ${grade}: articles finished (first try) per student, by class.`}>
              <ScaledLineChart labels={d.weeks} series={usageSeries} title="Articles per student per week" min={0} max={uMax} ticks={uTicks} />
            </Section>
            <Section title="Level distribution" icon="📊" hint={gradeRow ? `Grade ${grade} · expected band ${gradeRow.band.low}–${gradeRow.band.high}` : "All placed students (choose a grade to see its expected band)."}>
              <LevelHistogram buckets={gradeRow ? gradeRow.distribution : d.distribution} title="Students by ReadRise Level" />
            </Section>
          </div>

          {grade === null && (
            <Section title="By grade" icon="🏫">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b text-xs text-slate-500"><th className="p-2">Grade</th><th className="p-2">Students</th><th className="p-2">Placed</th><th className="p-2">Not placed</th><th className="p-2">Median level vs band</th><th className="p-2">Growth since placement</th><th className="p-2">Articles / student / week</th><th className="p-2">Goal met</th></tr></thead>
                  <tbody>{d.grades.map((g) => (
                    <tr key={g.grade} className="border-b last:border-0">
                      <td className="p-2 font-bold"><Link href={`/admin/readrise/dashboard?grade=${g.grade}`} className="text-brand-navy hover:underline">Grade {g.grade}</Link></td>
                      <td className="p-2 tabular-nums">{g.students}</td><td className="p-2 tabular-nums">{g.placed}</td>
                      <td className={`p-2 tabular-nums ${g.notPlaced ? "font-semibold text-amber-800" : ""}`}>{g.notPlaced}</td>
                      <td className="p-2"><MedianCell g={g} /></td>
                      <td className="p-2 tabular-nums">{signed(g.avgGrowth)}</td><td className="p-2 tabular-nums">{fmt(g.perStudentPerWeek)}</td><td className="p-2 tabular-nums">{fmt(g.goalPct, "%")}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Section>
          )}

          <Section title={grade === null ? "By class" : `Grade ${grade} classes`} icon="👥">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b text-xs text-slate-500"><th className="p-2">Class</th><th className="p-2">Students</th><th className="p-2">Placed</th><th className="p-2">Median level vs band</th><th className="p-2">Growth</th><th className="p-2">Last 8 weeks</th><th className="p-2">Per week</th><th className="p-2">Goal met</th></tr></thead>
                <tbody>{classes.map((c) => (
                  <tr key={c.classId} className="border-b last:border-0">
                    <td className="p-2 font-semibold"><Link href={`/teacher/readrise?class=${c.classId}`} className="text-brand-navy hover:underline">{c.name}</Link> <span className="text-xs text-slate-400">G{c.grade}</span></td>
                    <td className="p-2 tabular-nums">{c.students}</td>
                    <td className={`p-2 tabular-nums ${c.notPlaced ? "text-amber-800" : ""}`}>{c.placed}{c.notPlaced ? <span className="text-xs"> ({c.notPlaced} not)</span> : null}</td>
                    <td className="p-2"><MedianCell g={c} /></td>
                    <td className="p-2 tabular-nums">{signed(c.avgGrowth)}</td>
                    <td className="p-2"><UsageBars usage={c.usage} /></td>
                    <td className="p-2 tabular-nums">{fmt(c.perStudentPerWeek)}</td><td className="p-2 tabular-nums">{fmt(c.goalPct, "%")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Section>

          {grade === null && (d.top.length > 0 || d.bottom.length > 0) && (
            <div className="grid gap-6 md:grid-cols-2">
              <Section title="Most growth" icon="🏆" tone="emerald" hint="Average level change since placement.">
                <ol className="space-y-2">{d.top.map((c, i) => <li key={c.classId} className="flex justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-200"><span className="font-semibold">{i + 1}. {c.name}</span><span className="tabular-nums font-bold text-emerald-700">{signed(c.avgGrowth)}</span></li>)}</ol>
              </Section>
              <Section title="Least growth" icon="🔎" tone="amber" hint="Classes that may need support.">
                {d.bottom.length === 0 ? <p className="text-sm text-slate-600">Not enough classes to compare yet.</p> :
                  <ol className="space-y-2">{d.bottom.map((c) => <li key={c.classId} className="flex justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-amber-200"><span className="font-semibold">{c.name}</span><span className={`tabular-nums font-bold ${c.avgGrowth < 0 ? "text-red-700" : "text-slate-700"}`}>{signed(c.avgGrowth)}</span></li>)}</ol>}
              </Section>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
