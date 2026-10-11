"use client";
import { useT } from "@/i18n/client";

/**
 * The "❔ Tour" button on the student home: replays the first-login tour (FirstLoginTour in the page frame,
 * shown once per user automatically and saved on the server — no second tour here).
 */
export function StudentTour() {
  const t = useT();
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("open-tour"))}
      className="fixed bottom-4 end-4 z-30 min-h-11 rounded-full bg-white px-4 text-sm font-semibold text-brand-navy shadow-lg ring-1 ring-slate-200 print:hidden">❔ {t("Tour")}</button>
  );
}
