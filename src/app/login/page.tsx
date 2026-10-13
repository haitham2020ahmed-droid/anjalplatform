import { LoginForm } from "./login-form";
import { LoginHero } from "./login-hero";
import { LangSwitch } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "Sign in" };

/**
 * Sign-in page (Literise). Deep-navy brand side (logo, "Every reader rises.", rising bars) and a white card with the
 * form. The form posts to /login/submit (a fixed address that survives deployments); the role tiles on the card
 * only change the wording: the real role always comes from the account.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; u?: string; next?: string }> }) {
  const sp = await searchParams;
  const { t } = await getT();
  return (
    <main className="relative min-h-screen bg-[#161b4f] lg:grid lg:grid-cols-[1.15fr_1fr]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(70%_60%_at_15%_10%,rgb(91_63_160/.35),transparent_70%),radial-gradient(60%_50%_at_90%_90%,rgb(31_163_163/.18),transparent_70%)]" />
      {/* the language switch for parents sits at the top, as on every page */}
      <div className="absolute end-4 top-4 z-10 rounded-xl bg-white/95 shadow-sm"><LangSwitch /></div>
      <LoginHero t={t} />
      <section className="relative flex items-start justify-center px-4 pb-10 sm:px-8 lg:min-h-screen lg:items-center lg:py-10">
        <LoginForm error={sp.error ? String(sp.error).slice(0, 200) : null} username={sp.u ? String(sp.u).slice(0, 100) : ""} next={sp.next ? String(sp.next).slice(0, 300) : ""} />
      </section>
    </main>
  );
}
