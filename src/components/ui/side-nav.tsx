"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavItem } from "./main-nav";
import { navSections as sections } from "../nav-items";
import { useT } from "@/i18n/client";
import { LineIcon } from "./line-icon";

/** Menu entries the first-login tour points at (home tiles with the same data-tour win when visible). */
const TOUR_TARGET: Record<string, string> = {
  "/student/work": "my-work", "/student/map": "plans", "/student/tests": "tests",
  "/teacher/students": "students", "/teacher/plans": "plans", "/teacher/reports": "teacher-reports", "/admin/all": "all-tools",
};

/** Groups that start folded (opened by a tap, and the choice is remembered): every role's rarely used pages. */
const FOLDED_BY_DEFAULT = new Set(["More"]);
/** Menu groups the first-login tour points at. */
const TOUR_GROUP: Record<string, string> = { Content: "content", Reports: "reports" };
/** Soft colours for the group headings (cheerful, never loud); unknown groups are grey. */
const GROUP_TONE: Record<string, string> = {
  Programs: "bg-sky-50 text-sky-800", Reading: "bg-teal-50 text-teal-800", Achievements: "bg-amber-50 text-amber-800",
  School: "bg-indigo-50 text-indigo-800", Content: "bg-violet-50 text-violet-800", "Assessments & Programs": "bg-emerald-50 text-emerald-800",
  Reports: "bg-orange-50 text-orange-800", Settings: "bg-slate-100 text-slate-700", More: "bg-slate-100 text-slate-600",
};
/** The little coloured dot in front of each group heading (same hue as its heading). */
const GROUP_DOT: Record<string, string> = {
  Programs: "bg-sky-400", Reading: "bg-teal-400", Achievements: "bg-amber-400", School: "bg-indigo-400", Content: "bg-violet-400",
  "Assessments & Programs": "bg-emerald-400", Reports: "bg-orange-400", Settings: "bg-slate-400", More: "bg-slate-300",
};

/**
 * The role's menu on the left (desktop) or in a drawer (phone): a light side bar, the current page highlighted,
 * numbers for what is waiting (red = late / urgent). "More" starts folded; groups fold and the choice is remembered.
 * `variant="calm"` (teachers): clean line icons, quiet grey group headings, a slim teal marker on the current page;
 * the default (students, admins): soft coloured group headings and the emoji icons.
 */
export function SideNav({ items, brand, footer, tools, extras, variant = "default" }: { items: NavItem[]; brand: React.ReactNode; footer?: React.ReactNode; /** under the brand: "Find a page" */ tools?: React.ReactNode; /** bottom of the menu on every screen (notifications, feedback, print) */ extras?: React.ReactNode; variant?: "default" | "calm" }) {
  const calm = variant === "calm";
  const t = useT();
  const hasAssessments = items.some((i) => i.href === "/teacher/assessments");
  const path = usePathname() ?? "";
  const [drawer, setDrawer] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  // MAP reports and the MAP plan open on the MAP page's address but belong to Reports and Plans
  const [tab, setTab] = useState("");
  useEffect(() => { try { setTab(new URLSearchParams(window.location.search).get("tab") ?? ""); } catch { setTab(""); } }, [path]);
  const here = path === "/teacher/map-center" && tab === "reports" ? "/teacher/reports" : path === "/teacher/map-center" && tab === "plan" ? "/teacher/plans" : path;
  const current = items.filter((i) => here === i.href || here.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
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
    <nav aria-label={t("Main menu")} className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-4">{brand}</div>
      {tools && <div className="px-3 pb-3">{tools}</div>}
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {sections(items).map((s, si) => {
          const tourGroup = s.name ? TOUR_GROUP[s.name] : undefined;
          // folded-by-default groups store "+name" once opened; the others store "name" once closed
          const folded = s.name !== null && (FOLDED_BY_DEFAULT.has(s.name) ? !closed.includes(`+${s.name}`) : closed.includes(s.name));
          const isClosed = folded && !s.items.some((i) => i.href === current);
          const waiting = s.items.reduce((t, i) => t + (i.count ?? 0), 0);
          return (
            <div key={`${s.name ?? "top"}-${si}`} className={s.name ? "mt-3" : si ? "mt-1" : ""}>
              {s.name && (
                <button type="button" onClick={() => toggle(FOLDED_BY_DEFAULT.has(s.name!) ? `+${s.name}` : s.name!)} aria-expanded={!isClosed} data-tour={tourGroup} className={calm
                  ? "flex min-h-10 w-full items-center justify-between rounded-lg px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 transition hover:text-slate-600"
                  : `flex min-h-11 w-full items-center justify-between rounded-2xl px-3 py-1 text-[13px] font-semibold tracking-wide transition hover:brightness-95 ${GROUP_TONE[s.name] ?? "bg-slate-100 text-slate-700"}`}>
                  <span className="flex items-center gap-2">{!calm && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${GROUP_DOT[s.name] ?? "bg-slate-300"}`} />}{t(s.name)}</span>
                  <span className="flex items-center gap-2">{isClosed && waiting > 0 && <span className="rounded-full bg-white px-1.5 text-[11px] text-slate-700">{waiting}</span>}<span aria-hidden="true" className={`text-[10px] transition ${isClosed ? "-rotate-90 rtl:rotate-90" : ""}`}>▼</span></span>
                </button>
              )}
              {!isClosed && (
                <ul className="mt-1 space-y-0.5">
                  {s.items.map((i) => {
                    const on = i.href === current;
                    return (
                      <li key={i.href}>
                        <Link prefetch={false} href={i.href} aria-current={on ? "page" : undefined} data-tour={TOUR_TARGET[i.href] ?? (i.href === "/teacher/assignments" && !hasAssessments ? "assessments" : undefined)}
                          className={calm
                            ? `group relative flex min-h-10 items-center gap-3 rounded-lg px-2.5 py-1.5 text-[14px] transition ${on ? "bg-slate-100 font-semibold text-brand-navy" : "font-medium text-slate-600 hover:bg-slate-50 hover:text-brand-navy"}`
                            : `group relative flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[15px] transition ${on ? "bg-brand-navy/[0.07] font-semibold text-brand-navy ring-1 ring-brand-navy/10" : "text-slate-600 hover:bg-slate-100/70 hover:text-brand-navy"}`}>
                          {on && <span aria-hidden="true" className={`absolute inset-y-1.5 -start-3 rounded-e bg-brand-teal ${calm ? "w-[3px]" : "w-1"}`} />}
                          {i.line
                            ? <span aria-hidden="true" className={`grid w-5 place-items-center ${on ? "text-brand-teal" : "text-slate-400 group-hover:text-brand-navy"}`}><LineIcon name={i.line} className="h-[18px] w-[18px]" /></span>
                            : <span aria-hidden="true" className="w-5 text-center text-[15px] transition group-hover:scale-110">{i.icon}</span>}
                          <span className="flex-1 truncate">{t(i.label)}</span>
                          {i.count ? <span dir="ltr" className={`rounded-full px-1.5 text-[11px] font-bold leading-5 ${i.alert ? "bg-rose-500 text-white" : on ? "bg-brand-navy text-white" : "bg-slate-200 text-slate-700"}`}>{i.count > 99 ? "99+" : i.count}<span className="sr-only">{i.alert ? " need attention" : " waiting"}</span></span> : null}
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
      {extras && <div className="hidden border-t border-slate-200 bg-white px-4 py-2 lg:block">{extras}</div>}
      {footer && <div className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden">{footer}</div>}
    </nav>
  );
  return (
    <>
      <aside className={`fixed inset-y-0 start-0 z-30 hidden w-64 border-e lg:block print:hidden ${calm ? "border-slate-200 bg-white" : "border-slate-200/70 bg-white/90 backdrop-blur-md"}`}>{list}</aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label={t("Menu")}>
          <button type="button" aria-label={t("Close the menu")} className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <aside className={`animate-slide-in absolute inset-y-0 start-0 w-72 max-w-[85vw] shadow-2xl ${calm ? "rounded-e-2xl bg-white" : "rounded-e-3xl bg-gradient-to-b from-white to-slate-50"}`}>{list}</aside>
        </div>
      )}
    </>
  );
}

/** The phone's menu button (opens the drawer). */
export function MenuButton({ label = "Open the menu" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("open-nav"))} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-brand-navy hover:bg-slate-100 lg:hidden" aria-label={label}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" /></svg>
    </button>
  );
}
