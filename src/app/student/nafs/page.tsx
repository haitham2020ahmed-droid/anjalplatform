import Link from "next/link";
import { hideLevels } from "@/lib/hide-levels";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentSkillPlans } from "@/server/curriculum-map/plans";
import { programWork } from "@/server/student/program-work";
import { ProgramWorkList } from "@/components/student/program-work-list";
import { EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "NAFS" };

/**
 * 🎯 My NAFS plan: the NAFS plan(s) my teacher assigned (open one to see every part) and my NAFS work (the NAFS
 * rows of My Work — also listed in My Work). The menu shows NAFS only when the student has NAFS work
 * (studentMenuFlags); anyone else opening this page gets a friendly empty state.
 */
export default async function StudentNafsPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, plans, work] = await Promise.all([getT(), studentSkillPlans(repo, actor).catch(() => []), programWork(repo, actor.studentId!, "NAFS")]);
  const nafs = plans.filter((p) => p.kind === "NAFS");
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My Work" }} icon="🎯" title="NAFS" subtitle={t("Your NAFS plan and practice, step by step.")} />
      {!nafs.length && !work.length ? <EmptyState icon="🎯" title="Nothing here yet" text="Your teacher will add work here soon." action={{ href: "/student", label: "My Work" }} /> : (
        <>
          {nafs.length > 0 && (
            <ul className="grid gap-4 md:grid-cols-2">
              {nafs.map((p) => {
                const pct = p.places ? Math.round((100 * p.done) / p.places) : 0;
                return (
                  <li key={p.id}><Link prefetch={false} href={`/student/plans/${p.id}`} className="lift block rounded-3xl bg-teal-50 p-5 ring-1 ring-teal-200">
                    <p className="text-lg font-semibold text-brand-navy">🎯 <bdi>{hideLevels(p.title)}</bdi></p>
                    <p className="mt-1 text-sm text-slate-600">{t("{done} of {total} done", { done: p.done, total: p.places })}</p>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white" aria-hidden="true"><div className="h-full rounded-full bg-teal-500" style={{ width: `${pct}%` }} /></div>
                  </Link></li>
                );
              })}
            </ul>
          )}
          <ProgramWorkList id="nafs-work" items={work} title="Your NAFS work" program="NAFS" />
        </>
      )}
    </AppShell>
  );
}
