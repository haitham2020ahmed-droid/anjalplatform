import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { GroupPlanView } from "@/components/map/group-plan-view";
import { ReportToolbar } from "@/components/map/report-toolbar";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { groupStudyPlan } from "@/server/map/map-reports";
import { ReportIntro } from "@/components/report-kit";

export const metadata = { title: "Group Study Plan" };

/** 👥 The class in groups by RIT band for every goal area: what each group develops, and send it. */
export default async function GroupPlanPage({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ subject?: string; msg?: string; full?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { classId } = await params;
  const sp = await searchParams;
  const subject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  let d;
  try { d = await groupStudyPlan(repo, actor, classId, subject, sp.full === "1"); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  return (
    <AppShell name={String(me.displayName)}>
      <ReportToolbar back={{ href: `/teacher/map-reports?classId=${classId}`, label: "MAP Reports" }} base={`/map-report/class/${classId}/groups`} subject={subject} full={sp.full === "1"} msg={sp.msg} extra={<span className="text-sm text-slate-600">{d.className}</span>} />
      <div className="mx-auto max-w-4xl"><ReportIntro text="The class in groups by MAP score for each goal area: what each group should learn next, and send it." /></div>
      <GroupPlanView d={d} />
    </AppShell>
  );
}
