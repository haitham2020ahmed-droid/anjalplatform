import Link from "next/link";
import type { WeekStats } from "@/server/student/weekly";
import type { WeeklyCheckView } from "@/server/student/weekly-check";

export interface TodayPlan { planId: string; unit: string; set: string; label: string; href: string; done: number; total: number; correct: number; target: number; inProgress: boolean }

/** ⭐ Today: the next part of my curriculum plan, my weekly goal, and a part to review. */
export function TodayPlanCard({ step, week, review, check }: { step: TodayPlan | null; week: WeekStats; review: { assignmentId: string; name: string; days: number } | null; check?: WeeklyCheckView | null }) {
  if (!step && !review && !check) return null;
  const pct = step && step.total ? Math.round((100 * step.done) / step.total) : 0;
  return (
    <section aria-label="Today's plan" className="mb-5 grid gap-3 lg:grid-cols-3">
      {step && (
        <div className="rounded-3xl bg-gradient-to-br from-brand-navy to-indigo-800 p-5 text-white shadow-md lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-200">⭐ Today’s plan</p>
          <p className="mt-1 text-2xl font-extrabold">{step.label}</p>
          <p className="text-sm text-white/80">{step.unit} · {step.set}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-white/90">{step.inProgress ? `🎯 ${Math.min(step.correct, step.target)} / ${step.target} correct so far` : `🎯 ${step.target} correct answers finish it`}</span>
            <Link href={step.href} className="rounded-xl bg-amber-400 px-6 py-2.5 text-lg font-bold text-amber-950 shadow hover:bg-amber-300">{step.inProgress ? "Continue ▶" : "Start ▶"}</Link>
          </div>
          <Link href={`/student/plans/${step.planId}`} className="mt-3 block">
            <span className="flex justify-between text-xs text-white/80"><span>My curriculum plan</span><span className="tabular-nums">{step.done}/{step.total} parts · {pct}%</span></span>
            <span className="mt-1 block h-2 overflow-hidden rounded-full bg-white/20"><span className="block h-full rounded-full bg-teal-300" style={{ width: `${pct}%` }} /></span>
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-500">🗓️ My weekly goal</p>
          <p className="text-2xl font-extrabold text-brand-navy">{week.reached ? "🎉 Done!" : `${week.partsDone} / ${week.partsGoal} parts`}</p>
          <div className="mt-2 flex gap-1" aria-hidden="true">{Array.from({ length: week.partsGoal }, (_, i) => <span key={i} className={`h-2 flex-1 rounded-full ${i < week.partsDone ? "bg-emerald-500" : "bg-slate-200"}`} />)}</div>
          <p className="mt-1 text-xs text-slate-500">{week.answers} answers · {week.minutes} min · {week.days} day{week.days === 1 ? "" : "s"} this week</p>
        </div>
        {check && (
          check.status === "DONE" ? (
            <div className="rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <p className="text-sm font-semibold text-emerald-800">🗓️ Weekly Check · done</p>
              <p className="font-bold text-brand-navy">{check.correct} / {check.total} correct</p>
              {check.ritAfter !== null && <p className="text-xs text-slate-600">My RIT now: about <b>{check.ritAfter}</b>{check.ritBefore !== null && check.ritAfter !== check.ritBefore ? ` (${check.ritAfter > check.ritBefore ? "+" : ""}${check.ritAfter - check.ritBefore})` : ""}</p>}
            </div>
          ) : (
            <Link href={check.href} className="lift rounded-3xl bg-indigo-50 p-4 ring-1 ring-indigo-200">
              <p className="text-sm font-semibold text-indigo-800">🗓️ Weekly Check</p>
              <p className="font-bold text-brand-navy">{check.status === "STARTED" ? "Finish this week’s 5 questions ▶" : "5 questions · 3 minutes ▶"}</p>
              <p className="text-xs text-slate-600">It keeps your level and RIT up to date.</p>
            </Link>
          )
        )}
        {review && (
          <Link href={`/quiz/${review.assignmentId}`} className="lift rounded-3xl bg-violet-50 p-4 ring-1 ring-violet-200">
            <p className="text-sm font-semibold text-violet-800">🔁 Time to review</p>
            <p className="font-bold text-brand-navy">{review.name}</p>
            <p className="text-xs text-slate-600">Finished {review.days} days ago — a few questions keep it strong.</p>
          </Link>
        )}
      </div>
    </section>
  );
}
