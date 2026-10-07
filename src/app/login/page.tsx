"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={action} className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200" aria-describedby="login-error">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/school-logo" alt="Al-Anjal Private Schools" className="mx-auto mb-3 w-full max-w-xs" />
          <div className="mb-4 flex items-center justify-center gap-4" aria-label="Accreditations">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ncsee.png" alt="NCSEE (Tamayuz) accredited" className="h-12 w-auto" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/cognia.png" alt="Cognia School of Distinction" className="h-12 w-auto" />
          </div>
          <p className="text-sm font-semibold tracking-wide text-brand-teal">Al-Anjal Private Schools</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-navy">Sign in</h1>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Username</span>
          <input name="username" autoComplete="username" required maxLength={100}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input name="password" type="password" autoComplete="current-password" required maxLength={128}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30" />
        </label>
        {state.error && <p id="login-error" role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <button disabled={pending} className="w-full rounded-lg bg-brand-navy py-2.5 font-semibold text-white transition hover:bg-brand-purple disabled:opacity-60">
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-xs text-slate-500">Forgot your password? Ask your teacher.</p>
      </form>
    </main>
  );
}
