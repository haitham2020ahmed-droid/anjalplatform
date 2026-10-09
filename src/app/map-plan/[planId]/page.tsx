import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { AutoPrint } from "@/components/plans/auto-print";
import { PlanDocView } from "@/components/map/map-ui";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { planDoc } from "@/server/map/map-more";

export const metadata = { title: "MAP plan" };

/** 🗺️ One student's MAP plan: preview, print or save as PDF (teacher, admin, the student, the parent). */
export default async function MapPlanPage({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ print?: string }> }) {
  const actor = await requireActor();
  const me = (await getActor())!.user;
  const { planId } = await params;
  const sp = await searchParams;
  let d;
  try { d = await planDoc(repo, actor, planId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const back = actor.role === "STUDENT" ? { href: "/student/map", label: "My MAP" } : actor.role === "PARENT" ? { href: "/parent", label: "Back" } : { href: `/teacher/map-plans?tab=plans&subject=${d.subject}`, label: "MAP plans" };
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden"><PageHeader back={back} icon="🗺️" title={`MAP plan · ${d.name}`} subtitle="Press the button and choose “Save as PDF” to download it."><PrintButton /></PageHeader></div>
      <PlanDocView d={d} forStudent={actor.role === "STUDENT"} />
      {sp.print === "1" && <AutoPrint />}
    </AppShell>
  );
}
