import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssignmentReportView } from "@/components/reports/assignment-report-view";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { assignmentReport, type AssignmentReport } from "@/server/student/assigned";

export default async function StudentAssignmentReport({ params }: { params: Promise<{ assignmentId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  let r: AssignmentReport;
  try { r = await assignmentReport(repo, actor, (await params).assignmentId); } catch { notFound(); }
  return <AppShell name={String(me.displayName)}><AssignmentReportView r={r} backHref="/student" backLabel="My assigned skills" /></AppShell>;
}
