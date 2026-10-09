import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { parentChildren } from "@/server/queries/parent";
import { isReportShared } from "@/server/insights/parent-report";
import { studentDiagnosticReport } from "@/server/diagnostic/report";
import { weekStats } from "@/server/student/weekly";
import { ForbiddenError } from "@/server/auth/rbac";

export const metadata = { title: "Family Report" };
const s = (v: unknown) => String(v ?? "");

/** 👪 Everything about my child in one place: this week, the Diagnostic, MAP, the teacher's report, the study plan and the plan's progress. Printable. */
export default async function ParentFamily({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["PARENT"] });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  const child = (await parentChildren(repo, actor)).find((c) => c.studentId === studentId);
  if (!child) return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">Student not found.</p></AppShell>;
  const [shared, week, diag, maps] = await Promise.all([
    isReportShared(repo, String(actor.schoolId), studentId), weekStats(repo, studentId),
    studentDiagnosticReport(repo, actor, studentId).catch((e) => { if (e instanceof ForbiddenError) return null; throw e; }),
    repo.findMany("MapResult", { studentId }, { select: ["goalName"] }),
  ]);
  // the curriculum plan's progress
  const m = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  const plan = m ? (await repo.findMany("SkillPlan", { classId: m.classId, kind: "CURRICULUM" }))[0] : null;
  const items = plan ? await repo.findMany("SkillPlanItem", { planId: plan.id }) : [];
  const aids = items.flatMap((it) => { const v = typeof it.assignmentIds === "string" ? JSON.parse(s(it.assignmentIds)) : it.assignmentIds; return Array.isArray(v) ? v.map(String) : []; });
  const done = aids.length ? await repo.count("AssignmentStudent", { studentId, assignmentId: { in: aids }, status: "COMPLETED" }) : 0;
  const pct = items.length ? Math.round((100 * done) / items.length) : 0;
  const card = "lift flex items-start gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200";
  const off = "flex items-start gap-4 rounded-3xl bg-white p-5 opacity-70 ring-1 ring-slate-200";
  return (
    <AppShell name={String(me.displayName)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden"><Link href="/parent" className="font-semibold text-brand-teal">← My children</Link><PrintButton /></div>
      <header className="mb-5 rounded-3xl bg-gradient-to-br from-brand-navy to-indigo-800 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">👪 Family Report</p>
        <h1 className="mt-1 text-3xl font-extrabold"><bdi>{child.name}</bdi></h1>
        <p className="text-white/80">Grade {child.grade}{child.className ? ` · ${child.className}` : ""}</p>
      </header>
      <section className="mb-5 rounded-3xl bg-gradient-to-r from-teal-50 to-sky-50 p-5 ring-1 ring-teal-200">
        <h2 className="text-lg font-bold text-brand-navy">🗓️ This Week <span className="text-sm font-normal text-slate-500">since {week.since}</span></h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {[["Weekly goal", `${Math.min(week.partsDone, week.partsGoal)}/${week.partsGoal}`, week.reached ? "🎉 reached" : "parts of the plan"], ["Answers", String(week.answers), `${week.correct} correct`], ["Minutes", String(week.minutes), "of practice"], ["Days active", `${week.days}/7`, "this week"]].map(([k, v, n]) => <div key={k} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</p><p className="text-2xl font-extrabold tabular-nums text-brand-navy">{v}</p><p className="text-xs text-slate-500">{n}</p></div>)}
        </div>
        {week.parts.length > 0 && <p className="mt-3 text-sm text-slate-700">✅ Finished this week: {week.parts.join(" · ")}</p>}
        {items.length > 0 && <div className="mt-3"><div className="flex justify-between text-sm text-slate-700"><span>📘 Curriculum plan (the whole year)</span><b className="tabular-nums">{done}/{items.length} parts · {pct}%</b></div><div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-slate-200"><div className="h-full bg-brand-teal" style={{ width: `${pct}%` }} /></div></div>}
      </section>
      <ul className="grid gap-4 md:grid-cols-2">
        <li>{diag ? <Link href={`/parent/diagnostic/${studentId}`} className={card}><span className="text-4xl" aria-hidden="true">📝</span><span><span className="block text-lg font-bold text-brand-navy">Diagnostic Report</span><span className="block text-sm text-slate-600">{diag.pct}% · {diag.level === "ABOVE" ? "Above" : diag.level === "ON" ? "On" : "Below"} Level · strengths and next steps.</span></span></Link> : <div className={off}><span className="text-4xl" aria-hidden="true">📝</span><span><span className="block text-lg font-bold text-slate-600">Diagnostic Report</span><span className="block text-sm text-slate-500">Appears when the teacher shares it.</span></span></div>}</li>
        <li>{shared ? <Link href={`/parent/report/${studentId}`} className={card}><span className="text-4xl" aria-hidden="true">📄</span><span><span className="block text-lg font-bold text-brand-navy">Report from the Teacher</span><span className="block text-sm text-slate-600">Progress, strengths and what to practise next.</span></span></Link> : <div className={off}><span className="text-4xl" aria-hidden="true">📄</span><span><span className="block text-lg font-bold text-slate-600">Report from the Teacher</span><span className="block text-sm text-slate-500">Appears when the teacher shares it.</span></span></div>}</li>
        <li>{maps.length && shared ? <Link href={`/map-report/family/${studentId}`} className={card}><span className="text-4xl" aria-hidden="true">📈</span><span><span className="block text-lg font-bold text-brand-navy">MAP Family Report</span><span className="block text-sm text-slate-600">MAP Growth results, the Spring goal and what they mean.</span></span></Link> : <div className={off}><span className="text-4xl" aria-hidden="true">📈</span><span><span className="block text-lg font-bold text-slate-600">MAP Family Report</span><span className="block text-sm text-slate-500">Appears with the MAP results and the teacher’s report.</span></span></div>}</li>
        <li>{shared ? <Link href={`/map-report/study-plan/${studentId}`} className={card}><span className="text-4xl" aria-hidden="true">🧭</span><span><span className="block text-lg font-bold text-brand-navy">Study Plan</span><span className="block text-sm text-slate-600">The skills to work on next.</span></span></Link> : <div className={off}><span className="text-4xl" aria-hidden="true">🧭</span><span><span className="block text-lg font-bold text-slate-600">Study Plan</span><span className="block text-sm text-slate-500">Appears with the teacher’s report.</span></span></div>}</li>
      </ul>
      <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-sky-200">🏠 15 minutes a day on the platform (“Today’s plan”) and 15 minutes of reading together make the biggest difference.</p>
    </AppShell>
  );
}
