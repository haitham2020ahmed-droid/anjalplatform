import Link from "next/link";
import type { ReactNode } from "react";

/** One consistent page header: back link, icon + title, description, actions on the right. */
export function PageHeader({ back, icon, title, subtitle, children }: { back?: { href: string; label: string }; icon?: string; title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6">
      {back && <Link href={back.href} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-teal hover:underline">← {back.label}</Link>}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-brand-navy">
            {icon && <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-slate-200">{icon}</span>}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && <div className="mt-2 max-w-3xl text-slate-600">{subtitle}</div>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}

/** A titled white card section. */
export function Section({ title, icon, hint, tone = "white", className = "", children }: { title?: string; icon?: string; hint?: ReactNode; tone?: "white" | "amber" | "sky" | "emerald"; className?: string; children: ReactNode }) {
  const bg = { white: "bg-white", amber: "bg-gradient-to-br bg-linear-to-br from-amber-50 to-white", sky: "bg-gradient-to-br bg-linear-to-br from-sky-50 to-white", emerald: "bg-gradient-to-br bg-linear-to-br from-emerald-50 to-white" }[tone];
  return (
    <section className={`rounded-3xl p-5 shadow-sm ring-1 ring-slate-200 sm:p-6 ${bg} ${className}`}>
      {title && <h2 className="flex items-center gap-2 text-xl font-bold text-brand-navy">{icon && <span aria-hidden="true">{icon}</span>}{title}</h2>}
      {hint && <div className="mt-1 text-sm text-slate-600">{hint}</div>}
      <div className={title || hint ? "mt-4" : ""}>{children}</div>
    </section>
  );
}
