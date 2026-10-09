import Link from "next/link";
import { PrintButton } from "@/components/plans/print-button";

/** Above a report (not printed): back, Reading / Language, short / full, Print. */
export function ReportToolbar({ back, base, subject, full, msg, extra }: { back: { href: string; label: string }; base: string; subject?: string; full?: boolean; msg?: string; extra?: React.ReactNode }) {
  const q = (p: Record<string, string>) => `${base}?${new URLSearchParams({ ...(subject ? { subject } : {}), ...(full ? { full: "1" } : {}), ...p })}`;
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-300 hover:ring-brand-teal"}`;
  return (
    <div className="mx-auto mb-4 max-w-4xl print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={back.href} className="rounded-full px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">← {back.label}</Link>
        {subject && <>{(["READING", "LANGUAGE"] as const).map((x) => <Link key={x} href={q({ subject: x })} className={chip(subject === x)}>{x === "READING" ? "📖 Reading" : "✍️ Language Usage"}</Link>)}</>}
        {full !== undefined && <Link href={`${base}?${new URLSearchParams({ ...(subject ? { subject } : {}), ...(full ? {} : { full: "1" }) })}`} className={chip(false)}>{full ? "Short version" : "Full version (every statement)"}</Link>}
        {extra}
        <span className="ms-auto"><PrintButton /></span>
      </div>
      {msg && <p role="status" className="mt-3 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{msg}</p>}
    </div>
  );
}
