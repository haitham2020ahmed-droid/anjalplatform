import { parentSummary, type ParentSummary } from "@/server/student/parent-summary";
import { AppShell } from "@/components/app-shell";
import { ReportDownloads } from "@/components/reports/report-downloads";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { parentChildren } from "@/server/queries/parent";
import Link from "next/link";
import { isReportShared } from "@/server/insights/parent-report";
import { weekStats, type WeekStats } from "@/server/student/weekly";

/** Parent home: each linked child with their progress report (Arabic or English PDF). */
export default async function ParentHome() {
  const actor = await requireActor({ roles: ["PARENT"] });
  const me = (await getActor())!.user;
  const children = await parentChildren(repo, actor);
  // each child's monthly summary, in parallel
  const summaries = new Map(await Promise.all(children.map(async (c) => [c.studentId, await parentSummary(repo, actor, c.studentId)] as const)));
  const weeks = new Map(await Promise.all(children.map(async (c) => [c.studentId, await weekStats(repo, c.studentId)] as const)));
  const shared = new Map(await Promise.all(children.map(async (c) => [c.studentId, await isReportShared(repo, String(actor.schoolId), c.studentId)] as const)));
  return (
    <AppShell name={String(me.displayName)}>
      <h1 className="text-3xl font-bold text-brand-navy">My Children</h1>
      <p className="mt-1 text-slate-600">English progress reports</p>
      {children.length === 0 ? (
        <p className="mt-6 text-slate-600">No children are linked to your account yet. Please contact the school.</p>
      ) : (
        children.map((c) => (
          <div key={c.studentId} className="mt-6">
            <h2 className="text-xl font-bold text-brand-navy"><bdi>{c.name}</bdi></h2>
            <p className="text-sm text-slate-500">Grade {c.grade}{c.className ? `, class ${c.className}` : ""}</p>
            {shared.get(c.studentId) && <Link href={`/parent/report/${c.studentId}`} className="lift mt-3 flex items-center justify-between rounded-2xl bg-emerald-50 px-5 py-4 font-bold text-emerald-900 ring-1 ring-emerald-300"><span>📄 Report from the teacher</span><span>Open ▶</span></Link>}
            {shared.get(c.studentId) && <div className="mt-2 flex flex-wrap gap-2"><Link href={`/map-report/family/${c.studentId}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📈 MAP Family Report</Link><Link href={`/map-report/study-plan/${c.studentId}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🧭 Study Plan</Link></div>}
            <Link href={`/parent/family/${c.studentId}`} className="lift mt-3 flex items-center justify-between rounded-2xl bg-brand-navy px-5 py-4 font-bold text-white"><span>👪 Family Report — everything in one place</span><span>Open ▶</span></Link>
            <ParentWeek w={weeks.get(c.studentId)!} />
            <ParentMonthly s={summaries.get(c.studentId)!} />
            <ReportDownloads title="Progress report (this term)" report={{ kind: "student", studentId: c.studentId, period: "TERM" }} formats={["pdf"]} />
          </div>
        ))
      )}
    </AppShell>
  );
}

const LV: Record<string, string> = { BELOW: "🟠 Below level", ON: "🔵 On level", ABOVE: "🟢 Above level" };

/** 👪 This month, in plain words. */
function ParentMonthly({ s }: { s: ParentSummary }) {
  return (
    <div className="mt-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="font-bold text-brand-navy">This month</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Practice</p><p className="text-xl font-extrabold text-brand-navy">{s.answers30}</p><p className="text-xs text-slate-500">answers</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Correct</p><p className="text-xl font-extrabold text-brand-navy">{s.accuracy30 ?? "—"}{s.accuracy30 !== null && "%"}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">MAP Reading</p>
          <p className="text-xl font-extrabold text-brand-navy">{s.map ? s.map.rit : "—"}{s.map?.goal ? <span className="text-sm font-semibold text-slate-500"> → goal {s.map.goal}</span> : null}</p>{s.map && <p className="text-xs text-slate-500">{s.map.term}</p>}</div>
      </div>
      {(s.categories.length > 0 || s.overall) && (
        <ul className="mt-3 space-y-1 text-sm">
          {s.categories.length ? s.categories.map((c) => <li key={c.name} className="flex flex-wrap justify-between gap-2"><span>{c.name}</span><b>{LV[c.level]}</b></li>)
            : <li className="flex flex-wrap justify-between gap-2"><span>Reading level</span><b>{LV[s.overall!]}</b></li>}
        </ul>
      )}
      <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">🏠 {s.tip.en}</p>
    </div>
  );
}

/** 🗓️ This week: the weekly goal (parts of the plan), answers, minutes, days. */
function ParentWeek({ w }: { w: WeekStats }) {
  return (
    <div className="mt-3 rounded-2xl bg-gradient-to-r from-teal-50 to-sky-50 p-5 ring-1 ring-teal-200">
      <p className="font-bold text-brand-navy">This week <span className="text-sm font-normal text-slate-500">· since {w.since}</span></p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">Weekly goal</p><p className="text-xl font-extrabold text-brand-navy">{Math.min(w.partsDone, w.partsGoal)}/{w.partsGoal}</p><p className="text-xs text-slate-500">{w.reached ? "🎉 reached" : "parts of the plan"}</p></div>
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">Answers</p><p className="text-xl font-extrabold text-brand-navy">{w.answers}</p><p className="text-xs text-slate-500">{w.correct} correct</p></div>
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">Minutes</p><p className="text-xl font-extrabold text-brand-navy">{w.minutes}</p></div>
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">Days active</p><p className="text-xl font-extrabold text-brand-navy">{w.days}/7</p></div>
      </div>
      {w.parts.length > 0 && <p className="mt-2 text-sm text-slate-700">✅ Finished this week: {w.parts.join(" · ")}</p>}
      {w.answers === 0 && <p className="mt-2 text-sm text-amber-800">No practice yet this week. 15 minutes a day makes a big difference.</p>}
    </div>
  );
}
