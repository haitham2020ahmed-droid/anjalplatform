"use client";
import { useT } from "@/i18n/client";

/** Shown by a game that is not built yet. */
export function SoonPanel() {
  const t = useT();
  return (
    <div className="rounded-3xl bg-white p-10 text-center ring-1 ring-slate-200">
      <p className="text-5xl" aria-hidden="true">🛠️</p>
      <p className="mt-3 text-2xl font-semibold text-brand-navy">{t("Soon")}</p>
      <p className="mt-1 text-slate-600">{t("This game is coming soon.")}</p>
    </div>
  );
}
