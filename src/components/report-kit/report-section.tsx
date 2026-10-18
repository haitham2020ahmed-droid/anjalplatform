"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import { tipOf } from "@/lib/report-columns";
import { InfoTip } from "./info-tip";

/**
 * A titled white card for one part of a report (kept on one printed page when it fits). `info` = the ⓘ tooltip of
 * the heading in plain words (the glossary's words for a usual title when absent).
 */
export function ReportSection({ title, icon, hint, info, id, actions, tone = "white", className = "", children }: {
  title?: string; icon?: string; hint?: ReactNode; info?: string; id?: string; actions?: ReactNode; tone?: "white" | "soft"; className?: string; children: ReactNode;
}) {
  const t = useT();
  const tip = title ? tipOf(title, info) : info ?? null;
  return (
    <section id={id} aria-label={title ? t(title) : undefined} className={`rk-section mb-5 min-w-0 rounded-3xl p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6 ${tone === "soft" ? "bg-slate-50" : "bg-white"} ${className}`} data-rk="section">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-navy sm:text-xl">{icon && <span aria-hidden="true">{icon}</span>}{t(title)}{tip && <InfoTip text={tip} />}</h2>}
            {hint && <div className="mt-0.5 text-sm text-slate-600">{typeof hint === "string" ? t(hint) : hint}</div>}
          </div>
          {actions && <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
