import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageHero } from "@/components/ui-kit";
import { SecondChancePlayer } from "@/components/second-chance/player";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { secondChanceView } from "@/server/second-chance/service";

export const metadata = { title: "Second Chance" };

/**
 * ⭐ Second Chance: every question I got wrong (practice, tests, ReadMaster, ReadRise, Question of the Day) and have
 * not answered right since, grouped by skill, 20 at a time. A right answer takes it off the list. Practice only:
 * levels and mastery never change here. Access: the student's own answers only (secondChanceView checks the actor).
 */
export default async function SecondChancePage({ searchParams }: { searchParams: Promise<{ skill?: string; page?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [{ t }, v] = await Promise.all([getT(), secondChanceView(repo, actor, { skill: String(sp.skill ?? ""), page: Number(sp.page) || 1 })]);
  const href = (o: { skill?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (o.skill) q.set("skill", o.skill);
    if (o.page && o.page > 1) q.set("page", String(o.page));
    return `/student/second-chance${q.size ? `?${q}` : ""}`;
  };
  const chip = (on: boolean) => `inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHero tone="student" title={<>⭐ {t("Second Chance")}</>}
        subtitle={t("Questions you got wrong come here. Try them again: a right answer takes one off the list.")}
        actions={v.total ? <span data-testid="chance-count" className="inline-flex min-h-11 items-center rounded-full bg-amber-100 px-4 text-base font-bold text-amber-900 ring-1 ring-amber-300">{v.total === 1 ? t("1 question waiting") : t("{n} questions waiting", { n: v.total })}</span> : undefined} />
      {!v.total ? (
        <EmptyState className="mt-6" icon="🌟" title="No mistakes waiting — great job!" text="When you get a question wrong, it comes here so you can try it again." action={{ href: "/student", label: "Back to My Work" }} />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_1fr]">
          <nav aria-label={t("Skills")} className="flex flex-wrap content-start gap-2 lg:flex-col">
            <Link prefetch={false} href={href({})} className={chip(!v.skill)} aria-current={!v.skill ? "page" : undefined}>{t("All skills")} <span className="rounded-full bg-amber-100 px-2 text-amber-900">{v.total}</span></Link>
            {v.groups.map((g) => (
              <Link key={g.key} prefetch={false} href={href({ skill: g.key })} className={chip(v.skill === g.key)} aria-current={v.skill === g.key ? "page" : undefined}>
                <bdi lang="en" className="min-w-0 truncate">{g.name}</bdi> <span className="rounded-full bg-amber-100 px-2 text-amber-900">{g.count}</span>
              </Link>
            ))}
          </nav>
          <div>
            <SecondChancePlayer key={`${v.skill}:${v.page}:${v.questions.map((q) => q.key).join(",")}`} questions={v.questions} total={v.total} />
            {v.pages > 1 && (
              <nav aria-label={t("Pages")} className="mt-4 flex flex-wrap items-center gap-2">
                {v.page > 1 && <Link prefetch={false} href={href({ skill: v.skill, page: v.page - 1 })} className={chip(false)}>{t("Back")}</Link>}
                <span className="text-sm text-slate-600">{t("Page {n} of {m}", { n: v.page, m: v.pages })}</span>
                {v.page < v.pages && <Link prefetch={false} href={href({ skill: v.skill, page: v.page + 1 })} className={chip(false)}>{t("Next")}</Link>}
              </nav>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
