import type { Locale } from "@/i18n/school-reports";
import { t } from "@/i18n/school-reports";
import type { AreaQuintileRow } from "@/server/map/nwea-reports";
import { medianQuintile } from "@/server/map/nwea-reports";
import { Q_COLORS } from "./nwea-charts";

const BAND_KEY = ["personalizedPlan.areaPercentiles.band.low", "personalizedPlan.areaPercentiles.band.loavg", "personalizedPlan.areaPercentiles.band.avg", "personalizedPlan.areaPercentiles.band.hiavg", "personalizedPlan.areaPercentiles.band.high"] as const;

/**
 * 📊 "Instructional Area Achievement Percentiles": one row per MAP instructional area — a colored badge for the
 * band most students' own achievement descriptor falls in (the true ordinal median of NWEA's five national-
 * percentile bands, never an invented exact number: the comprehensive MAP data file gives each goal row a band,
 * Low/LoAvg/Avg/HiAvg/High, not a raw percentile), and the full distribution across those five bands — the same
 * chart the school's own NWEA portal shows, for either a whole class (`ClassProfile.areas`) or one student
 * (`studentAreaQuintiles`, one student one-hot in their own band).
 *
 * A basic RIT-only import (template, NWEA's simple export, or a roster entry typed as a number) carries no NWEA
 * band either — so that row is shown from a ≈ estimate instead (the area RIT against the grade/season national
 * norm, same approximation the rest of the platform already uses when NWEA's own percentile wasn't imported),
 * marked with the same ≈ the rest of the platform uses for an estimate. Only an area with zero students tested
 * for it at all (no RIT, nothing to estimate from) is left out, and the whole section is skipped once that
 * leaves nothing to show.
 */
export function InstructionalAreaPercentiles({ rows, L }: { rows: AreaQuintileRow[]; L: Locale }) {
  const withData = rows.filter((r) => r.quintiles.some((c) => c > 0));
  if (!withData.length) return null;
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
      <h2 className="text-lg font-extrabold text-brand-navy">📊 {t(L, "personalizedPlan.areaPercentiles.title")}</h2>
      <div className="mt-4 space-y-4">
        {withData.map((a) => {
          const total = a.quintiles.reduce((x, y) => x + y, 0);
          const med = medianQuintile(a.quintiles);
          return (
            <div key={a.name} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="shrink-0 text-sm font-semibold text-slate-700 sm:w-48">{a.name}{a.estimated && <span title={t(L, "personalizedPlan.areaPercentiles.estimated")} className="ms-1 text-slate-400">≈</span>}</p>
              {med !== null && (
                <span className="inline-block w-fit shrink-0 rounded-full px-3 py-1 text-center text-xs font-extrabold sm:w-20" style={{ background: `${Q_COLORS[med]}26`, color: Q_COLORS[med] }}>
                  {t(L, BAND_KEY[med])}
                </span>
              )}
              <div className="flex h-7 flex-1 overflow-hidden rounded-lg ring-1 ring-slate-200" role="img" aria-label={`${a.name}: ${a.quintiles.join(", ")}`}>
                {a.quintiles.map((c, i) => c > 0 && (
                  <div key={i} className="flex items-center justify-center text-[11px] font-bold text-white" style={{ width: `${(100 * c) / total}%`, background: Q_COLORS[i] }}>
                    {Math.round((100 * c) / total)}%
                  </div>
                ))}
              </div>
              <p className="shrink-0 text-end text-sm tabular-nums text-slate-500 sm:w-8">{total}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="font-semibold">{t(L, "personalizedPlan.areaPercentiles.key")}:</span>
        {BAND_KEY.map((k, i) => <span key={k} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: Q_COLORS[i] }} />{t(L, k)}</span>)}
      </div>
      {withData.some((a) => a.estimated) && <p className="mt-2 text-xs text-slate-400">{t(L, "personalizedPlan.areaPercentiles.estimated")}</p>}
    </section>
  );
}
