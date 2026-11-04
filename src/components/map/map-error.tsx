"use client";
import { useEffect } from "react";
import { useT } from "@/i18n/client";

/**
 * 🧯 r79 (the r78 NAFS pattern): the MAP pages' own error page (never a white page): a friendly line, "Try again"
 * (draws the page again) and a link back to MAP. Shown inside the teacher frame; the failure is sent to the school's
 * error log.
 */
export function MapError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    try { void fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: error.message, digest: error.digest, path: window.location.pathname }) }); } catch { /* offline */ }
  }, [error]);
  return (
    <div role="alert" className="mx-auto mt-6 max-w-md rounded-2xl bg-surface p-6 text-center shadow-card ring-1 ring-line">
      <p className="text-4xl" aria-hidden="true">😕</p>
      <h1 className="mt-2 text-xl font-bold text-ink">{t("Something went wrong — try again")}</h1>
      <p className="mt-2 text-sm text-ink-2">{t("Your saved work is safe. Try again, or go back to MAP.")}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => reset()} className="min-h-11 rounded-xl bg-brand-navy px-5 font-semibold text-white">{t("Try again")}</button>
        <a href="/teacher/map-center" className="inline-flex min-h-11 items-center rounded-xl px-5 font-semibold text-ink ring-1 ring-line">{t("Back to MAP")}</a>
      </div>
      {error.digest && <p className="mt-4 text-xs text-muted" dir="ltr">{t("Reference")}: {error.digest}</p>}
    </div>
  );
}
