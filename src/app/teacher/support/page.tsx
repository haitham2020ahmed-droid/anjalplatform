import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getT } from "@/i18n/server";
import { getActor, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";

export const metadata = { title: "Support & Intervention" };

/**
 * 🛟 Support & Intervention hub (owner request, Oct 2026): a non-technical teacher couldn't tell 8 similarly-named
 * menu entries apart, and two of them ("Who Needs Help" / "Alerts") were the exact same page reached two ways.
 * This page changes NOTHING about those 7 destination pages — every one keeps its own URL, its own forms and its
 * own server actions exactly as before (confirmed by reading each one: several submit forms to their own hard-coded
 * path, so merging their actual content into one page/URL would mean rewriting every one of those paths — too risky
 * to do blind, with no way to compile-check a Next.js page in this sandbox). Instead this is a NEW, purely additive
 * page: one shared title, one plain-language explanation of the order to use things in, and a grid of cards — each
 * card a doorway to an existing, already-working page. The two tools that are genuinely the same kind of thing
 * (Support plan's two steps; the two group-building tools) are grouped under one card with two buttons, so the grid
 * reads as 5 cards instead of 7 separate menu rows.
 */
export default async function SupportHubPage() {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const showMeasuredGroups = can(actor, "assignments:create");
  const showStrategyGroups = actor.role !== "SUPER_ADMIN"; // strategy-groups/page.tsx itself only allows TEACHER/SCHOOL_ADMIN

  const card = (icon: string, title: string, hint: string, links: { href: string; label: string }[]) => (
    <article key={title} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-3xl">{icon}</p>
      <h2 className="mt-2 text-lg font-bold text-brand-navy">{t(title)}</h2>
      <p className="mt-1 text-sm text-slate-600">{t(hint)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center rounded-xl bg-brand-navy px-4 text-sm font-bold text-white hover:bg-brand-purple">
            {t(l.label)}
          </Link>
        ))}
      </div>
    </article>
  );

  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader icon="🛟" title="Support & Intervention"
        subtitle={t("Everything for a student who needs extra help, in one place. Start with Alerts to see who needs attention now, then Support Plan to build their plan. Lessons, Small Groups and the Full Picture are there whenever you need them.")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {card("🚨", "Alerts", "Students who need attention now, and MAP or practice flags.", [{ href: "/teacher/alerts", label: "Open" }])}
        {card("🛟", "Support Plan (RTI)", "Who needs support, by level — and this week's plan.", [
          { href: "/teacher/plans/support", label: "Who needs support" },
          { href: "/teacher/rti-plan", label: "RTI Weekly Plan" },
        ])}
        {card("🧩", "Intervention Lessons", "Assign a lesson and follow each student's progress.", [{ href: "/teacher/lessons", label: "Open" }])}
        {(showMeasuredGroups || showStrategyGroups) && card("🎯", "Small Groups", "Group students for extra practice.", [
          ...(showMeasuredGroups ? [{ href: "/teacher/intervention/groups", label: "Groups with measured impact" }] : []),
          ...(showStrategyGroups ? [{ href: "/teacher/strategy-groups", label: "Reading strategy groups" }] : []),
        ])}
        {card("🔄", "Full Picture", "The whole class on one wheel: teach, check, reteach.", [{ href: "/teacher/learning-loop", label: "Open" }])}
      </div>
    </AppShell>
  );
}
