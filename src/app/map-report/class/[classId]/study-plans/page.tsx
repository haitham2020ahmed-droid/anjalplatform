import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StudyPlanView } from "@/components/map/study-plan-view";
import { ReportToolbar } from "@/components/map/report-toolbar";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { classStudyPlans } from "@/server/map/map-reports";
import { sentPlans, planProgress, type PlanProgress } from "@/server/map/map-more";
import { ReportIntro, ReportSummary } from "@/components/report-kit";
import { classStudyPlansSummary } from "@/lib/report-summaries";
import { planStarCount } from "@/lib/plan-groups";

export const metadata = { title: "Study Plans · Class" };

/** 🧭 Every student's Personal Study Plan of a class, one after the other (one PDF). */
export default async function ClassStudyPlansPage({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ subject?: string; full?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { classId } = await params;
  const sp = await searchParams;
  const subject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  let v;
  try { v = await classStudyPlans(repo, actor, classId, subject, sp.full === "1"); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  // 🆕 feature (Nov 2026): the same "X of Y done" a teacher sees on one student's own study-plan page, for every
  // student here too — so the class view is enough to see who's stuck in their auto-advance MAP plan, no need to
  // open each student individually. One read per student (sentPlans), same as the single-student page.
  const plans = new Map<string, PlanProgress>(
    await Promise.all(v.docs.map(async (d): Promise<[string, PlanProgress]> => {
      const doc = (await sentPlans(repo, d.student.id)).find((x) => x.subject === subject) ?? null;
      return [d.student.id, doc ? planProgress(doc) : { done: 0, total: 0, pct: 0, allDone: false, next: null }];
    })),
  );
  return (
    <AppShell name={String(me.displayName)}>
      <ReportToolbar back={{ href: `/teacher/map-reports?classId=${classId}`, label: "MAP Reports" }} base={`/map-report/class/${classId}/study-plans`} subject={subject} full={sp.full === "1"} extra={<span className="text-sm text-slate-600">{v.className} · {v.docs.length} student(s)</span>} />
      <div className="mx-auto max-w-4xl"><ReportIntro text="Every student's Personal Study Plan in one document: the skills each student should practise next." /></div>
      {!v.docs.length && <p className="mx-auto max-w-4xl rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No student of {v.className} has a {subject === "READING" ? "Reading" : "Language Usage"} MAP score yet.</p>}
      {v.docs.map((d, i) => {
        const plan = plans.get(d.student.id);
        return (
          <div key={d.student.id}>
            {plan && plan.total > 0 && (
              <div className="mx-auto mb-2 max-w-4xl rounded-2xl bg-white p-3 ring-1 ring-slate-200 print:hidden">
                <p className="text-sm font-semibold text-brand-navy">{d.student.name} — 📋 MAP plan: {plan.allDone ? "✅ All done" : `${plan.done} of ${plan.total} done`} <span dir="ltr" className="text-slate-500">({plan.pct}%)</span></p>
              </div>
            )}
            <StudyPlanView d={d} first={i === 0} hub />
          </div>
        );
      })}
      <div className="mx-auto max-w-4xl"><ReportSummary summary={classStudyPlansSummary(v.docs.map((d) => ({ ...d, counts: d.counts ?? planStarCount(d.areas) })), classId, subject)} /></div>
    </AppShell>
  );
}
