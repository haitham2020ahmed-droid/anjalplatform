"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import { fmtDay } from "./tokens";

/** 🖨 Print / Save as PDF (the browser's dialog). Hidden on paper. */
export function PrintButton({ label = "Print" }: { label?: string }) {
  const t = useT();
  return (
    <button type="button" onClick={() => window.print()} data-rk="print"
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white shadow-btn transition hover:bg-[#25467c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal print:hidden">
      <span aria-hidden="true">🖨</span>{t(label)}
    </button>
  );
}

export interface Download { href: string; label: string; icon?: string; download?: boolean }

/**
 * The top of every report: title, who it is about and when (shown on paper too), the filters (class, window…)
 * and the Print / Download buttons. `title`, `subtitle` strings, `who`/`when` labels and button labels are
 * translated when they are interface words; names and numbers stay as given.
 */
export function ReportHeader({ back, icon, title, subtitle, who, when, filters, downloads = [], print = true, children }: {
  back?: { href: string; label: string }; icon?: string; title: string; subtitle?: ReactNode;
  who?: ReactNode; when?: ReactNode; filters?: ReactNode; downloads?: Download[]; print?: boolean; children?: ReactNode;
}) {
  const t = useT();
  const today = fmtDay(new Date());
  return (
    <header className="rk-header mb-5" data-rk="header">
      {back && <Link href={back.href} className="inline-flex min-h-10 items-center gap-1 rounded-md text-sm font-medium text-slate-500 hover:text-brand-teal print:hidden"><span aria-hidden="true" className="inline-block rtl:rotate-180">‹</span> {t(back.label)}</Link>}
      <div className="mt-1.5 overflow-hidden rounded-3xl bg-white bg-gradient-to-br from-white via-white to-sky-50/70 shadow-card ring-1 ring-slate-200/80 print:rounded-none print:shadow-none print:ring-0">
        <div className="brand-stripe h-1.5" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0 flex-1 basis-72">
            <h1 className="flex items-center gap-3 text-2xl font-semibold leading-tight tracking-tight text-brand-navy sm:text-[28px]">
              {icon && <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-white to-sky-50 text-2xl shadow-card ring-1 ring-slate-200/70">{icon}</span>}
              <span className="min-w-0 break-words">{t(title)}</span>
            </h1>
            {subtitle && <div className="mt-2 max-w-3xl text-[15px] leading-relaxed text-slate-600">{typeof subtitle === "string" ? t(subtitle) : subtitle}</div>}
            {(who || when) && (
              <p className="mt-3 flex flex-wrap gap-2 text-sm">
                {who && <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700"><span aria-hidden="true">👥</span><bdi>{typeof who === "string" ? t(who) : who}</bdi></span>}
                {when && <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700"><span aria-hidden="true">🗓</span>{typeof when === "string" ? t(when) : when}</span>}
              </p>
            )}
          </div>
          {(print || downloads.length > 0 || children) && (
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {children}
              {downloads.map((d) => (
                <a key={d.href} href={d.href} {...(d.download === false ? {} : { download: true })}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">
                  <span aria-hidden="true">{d.icon ?? "⬇️"}</span>{t(d.label)}
                </a>
              ))}
              {print && <PrintButton />}
            </div>
          )}
        </div>
        {filters && <div className="rk-filters border-t border-slate-100 bg-slate-50/70 px-5 py-3 sm:px-6 print:hidden">{filters}</div>}
      </div>
      <p className="mt-2 hidden text-xs text-slate-500 print:block" suppressHydrationWarning>{t("Printed {date}", { date: today })} · Al-Anjal English</p>
    </header>
  );
}
