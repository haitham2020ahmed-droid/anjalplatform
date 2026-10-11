import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentRtiProgram } from "@/server/student/student-home";
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState, SourceTag, StatusPill } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "RTI Program" };
const STATUS = { "Not started": "NOT_STARTED", "In progress": "IN_PROGRESS", Done: "DONE" } as const;

/**
 * 🛟 My RTI Program (only students in Tier 2 / Tier 3 — tiers module): this week's skills from the teacher
 * (RTI work in My Work) and the focus skill. Other students see a friendly message (the home shows no RTI icon).
 */
export default async function StudentRtiPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, p] = await Promise.all([getT(), studentRtiProgram(repo, actor)]);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="🛟" title="RTI Program"
        subtitle={p ? t("Extra help: {s} sessions of {m} minutes this week", { s: p.sessions, m: p.minutes }) : undefined} />
      {!p ? <EmptyState icon="🛟" title="Nothing here yet" text="Your teacher will add work here soon." action={{ href: "/student", label: "Home" }} /> : (
        <>
          {p.focus && (
            <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-orange-50 p-5 ring-1 ring-orange-200">
              <div><p className="text-sm font-semibold text-orange-900">{t("My focus skill")}</p><p className="text-xl font-semibold text-brand-navy"><bdi>{p.focus.name}</bdi></p></div>
              <Link prefetch={false} href={`/practice/${encodeURIComponent(p.focus.skillId)}`} className={BTN_PRIMARY}>{t("Start")}</Link>
            </section>
          )}
          <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-brand-navy">{t("My skills this week")}</h2>
            {!p.skills.length ? <div className="mt-3"><EmptyState compact title="No work right now — great job!" text="Your teacher will add work here soon." /></div> : (
              <ul className="mt-3 grid gap-3">
                {p.skills.map((r) => (
                  <li key={r.assignmentId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
                    <div className="min-w-0"><p className="font-semibold text-brand-navy"><bdi>{r.skill}</bdi></p><div className="mt-1 flex flex-wrap gap-2"><SourceTag source="RTI" /><StatusPill status={STATUS[r.status]} /></div></div>
                    <Link prefetch={false} href={r.href} className={r.status === "Done" ? BTN_SECONDARY : BTN_PRIMARY}>{t(r.action)}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
