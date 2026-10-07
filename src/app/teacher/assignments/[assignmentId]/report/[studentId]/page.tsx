import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssignmentReportView } from "@/components/reports/assignment-report-view";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { assignmentReport, type AssignmentReport } from "@/server/student/assigned";

export default async function TeacherStudentAssignmentReport({ params }: { params: Promise<{ assignmentId: string; studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { assignmentId, studentId } = await params;
  let r: AssignmentReport;
  try { r = await assignmentReport(repo, actor, assignmentId, studentId); } catch { notFound(); }
  return <AppShell name={String(me.displayName)}><AssignmentReportView r={r} backHref={`/teacher/assignments/${assignmentId}`} backLabel="Assignment results" /></AppShell>;
}
