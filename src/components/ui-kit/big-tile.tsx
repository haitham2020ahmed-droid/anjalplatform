"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";

/**
 * A big icon card (home pages): large emoji/icon, short label, optional one-line hint and a badge with the
 * number of unfinished items (red when `alert`). `tour` sets data-tour so the first-login tour can point at it.
 * `size="hero"` is the wide My Work card.
 */
export function BigTile({ href, icon, label, hint, badge, alert = false, tour, tag, size = "md", onClick, className = "" }: {
  href: string; icon: ReactNode; label: string; hint?: string; badge?: number | null; alert?: boolean; tour?: string; tag?: ReactNode;
  size?: "md" | "hero"; onClick?: () => void; className?: string;
}) {
  const t = useT();
  const n = Number(badge ?? 0);
  const hero = size === "hero";
  return (
    <Link href={href} prefetch={false} onClick={onClick} data-tour={tour}
      className={`lift group relative flex min-h-28 items-center gap-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200 transition hover:ring-brand-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal ${hero ? "sm:min-h-36 sm:p-7" : "flex-col justify-center text-center sm:min-h-36"} ${className}`}>
      <span aria-hidden="true" className={`relative grid shrink-0 place-items-center rounded-2xl bg-slate-50 ring-1 ring-slate-100 ${hero ? "h-20 w-20 text-5xl" : "h-16 w-16 text-4xl"}`}>
        {icon}
        {n > 0 && <span dir="ltr" className={`absolute -end-2 -top-2 min-w-7 rounded-full px-1.5 text-center text-sm font-bold leading-7 text-white ring-2 ring-white ${alert ? "bg-red-600" : "bg-sky-600"}`}>{n > 99 ? "99+" : n}</span>}
      </span>
      <span className={`min-w-0 ${hero ? "flex-1" : ""}`}>
        <span className={`block font-semibold text-brand-navy ${hero ? "text-2xl" : "text-lg"}`}>{t(label)}</span>
        {hint && <span className="mt-0.5 block text-sm text-slate-600">{t(hint)}</span>}
        {tag && <span className="mt-1.5 inline-flex flex-wrap justify-center gap-1">{tag}</span>}
      </span>
      {n > 0 && <span className="sr-only">{t("{n} to do", { n })}</span>}
    </Link>
  );
}
