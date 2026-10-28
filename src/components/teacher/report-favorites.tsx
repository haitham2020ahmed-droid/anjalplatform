"use client";
/** ⭐ A small panel to pin/unpin reports to the top of the Reports hub (Oct 2026, daily-reports consolidation). */
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useT } from "@/i18n/client";
import { toggleFavoriteReportAction } from "@/app/teacher/actions";
import { LineIcon } from "@/components/ui/line-icon";
import { REPORT_KEYS, REPORT_KEY_HREF, REPORT_KEY_LABEL, type ReportKey } from "@/lib/report-keys";

/** One row of the "Pin reports" panel: open it, and a star to toggle it. */
function FavoriteRow({ reportKey, favorited }: { reportKey: ReportKey; favorited: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
      <a href={REPORT_KEY_HREF[reportKey]} className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 hover:text-brand-navy">{t(REPORT_KEY_LABEL[reportKey])}</a>
      <button type="button" disabled={pending} aria-pressed={favorited}
        aria-label={favorited ? t("Unpin this report") : t("Pin this report to the top")}
        title={favorited ? t("Unpin this report") : t("Pin this report to the top")}
        onClick={() => start(async () => { await toggleFavoriteReportAction(reportKey); router.refresh(); })}
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ring-1 transition ${favorited ? "bg-amber-50 text-amber-600 ring-amber-200" : "bg-slate-50 text-slate-400 ring-slate-200 hover:text-amber-500"}`}>
        <span aria-hidden="true">{favorited ? "★" : "☆"}</span>
      </button>
    </li>
  );
}

/** The "Pinned" strip (favourited reports as cards) plus a small panel to pin/unpin any of the 6 reports. Only
 * shown for a teacher, and only once favourites exist does the pinned strip itself render. */
export function PinnedReports({ favorites }: { favorites: ReportKey[] }) {
  const t = useT();
  const favSet = new Set(favorites);
  const rest = REPORT_KEYS.filter((k) => !favSet.has(k));
  return (
    <section aria-label={t("Pinned")} className="mb-6">
      {favorites.length > 0 && (
        <>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold tracking-tight text-brand-navy">
            <span aria-hidden="true" className="text-amber-500">★</span>{t("Pinned")}
          </h2>
          <ul className="mb-3 grid gap-3 sm:grid-cols-3">
            {favorites.map((k) => (
              <li key={k}>
                <a href={REPORT_KEY_HREF[k]} className="flex h-full items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-amber-200 transition hover:-translate-y-px hover:shadow-card">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-200"><LineIcon name="alert" /></span>
                  <span className="min-w-0 font-semibold text-slate-800">{t(REPORT_KEY_LABEL[k])}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <details className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
        <summary className="cursor-pointer select-none py-1 text-sm font-semibold text-slate-600">{t("Pin reports to the top")}</summary>
        <ul className="mt-1">
          {[...favorites, ...rest].map((k) => <FavoriteRow key={k} reportKey={k} favorited={favSet.has(k)} />)}
        </ul>
      </details>
    </section>
  );
}
