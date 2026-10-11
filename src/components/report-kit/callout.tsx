"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";

const KIND = {
  meaning: { icon: "💡", title: "What this means", cls: "bg-sky-50 ring-sky-200 text-sky-950", head: "text-sky-900" },
  next: { icon: "👉", title: "Next step", cls: "bg-emerald-50 ring-emerald-200 text-emerald-950", head: "text-emerald-900" },
  help: { icon: "🙋", title: "Who needs help", cls: "bg-rose-50 ring-rose-200 text-rose-950", head: "text-rose-900" },
  note: { icon: "ℹ️", title: "Good to know", cls: "bg-slate-50 ring-slate-200 text-slate-800", head: "text-slate-800" },
  praise: { icon: "🌟", title: "Well done", cls: "bg-amber-50 ring-amber-200 text-amber-950", head: "text-amber-900" },
} as const;
export type CalloutKind = keyof typeof KIND;

/**
 * "What this means" / "Next step" / "Who needs help" boxes: short sentences under a clear heading.
 * `items` become a list; `children` are free text. Strings are translated when they are interface words.
 */
export function Callout({ kind = "meaning", title, items, children, className = "" }: { kind?: CalloutKind; title?: string; items?: ReactNode[]; children?: ReactNode; className?: string }) {
  const t = useT();
  const k = KIND[kind];
  const list = (items ?? []).filter((x) => x !== null && x !== undefined && x !== false && x !== "");
  if (!list.length && !children) return null;
  return (
    <aside className={`rk-callout break-inside-avoid rounded-2xl p-4 ring-1 sm:p-5 ${k.cls} ${className}`} data-rk={`callout-${kind}`}>
      <p className={`flex items-center gap-2 font-semibold ${k.head}`}><span aria-hidden="true" className="text-lg">{k.icon}</span>{t(title ?? k.title)}</p>
      {list.length > 0 && <ul className="mt-2 list-disc space-y-1 ps-6 text-[15px] leading-relaxed">{list.map((x, i) => <li key={i}>{typeof x === "string" ? t(x) : x}</li>)}</ul>}
      {children && <div className="mt-1.5 text-[15px] leading-relaxed">{typeof children === "string" ? t(children) : children}</div>}
    </aside>
  );
}
