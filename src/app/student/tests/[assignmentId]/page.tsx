import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TestReviewView } from "@/components/tests/test-review-view";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { testReview, type TestReview } from "@/server/tests/assessments";
import { getT } from "@/i18n/server";

export const metadata = { title: "Review my test" };

/** Review of the student's own completed test. */
export default async function StudentTestReview({ params }: { params: Promise<{ assignmentId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  let r: TestReview;
  try { r = await testReview(repo, actor, (await params).assignmentId); } catch (e) {
    if (e instanceof ValidationError) return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">{t(e.message)}</p><Link href="/student/tests" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-brand-navy px-6 font-semibold text-white">{t("My Tests")}</Link></AppShell>;
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  return <AppShell name={String(me.displayName)}><TestReviewView r={r} backHref="/student/tests" backLabel="My Tests" /></AppShell>;
}
