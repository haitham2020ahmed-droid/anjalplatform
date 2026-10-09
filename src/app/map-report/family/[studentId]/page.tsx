import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AutoPrint } from "@/components/plans/auto-print";
import { FamilyView } from "@/components/map/family-view";
import { ReportToolbar } from "@/components/map/report-toolbar";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { familyReport } from "@/server/map/map-reports";

export const metadata = { title: "Family Report" };

/** 👪 One student's Family Report (staff, the student, their parent once shared). */
export default async function FamilyReportPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ print?: string }> }) {
  const actor = await requireActor();
  const me = (await getActor())!.user;
  const { studentId } = await params;
  const sp = await searchParams;
  let d;
  try { d = await familyReport(repo, actor, studentId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const back = actor.role === "STUDENT" ? { href: "/student/map", label: "My MAP" } : actor.role === "PARENT" ? { href: "/parent", label: "Back" } : { href: d.student.classId ? `/teacher/map-reports?classId=${d.student.classId}` : "/teacher/map-reports", label: "MAP Reports" };
  return (
    <AppShell name={String(me.displayName)}>
      <ReportToolbar back={back} base={`/map-report/family/${studentId}`} />
      <FamilyView d={d} />
      {sp.print === "1" && <AutoPrint />}
    </AppShell>
  );
}
