/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
import { useState } from "react";
import { useLang, useT } from "@/i18n/client";
import { LANG_NAMES, type Lang } from "@/i18n";

/**
 * "English | Arabic" — the parents' switch in the top bar. Changes menus, buttons, headings and labels only;
 * lessons, passages and questions stay English. Remembered per user (and on this device).
 */
export function LangSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const pick = async (l: Lang) => {
    if (l === lang || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/ui-lang", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: l }) });
      // <html lang dir> come from the server: reload the same page in the new language
      if (r.ok) { window.location.reload(); return; }
    } catch { /* offline: nothing changes */ }
    setBusy(false);
  };
  const btn = (l: Lang) => (
    <button type="button" lang={l} dir={l === "ar" ? "rtl" : "ltr"} onClick={() => void pick(l)} aria-pressed={lang === l} disabled={busy}
      className={`min-h-9 min-w-10 rounded-full px-2.5 text-sm font-semibold transition sm:px-3 ${lang === l ? "bg-brand-navy text-white" : "text-ink-2 hover:text-ink"}`}>{LANG_NAMES[l]}</button>
  );
  return (
    <div role="group" aria-label={t("Interface language")} data-tour="lang" className={`inline-flex shrink-0 items-center gap-0.5 rounded-full p-0.5 ring-1 ring-line ${className}`}>
      {btn("en")}{btn("ar")}
    </div>
  );
}
