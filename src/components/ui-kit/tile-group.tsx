"use client";
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import type { TileTone } from "./big-tile";

/**
 * A short heading ("Reading", "My Progress", "Programs") over a responsive grid of BigTiles.
 * `tone` puts a small coloured dot before the heading instead of an icon (calm pages: one colour per section).
 */
export function TileGroup({ title, icon, tone, cols = 3, children, className = "", id }: { title: string; icon?: string; tone?: TileTone; cols?: 2 | 3 | 4; children: ReactNode; className?: string; id?: string }) {
  const t = useT();
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} className={`mt-8 ${className}`}>
      <h2 id={id ? `${id}-h` : undefined} className="mb-4 flex items-center gap-2.5 text-xl font-semibold tracking-tight text-brand-navy">{tone ? <span aria-hidden="true" className={`heading-dot tone-${tone}`} /> : icon && <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-white text-lg shadow-card ring-1 ring-slate-100">{icon}</span>}{t(title)}</h2>
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${grid}`}>{children}</div>
    </section>
  );
}
