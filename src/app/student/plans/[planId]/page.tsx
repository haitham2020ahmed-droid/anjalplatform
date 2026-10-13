import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { skillPlanForStudent, studentStudyPlans, type StudentPlanView } from "@/server/curriculum-map/plans";
import { StudyPlan } from "@/components/student/study-plan";
import { getT } from "@/i18n/server";

export const metadata = { title: "Study plan" };

/**
 * One plan of mine (links in notifications and certificates): the same study-plan sheet as the Curriculum Map page
 * (Literise · Study plan header, Unit → Text Set → numbered sections, Download PDF / Print).
 */
export default async function MyPlan({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, { planId }, { msg }] = await Promise.all([getT(), params, searchParams]);
  let p: StudentPlanView | null = null;
  try { p = await skillPlanForStudent(repo, actor, planId); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
  if (!p) return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">{t("This plan is not assigned to you.")}</p></AppShell>;
  const view = p;
  const mine = await studentStudyPlans(repo, actor).catch(() => null);
  const plans = mine && mine.plans.some((x) => x.id === view.id) ? mine.plans : [];
  return (
    <AppShell name={String(me.displayName)}>
      <StudyPlan t={t} p={view} studentName={String(me.displayName)} plans={plans} basePath="/student/curriculum" msg={msg ?? null} />
    </AppShell>
  );
}
