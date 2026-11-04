import Link from "next/link";
import type { StudentYearPlan } from "@/server/map/year-plan-share";
import { SkillStar, StarLegend } from "@/components/skills/skill-star";

type T = (text: string, vars?: Record<string, string | number>) => string;
const md = (d: string) => d.slice(5).replace("-", "/");

/**
 * 🗓️ The Year plan as the STUDENT sees it (owner r68 §C) — the student's MAP page tab, and exactly the same view in the
 * teacher's "Preview as students". This week first (highlighted), then the weeks ahead, past weeks folded; each skill
 * with the student's own star and a Practise button. Student words only (no level words, no counts of students).
 */
export function StudentYearPlanView({ p, t, preview = false }: { p: StudentYearPlan; t: T; preview?: boolean }) {
  const now = p.weeks.find((w) => w.current) ?? null;
  const ahead = p.weeks.filter((w) => !w.past && !w.current);
  const past = p.weeks.filter((w) => w.past);
  const week = (w: StudentYearPlan["weeks"][number]) => (
    <li key={w.week} data-testid="student-year-week" aria-current={w.current ? "date" : undefined} className={`rounded-2xl bg-white p-3 ring-1 ${w.current ? "ring-2 ring-brand-teal" : "ring-slate-200"}`}>
      <p className="flex flex-wrap items-center gap-2 text-sm"><b className="text-brand-navy">{t("Week {n}", { n: w.week })}</b><span className="text-xs text-slate-500" dir="ltr">{md(w.from)} – {md(w.to)}</span>{w.current && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">{t("This week")}</span>}</p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {w.skills.map((k, i) => (
          <li key={`${k.skillId}-${i}`} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-sm">
            <SkillStar info={{ status: k.status }} who="student" t={t} label={k.name} size={18} />
            <span className="min-w-0 flex-1"><b className="text-slate-900" data-content lang="en">{k.name}</b> <span className="text-xs text-slate-500">{k.icon} {t(k.area)}{k.review ? ` · ${t("review")}` : ""}</span></span>
            {preview ? <span className="rounded-lg bg-brand-navy/80 px-3 py-1.5 text-xs font-semibold text-white">▶ {t("Practise")}</span>
              : <Link prefetch={false} href={k.href} className="inline-flex min-h-9 items-center rounded-lg bg-brand-navy px-3 text-xs font-semibold text-white hover:bg-brand-purple">▶ {t("Practise")}</Link>}
          </li>
        ))}
      </ul>
    </li>
  );
  return (
    <section aria-label={t("Year plan")} data-testid="student-year-plan" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">{t("Your teacher's plan for the year: the skills of each week. Practise them and win their stars!")}</p>
        <p className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 ring-1 ring-amber-200" dir="ltr">⭐ {p.mastered} / {p.total}</p>
      </div>
      <StarLegend who="student" t={t} />
      {now && <ol className="space-y-2" aria-label={t("This week")}>{week(now)}</ol>}
      {ahead.length > 0 && <><h3 className="pt-1 text-sm font-semibold text-slate-600">{t("Coming next")}</h3><ol className="space-y-2">{ahead.slice(0, now ? 4 : 6).map(week)}</ol></>}
      {ahead.length > (now ? 4 : 6) && (
        <details className="rounded-2xl bg-white/70 p-2 ring-1 ring-slate-200"><summary className="cursor-pointer text-sm font-semibold text-brand-navy">{t("Later weeks ({n})", { n: ahead.length - (now ? 4 : 6) })}</summary><ol className="mt-2 space-y-2">{ahead.slice(now ? 4 : 6).map(week)}</ol></details>
      )}
      {past.length > 0 && (
        <details className="rounded-2xl bg-white/70 p-2 ring-1 ring-slate-200"><summary className="cursor-pointer text-sm font-semibold text-slate-600">{t("Weeks done ({n})", { n: past.length })}</summary><ol className="mt-2 space-y-2">{past.map(week)}</ol></details>
      )}
    </section>
  );
}
