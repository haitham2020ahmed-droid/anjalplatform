"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";
import type { FocusArea, RemedialPlan } from "@/server/fluency/remedial";

/** the same words as remedial.ts FOCUS_KID (kept here so no server code reaches the page's bundle) */
const FOCUS_KID: Record<FocusArea, string> = { ACCURACY: "Reading every word right", RATE: "Reading smoothly and a little faster", PROSODY: "Reading with expression", ENRICH: "Reading new, harder texts" };

/**
 * 🧭 The student's own reading plan in friendly words: the goal and the date, where they are now, the daily routine
 * with minutes, the weekly check, and how they will know they did it. Never Below/On/Above or tier wording.
 */
export function MyPlanCard({ plan }: { plan: RemedialPlan }) {
  const t = useT();
  const now = plan.status.latest ?? plan.baseline.wcpm;
  const span = Math.max(1, plan.goals.wcpm - plan.baseline.wcpm);
  const pct = Math.max(0, Math.min(100, Math.round(((now - plan.baseline.wcpm) / span) * 100)));
  const linePct = Math.max(0, Math.min(100, Math.round(((plan.status.expected - plan.baseline.wcpm) / span) * 100)));
  const week = Math.min(plan.weeks, plan.status.week);
  return (
    <section className="rounded-3xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-emerald-950">🧭 {t("My reading plan")} <span className="text-sm font-semibold text-emerald-800">· {t(FOCUS_KID[plan.focus])}</span></h2>
        <span className="rounded-full bg-white px-3 py-0.5 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200">{t("Week {n} of {m}", { n: week, m: plan.weeks })}</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-emerald-900">{plan.status.kid}</p>

      <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-emerald-100">
        <p className="text-sm text-slate-700">🎯 {t("My goal")}: <b className="text-slate-900">{plan.success[0]?.kid}</b></p>
        <div className="relative mt-3 h-3 rounded-full bg-emerald-100" role="img" aria-label={`${now} → ${plan.goals.wcpm}`}>
          <div className="h-3 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          <span className="absolute -top-1 h-5 w-0.5 bg-amber-500" style={{ left: `${linePct}%` }} title={String(plan.status.expected)} />
        </div>
        <p className="mt-1 flex justify-between text-xs text-slate-500"><span>{t("Start")}: {plan.baseline.wcpm}</span><span>{t("Now")}: <b className="text-slate-800">{now}</b></span><span>{t("Goal")}: {plan.goals.wcpm}</span></p>
      </div>

      <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-emerald-900">{t("Every day · {n} minutes", { n: plan.minutesPerDay })}</h3>
      <ol className="mt-2 space-y-2">
        {plan.daily.map((st, i) => (
          <li key={i} className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-emerald-100">
            <span className="mt-0.5 shrink-0 rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-900">{st.minutes} {t("min")}</span>
            <span className="flex-1 text-sm text-slate-800"><b>{t(st.kidTitle)}</b> — {st.kid}</span>
            {st.href && <Link href={st.href} className="shrink-0 rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700">{t("Go")}</Link>}
          </li>
        ))}
        <li className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <span className="mt-0.5 shrink-0 rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">{t("Weekly")}</span>
          <span className="flex-1 text-sm text-slate-800"><b>{t(plan.weekly.kidTitle)}</b> — {plan.weekly.kid}</span>
          {plan.weekly.href && <Link href={plan.weekly.href} className="shrink-0 rounded-xl bg-amber-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-amber-600">{t("Go")}</Link>}
        </li>
      </ol>

      <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-emerald-900">{t("I'll know I did it when…")}</h3>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-emerald-950">{plan.success.map((x, i) => <li key={i}>{x.kid}</li>)}</ul>
    </section>
  );
}
