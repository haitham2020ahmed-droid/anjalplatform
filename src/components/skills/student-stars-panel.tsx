/**
 * ⭐ The student's stars strip (My Work, My MAP plan): "8 skills mastered", the one-line legend in student words, a
 * light celebration of a new star (once, with the coins it earned), this week's goal ("master 2 skills") and the
 * self-check after a finished skill (😊 😐 😟). Plain words, no level words, no "failed".
 */
import type { StudentStars } from "@/server/skills/student-stars";
import { setMySkillGoalAction, selfCheckAction } from "@/app/student/star-actions";
import { StarGlyph, StarLegend } from "./skill-star";
import { SELF_CHECKS, SELF_ICON } from "@/server/skills/status-extras";

type T = (text: string, vars?: Record<string, string | number>) => string;

export function StudentStarsPanel({ s, t, back, count }: { s: StudentStars; t: T; back: string; /** a plan's own skills (each once): "8 of 20 skills mastered" */ count?: { mastered: number; total: number } }) {
  return (
    <section data-testid="student-stars" aria-label={t("My skill stars")} className="mb-4 space-y-2">
      {s.celebrate.length > 0 && (
        <p role="status" data-testid="star-celebration" className="animate-pop rounded-2xl bg-amber-50 px-4 py-3 text-amber-950 ring-1 ring-amber-200">
          🎉 <b>{t("New star!")}</b> {t("You mastered {skill}.", { skill: s.celebrate.join(", ") })} <span className="text-sm">🪙 {t("You earned coins.")}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-2 ring-1 ring-slate-200">
        <span className="inline-flex items-center gap-1.5 font-semibold text-brand-navy"><StarGlyph status="MASTERED" size={18} />{count ? t("{n} of {total} skills mastered", { n: count.mastered, total: count.total }) : t("{n} skills mastered", { n: s.mastered })}</span>
        {s.goal ? (
          <span data-testid="skill-goal" className="text-sm text-slate-700">🎯 {t("This week's goal: master {n} skills", { n: s.goal.target })} · <b dir="ltr">{s.goal.mastered}/{s.goal.target}</b>{s.goal.done && <> · {t("Goal reached! 🎉")}</>}</span>
        ) : (
          <form action={setMySkillGoalAction} className="flex items-center gap-1.5 text-sm text-slate-700" data-testid="skill-goal-form">
            <input type="hidden" name="back" value={back} />
            <label className="inline-flex items-center gap-1">🎯 {t("My goal this week: master")}
              <select name="target" defaultValue="2" className="h-8 rounded-lg border border-slate-300 px-1">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>{t("skills")}</label>
            <button className="rounded-lg bg-brand-navy px-2.5 py-1 text-xs font-semibold text-white">{t("Set")}</button>
          </form>
        )}
      </div>
      {s.selfCheck && (
        <form action={selfCheckAction} data-testid="self-check" className="flex flex-wrap items-center gap-2 rounded-2xl bg-sky-50 px-4 py-2 text-sm text-sky-950 ring-1 ring-sky-200">
          <input type="hidden" name="key" value={s.selfCheck.key} /><input type="hidden" name="back" value={back} />
          <span>{t("You finished {skill}. Do you feel you understood it?", { skill: s.selfCheck.skill })}</span>
          {SELF_CHECKS.map((v) => <button key={v} name="value" value={v} aria-label={t(v === "HAPPY" ? "Yes, I understood it" : v === "OK" ? "A little" : "Not really")} className="rounded-full bg-white px-2 py-0.5 text-xl ring-1 ring-sky-200 hover:ring-brand-teal">{SELF_ICON[v]}</button>)}
        </form>
      )}
      <StarLegend who="student" t={t} />
    </section>
  );
}
