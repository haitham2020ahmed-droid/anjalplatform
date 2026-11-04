import Link from "next/link";
import { headers } from "next/headers";
import { ClassSignInFrame } from "@/components/class-signin/frame";
import { NameList } from "@/components/class-signin/name-list";
import { clientIp } from "@/server/auth/http";
import { repo } from "@/server/auth/next";
import { ClassSignInError, classSignInNames } from "@/server/auth/class-signin";
import { getT } from "@/i18n/server";

export const metadata = { title: "Class sign-in", robots: { index: false, follow: false }, referrer: "same-origin" as const };
export const dynamic = "force-dynamic";

/** The messages a failed tap comes back with (?e=…). */
const ERRORS: Record<string, string> = {
  ENDED: "This QR code has ended. Ask your teacher to show it again.",
  TAKEN: "This name has already signed in. Ask your teacher.",
  NOT_IN_CLASS: "This name is not in this class.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  RETRY: "Please try again.",
};

/**
 * 📋 Class sign-in, the student's side (r76): the QR's link (or the short code) → the names of THAT class still to
 * sign in, as big buttons (sorted; a search box for long lists). Tap your name → you are in (no password).
 */
export default async function ClassNamesPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ e?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const { t } = await getT();
  let data: Awaited<ReturnType<typeof classSignInNames>> = null;
  let limited = false;
  try { data = await classSignInNames(repo, decodeURIComponent(key).slice(0, 100), { ip: clientIp(await headers()) }); }
  catch (e) { if (e instanceof ClassSignInError) limited = true; else throw e; }
  if (!data) {
    return (
      <ClassSignInFrame title={t("Class sign-in")}>
        <p role="alert" className="text-lg">{t(limited ? ERRORS.RATE_LIMITED : ERRORS.ENDED)}</p>
        <p className="mt-6 flex flex-wrap gap-3">
          <Link prefetch={false} href="/qr" className="inline-flex min-h-12 items-center rounded-2xl bg-brand-navy px-5 font-semibold text-white">{t("Type a code")}</Link>
          <Link prefetch={false} href="/login" className="inline-flex min-h-12 items-center rounded-2xl px-5 font-semibold text-brand-navy ring-1 ring-line">{t("Sign in")}</Link>
        </p>
      </ClassSignInFrame>
    );
  }
  const error = sp.e && ERRORS[sp.e] ? t(ERRORS[sp.e]) : null;
  return (
    <ClassSignInFrame title={data.className} sub={t("Tap your name.")}>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-800">{error}</p>}
      {data.names.length === 0
        ? <p className="text-lg">{t("Everyone in this class has signed in.")}</p>
        : <NameList names={data.names} signInKey={decodeURIComponent(key).slice(0, 100)} />}
    </ClassSignInFrame>
  );
}
