import { Suspense } from "react";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";

/** Shared page frame: school name, the signed-in person, sign out. Content area max ~72rem. */
export function AppShell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <a href="/" className="flex items-center gap-3 font-bold text-brand-navy">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/school-logo" alt="Al-Anjal Private Schools" className="h-10 w-auto" />
            <span>Al-Anjal English</span>
          </a>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            {/* the bell loads alongside the page instead of holding it up */}
            <Suspense fallback={<span className="inline-block h-8 w-8" aria-hidden="true" />}><NotificationBell /></Suspense>
            <span>{name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
