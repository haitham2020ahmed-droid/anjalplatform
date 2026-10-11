"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";

/** A titled white card for one part of a report (kept on one printed page when it fits). */
export function ReportSection({ title, icon, hint, id, actions, tone = "white", className = "", children }: {
  title?: string; icon?: string; hint?: ReactNode; id?: string; actions?: ReactNode; tone?: "white" | "soft"; className?: string; children: ReactNode;
}) {
  const t = useT();
  return (
    <section id={id} aria-label={title ? t(title) : undefined} className={`rk-section mb-5 min-w-0 rounded-3xl p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6 ${tone === "soft" ? "bg-slate-50" : "bg-white"} ${className}`} data-rk="section">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-navy sm:text-xl">{icon && <span aria-hidden="true">{icon}</span>}{t(title)}</h2>}
            {hint && <div className="mt-0.5 text-sm text-slate-600">{typeof hint === "string" ? t(hint) : hint}</div>}
          </div>
          {actions && <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
