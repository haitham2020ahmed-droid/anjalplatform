import { LogoutButton } from "./logout-button";

/** Shared page frame: school name, the signed-in person, sign out. Content area max ~72rem. */
export function AppShell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <a href="/" className="font-bold text-brand-navy">Al-Anjal English</a>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span>{name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
