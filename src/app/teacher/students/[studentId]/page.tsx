import { AppShell } from "@/components/app-shell";
import { StudentDetailView } from "@/components/teacher/student-detail";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentDetail } from "@/server/teacher/queries";
import { ResetPasswordButton } from "./reset-password-button";
import { StudentAnalyticsView } from "@/components/analytics/student-analytics";
import { resolvePeriod } from "@/analytics/periods";
import { loadCalendar } from "@/server/analytics/calendar";
import { studentAnalytics } from "@/server/analytics/reports";
import { MapComparisonView } from "@/components/analytics/map-comparison";
import { mapComparison } from "@/server/analytics/map-compare";
import { ReportDownloads } from "@/components/reports/report-downloads";

export default async function StudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const { studentId } = await params;
  const me = (await getActor())!.user;
  const d = await studentDetail(repo, actor, studentId); // access checked inside
  const member = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  const st = (await repo.findUnique("Student", { id: studentId }))!;
  const analytics = await studentAnalytics(repo, actor, studentId, resolvePeriod("SCHOOL_YEAR", await loadCalendar(repo, String(st.schoolId))));
  return (
    <AppShell name={String(me.displayName)}>
      <StudentDetailView d={d} classHref={member ? `/teacher/classes/${String(member.classId)}` : "/teacher"} />
      <StudentAnalyticsView a={analytics} />
      <MapComparisonView data={await mapComparison(repo, actor, studentId)} />
      <ReportDownloads title="Student progress report (this school year)" report={{ kind: "student", studentId, period: "SCHOOL_YEAR" }} />
      <div className="mt-8"><ResetPasswordButton userId={String(st.userId)} /></div>
    </AppShell>
  );
}
