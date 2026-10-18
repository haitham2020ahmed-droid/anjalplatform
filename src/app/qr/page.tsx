import { redirect } from "next/navigation";
import { ClassSignInFrame } from "@/components/class-signin/frame";
import { cleanCode } from "@/server/auth/class-signin";
import { getT } from "@/i18n/server";

export const metadata = { title: "Class sign-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** 📱 Class sign-in without a camera (r76): type the short code shown on the teacher's screen. */
export default async function ClassCodePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const sp = await searchParams;
  const { t } = await getT();
  const typed = sp.code !== undefined;
  const code = typed ? cleanCode(sp.code) : null;
  if (code) redirect(`/qr/${code}`);
  return (
    <ClassSignInFrame title={t("Class sign-in")}>
      <form method="get" action="/qr" className="flex flex-col gap-3">
        <label htmlFor="qr-code" className="text-lg font-semibold">{t("Type the code on your teacher's screen")}</label>
        <input id="qr-code" name="code" required autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} dir="ltr"
          className="min-h-14 rounded-2xl border-2 border-slate-300 px-4 text-center font-mono text-3xl uppercase tracking-[0.3em] focus:border-brand-teal focus:outline-none" />
        {typed && <p role="alert" className="text-sm font-semibold text-red-700">{t("That code is not right. Check it and try again.")}</p>}
        <button className="min-h-14 rounded-2xl bg-brand-navy text-lg font-bold text-white">{t("Next")}</button>
      </form>
    </ClassSignInFrame>
  );
}
