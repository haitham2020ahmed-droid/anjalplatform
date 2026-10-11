"use client";
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";

/** A short heading ("Reading", "My Progress", "Programs") over a responsive grid of BigTiles. */
export function TileGroup({ title, icon, cols = 3, children, className = "", id }: { title: string; icon?: string; cols?: 2 | 3 | 4; children: ReactNode; className?: string; id?: string }) {
  const t = useT();
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} className={`mt-8 ${className}`}>
      <h2 id={id ? `${id}-h` : undefined} className="mb-3 flex items-center gap-2 text-xl font-semibold text-brand-navy">{icon && <span aria-hidden="true">{icon}</span>}{t(title)}</h2>
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${grid}`}>{children}</div>
    </section>
  );
}
