import { Suspense } from "react";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";

/** Shared page frame: brand stripe, sticky header (logo, accreditations, bell, person), content that fades in. */
export function AppShell({ name, children }: { name: string; children: React.ReactNode }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <div className="min-h-screen">
      <div className="brand-stripe h-1.5" aria-hidden="true" />
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
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
            <Suspense fallback={<span className="inline-block h-8 w-8" aria-hidden="true" />}><NotificationBell /></Suspense>
            <span className="hidden items-center gap-2 sm:flex">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple text-xs font-bold text-white">{initials || "•"}</span>
              <span className="max-w-[12rem] truncate font-medium text-slate-700">{name}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="animate-fade-up mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
