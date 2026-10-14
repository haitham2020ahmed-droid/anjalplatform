import Link from "next/link";
import type { TFn } from "@/i18n";
import { INSIGHT_ACTIONS, insightHref, type InsightAction, type InsightTarget } from "./insight-links";

/**
 * ⚡ The action buttons next to every alert and insight, the SAME five everywhere — alerts, early warning, Class
 * Insights, mistakes and root causes, class progress, the student file (links: insight-links.ts).
 */
export function InsightActions({ t, target, only, className = "" }: { t: TFn; target: InsightTarget; only?: InsightAction[]; className?: string }) {
  const items = INSIGHT_ACTIONS.filter((a) => !only || only.includes(a.key)).map((a) => ({ ...a, href: insightHref(a.key, target) })).filter((a) => a.href);
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap gap-2 print:hidden ${className}`} data-insight-actions>
      {items.map((a) => (
        <Link key={a.key} prefetch={false} href={a.href!} data-action={a.key}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">
          <span aria-hidden="true">{a.icon}</span> {t(a.label)}
        </Link>
      ))}
    </div>
  );
}
