import Link from "next/link";
import { headers } from "next/headers";
import { ClassSignInFrame } from "@/components/class-signin/frame";
import { NameList } from "@/components/class-signin/name-list";
import { clientIp } from "@/server/auth/http";
import { repo } from "@/server/auth/next";
import { PrintQrError, printQrNames } from "@/server/auth/class-print-qr";
import { getT } from "@/i18n/server";

// r77: same-origin referrers (never "no-referrer": browsers would send Origin: null and the sign-in would be blocked)
export const metadata = { title: "Class sign-in", robots: { index: false, follow: false }, referrer: "same-origin" as const };
export const dynamic = "force-dynamic";

/** The messages a failed sign-in comes back with (?e=…). */
const ERRORS: Record<string, string> = {
  OFF: "This QR code does not work now. Ask your teacher.",
  NOT_IN_CLASS: "This name is not in this class.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  RETRY: "Please try again.",
};

/**
 * 🖨 The class's PRINTED QR (r85, weekly plan sheet): the class's names as big buttons → tap your name → you're in.
 * Works at school and at home.
 * 🔁 fix (Oct 2026, "الكود مالوش داعي... اي حد ممكن يستخدمه"): used to ask for the 4-digit class code after the
 * tap — dropped (owner: the code was printed on the very same sheet as the QR, so it added a step without adding
 * real protection; a tapped name now signs in the same way the board QR already does).
 */
export default async function PrintedQrPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const token = decodeURIComponent((await params).token).slice(0, 100);
  const sp = await searchParams;
  const { t } = await getT();
  const ip = clientIp(await headers());
  const error = sp.e && ERRORS[sp.e] ? t(ERRORS[sp.e]) : null;
  let limited = false;
  try {
    const data = await printQrNames(repo, token, { ip });
    if (data) {
      return (
        <ClassSignInFrame title={data.className} sub={t("Tap your name.")}>
          {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-800">{error}</p>}
          {data.names.length === 0 ? <p className="text-lg">{t("No students in this class yet")}</p> : <NameList names={data.names} signInKey={token} signInPath="/qr/c/signin" />}
        </ClassSignInFrame>
      );
    }
  } catch (e) { if (e instanceof PrintQrError) limited = true; else throw e; }
  return (
    <ClassSignInFrame title={t("Class sign-in")}>
      <p role="alert" className="text-lg">{t(limited ? ERRORS.RATE_LIMITED : ERRORS.OFF)}</p>
      <p className="mt-6 flex flex-wrap gap-3">
        <Link prefetch={false} href="/login" className="inline-flex min-h-12 items-center rounded-2xl bg-brand-navy px-5 font-semibold text-white">{t("Sign in")}</Link>
      </p>
    </ClassSignInFrame>
  );
}
