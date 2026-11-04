import Link from "next/link";
import { TourButton, tourStepsFor } from "@/components/ui-kit";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, requireActor } from "@/server/auth/next";
import { GUIDES, GUIDE_UI, ROLE_LABEL } from "@/i18n/guides-ar";
import { GUIDES_EN, GUIDE_UI_EN, ROLE_LABEL_EN } from "@/i18n/guides-en";
import { LANG_NAMES } from "@/i18n";

export const metadata = { title: "Guide" };

/**
 * ❔ Role guides — one simple page per role, numbered steps that say where things are in the new menus. Each step
 * links to the page. Admins can open the other roles' guides (?role=TEACHER / STUDENT) to help colleagues and
 * parents.
 *
 * 🐛 fix (audit finding, Oct 2026): this page used to be Arabic-only, always, no matter the site's English/Arabic
 * toggle — it never matched the rest of the interface (English by default). It now defaults to English (guides-en.ts)
 * like every other page, with an explicit "Arabic / العربية" switch (?lang=ar) for a parent or anyone who prefers
 * Arabic — the original Arabic text (guides-ar.ts) is unchanged, just no longer forced on everyone.
 */
export default async function GuidePage({ searchParams }: { searchParams?: Promise<{ role?: string; lang?: string }> }) {
  const actor = await requireActor();
  const me = (await getActor())!.user;
  const own: keyof typeof GUIDES = actor.role === "SUPER_ADMIN" || actor.role === "SCHOOL_ADMIN" ? "SCHOOL_ADMIN" : actor.role === "TEACHER" ? "TEACHER" : "STUDENT";
  const sp = await searchParams;
  const asked = String(sp?.role ?? "") as keyof typeof GUIDES;
  // staff may read the guides of the roles they help (admin: all three; teacher: teacher and student)
  const allowed: (keyof typeof GUIDES)[] = own === "SCHOOL_ADMIN" ? ["SCHOOL_ADMIN", "TEACHER", "STUDENT"] : own === "TEACHER" ? ["TEACHER", "STUDENT"] : ["STUDENT"];
  const role = allowed.includes(asked) ? asked : own;
  const ar = sp?.lang === "ar";
  const [GSET, UI, ROLE_NAMES] = ar ? [GUIDES, GUIDE_UI, ROLE_LABEL] : [GUIDES_EN, GUIDE_UI_EN, ROLE_LABEL_EN];
  const g = GSET[role];
  const qs = (r: keyof typeof GUIDES, lang: "en" | "ar") => `/guide?role=${r}${lang === "ar" ? "&lang=ar" : ""}`;
  // 🐛 fix (audit finding, Oct 2026): the Tour button replays the first-login tour (first-login-tour.tsx), but
  // TOUR_STEPS has no entry for every role (e.g. PARENT) — clicking it then dispatched "open-tour" and nothing ever
  // appeared, since FirstLoginTour renders nothing when its role has zero steps. Rather than build a parent-specific
  // tour with no menu to point at (parent accounts get no side menu at all — see nav-items.ts), the button itself is
  // now hidden for any role with no steps, so it never again looks clickable while doing nothing.
  const hasTour = tourStepsFor(actor.role).length > 0;
  return (
    <AppShell name={String(me.displayName)}>
      <div dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"}>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-brand-navy sm:text-3xl">{g.title}</h1>
            <p className="mt-2 max-w-3xl text-lg text-slate-600">{g.intro}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Link prefetch={false} href={qs(role, ar ? "en" : "ar")} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🌐 {ar ? LANG_NAMES.en : LANG_NAMES.ar}</Link>
            {hasTour && <TourButton />}<PrintButton />
          </div>
        </header>
        {allowed.length > 1 && (
          <nav aria-label={UI.guides} className="mb-5 flex flex-wrap gap-2 print:hidden">
            {allowed.map((r) => <Link key={r} prefetch={false} href={qs(r, ar ? "ar" : "en")} aria-current={r === role ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${r === role ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`}>{ROLE_NAMES[r]}</Link>)}
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
        <p className="mt-6 text-sm text-slate-500">{g.ask} · <Link href="/privacy" className="underline">{UI.privacy}</Link></p>
      </div>
    </AppShell>
  );
}
