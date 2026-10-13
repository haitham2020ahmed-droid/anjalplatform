import { LoginForm } from "./login-form";
import { LoginHero } from "./login-hero";
import { getT } from "@/i18n/server";

export const metadata = { title: "Sign in" };

/**
 * Sign-in page (Literise D1 "Mashrabiya light"): one centred card on a very light 8-point-star pattern — the navy half
 * (Literise, "Read today. Rise tomorrow.", rising bars) and the white half with the form. Phones: the navy half is a
 * short band above the form. The form posts to /login/submit (a fixed address that survives deployments); the role
 * tiles only change the wording: the real role always comes from the account.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; u?: string; next?: string }> }) {
  const sp = await searchParams;
  const { t } = await getT();
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page px-3 py-6 sm:px-6 sm:py-10">
      {/* the mashrabiya pattern (8-point star), faded towards the card; still (no motion) */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" style={{ color: "var(--lr-pattern)" }}>
        <defs>
          <pattern id="lr-mashrabiya" width="96" height="96" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M48 8 L60 36 L88 48 L60 60 L48 88 L36 60 L8 48 L36 36 Z" />
              <path d="M20 20 L76 20 L76 76 L20 76 Z" transform="rotate(45 48 48)" />
              <circle cx="48" cy="48" r="9" />
            </g>
          </pattern>
          <radialGradient id="lr-fade" cx="50%" cy="50%" r="62%">
            <stop offset="38%" style={{ stopColor: "var(--lr-bg)", stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: "var(--lr-bg)", stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#lr-mashrabiya)" />
        <rect width="100%" height="100%" fill="url(#lr-fade)" />
      </svg>
      <div className="animate-fade-up relative flex w-full max-w-[980px] flex-col overflow-hidden rounded-[1.75rem] bg-surface shadow-[0_30px_60px_-30px_rgb(35_42_110/.35),0_0_0_1px_rgb(35_42_110/.06)] md:flex-row">
        <LoginHero t={t} />
        <div className="min-w-0 flex-1">
          <LoginForm error={sp.error ? String(sp.error).slice(0, 200) : null} username={sp.u ? String(sp.u).slice(0, 100) : ""} next={sp.next ? String(sp.next).slice(0, 300) : ""} />
        </div>
      </div>
    </main>
  );
}
