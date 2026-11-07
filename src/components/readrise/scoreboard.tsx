import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Scoreboard, TopStudent } from "@/server/readrise/points";
import { ACHIEVEMENTS } from "@/server/readrise/points";

/**
 * 🏆 The ReadRise scoreboard panel (server component, round 6): my points today and this school year, the annual goal
 * (activities at 75%+), my achievements (x of 28, the newest ones) and the school's boards — the highest scoring
 * classes this week and the daily / weekly top scorers (initials and grade only: students are never named).
 * A new achievement shows a small banner, unless the class turned celebrations off (points still count).
 */
const plain: TFn = ((text: string, vars?: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`))) as TFn;
const nameOf = (code: string, fallback: string) => ACHIEVEMENTS.find((a) => a.code === code)?.name ?? fallback;

function Stat({ label, value, testId }: { label: string; value: string | number; testId: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
      <dt className="text-xs font-semibold text-slate-600">{label}</dt>
      <dd data-testid={testId} className="text-2xl font-bold tabular-nums text-brand-navy">{value}</dd>
    </div>
  );
}

function Who({ who, t }: { who: TopStudent | null; t: TFn }) {
  if (!who) return <span className="text-slate-500">{t("No points yet")}</span>;
  return <span className="font-semibold text-slate-800">{who.initials}{who.grade !== null ? ` · ${t("Grade {n}", { n: who.grade })}` : ""} · {t("{n} points", { n: who.points })}</span>;
}

export function ReadRiseScoreboard({ board, t = plain }: { board: Scoreboard; t?: TFn }) {
  const g = board.goal, a = board.achievements, sc = board.school;
  const pct = Math.min(100, Math.round((100 * g.done) / Math.max(1, g.target)));
  return (
    <section aria-labelledby="rr-score-h" data-testid="rr-scoreboard" className="mt-6 rounded-3xl bg-gradient-to-br from-amber-50 to-white p-5 ring-1 ring-amber-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rr-score-h" className="text-xl font-bold text-brand-navy">🏆 {t("My scoreboard")}</h2>
        <Link href="/student/readrise/scoreboard" data-testid="rr-score-rules" className="text-sm font-semibold text-brand-teal underline">{t("How do I earn points?")}</Link>
      </div>

      {a.fresh.length > 0 && (
        <p data-testid="rr-new-achievement" role="status" className="mt-3 rounded-xl bg-emerald-100 px-4 py-2 font-semibold text-emerald-900">
          {t("New achievement: {name}", { name: a.fresh.map((x) => t(nameOf(x.code, x.name))).join(", ") })}
        </p>
      )}

      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">{t("Points")}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            <Stat label={t("Today")} value={board.today} testId="rr-points-today" />
            <Stat label={t("School year")} value={board.year} testId="rr-points-year" />
          </dl>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">{t("Annual goal")}</h3>
          <p className="mt-2 text-slate-800" data-testid="rr-annual-goal">{t("{n} of {m} activities at {p}% or more", { n: g.done, m: g.target, p: g.avgTarget })}</p>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={g.done} aria-label={t("Annual goal")}>
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-sm text-slate-600">{g.avg === null ? t("No activities this year yet.") : t("My average this year: {n}%", { n: g.avg })}</p>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">{t("Achievements")}</h3>
          <p className="mt-2 text-2xl font-bold text-brand-navy" data-testid="rr-achievements">{t("{n} of {m}", { n: a.earned, m: a.total })}</p>
          {a.recent.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
              {a.recent.map((x) => <li key={x.code}>{t(nameOf(x.code, x.name))} <span className="text-slate-500">(+{x.points})</span></li>)}
            </ul>
          ) : <p className="mt-1 text-sm text-slate-600">{t("Finish an article to earn your first achievement.")}</p>}
        </div>
      </div>

      {sc && (
        <div className="mt-5 grid gap-4 border-t border-amber-200 pt-4 md:grid-cols-2" data-testid="rr-school-board">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">{t("Highest scoring classes this week")}</h3>
            {sc.classesWeek.length ? (
              <ol className="mt-2 space-y-1">
                {sc.classesWeek.map((c, i) => (
                  <li key={c.classId} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200">
                    <span><b className="text-brand-navy">{i + 1}.</b> {c.name}{c.teacher ? <span className="text-slate-500"> · {c.teacher}</span> : null}</span>
                    <span className="font-semibold tabular-nums">{t("{n} points", { n: c.points })}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-2 text-sm text-slate-600">{t("No points yet")}</p>}
          </div>
          <dl className="space-y-2">
            <div><dt className="text-sm font-bold uppercase tracking-wide text-slate-600">{t("School top scorer today")}</dt><dd data-testid="rr-daily-top"><Who who={sc.dailyTop} t={t} /></dd></div>
            <div><dt className="text-sm font-bold uppercase tracking-wide text-slate-600">{t("School top scorer this week")}</dt><dd data-testid="rr-weekly-top"><Who who={sc.weeklyTop} t={t} /></dd></div>
          </dl>
        </div>
      )}
    </section>
  );
}
