"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface NavItem { href: string; label: string; icon: string; count?: number; alert?: boolean; group?: string }

const GROUP_ICON: Record<string, string> = { Teach: "📚", Students: "👥", MAP: "🗺️", Content: "📚", "Follow-up": "📈", School: "🏫" };

function Badge({ n, alert }: { n?: number; alert?: boolean }) {
  if (!n) return null;
  return <span className={`absolute -end-2.5 -top-2 min-w-[1.1rem] rounded-full px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-white ${alert ? "bg-red-600" : "bg-sky-600"}`}>{n > 99 ? "99+" : n}</span>;
}

/**
 * The role's main sections on every page: direct links, plus grouped menus (Teach ▾, Students ▾, MAP ▾ …).
 * The current section is highlighted; numbers show what is waiting (red = late or urgent).
 */
export function MainNav({ items }: { items: NavItem[] }) {
  const path = usePathname() ?? "";
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const current = items.filter((i) => path === i.href || path.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  useEffect(() => { setOpen(null); }, [path]);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, []);
  // keep the order of first appearance: direct links and groups interleaved as listed
  const entries: ({ kind: "link"; item: NavItem } | { kind: "group"; name: string; items: NavItem[] })[] = [];
  for (const i of items) {
    if (!i.group) { entries.push({ kind: "link", item: i }); continue; }
    const g = entries.find((e) => e.kind === "group" && e.name === i.group) as { kind: "group"; name: string; items: NavItem[] } | undefined;
    if (g) g.items.push(i); else entries.push({ kind: "group", name: i.group, items: [i] });
  }
  const base = "relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-semibold transition active:scale-[.97]";
  return (
    <nav ref={ref} aria-label="Main" className="border-t border-slate-100 bg-white/95 print:hidden">
      <ul className="mx-auto flex max-w-7xl flex-wrap gap-1 px-3 py-1.5 text-sm sm:px-6">
        {entries.map((e) => {
          if (e.kind === "link") {
            const i = e.item, on = i.href === current;
            return (
              <li key={i.href} className="shrink-0">
                <Link prefetch={false} href={i.href} aria-current={on ? "page" : undefined} className={`${base} ${on ? "bg-brand-navy text-white shadow-sm" : "text-slate-700 hover:bg-slate-100 hover:text-brand-navy"}`}>
                  <span aria-hidden="true" className="relative">{i.icon}<Badge n={i.count} alert={i.alert} /></span>{i.label}
                  {i.count ? <span className="sr-only"> ({i.count}{i.alert ? ", needs attention" : ""})</span> : null}
                </Link>
              </li>
            );
          }
          const on = e.items.some((i) => i.href === current), isOpen = open === e.name;
          const n = e.items.reduce((t, i) => t + (i.count ?? 0), 0), alert = e.items.some((i) => i.alert && i.count);
          return (
            <li key={e.name} className="relative shrink-0">
              <button type="button" onClick={() => setOpen(isOpen ? null : e.name)} aria-expanded={isOpen} aria-haspopup="menu" className={`${base} ${on ? "bg-brand-navy text-white shadow-sm" : isOpen ? "bg-slate-100 text-brand-navy" : "text-slate-700 hover:bg-slate-100 hover:text-brand-navy"}`}>
                <span aria-hidden="true" className="relative">{GROUP_ICON[e.name] ?? "•"}<Badge n={n} alert={alert} /></span>{e.name}<span aria-hidden="true" className={`text-xs transition ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {isOpen && (
                <ul role="menu" className="animate-fade-up absolute start-0 top-10 z-50 min-w-[14rem] rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200">
                  {e.items.map((i) => (
                    <li key={i.href} role="none">
                      <Link role="menuitem" prefetch={false} href={i.href} aria-current={i.href === current ? "page" : undefined} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${i.href === current ? "bg-brand-navy text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                        <span aria-hidden="true" className="w-6 text-center">{i.icon}</span><span className="flex-1">{i.label}</span>
                        {i.count ? <span className={`rounded-full px-2 text-xs font-bold text-white ${i.alert ? "bg-red-600" : "bg-sky-600"}`}>{i.count}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
