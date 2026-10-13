"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";

/**
 * One consistent page header: back link, icon + title, description, actions on the right.
 * The title and back label are translated in Arabic mode when they are interface words (src/i18n/en.ts);
 * anything else (a student's name, a lesson title) stays exactly as given.
 */
export function PageHeader({ back, icon, title, subtitle, children }: { back?: { href: string; label: string }; icon?: string; title: string; subtitle?: ReactNode; children?: ReactNode }) {
  const t = useT();
  return (
    <header className="mb-6">
      {back && <Link href={back.href} className="inline-flex min-h-10 items-center gap-1 rounded-md text-sm font-medium text-muted hover:text-teal-ink"><span aria-hidden="true" className="inline-block rtl:rotate-180">‹</span> {t(back.label)}</Link>}
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-[1.625rem] leading-tight text-ink sm:text-3xl">
            {icon && <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface text-xl shadow-card ring-1 ring-line">{icon}</span>}
            <span className="min-w-0 break-words">{t(title)}</span>
          </h1>
          {subtitle && <div className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-ink-2">{subtitle}</div>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}

/** A titled white card section. */
export function Section({ title, icon, hint, tone = "white", className = "", children }: { title?: string; icon?: string; hint?: ReactNode; tone?: "white" | "amber" | "sky" | "emerald"; className?: string; children: ReactNode }) {
  const t = useT();
  const bg = { white: "bg-surface", amber: "bg-gradient-to-br bg-linear-to-br from-amber-50 to-white", sky: "bg-gradient-to-br bg-linear-to-br from-sky-50 to-white", emerald: "bg-gradient-to-br bg-linear-to-br from-emerald-50 to-white" }[tone];
  return (
    <section className={`rounded-[1.25rem] p-5 shadow-card ring-1 ring-line sm:p-6 ${bg} ${className}`}>
      {title && <h2 className="flex items-center gap-2 text-xl text-ink">{icon && <span aria-hidden="true">{icon}</span>}{t(title)}</h2>}
      {hint && <div className="mt-1 text-sm text-ink-2">{hint}</div>}
      <div className={title || hint ? "mt-4" : ""}>{children}</div>
    </section>
  );
}
