import Link from "next/link";
import { SkillStar } from "@/components/skills/skill-star";
import { absolutePlanPath } from "@/lib/plan-links";
import { PlanA } from "@/components/plans/plan-links";
import { TAB_ICON, TAB_LABEL, type MySkills, type MySkillsTab } from "@/server/skills/my-skills";

type T = (text: string, vars?: Record<string, string | number>) => string;

/**
 * ⭐ My Skills (owner r68 spec B): four tabs with counts (Review only when it has skills), rows grouped by strand with a
 * heading and a count, one row per skill — its star, its name and ONE button (Practice again + the small mastered date ·
 * Continue + a small mastery bar · Review now · Start). Clean on a phone and an iPad. `readOnly`: the teacher's copy
 * (Reports → Student Skills → Student): no buttons. No hooks: a server component; the tabs are plain links.
 */
export function MySkillsView({ v, tab, t, hrefOf, readOnly = false }: { v: MySkills; tab: MySkillsTab; t: T; hrefOf: (tab: MySkillsTab) => string; readOnly?: boolean }) {
  const groups = v.groups[tab] ?? [];
  return (
    <div data-testid="my-skills" className="space-y-4">
      <nav aria-label={t("My Skills")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" data-testid="my-skills-tabs">
        {v.tabs.map((k) => (
          <Link key={k} prefetch={false} href={hrefOf(k)} aria-current={k === tab ? "page" : undefined} data-tab={k}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 transition ${k === tab ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300 hover:ring-brand-teal"}`}>
            <span aria-hidden="true">{TAB_ICON[k]}</span>{t(TAB_LABEL[k])}
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${k === tab ? "bg-white/20" : "bg-slate-100"}`} dir="ltr">{v.counts[k]}</span>
          </Link>
        ))}
      </nav>
      {!groups.length ? (
        <p className="rounded-2xl bg-white p-5 text-center text-slate-600 ring-1 ring-slate-200" data-testid="my-skills-empty">
          {tab === "MASTERED" ? t("No star yet. Keep practising: your first star is close!") : tab === "LEARNING" ? t("Nothing in progress right now.") : tab === "REVIEW" ? t("Nothing to review. Well done!") : t("Every skill of your plans is started. Great!")}
        </p>
      ) : groups.map((g) => (
        <section key={g.strand} aria-labelledby={`strand-${g.strand}`} data-strand={g.strand}>
          <h2 id={`strand-${g.strand}`} className="mb-2 flex items-center gap-2 text-base font-semibold text-brand-navy">
            {t(g.label)} <span className="rounded-full bg-white px-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200" dir="ltr">{g.rows.length}</span>
          </h2>
          <ul className="grid gap-2 md:grid-cols-2">
            {g.rows.map((r) => (
              <li key={r.key} data-testid="my-skill" data-status={r.status} className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200">
                <SkillStar info={{ status: r.status }} who="student" t={t} label={r.name} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug text-slate-900" data-content lang="en">{/* 🔗 r79: printed, the skill's name still opens its practice */}{!readOnly && r.href ? <PlanA href={absolutePlanPath(r.href)}>{r.name}</PlanA> : r.name}</span>
                  {tab === "MASTERED" && r.masteredAt && <span className="block text-xs text-slate-500">{t("Mastered on {date}", { date: r.masteredAt })}</span>}
                  {tab === "LEARNING" && (
                    <span className="mt-1 block h-1.5 w-full max-w-[10rem] overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={t("Mastery")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.score}>
                      <span className="block h-full rounded-full bg-sky-500" style={{ width: `${Math.max(4, r.score)}%` }} />
                    </span>
                  )}
                </span>
                {!readOnly && r.href && (
                  <Link prefetch={false} href={r.href} data-testid="my-skill-action"
                    className={`inline-flex min-h-10 shrink-0 items-center rounded-xl px-3 text-sm font-semibold ${tab === "MASTERED" ? "bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal" : tab === "REVIEW" ? "bg-orange-600 text-white hover:bg-orange-700" : "bg-brand-navy text-white hover:bg-brand-purple"}`}>
                    {t(r.action)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
