import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { AutoPrint } from "@/components/plans/auto-print";
import { PlanDocView } from "@/components/map/map-ui";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { planDoc } from "@/server/map/map-more";
import Link from "next/link";
import { getT } from "@/i18n/server";

export const metadata = { title: "MAP plan" };

/** 🗺️ One student's MAP plan: preview, print or save as PDF (teacher, admin, the student, the parent). */
export default async function MapPlanPage({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ print?: string; view?: string }> }) {
  const actor = await requireActor();
  const me = (await getActor())!.user;
  const { planId } = await params;
  const sp = await searchParams;
  let d;
  try { d = await planDoc(repo, actor, planId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const back = actor.role === "STUDENT" ? { href: "/student/map", label: "My MAP" } : actor.role === "PARENT" ? { href: "/parent", label: "Back" } : { href: `/teacher/map-plans?tab=plans&subject=${d.subject}`, label: "MAP plans" };
  // 👀 staff: "Preview as student" shows the student's own version of the plan (the same component, student wording)
  const staff = actor.role === "TEACHER" || actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  const asStudent = actor.role === "STUDENT" || (staff && sp.view === "student");
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden"><PageHeader back={back} icon="🗺️" title={`MAP plan · ${d.name}`} subtitle="Press the button and choose “Save as PDF” to download it."><PrintButton />
        {staff && <Link href={`/map-plan/${encodeURIComponent(planId)}${asStudent ? "" : "?view=student"}`} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300">{asStudent ? t("Back to the teacher view") : `👀 ${t("Preview as student")}`}</Link>}
      </PageHeader></div>
      {staff && asStudent && <p role="status" className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-sky-200 print:hidden">{t("This is exactly what the student sees. Read only: nothing is answered, sent or saved.")}</p>}
      <PlanDocView d={d} forStudent={asStudent} audience={actor.role === "PARENT" ? "family" : asStudent ? "student" : "staff"} />
      {sp.print === "1" && <AutoPrint />}
    </AppShell>
  );
}
