import { Suspense } from "react";
import { headers } from "next/headers";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { PrintBox } from "./print/print-box";
import { SubmitFeedback } from "./ui/submit-feedback";
import { ComfortToggle } from "./ui/comfort-toggle";
import { NavProgress } from "./ui/nav-progress";
import { MenuButton, SideNav } from "./ui/side-nav";
import { JumpTo } from "./ui/jump-to";
import { FirstLoginTour, LangSwitch, StickyHome } from "./ui-kit";
import { navItemsFor } from "./nav-items";
import { RewardChip } from "./motivation/reward-chip";
import { getActor, HOME_BY_ROLE, repo } from "@/server/auth/next";
import type { Role } from "@/server/auth/rbac";
import { navCountsCached } from "@/server/teacher/week-plan";
import { needsTour } from "@/server/ui/prefs";
import { getT } from "@/i18n/server";
import { isContentPath } from "@/i18n/content-routes";

const ROLE_NAME: Record<string, string> = { TEACHER: "Teacher", SCHOOL_ADMIN: "School admin", SUPER_ADMIN: "Platform admin", STUDENT: "Student", PARENT: "Parent" };

/**
 * Shared page frame. Top bar (sticky, on every page): menu (phone) · 🏠 Home · English | Arabic · search ·
 * print box · bell · person · sign out. Desktop: the role's whole map in a navy side bar (groups fold; numbers =
 * waiting work); phone: the same map in a drawer. The interface language (menus, headings, buttons) follows the
 * user's choice; page content is never translated.
 */
export async function AppShell({ name, children }: { name: string; children: React.ReactNode }) {
  const me = await getActor();   // cached for the request: no extra query
  const { t, lang } = await getT();
  // English learning content (passages, questions, feedback) keeps its own direction in Arabic mode
  let content = false;
  if (lang === "ar") { try { content = isContentPath((await headers()).get("x-pathname")); } catch { content = false; } }
  let counts: Awaited<ReturnType<typeof navCountsCached>> = {};
  try { if (me) counts = await navCountsCached(repo, me.actor); } catch { counts = {}; }
  const role = String(me?.actor.role ?? "");
  // "/student/rti" in the counts = the student is in the RTI program (Tier 2/3): only then the RTI Program entry
  const items = navItemsFor(role, { rti: "/student/rti" in counts }).map((i) => ({ ...i, ...(counts[i.href] ?? {}) }));
  const staff = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"].includes(role);
  const home = HOME_BY_ROLE[role as Role] ?? "/";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const brand = (
    <a href={home} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/api/school-logo" alt="Al-Anjal Private Schools" className="h-9 w-auto" />
      <span dir="ltr" className="border-s border-slate-200 ps-3 text-[15px] font-semibold leading-tight text-brand-navy">Al-Anjal<br />English</span>
    </a>
  );
  const sideNav = items.length > 0;
  // on phones the drawer carries the extras, so the top bar keeps only the big buttons
  const drawerFooter = (
    <div className="flex flex-wrap items-center gap-2">
      {role === "STUDENT" && <ComfortToggle />}
      <LogoutButton label={t("Sign out")} />
    </div>
  );
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-navy focus:px-4 focus:py-2 focus:font-semibold focus:text-white">{t("Skip to content")}</a>
      <Suspense fallback={null}><NavProgress /></Suspense>
      <Suspense fallback={null}><SubmitFeedback /></Suspense>
      {sideNav && <SideNav items={items} brand={brand} footer={drawerFooter} />}
      <div className={sideNav ? "lg:ps-64" : ""}>
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur print:hidden">
          <div className="brand-stripe h-1" aria-hidden="true" />
          <div className="mx-auto flex max-w-7xl items-center gap-1.5 px-3 py-2 sm:gap-3 sm:px-6">
            {sideNav && <MenuButton label={t("Open the menu")} />}
            <StickyHome href={home} />
            <LangSwitch />
            {!sideNav && <span className="hidden md:block">{brand}</span>}
            <div className={`min-w-0 flex-1 ${sideNav ? "" : "hidden"}`}>{sideNav && <JumpTo items={items} people={staff} />}</div>
            {!sideNav && <div className="flex-1" />}
            <span className="hidden items-center gap-2 2xl:flex" aria-label="Accreditations">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/ncsee.png" alt="NCSEE (Tamayuz) accredited" className="h-8 w-auto" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/cognia.png" alt="Cognia School of Distinction" className="h-8 w-auto" />
            </span>
            <div className="flex items-center gap-1.5 text-sm text-slate-600 sm:gap-2">
              {staff && <span className="hidden sm:inline-flex"><PrintBox /></span>}
              {role === "STUDENT" && <span className={sideNav ? "hidden sm:inline-flex" : "inline-flex"}><ComfortToggle /></span>}
              <Suspense fallback={<span className="inline-block h-8 w-8" aria-hidden="true" />}><NotificationBell /></Suspense>
              {/* students: avatar + coins (Avatar Shop) and the favorite badge emblem (Games Part 3) instead of the initials */}
              {role === "STUDENT" && me?.actor.studentId ? (
                <Suspense fallback={<span className="inline-block h-11 w-20" aria-hidden="true" />}><RewardChip studentId={me.actor.studentId} name={name} /></Suspense>
              ) : (
                <span className="hidden items-center gap-2 ps-1 xl:flex">
                  <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white ring-2 ring-brand-teal/40">{initials || "•"}</span>
                  <span className="leading-tight"><bdi className="block max-w-[11rem] truncate font-semibold text-slate-800">{name}</bdi><span className="block text-xs text-slate-500">{ROLE_NAME[role] ? t(ROLE_NAME[role]) : ""}</span></span>
                </span>
              )}
              <span className={sideNav ? "hidden sm:block" : "block"}><LogoutButton label={t("Sign out")} /></span>
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1} {...(content ? { "data-content": "", lang: "en" } : {})} className="animate-fade-up mx-auto max-w-7xl px-4 py-7 outline-none sm:px-6 lg:px-8 print:max-w-none print:p-0">{children}</main>
      </div>
      {me && <FirstLoginTour role={role} open={needsTour(me.user, role)} />}
    </div>
  );
}
