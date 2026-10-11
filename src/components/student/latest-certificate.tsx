import Link from "next/link";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { studentCertificates } from "@/server/student/certificates";
import { getT } from "@/i18n/server";

/** 📜 One small line on the student home: my newest certificate, linking to My Certificates. Nothing when none. */
export async function LatestCertificate({ actor }: { actor: Actor }) {
  const { t, lang } = await getT();
  const c = (await studentCertificates(repo, actor, lang).catch(() => []))[0];
  if (!c) return null;
  return (
    <Link prefetch={false} href="/student/certificates" data-testid="latest-certificate" className="lift mt-4 flex min-h-14 items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
      <span aria-hidden="true" className="text-2xl">📜</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-amber-900">{t("My Certificates")}</span><span className="block truncate font-semibold text-brand-navy"><bdi>{t(c.title)}</bdi></span></span>
      <span className="shrink-0 text-sm font-semibold text-brand-navy">{t("See all")} ›</span>
    </Link>
  );
}
