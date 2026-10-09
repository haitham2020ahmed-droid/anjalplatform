import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AutoPrint } from "@/components/plans/auto-print";
import { StudyPlanView } from "@/components/map/study-plan-view";
import { ReportToolbar } from "@/components/map/report-toolbar";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { studyPlan } from "@/server/map/map-reports";

export const metadata = { title: "Personal Study Plan" };

/** 🧭 One student's Personal Study Plan (staff, the student, their parent once shared). */
export default async function StudyPlanPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ subject?: string; full?: string; print?: string }> }) {
  const actor = await requireActor();
  const me = (await getActor())!.user;
  const { studentId } = await params;
  const sp = await searchParams;
  const subject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  let d;
  try { d = await studyPlan(repo, actor, studentId, subject, { full: sp.full === "1" }); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const back = actor.role === "STUDENT" ? { href: "/student/map", label: "My MAP" } : actor.role === "PARENT" ? { href: "/parent", label: "Back" } : { href: d.student.classId ? `/teacher/map-reports?classId=${d.student.classId}` : "/teacher/map-reports", label: "MAP Reports" };
  return (
    <AppShell name={String(me.displayName)}>
      <ReportToolbar back={back} base={`/map-report/study-plan/${studentId}`} subject={subject} full={d.full} />
      <StudyPlanView d={d} link={actor.role === "STUDENT"} hub={["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"].includes(actor.role)} />
      {sp.print === "1" && <AutoPrint />}
    </AppShell>
  );
}
