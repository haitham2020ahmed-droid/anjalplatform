import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { cleanupCounts } from "@/server/admin/data-cleanup";
import { getT } from "@/i18n/server";
import { PublishDrafts } from "./publish-drafts";

export const metadata = { title: "Data Cleanup" };

/** 🧹 Simple fix-it cards: a count and one button each. Only "Publish all drafts" changes data (the admin presses it). */
export default async function DataCleanupPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const c = await cleanupCounts(repo, actor);
  const cards: { n: number; title: string; text: string; href: string; button: string; extra?: string }[] = [
    { n: c.unclassified, title: "Questions without a skill", text: "Sort them under their skills. You check the ones the platform is not sure about.", href: "/admin/skill-links#sort", button: "Sort questions" },
    { n: c.underReview + c.drafts, title: "Draft questions waiting for review", text: "Publish them all with one press, or review them one by one.", href: `/admin/questions?status=${c.underReview ? "UNDER_REVIEW" : "DRAFT"}`, button: "Review questions", extra: t("{n} sent for review · {m} drafts", { n: c.underReview, m: c.drafts }) },
    { n: c.studentsWithoutClass, title: "Students without a class", text: "Put each student in a class so a teacher can see them.", href: "/admin/school?open=no-class", button: "Give them a class" },
    { n: c.classesWithoutTeacher, title: "Classes without a teacher", text: "Choose a teacher for each class.", href: "/admin/school?filter=no-teacher", button: "Choose teachers" },
    { n: c.skillsWithoutQuestions, title: "Skills with no questions", text: "Students cannot practise these skills yet.", href: "/admin/bank-gaps", button: "Add questions", extra: c.emptySkills.length ? c.emptySkills.map((k) => `${k.name} (G${k.grade})`).join(" · ") : undefined },
    { n: c.studentsWithoutMap, title: "Students with no MAP scores", text: "Add their MAP scores so their plans can be made.", href: "/teacher/map-rit", button: "Add MAP scores" },
  ];
  const todo = cards.filter((x) => x.n > 0).length;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🧹" title="Data Cleanup"
        subtitle={todo ? t("{n} things to fix. Each button opens the page that fixes it.", { n: todo }) : t("Everything looks tidy.")} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((x) => (
          <li key={x.title} className={`flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ${x.n ? "ring-orange-200" : "ring-slate-200"}`}>
            <p className={`text-3xl font-bold ${x.n ? "text-orange-700" : "text-emerald-700"}`}>{x.n ? x.n : "✓"}</p>
            <h2 className="mt-1 text-lg font-semibold text-brand-navy">{t(x.title)}</h2>
            <p className="mt-1 flex-1 text-sm text-slate-600">{x.n ? t(x.text) : t("Nothing to fix.")}</p>
            {x.n > 0 && x.extra && <p className="mt-2 text-xs text-slate-500" lang="en">{x.extra}</p>}
            {x.n > 0 && x.title === "Draft questions waiting for review" && <PublishDrafts total={x.n} />}
            {x.n > 0 && <Link href={x.href} prefetch={false} className={`${BTN_SECONDARY} mt-3 self-start`}>{t(x.button)}</Link>}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
