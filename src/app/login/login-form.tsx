/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
import { useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { SchoolLogo } from "@/components/brand/school-logo";
import { LangSwitch } from "@/components/ui-kit/lang-switch";

type Who = "Student" | "Teacher" | "Admin";

/**
 * The sign-in form: the white half of the Literise D1 card (school logo + language switch, "Welcome back!", the three
 * role tiles with line icons, username, password with Show, the main button, the forgot-password line).
 * The three tiles only change the wording (placeholder, help line, button): the real role comes from the account. */
export const SIGN_IN_ROLES: { who: Who; placeholder: string; help: string; go: string }[] = [
  { who: "Student", placeholder: "Your student username", help: "Use the username on your sign-in card.", go: "Let's go, Student!" },
  { who: "Teacher", placeholder: "Your teacher username", help: "Use the username the school gave you.", go: "Let's go, Teacher!" },
  { who: "Admin", placeholder: "Your admin username", help: "Use your school admin account.", go: "Let's go, Admin!" },
];

const icon = (w: Who): ReactNode => ({
  Student: <path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z" />,
  Teacher: <g><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></g>,
  Admin: <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />,
})[w];

export function LoginForm({ error, username, next = "" }: { error: string | null; username: string; next?: string }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [who, setWho] = useState<Who>("Student");
  const role = SIGN_IN_ROLES.find((r) => r.who === who) ?? SIGN_IN_ROLES[0];
  const field = "w-full rounded-xl border border-[#cfd4ea] bg-surface px-4 py-2.5 text-[15px] text-ink placeholder:text-muted transition focus:border-brand-navy focus:outline-none focus:ring-4 focus:ring-[#f2b705]/35";
  return (
    <form method="post" action="/login/submit" onSubmit={() => setPending(true)} className="flex w-full flex-col gap-4 px-6 py-7 sm:px-10 md:py-9" aria-describedby={error ? "login-error" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SchoolLogo size="md" />
        <LangSwitch />
      </div>
      <div className="mt-2">
        <h1 className="font-display text-[1.75rem] leading-tight text-ink">{t("Welcome back!")}</h1>
        <p className="mt-0.5 text-sm text-muted">{t("Who's signing in today?")}</p>
      </div>
      <fieldset>
        <legend className="sr-only">{t("Who's signing in today?")}</legend>
        <div className="grid grid-cols-3 gap-2.5">
          {SIGN_IN_ROLES.map((r) => (
            <label key={r.who} className="block cursor-pointer">
              <input type="radio" name="signin-as" value={r.who} checked={who === r.who} onChange={() => setWho(r.who)} className="peer sr-only" />
              <span className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface px-2 py-2.5 text-sm font-medium text-ink-2 transition hover:border-[#cfd4ea] peer-checked:border-2 peer-checked:border-brand-navy peer-checked:bg-surface-2 peer-checked:font-semibold peer-checked:text-ink peer-focus-visible:ring-4 peer-focus-visible:ring-[#f2b705]/40">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon(r.who)}</svg>
                {t(r.who)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {next && <input type="hidden" name="next" value={next} />}
      {next.startsWith("/play") && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{t("Sign in to join the game.")}</p>}
      <label className="block">
        <span className="text-sm font-semibold text-ink">{t("Username")}</span>
        <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={100} defaultValue={username} autoFocus={!username}
          placeholder={t(role.placeholder)} aria-describedby="login-help" className={`${field} mt-1.5`} />
        <span id="login-help" className="mt-1 block text-xs text-muted">{t(role.help)}</span>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-ink">{t("Password")}</span>
        <span className="relative mt-1.5 block">
          <input name="password" type={show ? "text" : "password"} autoComplete="current-password" required maxLength={128} autoFocus={Boolean(username)}
            placeholder={t("Enter your password")} onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} className={`${field} pe-20`} />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 end-2 my-auto h-8 rounded-lg px-2.5 text-xs font-semibold text-ink-2 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f2b705]/60" aria-label={show ? t("Hide password") : t("Show password")}>{show ? t("Hide") : t("Show")}</button>
        </span>
        {caps && <span className="mt-1 block text-xs font-semibold text-amber-700">⇪ {t("Caps Lock is on")}</span>}
      </label>
      {error && <p id="login-error" role="alert" className="animate-shake rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      <button disabled={pending} className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-navy text-[15px] font-semibold text-white shadow-btn transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#f2b705]/60 active:scale-[.99] disabled:opacity-70">
        {pending && <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {pending ? t("Signing in…") : <span>{t(role.go)} <span aria-hidden="true" className="inline-block rtl:-scale-x-100">→</span></span>}
      </button>
      <p className="text-center text-[13px] text-muted">{t("Forgot your password? Students ask their teacher · Teachers ask the admin.")}</p>
      <p className="border-t border-line pt-3 text-center text-xs text-muted"><span dir="ltr">Literise</span> · {t("Al-Anjal Private Schools")}</p>
    </form>
  );
}
