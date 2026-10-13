import Link from "next/link";
import type { TFn } from "@/i18n";
import { LineIcon } from "@/components/ui/line-icon";

import { STUDENT_HOME_TILES } from "./home-tiles-data";

export { STUDENT_HOME_TILES, withoutTilePages, type HomeTile } from "./home-tiles-data";

/** The student home's grid of main tiles (calm line icons; a small number = things to do). */
export function HomeTiles({ t, badges = {} }: { t: TFn; badges?: Partial<Record<string, number>> }) {
  return (
    <nav aria-label={t("Main pages")} data-testid="home-tiles">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STUDENT_HOME_TILES.map((x) => {
          const n = Number(badges[x.key] ?? 0);
          return (
            <li key={x.key}>
              <Link prefetch={false} href={x.href} data-tile={x.key}
                className="group flex h-full min-h-28 flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/80 transition hover:ring-brand-teal/60 hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal sm:p-5">
                <span className="flex items-start justify-between gap-2">
                  <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-brand-navy ring-1 ring-slate-200/80 transition group-hover:bg-brand-teal/10 group-hover:text-brand-teal">
                    <LineIcon name={x.line} className="h-5 w-5" />
                  </span>
                  {n > 0 && <span dir="ltr" className="rounded-full bg-brand-navy px-2 py-0.5 text-xs font-semibold tabular-nums text-white">{n > 99 ? "99+" : n}<span className="sr-only"> {t("{n} to do", { n })}</span></span>}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold leading-snug text-brand-navy">{t(x.label)}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">{t(x.hint)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
