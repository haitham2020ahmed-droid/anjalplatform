import type { TFn } from "@/i18n";
import { EmptyState } from "@/components/ui-kit";
import { repo } from "@/server/auth/next";
import { ForbiddenError, type Actor } from "@/server/auth/rbac";
import { yearPlanView, type YearPlanView } from "@/server/map/year-plan";
import { YearPlanBoard } from "@/components/map/year-plan-board";

/**
 * 🗓️ Year plan (owner r67): the class's 40 school weeks of 2–3 shared skills (src/server/map/year-plan.ts). The class
 * teacher edits and assigns (☆); the admin sees each class's plan read-only (the class pills above).
 */
export async function YearTab({ actor, t, classId }: { actor: Actor; t: TFn; classId: string }) {
  let v: YearPlanView | null = null;
  try { v = await yearPlanView(repo, actor, classId); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
  if (!v) return <EmptyState icon="🗓️" title="Year plan" text="Choose one of your classes." />;
  return (
    <section aria-label={t("Year plan")} className="space-y-3">
      <p className="text-sm text-slate-600">{t("The skills most of {name} share as needs (MAP scores and the Learning Continuum), easiest first, 2–3 a week over 40 weeks. Press ☆ to assign a skill to the class.", { name: v.className })}</p>
      {!v.canEdit && <p role="status" className="rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900">{t("Read only: the class teacher changes and assigns the plan.")}</p>}
      <YearPlanBoard initial={v} />
    </section>
  );
}
