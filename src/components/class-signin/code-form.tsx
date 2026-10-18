/** @jsxRuntime automatic */
/** @jsxImportSource react */

type T = (text: string, vars?: Record<string, string | number>) => string;

/**
 * 🔢 r85 printed QR: after tapping a name, the student types the 4-digit class code. A plain form post to the fixed
 * address /qr/c/signin (works without scripts). The page never knows the code: it is checked on the server.
 */
export function ClassCodeForm({ signInKey, studentId, t }: { signInKey: string; studentId: string; t: T }) {
  return (
    <form method="post" action="/qr/c/signin" className="flex flex-col gap-3">
      <input type="hidden" name="key" value={signInKey} />
      <input type="hidden" name="studentId" value={studentId} />
      <label htmlFor="class-code" className="text-lg font-semibold">{t("Type your class code")}</label>
      <input id="class-code" name="code" required autoFocus autoComplete="off" inputMode="numeric" minLength={4} maxLength={6} dir="ltr"
        className="min-h-16 rounded-2xl border-2 border-slate-300 px-4 text-center font-mono text-4xl tracking-[0.4em] focus:border-brand-teal focus:outline-none" />
      <button className="min-h-14 rounded-2xl bg-brand-navy text-lg font-bold text-white">{t("Sign in")}</button>
    </form>
  );
}
