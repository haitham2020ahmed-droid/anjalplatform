import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { reviewControlView, type ReviewControlView } from "@/server/curriculum-map/review-control";
import { rosterForGrade } from "@/server/curriculum-map/levels";
import { ReviewControl } from "@/components/curriculum-map/review-control";
import { getT } from "@/i18n/server";

export const metadata = { title: "Review" };

/**
 * 🔁 Curriculum Map → Review: the teacher's own Review of one text set (src/server/curriculum-map/review-control.ts):
 * edit (a private copy), add (write · bank · AI draft), remove, reorder and how many questions students answer.
 */
export default async function CurriculumReviewPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  let v: ReviewControlView | null = null, error: string | null = null;
  try { v = await reviewControlView(repo, actor, String(sp.code ?? "")); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) error = e.message; else throw e; }
  const grade = v ? `?grade=${v.grade}` : "";
  const roster = v && actor.role === "TEACHER" ? await rosterForGrade(repo, actor, v.grade) : [];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/admin/curriculum-map${grade}`, label: "Curriculum Map" }} icon="🔁" title={v ? `${t("Review")}: ${v.title}` : "Review"}
        subtitle={t("Edit, add, remove and order the questions of this Review, and choose how many your students answer.")}>
        {actor.role === "TEACHER" && <Link href="/teacher/my-reviews" prefetch={false} className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📚 {t("My Reviews")}</Link>}
        {v && <Link href={`/teacher/preview?code=${encodeURIComponent(v.code)}`} prefetch={false} className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">👁 {t("Preview")}</Link>}
      </PageHeader>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">{t(error)}</p>}
      {v && <ReviewControl initial={v} roster={roster} />}
    </AppShell>
  );
}
