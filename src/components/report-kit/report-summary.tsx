"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useId } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import type { ActionKind, LineTone, Summary } from "@/lib/report-summary";
import { GLOSSARY } from "@/lib/report-columns";
import { InfoTip } from "./info-tip";

const MARK: Record<LineTone, string> = { info: "📊", good: "🌟", help: "🙋", skill: "🧩", next: "👉" };
const ICON: Record<ActionKind, string> = { practice: "🎯", lesson: "📘", group: "👥", parent: "✉️", reteach: "🔁", plan: "🗂️", followup: "🤝", message: "💬", open: "📂" };

/**
 * The SUMMARY at the END of every report: 3–5 plain sentences computed from the page's own numbers
 * (src/lib/report-summary.ts + report-summaries.ts), then the ACTION PLAN — buttons that open the page that does each
 * next step. Sentences and labels are interface strings (English and Arabic); names and numbers stay as given.
 */
export function ReportSummary({ summary, title = "Summary", className = "" }: { summary: Summary; title?: string; className?: string }) {
  const t = useT();
  const hid = useId(); // several summaries on one page (a class's family reports): unique heading ids
  return (
    <section aria-labelledby={hid} className={`rk-section mt-6 mb-5 break-inside-avoid rounded-3xl bg-gradient-to-br from-emerald-50 to-white p-5 shadow-card ring-1 ring-emerald-200 sm:p-6 ${className}`} data-rk="summary">
      <h2 id={hid} className="flex items-center gap-2 text-lg font-semibold text-brand-navy sm:text-xl"><span aria-hidden="true">🧾</span>{t(title)} <InfoTip text={GLOSSARY.Summary} /></h2>
      <ul className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-slate-800" data-rk="summary-lines">
        {summary.lines.map((l, i) => <li key={i} className="flex gap-2" data-tone={l.tone}><span aria-hidden="true">{MARK[l.tone]}</span><span>{t(l.key, l.vars)}</span></li>)}
      </ul>
      {summary.actions.length > 0 && (
        <div className="mt-4 border-t border-emerald-200 pt-3 print:hidden">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-900">{t("Action plan")} <InfoTip text={GLOSSARY["Action plan"]} /></h3>
          <div className="mt-2 flex flex-wrap gap-2" data-rk="action-plan">
            {summary.actions.map((a, i) => (
              <Link key={`${a.kind}${i}`} prefetch={false} href={a.href} data-action={a.kind}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold ${i === 0 ? "bg-brand-navy text-white hover:opacity-90" : "bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"}`}>
                <span aria-hidden="true">{ICON[a.kind]}</span>{t(a.label, a.vars)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
