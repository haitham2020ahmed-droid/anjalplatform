"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useId, useState } from "react";
import { useT } from "@/i18n/client";
import { shortStandard } from "@/lib/report-columns";

/**
 * ⓘ — a small tooltip in plain words next to a heading ("Accuracy = % of answers that were right"): shown on hover,
 * on keyboard focus, and on a tap (phones). The text is an interface string (translated); hidden on paper.
 */
export function InfoTip({ text, className = "" }: { text: string; className?: string }) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const words = t(text);
  return (
    <span className={`group relative inline-flex align-middle print:hidden ${className}`} data-rk="info">
      <button type="button" aria-label={`${t("More information")}: ${words}`} aria-describedby={id} aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }} onBlur={() => setOpen(false)}
        className="inline-grid h-5 w-5 cursor-help place-items-center rounded-full text-[12px] font-bold leading-none text-slate-500 ring-1 ring-slate-300 hover:text-brand-teal hover:ring-brand-teal focus-visible:outline-2 focus-visible:outline-brand-teal">
        <span aria-hidden="true">i</span>
      </button>
      <span id={id} role="tooltip"
        className={`absolute start-1/2 top-full z-30 mt-1.5 w-60 max-w-[70vw] -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-start text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg rtl:translate-x-1/2 ${open ? "block" : "hidden group-hover:block group-focus-within:block"}`}>
        {words}
      </span>
    </span>
  );
}

/** A standard in a table cell: code + short name (≤ 4 words), the full text in the tooltip (content: never translated). */
export function StandardLabel({ code, text, className = "" }: { code: string; text?: string | null; className?: string }) {
  const s = shortStandard(code, text);
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={s.full || undefined} data-rk="standard">
      <span data-content lang="en"><b className="font-semibold">{code}</b>{s.short ? ` ${s.short}` : ""}</span>
      {s.full && s.full !== s.short && (
        <span className="group relative inline-flex print:hidden">
          <span tabIndex={0} aria-label={s.full} className="inline-grid h-5 w-5 cursor-help place-items-center rounded-full text-[12px] font-bold text-slate-500 ring-1 ring-slate-300">i</span>
          <span role="tooltip" data-content lang="en" className="absolute start-1/2 top-full z-30 mt-1.5 hidden w-64 max-w-[70vw] -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-start text-xs font-normal leading-snug text-white shadow-lg group-hover:block group-focus-within:block rtl:translate-x-1/2">{s.full}</span>
        </span>
      )}
    </span>
  );
}
