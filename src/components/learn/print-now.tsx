"use client";
import { useEffect } from "react";
import { useT } from "@/i18n/client";

/** Opens the browser's print dialog once (choose "Save as PDF"), and a button to open it again. */
export function PrintNow() {
  const t = useT();
  useEffect(() => { const id = setTimeout(() => window.print(), 400); return () => clearTimeout(id); }, []);
  return <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-4 font-semibold text-white print:hidden">⬇️ {t("Download PDF")}</button>;
}
