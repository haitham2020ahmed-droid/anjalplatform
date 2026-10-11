/**
 * Shared admin styles and two tiny layout components — ONE module (readiness I-2). There used to be both styles.ts and
 * styles.tsx: TypeScript resolved the .ts file, but Next.js/webpack resolves .tsx first, so admin pages got a different
 * `field`/`label` and no `card`/`h2`/`btnLink` at all. Plain strings and server-safe components only (no hooks), so
 * server and client components can both import it.
 */
import type { ReactNode } from "react";

export const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";
export const label = "block text-sm font-medium text-slate-700";
export const card = "mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200";
export const h2 = "text-lg font-bold text-brand-navy";
export const btnLink = "rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";

export function AdminCard({ children }: { children: ReactNode }) {
  return <div className={card}>{children}</div>;
}

export function AdminTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-xl font-bold text-brand-navy">{children}</h1>;
}
