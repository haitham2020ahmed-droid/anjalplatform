"use client";
import { useActionState } from "react";
import { changePasswordAction } from "./actions";

const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30";

export default function ChangePasswordPage() {
  const [state, action, pending] = useActionState(changePasswordAction, {});
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-brand-navy">Choose a New Password</h1>
        <p className="text-sm text-slate-600">At least 10 characters, with letters and at least one number.</p>
        <label className="block"><span className="text-sm font-medium">Current or temporary password</span>
          <input name="current" type="password" autoComplete="current-password" required className={field} /></label>
        <label className="block"><span className="text-sm font-medium">New password</span>
          <input name="next" type="password" autoComplete="new-password" required minLength={10} className={field} /></label>
        <label className="block"><span className="text-sm font-medium">Repeat new password</span>
          <input name="confirm" type="password" autoComplete="new-password" required minLength={10} className={field} /></label>
        {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <button disabled={pending} className="w-full rounded-lg bg-brand-navy py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">
          {pending ? "Saving…" : "Save password"}
        </button>
      </form>
    </main>
  );
}
