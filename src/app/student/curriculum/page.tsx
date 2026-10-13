import { AppShell } from "@/components/app-shell";
import { LineIcon } from "@/components/ui/line-icon";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { skillPlanForStudent, studentStudyPlans, type StudentPlanView } from "@/server/curriculum-map/plans";
import { StudyPlan } from "@/components/student/study-plan";
import { getT } from "@/i18n/server";

export const metadata = { title: "Curriculum Map" };

/**
 * Curriculum Map for students = my study plan, straight away: the "Grade N Curriculum" plan (units, text sets,
 * sections incl. Review, progress, Download PDF / Print). Only my own plans; several → a small switcher at the top
 * (?plan=…), the default is the newest plan of my own grade. No levels are shown.
 */
export default async function StudentCurriculumPage({ searchParams }: { searchParams: Promise<{ plan?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, mine, sp] = await Promise.all([getT(), studentStudyPlans(repo, actor), searchParams]);
  const id = mine.plans.some((p) => p.id === sp.plan) ? sp.plan! : mine.defaultId;
  let p: StudentPlanView | null = null;
  if (id) { try { p = await skillPlanForStudent(repo, actor, id); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; } }
  return (
    <AppShell name={String(me.displayName)}>
      {p ? <StudyPlan t={t} p={p} studentName={String(me.displayName)} plans={mine.plans} basePath="/student/curriculum" msg={sp.msg ?? null} />
        : (
          <div role="status" className="flex flex-col items-center gap-2 rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200/80">
            <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-xl bg-slate-50 text-brand-navy ring-1 ring-slate-200"><LineIcon name="curriculum" /></span>
            <h1 className="text-lg font-semibold text-brand-navy">{t("No study plan yet")}</h1>
            <p className="max-w-md text-slate-600">{t("Your teacher has not sent your study plan yet. Check back later.")}</p>
          </div>
        )}
    </AppShell>
  );
}
