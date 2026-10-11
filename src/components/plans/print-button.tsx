"use client";
import { useT } from "@/i18n/client";

/** Prints the plan (the browser's “Save as PDF” makes the file to download and share). */
export function PrintButton({ label }: { label?: string } = {}) {
  const t = useT();
  return <button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple print:hidden">{label ? t(label) : `⬇ ${t("Download PDF")} / 🖨 ${t("Print")}`}</button>;
}
