import { Suspense } from "react";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { PrintBox } from "./print/print-box";
import { SubmitFeedback } from "./ui/submit-feedback";
import { ComfortToggle } from "./ui/comfort-toggle";
import { NavProgress } from "./ui/nav-progress";
import { MainNav } from "./ui/main-nav";
import { navItemsFor } from "./nav-items";
import { getActor, repo } from "@/server/auth/next";
import { navCountsCached } from "@/server/teacher/week-plan";

/** Shared page frame: brand stripe, sticky header (logo, accreditations, bell, person) with the role's main
 *  sections under it (one click between them), content that fades in. */
export async function AppShell({ name, children }: { name: string; children: React.ReactNode }) {
  const me = await getActor();   // cached for the request: no extra query
  // numbers on the icons (tasks to do; red = late or due today); never block the page on them
  let counts: Awaited<ReturnType<typeof navCountsCached>> = {};
  try { if (me) counts = await navCountsCached(repo, me.actor); } catch { counts = {}; }
  const items = navItemsFor(String(me?.actor.role ?? "")).map((i) => ({ ...i, ...(counts[i.href] ?? {}) }));
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-navy focus:px-4 focus:py-2 focus:font-semibold focus:text-white">Skip to content</a>
      <Suspense fallback={null}><NavProgress /></Suspense>
      <Suspense fallback={null}><SubmitFeedback /></Suspense>
      <div className="brand-stripe h-1.5 print:hidden" aria-hidden="true" />
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <a href="/" className="flex items-center gap-3 font-bold text-brand-navy">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/school-logo" alt="Al-Anjal Private Schools" className="h-10 w-auto" />
            <span className="hidden border-s border-slate-200 ps-3 text-lg tracking-tight sm:inline">Al-Anjal English</span>
          </a>
          <span className="hidden items-center gap-3 lg:flex" aria-label="Accreditations">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ncsee.png" alt="NCSEE (Tamayuz) accredited" className="h-9 w-auto" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/cognia.png" alt="Cognia School of Distinction" className="h-9 w-auto" />
          </span>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            {/* the bell loads alongside the page instead of holding it up */}
            {me && ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"].includes(String(me.actor.role)) && <PrintBox />}
            {me?.actor.role === "STUDENT" && <ComfortToggle />}
            <Suspense fallback={<span className="inline-block h-8 w-8" aria-hidden="true" />}><NotificationBell /></Suspense>
            <span className="hidden items-center gap-2 sm:flex">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple text-xs font-bold text-white">{initials || "•"}</span>
              <span className="max-w-[12rem] truncate font-medium text-slate-700">{name}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
        {items.length > 0 && <MainNav items={items} />}
      </header>
      <main id="main" tabIndex={-1} className="animate-fade-up mx-auto max-w-6xl px-4 py-8 outline-none sm:px-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
