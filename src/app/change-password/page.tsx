"use client";
import { useActionState } from "react";
import { changePasswordAction } from "./actions";
import { LangSwitch } from "@/components/ui-kit";
import { useT } from "@/i18n/client";

const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30";

export default function ChangePasswordPage() {
  const t = useT();
  const [state, action, pending] = useActionState(changePasswordAction, {});
  return (
    <main className="relative flex min-h-screen items-center justify-center p-6 pt-20">
      <div className="absolute end-4 top-4"><LangSwitch /></div>
      <form action={action} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-brand-navy">{t("Choose a New Password")}</h1>
        <p className="text-sm text-slate-600">{t("At least 10 characters, with letters and at least one number.")}</p>
        <label className="block"><span className="text-sm font-medium">{t("Current or temporary password")}</span>
          <input name="current" type="password" autoComplete="current-password" required className={field} /></label>
        <label className="block"><span className="text-sm font-medium">{t("New password")}</span>
          <input name="next" type="password" autoComplete="new-password" required minLength={10} className={field} /></label>
        <label className="block"><span className="text-sm font-medium">{t("Repeat new password")}</span>
          <input name="confirm" type="password" autoComplete="new-password" required minLength={10} className={field} /></label>
        {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <button disabled={pending} className="min-h-11 w-full rounded-xl bg-brand-navy py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">
          {pending ? t("Saving…") : t("Save password")}
        </button>
      </form>
    </main>
  );
}
