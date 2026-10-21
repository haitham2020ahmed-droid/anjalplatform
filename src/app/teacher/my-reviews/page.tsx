import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { myReviews } from "@/server/curriculum-map/review-control";
import { MyReviewsList } from "@/components/curriculum-map/my-reviews-list";
import { getT } from "@/i18n/server";

export const metadata = { title: "My Reviews" };

/** 📚 r92 "My Reviews" ("تاب جديد فوق يعرض كل Reviews اللي اتعملت قبل كده"): every Review this teacher has built
 * so far — any grade, any Text Set, or a whole-grade Review Builder — in one place to reopen, edit or remove. */
export default async function MyReviewsPage() {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const rows = await myReviews(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="📚" title={t("My Reviews")}
        subtitle={t("Every Review you've built. Open one to keep editing it, or remove one you no longer need.")} />
      <MyReviewsList initial={rows} />
    </AppShell>
  );
}
