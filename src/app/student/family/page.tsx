import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { isReportShared } from "@/server/insights/parent-report";
import { myMap } from "@/server/map/map-more";
import { studentSkillPlans } from "@/server/curriculum-map/plans";
import { weekStats } from "@/server/student/weekly";
import { subjectName } from "@/components/map/map-ui";

export const metadata = { title: "Family Report" };

/**
 * 👪 Family Report: everything to show at home in one place — the MAP family report, the report my teacher
 * shared, my study plan, my plans and this week's progress. Each one prints or saves as PDF.
 */
export default async function FamilyReport() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const id = actor.studentId!;
  const [shared, m, plans, week] = await Promise.all([isReportShared(repo, String(actor.schoolId), id), myMap(repo, actor), studentSkillPlans(repo, actor), weekStats(repo, id)]);
  const hasMap = m.subjects.some((x) => x.profile.term);
  const card = "lift flex items-start gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="👪" title="Family Report" subtitle="Show these to your family. Open one, then use Download PDF / Print." />

      <section className="mb-6 rounded-3xl bg-gradient-to-r from-teal-50 to-sky-50 p-5 ring-1 ring-teal-200">
        <h2 className="text-lg font-bold text-brand-navy">🗓️ This Week <span className="text-sm font-normal text-slate-500">since {week.since}</span></h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Stat label="Weekly goal" value={`${Math.min(week.partsDone, week.partsGoal)}/${week.partsGoal}`} note={week.reached ? "🎉 reached!" : "parts of my plan"} strong />
          <Stat label="Answers" value={String(week.answers)} note={`${week.correct} correct`} />
          <Stat label="Minutes" value={String(week.minutes)} note="of practice" />
          <Stat label="Days active" value={`${week.days}/7`} note="this week" />
        </div>
        {week.parts.length > 0 && <p className="mt-3 text-sm text-slate-700">✅ Finished: {week.parts.join(" · ")}</p>}
      </section>

      <ul className="grid gap-4 md:grid-cols-2">
        <li>{hasMap ? (
          <Link href={`/map-report/family/${id}`} className={card}><span className="text-4xl" aria-hidden="true">📈</span><span><span className="block text-lg font-bold text-brand-navy">MAP Family Report</span><span className="block text-sm text-slate-600">My MAP Growth results ({m.subjects.filter((x) => x.profile.term).map((x) => subjectName(x.subject)).join(", ")}), my goal and what they mean.</span></span></Link>
        ) : <div className={`${card} opacity-70`}><span className="text-4xl" aria-hidden="true">📈</span><span><span className="block text-lg font-bold text-slate-600">MAP Family Report</span><span className="block text-sm text-slate-500">Appears when your MAP results are added.</span></span></div>}</li>
        <li>{shared ? (
          <Link href="/student/family/teacher-report" className={`${card} ring-emerald-300`}><span className="text-4xl" aria-hidden="true">📄</span><span><span className="block text-lg font-bold text-brand-navy">Report from My Teacher</span><span className="block text-sm text-slate-600">My teacher’s report about my progress, strengths and what to practise next.</span></span></Link>
        ) : <div className={`${card} opacity-70`}><span className="text-4xl" aria-hidden="true">📄</span><span><span className="block text-lg font-bold text-slate-600">Report from My Teacher</span><span className="block text-sm text-slate-500">Appears when your teacher shares it.</span></span></div>}</li>
        <li><Link href={`/map-report/study-plan/${id}`} className={card}><span className="text-4xl" aria-hidden="true">🧭</span><span><span className="block text-lg font-bold text-brand-navy">My Study Plan</span><span className="block text-sm text-slate-600">The skills to work on next, from my MAP results.</span></span></Link></li>
        <li><Link href="/student/plans" className={card}><span className="text-4xl" aria-hidden="true">🗂️</span><span><span className="block text-lg font-bold text-brand-navy">My Plans</span><span className="block text-sm text-slate-600">{plans.length ? plans.map((p) => `${p.title}: ${p.done}/${p.places} done`).join(" · ") : "No plans yet."}</span></span></Link></li>
      </ul>
    </AppShell>
  );
}

function Stat({ label, value, note, strong }: { label: string; value: string; note: string; strong?: boolean }) {
  return <div className={`rounded-2xl p-3 ${strong ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}><p className={`text-xs font-semibold uppercase tracking-wide ${strong ? "text-white/70" : "text-slate-500"}`}>{label}</p><p className="text-2xl font-extrabold tabular-nums">{value}</p><p className={`text-xs ${strong ? "text-white/80" : "text-slate-500"}`}>{note}</p></div>;
}
