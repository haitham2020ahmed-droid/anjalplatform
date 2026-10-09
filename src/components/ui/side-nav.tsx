"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavItem } from "./main-nav";

const GROUP_NAME: Record<string, string> = { Teach: "Teaching", Students: "Students", MAP: "MAP Growth", Content: "Content", "Follow-up": "Follow-up", School: "School" };

/** Groups in the order they first appear; items without a group form the top block. */
function sections(items: NavItem[]): { name: string | null; items: NavItem[] }[] {
  const out: { name: string | null; items: NavItem[] }[] = [];
  for (const i of items) {
    const key = i.group ?? null;
    const s = out.find((x) => x.name === key);
    if (s) s.items.push(i); else out.push({ name: key, items: [i] });
  }
  return out;
}

/**
 * The role's whole map on the left (desktop) or in a drawer (phone): every section in groups, the current page
 * marked, numbers for what is waiting (red = late / urgent). Groups fold; the choice is remembered.
 */
export function SideNav({ items, brand }: { items: NavItem[]; brand: React.ReactNode }) {
  const path = usePathname() ?? "";
  const [drawer, setDrawer] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  const current = items.filter((i) => path === i.href || path.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => { try { setClosed(JSON.parse(localStorage.getItem("nav-closed") ?? "[]")); } catch { /* private mode */ } }, []);
  useEffect(() => {
    const open = () => setDrawer(true);
    window.addEventListener("open-nav", open);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("open-nav", open); window.removeEventListener("keydown", esc); };
  }, []);
  const toggle = (name: string) => setClosed((c) => { const n = c.includes(name) ? c.filter((x) => x !== name) : [...c, name]; try { localStorage.setItem("nav-closed", JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const list = (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-4">{brand}</div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {sections(items).map((s) => {
          const isClosed = s.name !== null && closed.includes(s.name) && !s.items.some((i) => i.href === current);
          const waiting = s.items.reduce((t, i) => t + (i.count ?? 0), 0);
          return (
            <div key={s.name ?? "top"} className={s.name ? "mt-4" : ""}>
              {s.name && (
                <button type="button" onClick={() => toggle(s.name!)} aria-expanded={!isClosed} className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[13px] font-semibold text-white/55 hover:text-white">
                  <span>{GROUP_NAME[s.name] ?? s.name}</span>
                  <span className="flex items-center gap-2">{isClosed && waiting > 0 && <span className="rounded-full bg-white/15 px-1.5 text-[11px] text-white">{waiting}</span>}<span aria-hidden="true" className={`text-[10px] transition ${isClosed ? "-rotate-90" : ""}`}>▼</span></span>
                </button>
              )}
              {!isClosed && (
                <ul className="mt-1 space-y-0.5">
                  {s.items.map((i) => {
                    const on = i.href === current;
                    return (
                      <li key={i.href}>
                        <Link prefetch={false} href={i.href} aria-current={on ? "page" : undefined}
                          className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[14px] transition ${on ? "bg-white text-brand-navy shadow-sm" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>
                          {on && <span aria-hidden="true" className="absolute inset-y-1.5 -start-3 w-1 rounded-e bg-brand-teal" />}
                          <span aria-hidden="true" className="w-5 text-center text-[15px]">{i.icon}</span>
                          <span className="flex-1 truncate">{i.label}</span>
                          {i.count ? <span className={`rounded-full px-1.5 text-[11px] font-bold leading-5 ${i.alert ? "bg-red-500 text-white" : on ? "bg-brand-teal text-white" : "bg-white/15 text-white"}`}>{i.count > 99 ? "99+" : i.count}<span className="sr-only">{i.alert ? " need attention" : " waiting"}</span></span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
  return (
    <>
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 bg-brand-navy lg:block print:hidden">{list}</aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close the menu" className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <aside className="animate-slide-in absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-brand-navy shadow-2xl">{list}</aside>
        </div>
      )}
    </>
  );
}

/** The phone's menu button (opens the drawer). */
export function MenuButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("open-nav"))} className="rounded-lg p-2 text-brand-navy hover:bg-slate-100 lg:hidden" aria-label="Open the menu">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" /></svg>
    </button>
  );
}
