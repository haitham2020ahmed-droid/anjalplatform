"use client";
import { useEffect, useState } from "react";

export function LoginForm({ error, username, next = "" }: { error: string | null; username: string; next?: string }) {
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const field = "w-full rounded-xl border border-slate-300 bg-white py-3 ps-11 pe-3 text-base transition focus:border-brand-teal focus:outline-none focus:ring-4 focus:ring-brand-teal/20";
  // the greeting uses the device's clock, after the page is shown (no server / browser mismatch)
  const [greet, setGreet] = useState("Welcome");
  useEffect(() => { const h = new Date().getHours(); setGreet(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"); }, []);
  return (
    <form method="post" action="/login/submit" onSubmit={() => setPending(true)} className="animate-fade-up w-full max-w-md space-y-5 rounded-3xl bg-white/90 p-8 shadow-xl ring-1 ring-slate-200 backdrop-blur sm:p-10" aria-describedby={error ? "login-error" : undefined}>
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/school-logo" alt="Al-Anjal Private Schools" className="mx-auto mb-4 h-20 w-auto" />
        <p className="text-sm font-semibold tracking-wide text-brand-teal">{greet} 👋</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-brand-navy">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Students, teachers, parents and staff</p>
      </div>
      {next && <input type="hidden" name="next" value={next} />}
      {next.startsWith("/play") && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">🎮 Sign in to join the game.</p>}
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Username</span>
        <span className="relative mt-1 block">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-lg text-slate-400">👤</span>
          <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={100} defaultValue={username} autoFocus={!username} className={field} />
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Password</span>
        <span className="relative mt-1 block">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-lg text-slate-400">🔒</span>
          <input name="password" type={show ? "text" : "password"} autoComplete="current-password" required maxLength={128} autoFocus={Boolean(username)}
            onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} className={`${field} pe-20`} />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 end-2 my-auto h-8 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100" aria-label={show ? "Hide password" : "Show password"}>{show ? "🙈 Hide" : "👁 Show"}</button>
        </span>
        {caps && <span className="mt-1 block text-xs font-semibold text-amber-700">⇪ Caps Lock is on</span>}
      </label>
      {error && <p id="login-error" role="alert" className="animate-shake rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      <button disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r bg-linear-to-r from-brand-navy to-brand-purple py-3.5 text-lg font-bold text-white shadow-lg transition hover:brightness-110 active:scale-[.99] disabled:opacity-70">
        {pending && <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-xs text-slate-500">Forgot your password? Students ask their teacher · Teachers ask the admin.</p>
      <div className="flex items-center justify-center gap-3 lg:hidden" aria-label="Accreditations">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ncsee.png" alt="NCSEE (Tamayuz) accredited" className="h-9 w-auto" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/cognia.png" alt="Cognia School of Distinction" className="h-9 w-auto" />
      </div>
    </form>
  );
}
