import Link from "next/link";
import type { MapCard } from "@/server/student/map-dashboard";
import { getT } from "@/i18n/server";

/**
 * 🗺️ The student's MAP dashboard: two cards (Reading, Language Usage). Each: the latest RIT (big), the goal areas
 * with simple bars, "Your goal: 215", "You need +6 points to reach your goal", "You're strong at…" and
 * "Let's practice…". Numbers and friendly words only — never a MAP level word about the student.
 * Data: studentMapCards(myMap) (src/server/student/map-dashboard.ts). No questions on this page.
 */
export async function MapDashboard({ cards }: { cards: MapCard[] }) {
  const { t } = await getT();
  return (
    <section aria-label={t("My MAP")} data-testid="map-dashboard" className="grid gap-4 md:grid-cols-2">
      {cards.map((c) => (
        <article key={c.subject} aria-labelledby={`map-${c.subject}`} className={`rounded-3xl p-5 ring-1 sm:p-6 ${c.subject === "READING" ? "bg-green-50 ring-green-200" : "bg-emerald-50/70 ring-emerald-200"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`map-${c.subject}`} className="flex items-center gap-2 text-xl font-semibold text-brand-navy"><span aria-hidden="true">{c.subject === "READING" ? "📖" : "✏️"}</span>{t(c.name)}</h2>
            {c.term && <span className="text-sm text-slate-500">{c.term}</span>}
          </div>
          {c.rit === null ? (
            <p className="mt-4 rounded-2xl bg-white p-4 text-slate-700">{t("Your MAP score shows here when your school adds it.")}</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
                <p><span className="block text-sm font-semibold text-slate-600">{t("My RIT")}</span><span className="text-6xl font-bold tabular-nums leading-none text-brand-navy">{c.rit}</span></p>
                {c.goal !== null && <p className="rounded-2xl bg-white px-4 py-2 ring-1 ring-amber-200"><span className="block text-sm font-semibold text-amber-900">🎯 {t("Your goal: {n}", { n: c.goal })}</span>
                  <span className="block font-semibold text-brand-navy">{c.reached ? t("You reached your goal!") + " 🎉" : t("You need +{n} points to reach your goal", { n: c.toGoal ?? 0 })}</span></p>}
              </div>
              {c.goal !== null && (
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.goalPct} aria-label={t("Your goal: {n}", { n: c.goal })}>
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-500" style={{ width: `${c.goalPct}%` }} />
                </div>
              )}
              {c.areas.some((a) => a.rit !== null) && (
                <ul className="mt-4 space-y-2" aria-label={t("My goal areas")}>
                  {c.areas.map((a) => (
                    <li key={a.name}>
                      <div className="flex justify-between gap-2 text-sm"><span className="font-medium text-slate-700"><span aria-hidden="true">{a.icon}</span> <bdi>{a.name}</bdi></span><span className="tabular-nums font-semibold text-brand-navy">{a.rit ?? "—"}</span></div>
                      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white" aria-hidden="true"><div className="h-full rounded-full bg-green-500" style={{ width: `${a.pct}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-sm font-semibold text-emerald-800">💪 {t("You're strong at…")}</p>
                  {c.strengths.length ? <ul className="mt-1 space-y-1 text-sm text-slate-700">{c.strengths.map((n) => <li key={n}><bdi>{n}</bdi></li>)}</ul> : <p className="mt-1 text-sm text-slate-500">{t("Keep practising to find out!")}</p>}
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-sm font-semibold text-amber-800">🌱 {t("Let's practice…")}</p>
                  {c.grow.length ? <ul className="mt-1 space-y-1 text-sm">{c.grow.map((n) => <li key={n.name}>{n.href ? <Link prefetch={false} href={n.href} className="inline-flex min-h-11 items-center font-medium text-brand-navy underline-offset-2 hover:underline"><bdi>{n.name}</bdi>&nbsp;▶</Link> : <bdi>{n.name}</bdi>}</li>)}</ul> : <p className="mt-1 text-sm text-slate-500">{t("Keep practising to find out!")}</p>}
                </div>
              </div>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
