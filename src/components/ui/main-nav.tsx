"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string; icon: string }

/** The role's main sections, on every page: one click between them; the current section is highlighted. */
export function MainNav({ items }: { items: NavItem[] }) {
  const path = usePathname() ?? "";
  // the most specific matching section is the current one (e.g. /admin/questions/new → Question Bank)
  const current = items.filter((i) => path === i.href || path.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Main" className="border-t border-slate-100 bg-white/95 print:hidden">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 py-1.5 text-sm [scrollbar-width:thin] sm:px-6">
        {items.map((i) => {
          const on = i.href === current;
          return (
            <li key={i.href} className="shrink-0">
              <Link prefetch={false} href={i.href} aria-current={on ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-semibold transition ${on ? "bg-brand-navy text-white shadow-sm" : "text-slate-700 hover:bg-slate-100 hover:text-brand-navy"}`}>
                <span aria-hidden="true">{i.icon}</span>{i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
