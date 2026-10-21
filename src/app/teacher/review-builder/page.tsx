import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { customReviewView, customSetChoices, customSkillChoices } from "@/server/curriculum-map/review-control";
import { rosterForGrade } from "@/server/curriculum-map/levels";
import { ReviewBuilder } from "@/components/curriculum-map/review-builder";
import { getT } from "@/i18n/server";

export const metadata = { title: "Review" };

/**
 * 🔁 r90 Review Builder ("عايز أضيف كمان كلمه review تكون موجوده اعلي الخطه"): a SECOND Review, not tied to one
 * Text Set — pick any Text Sets/Selections (any unit, each with its own ☐ Vocabulary / ☐ Analyze Craft / ☐
 * Review tick-list) or any Skills of the whole grade's plan ("Language" tab, with a 👁 preview), with an optional
 * level filter, then assign the result — Fixed or Adaptive. Narrower than the per-Set Review: remove / reorder /
 * how-many only, no private-copy Edit, no Write-a-question, no ✨ AI draft.
 */
export default async function ReviewBuilderPage({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  const grade = Math.trunc(Number(sp.grade));
  if (!(grade >= 1)) {
    return (
      <AppShell name={String(me.displayName)}>
        <PageHeader back={{ href: "/admin/curriculum-map", label: "Curriculum Map" }} icon="🔁" title={t("Review")} />
        <EmptyState icon="🔁" title="Choose a grade first" text="Open the Skill plan tab for a grade, then press 🔁 Review there." />
      </AppShell>
    );
  }
  const [view, sets, skills, roster] = await Promise.all([
    customReviewView(repo, actor, grade),
    customSetChoices(repo, actor, grade),
    customSkillChoices(repo, actor, grade),
    actor.role === "TEACHER" ? rosterForGrade(repo, actor, grade) : Promise.resolve([]),
  ]);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/admin/curriculum-map?grade=${grade}&view=plan`, label: "Curriculum Map" }} icon="🔁" title={`${t("Review")}: ${t("Grade {n}", { n: grade })}`}
        subtitle={t("Build a Review from any Text Sets or Skills of this grade's whole plan, then assign it.")}>
        {actor.role === "TEACHER" && <Link href="/teacher/my-reviews" prefetch={false} className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📚 {t("My Reviews")}</Link>}
      </PageHeader>
      <ReviewBuilder grade={grade} initial={view} sets={sets} skillUnits={skills} roster={roster} />
    </AppShell>
  );
}
