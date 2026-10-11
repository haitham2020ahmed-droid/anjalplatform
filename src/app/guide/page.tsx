import Link from "next/link";
import { TourButton } from "@/components/ui-kit";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, requireActor } from "@/server/auth/next";
import { GUIDES, GUIDE_UI, ROLE_LABEL } from "@/i18n/guides-ar";

export const metadata = { title: "Guide" };

/**
 * ❔ Role guides — one simple page per role, written in ARABIC on purpose (a help page for staff and parents; the rest
 * of the interface stays English). Numbered steps that say where things are in the new menus. Each step links to
 * the page. Admins can open the other roles' guides (?role=TEACHER / STUDENT) to help colleagues and parents.
 * The Arabic text lives in src/i18n/guides-ar.ts.
 */
export default async function GuidePage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const actor = await requireActor();
  const me = (await getActor())!.user;
  const own: keyof typeof GUIDES = actor.role === "SUPER_ADMIN" || actor.role === "SCHOOL_ADMIN" ? "SCHOOL_ADMIN" : actor.role === "TEACHER" ? "TEACHER" : "STUDENT";
  const asked = String((await searchParams)?.role ?? "") as keyof typeof GUIDES;
  // staff may read the guides of the roles they help (admin: all three; teacher: teacher and student)
  const allowed: (keyof typeof GUIDES)[] = own === "SCHOOL_ADMIN" ? ["SCHOOL_ADMIN", "TEACHER", "STUDENT"] : own === "TEACHER" ? ["TEACHER", "STUDENT"] : ["STUDENT"];
  const role = allowed.includes(asked) ? asked : own;
  const g = GUIDES[role];
  return (
    <AppShell name={String(me.displayName)}>
      <div dir="rtl" lang="ar">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-brand-navy sm:text-3xl">{g.title}</h1>
            <p className="mt-2 max-w-3xl text-lg text-slate-600">{g.intro}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden"><TourButton /><PrintButton /></div>
        </header>
        {allowed.length > 1 && (
          <nav aria-label={GUIDE_UI.guides} className="mb-5 flex flex-wrap gap-2 print:hidden">
            {allowed.map((r) => <Link key={r} prefetch={false} href={`/guide?role=${r}`} aria-current={r === role ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${r === role ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`}>{ROLE_LABEL[r]}</Link>)}
          </nav>
        )}
        <ol className="space-y-3">
          {g.steps.map((s, i) => (
            <li key={s.title} className="break-inside-avoid">
              <Link prefetch={false} href={s.href} className="lift flex gap-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200 hover:ring-brand-teal">
                <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-xl font-semibold text-teal-800" dir="ltr">{i + 1}</span>
                <span>
                  <span className="block text-lg font-semibold text-brand-navy">{s.title}</span>
                  <span className="block text-sm font-semibold text-brand-teal">{s.where}</span>
                  <span className="mt-1 block text-slate-700">{s.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-slate-500">{g.ask} · <Link href="/privacy" className="underline">{GUIDE_UI.privacy}</Link></p>
      </div>
    </AppShell>
  );
}
