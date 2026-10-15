import Link from "next/link";
import type { ReactNode } from "react";
import { qrPath } from "@/lib/qr";
import { isPlanHref } from "@/lib/plan-links";

/**
 * 🔗 r79 — the printed-plan kit for page components (server components: APP_URL is read on the server).
 *   PlanA          an item of the plan as an ABSOLUTE platform link (src/lib/plan-links.ts) — underlined, readable in
 *                  print; kept as a clickable link by "Save as PDF". Not a platform link → plain text.
 *   PlanLinksNote  "🔗 Everything in this plan is clickable" at the top of the plan.
 *   PlanQr         ONE small QR code of a section / unit for paper copies (printed only; the screen has the links).
 */
export function PlanA({ href, children, className = "", testId }: { href: string | null | undefined; children: ReactNode; className?: string; testId?: string }) {
  if (!href || !isPlanHref(href)) return <>{children}</>;
  return <Link prefetch={false} href={href} data-plan-link="1" data-testid={testId} className={`underline decoration-1 underline-offset-2 hover:text-brand-purple print:text-blue-800 ${className}`}>{children}</Link>;
}

export function PlanLinksNote({ t, className = "" }: { t: (s: string) => string; className?: string }) {
  return <p data-testid="plan-links-note" className={`rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 ring-1 ring-blue-100 ${className}`}>🔗 {t("Everything in this plan is clickable")}</p>;
}

export function PlanQr({ href, size = 56, label }: { href: string | null | undefined; size?: number; label?: string }) {
  if (!href || !isPlanHref(href)) return null;
  let q: { total: number; d: string };
  try { q = qrPath(href); } catch { return null; }
  return (
    <a href={href} data-testid="plan-qr" className="hidden shrink-0 flex-col items-center text-[9px] leading-tight text-slate-500 no-underline print:inline-flex">
      <svg viewBox={`0 0 ${q.total} ${q.total}`} width={size} height={size} role="img" aria-label={label ?? "QR"}><rect width={q.total} height={q.total} fill="#fff" /><path d={q.d} fill="#000" /></svg>
      {label && <span>{label}</span>}
    </a>
  );
}
