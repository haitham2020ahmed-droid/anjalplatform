import type { ReactNode } from "react";
import { LangSwitch } from "@/components/ui-kit/lang-switch";

/** The student's Class sign-in pages (r76): one calm card, phone first, with the English | Arabic switch. */
export function ClassSignInFrame({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-screen justify-center bg-page px-4 py-6 sm:py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="font-semibold text-brand-navy">Literise</p>
          <LangSwitch />
        </div>
        <div className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line sm:p-8">
          <h1 className="text-3xl font-bold text-ink"><bdi>{title}</bdi></h1>
          {sub && <div className="mt-1 text-muted">{sub}</div>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </main>
  );
}
