import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentRtiProgram } from "@/server/student/student-home";
import { ProgramWorkList } from "@/components/student/program-work-list";
import { BTN_PRIMARY, EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "RTI Program" };

/**
 * 🛟 My RTI Program (only students in Tier 2 / Tier 3 — tiers module): my focus skill and this week's RTI work
 * (the RTI rows of My Work, also listed in My Work). Other students see a friendly message (no RTI menu entry).
 */
export default async function StudentRtiPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, p] = await Promise.all([getT(), studentRtiProgram(repo, actor)]);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My Work" }} icon="🛟" title="RTI Program"
        subtitle={p ? t("Extra help: {s} sessions of {m} minutes this week", { s: p.sessions, m: p.minutes }) : undefined} />
      {!p ? <EmptyState icon="🛟" title="Nothing here yet" text="Your teacher will add work here soon." action={{ href: "/student", label: "My Work" }} /> : (
        <>
          {p.focus && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-orange-50 p-5 ring-1 ring-orange-200 sm:p-6">
              <div><p className="text-sm font-semibold text-orange-900">🌟 {t("My focus skill")}</p><p className="text-xl font-semibold text-brand-navy"><bdi>{p.focus.name}</bdi></p></div>
              <Link prefetch={false} href={`/practice/${encodeURIComponent(p.focus.skillId)}`} className={`${BTN_PRIMARY} min-h-12 rounded-2xl px-6`}>{t("Start")}</Link>
            </section>
          )}
          <ProgramWorkList id="rti-work" items={p.skills} title="My skills this week" program="RTI" />
        </>
      )}
    </AppShell>
  );
}
