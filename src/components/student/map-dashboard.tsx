import Link from "next/link";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { myMap } from "@/server/map/map-more";
import { MAP_SUBJECT_NAME as SUBJECT, mapDashboardData, type MapDashboardData } from "@/server/student/student-home";
import { getT } from "@/i18n/server";
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState } from "@/components/ui-kit";

/**
 * 🗺️ My MAP dashboard at the top of My Plans (MAP results live here — no separate MAP icon for students):
 * RIT, level, strengths and skills needing work for Reading and Language Usage, with links to the full
 * My MAP Results page (/student/map) and the MAP practice test.
 */
export async function MapDashboard({ actor }: { actor: Actor }) {
  const { t } = await getT();
  let d: MapDashboardData = { subjects: [] };
  try { d = mapDashboardData(await myMap(repo, actor)); } catch { d = { subjects: [] }; }
  return (
    <section aria-labelledby="map-dash-h" data-testid="map-dashboard" className="mb-6 rounded-3xl bg-white p-5 ring-1 ring-green-200 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="map-dash-h" className="flex items-center gap-2 text-xl font-semibold text-brand-navy"><span aria-hidden="true">🗺️</span>{t("My MAP Results")}</h2>
        <div className="flex flex-wrap gap-2">
          <Link prefetch={false} href="/student/map" className={BTN_PRIMARY}>{t("See all my MAP results")}</Link>
          <Link prefetch={false} href="/student/map-test" className={BTN_SECONDARY}>{t("MAP Practice Test")}</Link>
        </div>
      </div>
      {!d.subjects.length ? (
        <div className="mt-4"><EmptyState compact icon="🗺️" title="No MAP results yet" text="They appear here when your school adds them." /></div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {d.subjects.map((x) => (
            <div key={x.subject} className="rounded-2xl bg-green-50/60 p-4 ring-1 ring-green-100">
              <p className="font-semibold text-brand-navy">{t(SUBJECT[x.subject] ?? x.subject)}{x.term ? <span className="text-sm font-normal text-slate-500"> · {x.term}</span> : null}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white p-2 ring-1 ring-green-100"><dt className="text-xs font-semibold text-slate-500">RIT</dt><dd className="text-2xl font-semibold tabular-nums text-brand-navy">{x.rit}</dd></div>
                <div className="rounded-xl bg-white p-2 ring-1 ring-green-100"><dt className="text-xs font-semibold text-slate-500">{t("Level")}</dt><dd className="text-sm font-semibold text-brand-navy">{x.level ? t(x.level) : "—"}{x.percentile !== null ? <span className="block text-xs font-normal text-slate-500">{t("Percentile {n}", { n: x.percentile })}</span> : null}</dd></div>
                <div className="rounded-xl bg-white p-2 ring-1 ring-green-100"><dt className="text-xs font-semibold text-slate-500">{t("Spring goal")}</dt><dd className="text-2xl font-semibold tabular-nums text-brand-navy">{x.goal ?? "—"}</dd></div>
              </dl>
              {x.lexile ? <p className="mt-2 text-sm text-slate-600"><span dir="ltr">MAP Lexile {x.lexile}L</span></p> : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">💪 {t("My strengths")}</p>
                  {x.strengths.length ? <ul className="mt-1 space-y-1 text-sm text-slate-700">{x.strengths.map((n) => <li key={n}><bdi>{n}</bdi></li>)}</ul> : <p className="mt-1 text-sm text-slate-500">—</p>}
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">🎯 {t("Skills to work on")}</p>
                  {x.needsWork.length ? <ul className="mt-1 space-y-1 text-sm">{x.needsWork.map((n) => <li key={n.name}>{n.href ? <Link prefetch={false} href={n.href} className="font-medium text-brand-navy underline-offset-2 hover:underline"><bdi>{n.name}</bdi> ▶</Link> : <bdi>{n.name}</bdi>}</li>)}</ul> : <p className="mt-1 text-sm text-slate-500">—</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
