import { Suspense } from "react";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { PrintBox } from "./print/print-box";
import { SubmitFeedback } from "./ui/submit-feedback";
import { ComfortToggle } from "./ui/comfort-toggle";
import { NavProgress } from "./ui/nav-progress";
import { MenuButton, SideNav } from "./ui/side-nav";
import { JumpTo } from "./ui/jump-to";
import { navItemsFor } from "./nav-items";
import { getActor, repo } from "@/server/auth/next";
import { navCountsCached } from "@/server/teacher/week-plan";

const ROLE_NAME: Record<string, string> = { TEACHER: "Teacher", SCHOOL_ADMIN: "School admin", SUPER_ADMIN: "Platform admin", STUDENT: "Student", PARENT: "Parent" };

/**
 * Shared page frame. Desktop: the role's whole map in a navy side bar (groups fold; numbers = waiting work),
 * a top bar with one search for pages, students, classes and skills, the print box, the bell and the person.
 * Phone: the same map in a drawer from the menu button.
 */
export async function AppShell({ name, children }: { name: string; children: React.ReactNode }) {
  const me = await getActor();   // cached for the request: no extra query
  let counts: Awaited<ReturnType<typeof navCountsCached>> = {};
  try { if (me) counts = await navCountsCached(repo, me.actor); } catch { counts = {}; }
  const role = String(me?.actor.role ?? "");
  const items = navItemsFor(role).map((i) => ({ ...i, ...(counts[i.href] ?? {}) }));
  const staff = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"].includes(role);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const brand = (
    <a href="/" className="flex items-center gap-3 rounded-xl bg-white px-3 py-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/api/school-logo" alt="Al-Anjal Private Schools" className="h-9 w-auto" />
      <span className="border-s border-slate-200 ps-3 text-[15px] font-semibold leading-tight text-brand-navy">Al-Anjal<br />English</span>
    </a>
  );
  const sideNav = items.length > 0;
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-navy focus:px-4 focus:py-2 focus:font-semibold focus:text-white">Skip to content</a>
      <Suspense fallback={null}><NavProgress /></Suspense>
      <Suspense fallback={null}><SubmitFeedback /></Suspense>
      {sideNav && <SideNav items={items} brand={brand} />}
      <div className={sideNav ? "lg:ps-64" : ""}>
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur print:hidden">
          <div className="brand-stripe h-1" aria-hidden="true" />
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
            {sideNav && <MenuButton />}
            {!sideNav && brand}
            <div className={`min-w-0 flex-1 ${sideNav ? "" : "hidden"}`}>{sideNav && <JumpTo items={items} people={staff} />}</div>
            <span className="hidden items-center gap-2 xl:flex" aria-label="Accreditations">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/ncsee.png" alt="NCSEE (Tamayuz) accredited" className="h-8 w-auto" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/cognia.png" alt="Cognia School of Distinction" className="h-8 w-auto" />
            </span>
            <div className="ms-auto flex items-center gap-2 text-sm text-slate-600">
              {staff && <PrintBox />}
              {role === "STUDENT" && <ComfortToggle />}
              <Suspense fallback={<span className="inline-block h-8 w-8" aria-hidden="true" />}><NotificationBell /></Suspense>
              <span className="hidden items-center gap-2 ps-1 sm:flex">
                <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white ring-2 ring-brand-teal/40">{initials || "•"}</span>
                <span className="leading-tight"><span className="block max-w-[11rem] truncate font-semibold text-slate-800">{name}</span><span className="block text-xs text-slate-500">{ROLE_NAME[role] ?? ""}</span></span>
              </span>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="animate-fade-up mx-auto max-w-7xl px-4 py-7 outline-none sm:px-6 lg:px-8 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
