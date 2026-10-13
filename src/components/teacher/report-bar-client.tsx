"use client";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { LineIcon } from "../ui/line-icon";

/** A select that opens the chosen address at once (class switcher, student picker). Values are same-site paths. */
export function NavSelect({ label, value, options, className = "" }: { label: string; value: string; options: { href: string; label: string }[]; className?: string }) {
  const router = useRouter();
  const t = useT();
  return (
    <label className={`flex min-w-0 items-center gap-2 text-sm ${className}`}>
      <span className="shrink-0 font-medium text-slate-500">{t(label)}</span>
      <select value={value} onChange={(e) => { const v = e.target.value; if (v.startsWith("/")) router.push(v); }}
        className="min-h-10 min-w-0 max-w-[16rem] rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-800 focus:border-brand-teal">
        {options.map((o) => <option key={o.href} value={o.href}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** "PDF / Print": the browser's print dialog for this page (Save as PDF is one tap there). */
export function PrintThisPage({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <LineIcon name="print" className="h-4 w-4" />{t("PDF / Print")}
    </button>
  );
}
