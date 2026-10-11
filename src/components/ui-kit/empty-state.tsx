"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import { BTN_PRIMARY } from "./tokens";

/**
 * A friendly message instead of a blank page or empty table ("No work right now — great job!").
 * The icon sits in a soft round bubble (CSS only). Keep it to one short title, one plain sentence and at most one
 * button. `title`/`text` are interface strings: they are translated when listed in src/i18n/en.ts.
 */
export function EmptyState({ icon = "🎉", title = "No work right now — great job!", text, action, children, compact = false, className = "" }: {
  icon?: string; title?: string; text?: string; action?: { href: string; label: string }; children?: ReactNode; compact?: boolean; className?: string;
}) {
  const t = useT();
  return (
    <div role="status" data-compact={compact ? "" : undefined} className={`empty-card flex flex-col items-center rounded-3xl text-center ${compact ? "gap-1.5 p-5" : "gap-2 p-8 sm:p-10"} ${className}`}>
      <span aria-hidden="true" className={`empty-art ${compact ? "mb-1 h-14 w-14 text-3xl" : "mb-2 h-24 w-24 text-5xl"}`}>{icon}</span>
      <p className={`font-semibold text-brand-navy ${compact ? "text-base" : "text-xl"}`}>{t(title)}</p>
      {text && <p className="max-w-md leading-relaxed text-slate-600">{t(text)}</p>}
      {action && <Link href={action.href} prefetch={false} className={`${BTN_PRIMARY} mt-3`}>{t(action.label)}</Link>}
      {children}
    </div>
  );
}
