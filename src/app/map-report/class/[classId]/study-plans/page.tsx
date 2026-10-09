import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StudyPlanView } from "@/components/map/study-plan-view";
import { ReportToolbar } from "@/components/map/report-toolbar";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { classStudyPlans } from "@/server/map/map-reports";

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
  return (
    <AppShell name={String(me.displayName)}>
      <ReportToolbar back={{ href: `/teacher/map-reports?classId=${classId}`, label: "MAP Reports" }} base={`/map-report/class/${classId}/study-plans`} subject={subject} full={sp.full === "1"} extra={<span className="text-sm text-slate-600">{v.className} · {v.docs.length} student(s)</span>} />
      {!v.docs.length && <p className="mx-auto max-w-4xl rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No student of {v.className} has a {subject === "READING" ? "Reading" : "Language Usage"} MAP score yet.</p>}
      {v.docs.map((d, i) => <StudyPlanView key={d.student.id} d={d} first={i === 0} hub />)}
    </AppShell>
  );
}
