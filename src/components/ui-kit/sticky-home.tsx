"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";

/**
 * The fixed "Home" button. In the top bar it is always visible (the bar is sticky); `floating` pins it to the
 * bottom corner for full-screen pages without the top bar.
 */
export function StickyHome({ href, floating = false }: { href: string; floating?: boolean }) {
  const t = useT();
  return (
    <Link href={href} prefetch={false} data-tour="home" aria-label={t("Home")}
      className={floating
        ? "fixed bottom-4 start-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-navy px-5 font-semibold text-white shadow-lg print:hidden"
        : "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand-navy px-3 font-semibold text-white hover:bg-brand-purple sm:px-4"}>
      <span aria-hidden="true">🏠</span><span className={floating ? "" : "hidden sm:inline"}>{t("Home")}</span>
    </Link>
  );
}
