/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
import { useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";

type Who = "Student" | "Teacher" | "Admin";

/** The three tiles only change the wording (placeholder, help line, button): the real role comes from the account. */
export const SIGN_IN_ROLES: { who: Who; placeholder: string; help: string; go: string }[] = [
  { who: "Student", placeholder: "Your student username", help: "Use the username on your sign-in card.", go: "Let's go, Student!" },
  { who: "Teacher", placeholder: "Your teacher username", help: "Use the username the school gave you.", go: "Let's go, Teacher!" },
  { who: "Admin", placeholder: "Your admin username", help: "Use your school admin account.", go: "Let's go, Admin!" },
];

const icon = (w: Who): ReactNode => ({
  Student: <path d="M12 6.5C10 5 7.5 4.5 4 4.5v13c3.5 0 6 .5 8 2m0-13c2-1.5 4.5-2 8-2v13c-3.5 0-6 .5-8 2m0-13v13" />,
  Teacher: <g><rect x="3.5" y="4.5" width="17" height="11" rx="1.5" /><path d="M12 15.5v4m-4 0h8M7.5 9h5m-5 3h3" /></g>,
  Admin: <g><path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-2.5Z" /><path d="m9 12 2.2 2.2L15.5 10" /></g>,
})[w];

export function LoginForm({ error, username, next = "" }: { error: string | null; username: string; next?: string }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [who, setWho] = useState<Who>("Student");
  const role = SIGN_IN_ROLES.find((r) => r.who === who) ?? SIGN_IN_ROLES[0];
  const field = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 transition focus:border-[#2a3a8f] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2a3a8f]/15";
  return (
    <form method="post" action="/login/submit" onSubmit={() => setPending(true)} className="animate-fade-up w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl shadow-black/30 sm:p-9" aria-describedby={error ? "login-error" : undefined}>
      <div className="border-b border-slate-200 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/school-logo" alt="Al-Anjal Private Schools" className="mx-auto h-14 w-auto" />
      </div>
      <div className="mt-5 text-center">
        <h1 className="font-display text-[2rem] leading-tight text-[#1f2a5c]">{t("Welcome back!")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("Who's signing in today?")}</p>
      </div>
      <fieldset className="mt-5">
        <legend className="sr-only">{t("Who's signing in today?")}</legend>
        <div className="grid grid-cols-3 gap-2.5">
          {SIGN_IN_ROLES.map((r) => (
            <label key={r.who} className="block cursor-pointer">
              <input type="radio" name="signin-as" value={r.who} checked={who === r.who} onChange={() => setWho(r.who)} className="peer sr-only" />
              <span className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-slate-200 bg-white px-2 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 peer-checked:border-[#e9b949] peer-checked:bg-[#fff6dc] peer-checked:text-[#1f2a5c] peer-focus-visible:ring-4 peer-focus-visible:ring-[#2a3a8f]/30">
                <span aria-hidden="true" className={`grid h-9 w-9 place-items-center rounded-xl ${who === r.who ? "bg-[#f5c542] text-[#1f2a5c]" : "bg-slate-100 text-slate-500"}`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon(r.who)}</svg>
                </span>
                {t(r.who)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {next && <input type="hidden" name="next" value={next} />}
      {next.startsWith("/play") && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">🎮 {t("Sign in to join the game.")}</p>}
      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-[#1f2a5c]">{t("Username")}</span>
          <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={100} defaultValue={username} autoFocus={!username}
            placeholder={t(role.placeholder)} aria-describedby="login-help" className={`${field} mt-1`} />
          <span id="login-help" className="mt-1 block text-xs text-slate-500">{t(role.help)}</span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-[#1f2a5c]">{t("Password")}</span>
          <span className="relative mt-1 block">
            <input name="password" type={show ? "text" : "password"} autoComplete="current-password" required maxLength={128} autoFocus={Boolean(username)}
              placeholder={t("Enter your password")} onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} className={`${field} pe-20`} />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 end-2 my-auto h-9 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2a3a8f]/40" aria-label={show ? t("Hide password") : t("Show password")}>{show ? t("Hide") : t("Show")}</button>
          </span>
          {caps && <span className="mt-1 block text-xs font-semibold text-amber-700">⇪ {t("Caps Lock is on")}</span>}
        </label>
      </div>
      {error && <p id="login-error" role="alert" className="animate-shake mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      <button disabled={pending} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2a3a8f] py-3.5 text-base font-semibold text-white shadow-lg shadow-[#2a3a8f]/30 transition hover:bg-[#23317c] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#f5c542]/60 active:scale-[.99] disabled:opacity-70">
        {pending && <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {pending ? t("Signing in…") : <span>{t(role.go)} <span aria-hidden="true" className="inline-block rtl:-scale-x-100">→</span></span>}
      </button>
      <p className="mt-4 text-center text-xs text-slate-500">{t("Forgot your password? Students ask their teacher · Teachers ask the admin.")}</p>
      <p className="mt-4 border-t border-slate-100 pt-4 text-center text-xs text-slate-400"><span dir="ltr">Literise</span> · {t("Al-Anjal Private Schools")}</p>
    </form>
  );
}
