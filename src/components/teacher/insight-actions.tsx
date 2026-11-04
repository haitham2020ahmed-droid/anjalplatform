import Link from "next/link";
import type { TFn } from "@/i18n";
import { INSIGHT_ACTIONS, insightHref, type InsightAction, type InsightTarget } from "./insight-links";

/**
 * ⚡ The action buttons next to every alert and insight, the SAME five everywhere — alerts, early warning, Class
 * Insights, mistakes and root causes, class progress, the student file (links: insight-links.ts). When a caller
 * passes `primary`, that one action is shown as the main button and the rest sit under a "More options" toggle —
 * so a long list of alerts doesn't show five buttons on every row. Callers that don't pass `primary` keep the old
 * flat row of all of them, unchanged.
 */
export function InsightActions({ t, target, only, primary, className = "" }: { t: TFn; target: InsightTarget; only?: InsightAction[]; primary?: InsightAction; className?: string }) {
  const items = INSIGHT_ACTIONS.filter((a) => !only || only.includes(a.key)).map((a) => ({ ...a, href: insightHref(a.key, target) })).filter((a) => a.href);
  if (!items.length) return null;
  const button = (a: (typeof items)[number], emphasize: boolean) => (
    <Link key={a.key} prefetch={false} href={a.href!} data-action={a.key}
      className={emphasize
        ? "inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white hover:bg-brand-teal"
        : "inline-flex min-h-9 items-center gap-1 rounded-lg bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"}>
      <span aria-hidden="true">{a.icon}</span> {t(a.label)}
    </Link>
  );
  if (!primary) {
    return (
      <div className={`flex flex-wrap gap-2 print:hidden ${className}`} data-insight-actions>
        {items.map((a) => button(a, false))}
      </div>
    );
  }
  const main = items.find((a) => a.key === primary) ?? items[0];
  const rest = items.filter((a) => a.key !== main.key);
  return (
    <div className={`flex flex-wrap items-center gap-2 print:hidden ${className}`} data-insight-actions>
      {button(main, true)}
      {rest.length > 0 && (
        <details className="inline-block">
          <summary className="min-h-9 cursor-pointer list-none rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:ring-brand-teal">{t("More options")}</summary>
          <div className="mt-2 flex flex-wrap gap-2">{rest.map((a) => button(a, false))}</div>
        </details>
      )}
    </div>
  );
}
