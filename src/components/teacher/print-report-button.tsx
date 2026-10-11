"use client";
import { useT } from "@/i18n/client";

/**
 * "Download PDF": opens the report's own page (the print view) in a new tab and opens the browser's print dialog
 * there, where "Save as PDF" is one tap. Same-site pages only.
 */
export function PrintReportButton({ url, className = "" }: { url: string; className?: string }) {
  const t = useT();
  const go = () => {
    if (!url.startsWith("/")) return;
    const w = window.open(url, "_blank");
    if (!w) { window.location.href = url; return; }
    w.addEventListener("load", () => setTimeout(() => { try { w.print(); } catch { /* the user prints from the page */ } }, 400));
  };
  return <button type="button" onClick={go} className={className}>{t("Download PDF")}</button>;
}
