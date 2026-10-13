/** @jsxRuntime automatic */
/** @jsxImportSource react */
import Link from "next/link";
import type { TFn } from "@/i18n";
import { LineIcon } from "@/components/ui/line-icon";

import { STUDENT_HOME_TILES } from "./home-tiles-data";

export { STUDENT_HOME_TILES, withoutTilePages, type HomeTile } from "./home-tiles-data";

/** the 8-point star behind each tile's icon (Literise D1 badge) */
const STAR = "M26 1 L33 12 L46 9 L42 21 L51 26 L42 31 L46 43 L33 40 L26 51 L19 40 L6 43 L10 31 L1 26 L10 21 L6 9 L19 12 Z";

/** The student home's grid of main tiles: 4 per row on a computer, 2 on a phone; a calm line icon on a coloured
 *  8-point-star badge, the name and one short line; a small number = things to do. */
export function HomeTiles({ t, badges = {} }: { t: TFn; badges?: Partial<Record<string, number>> }) {
  return (
    <nav aria-label={t("Main pages")} data-testid="home-tiles">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STUDENT_HOME_TILES.map((x) => {
          const n = Number(badges[x.key] ?? 0);
          return (
            <li key={x.key}>
              <Link prefetch={false} href={x.href} data-tile={x.key}
                className="group flex h-full min-h-[5.25rem] items-center gap-3 rounded-[1.25rem] bg-surface p-3.5 ring-1 ring-line transition hover:-translate-y-px hover:shadow-card hover:ring-brand-teal/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal motion-reduce:hover:translate-y-0 sm:p-4">
                <span aria-hidden="true" className="relative grid h-12 w-12 shrink-0 place-items-center">
                  <svg viewBox="0 0 52 52" className="absolute inset-0 h-full w-full"><path d={STAR} fill={x.star.bg} /></svg>
                  <span className="relative" style={{ color: x.star.fg }}><LineIcon name={x.line} className="h-5 w-5" strokeWidth={1.9} /></span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="block font-semibold leading-snug text-ink">{t(x.label)}</span>
                    {n > 0 && <span dir="ltr" className="rounded-full bg-brand-navy px-1.5 text-[11px] font-bold leading-5 tabular-nums text-white">{n > 99 ? "99+" : n}<span className="sr-only"> {t("{n} to do", { n })}</span></span>}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t(x.hint)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
