"use client";
import { useState } from "react";

export function LoginForm({ error, username, next = "" }: { error: string | null; username: string; next?: string }) {
  const [pending, setPending] = useState(false);
  const field = "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30";
  return (
    <form method="post" action="/login/submit" onSubmit={() => setPending(true)} className="animate-fade-up w-full max-w-sm space-y-5 rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200" aria-describedby={error ? "login-error" : undefined}>
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/school-logo" alt="Al-Anjal Private Schools" className="mx-auto mb-3 w-full max-w-xs" />
        <div className="mb-4 flex items-center justify-center gap-4" aria-label="Accreditations">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ncsee.png" alt="NCSEE (Tamayuz) accredited" className="h-12 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/cognia.png" alt="Cognia School of Distinction" className="h-12 w-auto" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-brand-teal">Al-Anjal English</p>
        <h1 className="mt-1 text-2xl font-extrabold text-brand-navy">Sign in</h1>
      </div>
      {next && <input type="hidden" name="next" value={next} />}
      {next.startsWith("/play") && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">🎮 Sign in to join the game.</p>}
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Username</span>
        <input name="username" autoComplete="username" required maxLength={100} defaultValue={username} autoFocus={!username} className={field} />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input name="password" type="password" autoComplete="current-password" required maxLength={128} autoFocus={Boolean(username)} className={field} />
      </label>
      {error && <p id="login-error" role="alert" className="animate-shake rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-brand-navy py-3 font-bold text-white transition hover:bg-brand-purple disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-xs text-slate-500">Forgot your password? Ask your teacher.</p>
    </form>
  );
}
