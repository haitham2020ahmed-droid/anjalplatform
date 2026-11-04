import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReportToolbar } from "@/components/map/report-toolbar";
import { StudentProfileView } from "@/components/map/student-profile-view";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { studentProfile } from "@/server/map/nwea-reports";
import { ReportIntro, ReportSummary } from "@/components/report-kit";
import { mapProfileSummary } from "@/lib/report-summaries";

export const metadata = { title: "MAP Student Profile" };

/** 🧑‍🎓 NWEA-style Student Profile (staff). */
export default async function StudentProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  let d;
  try { d = await studentProfile(repo, actor, studentId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  return (
    <AppShell name={String(me.displayName)}>
      <ReportToolbar back={{ href: d.student.classId ? `/map-report/class/${d.student.classId}/profile` : "/teacher/map-reports", label: "Class Profile" }} base={`/map-report/profile/${studentId}`} />
      <div className="mx-auto max-w-4xl"><ReportIntro text="One student's MAP Growth results: the score (RIT), growth, and the goal areas to work on." /></div>
      <StudentProfileView d={d} />
      <div className="mx-auto max-w-4xl"><ReportSummary summary={mapProfileSummary(d)} /></div>
    </AppShell>
  );
}
