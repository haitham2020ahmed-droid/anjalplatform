"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import { TONE, type Tone } from "./tokens";

export interface Glance { label: string; value: ReactNode; meaning?: ReactNode; icon?: string; tone?: Tone; href?: string }

const COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" };

/**
 * "At a glance": 3–5 big numbers, each with one plain-language line saying what it means. The tone adds a
 * coloured top bar AND a mark (✓ / !) so the meaning never rests on colour alone.
 */
export function AtAGlance({ items, title = "At a glance", className = "" }: { items: Glance[]; title?: string | null; className?: string }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <section aria-label={t(title ?? "At a glance")} className={`rk-glance mb-5 ${className}`} data-rk="glance">
      {title && <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{t(title)}</h2>}
      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${COLS[Math.min(6, items.length)] ?? "lg:grid-cols-5"}`}>
        {items.map((g, i) => {
          const tone = TONE[g.tone ?? "neutral"];
          const body = (
            <>
              <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1.5 ${tone.bar}`} />
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">{g.icon && <span aria-hidden="true">{g.icon}</span>}<span className="min-w-0">{t(g.label)}</span></span>
              <span className={`mt-1 flex items-baseline gap-1.5 text-3xl font-bold tabular-nums leading-tight ${tone.value}`}>
                <bdi dir="ltr">{g.value}</bdi>
                {tone.mark && <span aria-hidden="true" className="text-base">{tone.mark}</span>}
              </span>
              {g.meaning && <span className="mt-1 block text-[13px] leading-snug text-slate-600">{typeof g.meaning === "string" ? t(g.meaning) : g.meaning}</span>}
            </>
          );
          const cls = "relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white p-4 pt-5 shadow-card ring-1 ring-slate-200/80 break-inside-avoid";
          return g.href ? <a key={i} href={g.href} className={`${cls} lift hover:ring-brand-teal`}>{body}</a> : <div key={i} className={cls}>{body}</div>;
        })}
      </div>
    </section>
  );
}
