import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const FEATURES = [
  ["🎯", "Practice that adapts", "Every answer chooses the next question: never too easy, never too hard."],
  ["🗺️", "Ready for MAP Growth", "Goal areas, RIT bands, personal plans and a practice test."],
  ["⭐", "Reading at my level", "Leveled articles, a dictionary at a click, my word notebook."],
] as const;

/** Sign-in page. The form posts to /login/submit (a fixed address that survives deployments). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; u?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* brand side */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br bg-linear-to-br from-brand-navy via-[#2b3f8f] to-brand-purple p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-teal/30 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-brand-gold/20 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Al-Anjal Private Schools</p>
          <h2 className="mt-3 text-5xl font-extrabold leading-tight tracking-tight">Al-Anjal<br />English</h2>
          <p className="mt-4 max-w-md text-lg text-white/85">The adaptive English platform for Grades 4–6: practice, reading and MAP preparation in one place.</p>
        </div>
        <ul className="relative mt-10 space-y-4">
          {FEATURES.map(([icon, title, text], i) => (
            <li key={title} className="animate-fade-up flex items-start gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur" style={{ animationDelay: `${120 + i * 90}ms` }}>
              <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15 text-2xl">{icon}</span>
              <span><span className="block font-bold">{title}</span><span className="block text-sm text-white/80">{text}</span></span>
            </li>
          ))}
        </ul>
        <div className="relative mt-10 flex items-center gap-4 rounded-2xl bg-white/95 px-5 py-3 text-xs text-slate-600 shadow-lg" aria-label="Accreditations">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ncsee.png" alt="NCSEE (Tamayuz) accredited" className="h-10 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/cognia.png" alt="Cognia School of Distinction" className="h-10 w-auto" />
          <span>Accredited · NCSEE (Tamayuz) · Cognia School of Distinction</span>
        </div>
      </section>
      {/* form side */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <LoginForm error={sp.error ? String(sp.error).slice(0, 200) : null} username={sp.u ? String(sp.u).slice(0, 100) : ""} next={sp.next ? String(sp.next).slice(0, 300) : ""} />
      </section>
    </main>
  );
}
