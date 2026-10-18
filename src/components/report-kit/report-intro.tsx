"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useT } from "@/i18n/client";

/** "What this shows": one short plain sentence at the top of a report (an interface string, translated). */
export function ReportIntro({ text, vars, className = "" }: { text: string; vars?: Record<string, string | number>; className?: string }) {
  const t = useT();
  return (
    <p className={`mb-4 flex items-start gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-[15px] leading-relaxed text-sky-950 ring-1 ring-sky-200 ${className}`} data-rk="intro">
      <span aria-hidden="true">💡</span>
      <span><b className="font-semibold">{t("What this shows")}:</b> {t(text, vars)}</span>
    </p>
  );
}
