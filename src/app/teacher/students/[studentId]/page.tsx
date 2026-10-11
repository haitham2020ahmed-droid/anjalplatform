import { LearningPathView } from "@/components/student/learning-path-view";
import { studentLearningPath } from "@/server/student/learning-path";
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
import { FamilyReportPanel } from "@/components/reports/family-report-panel";
import { staffFamilyReports } from "@/server/reports/family-reports";
import { buildProfiles, profilesOf } from "@/server/insights/student-profile";
import { StudentProfileCard } from "@/components/insights/student-profile-card";
import { tierLine } from "@/server/tiers/views";

export default async function StudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const { studentId } = await params;
  const me = (await getActor())!.user;
  const d = await studentDetail(repo, actor, studentId); // access checked inside
  const member = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  const st = (await repo.findUnique("Student", { id: studentId }))!;
  const analytics = await studentAnalytics(repo, actor, studentId, resolvePeriod("SCHOOL_YEAR", await loadCalendar(repo, String(st.schoolId))));
  // the student profile (built nightly; built now if this student has none yet)
  let profile = (await profilesOf(repo, [studentId])).get(studentId) ?? null;
  if (!profile) { await buildProfiles(repo, String(st.schoolId), new Date(), [studentId]).catch(() => 0); profile = (await profilesOf(repo, [studentId])).get(studentId) ?? null; }
  return (
    <AppShell name={String(me.displayName)}>
      <StudentDetailView d={d} classHref={member ? `/teacher/classes/${String(member.classId)}` : "/teacher"} />
      <StudentProfileCard p={profile} tier={await tierLine(repo, studentId).catch(() => null)} tierHref={`/teacher/tiers/${studentId}`} />
      <FamilyReportPanel studentId={studentId} name={String(d.name ?? "")} reports={await staffFamilyReports(repo, actor, { studentId }).catch(() => [])} />
      <a href={`/teacher/level-story/${studentId}`} className="lift mt-6 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-indigo-50 to-white px-5 py-4 ring-1 ring-indigo-200">
        <span><span className="block font-bold text-brand-navy">🧭 Level Story</span><span className="block text-sm text-slate-600">Their level in every section, where it comes from (MAP, Diagnostic, platform, teacher) and every change.</span></span>
        <span className="font-semibold text-brand-navy">Open ▶</span>
      </a>
      <LearningPathView p={await studentLearningPath(repo, actor, studentId)} classId={member ? String(member.classId) : null} />
      <StudentAnalyticsView a={analytics} />
      <MapComparisonView data={await mapComparison(repo, actor, studentId)} />
      <ReportDownloads title="Student progress report (this school year)" report={{ kind: "student", studentId, period: "SCHOOL_YEAR" }} />
      <div className="mt-8"><ResetPasswordButton userId={String(st.userId)} /></div>
    </AppShell>
  );
}
