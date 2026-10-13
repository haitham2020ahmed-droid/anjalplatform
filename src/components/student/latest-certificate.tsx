import Link from "next/link";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { studentCertificates } from "@/server/student/certificates";
import { getT } from "@/i18n/server";
import { LineIcon } from "@/components/ui/line-icon";

/** One small line on the student home: my newest certificate, linking to My Certificates. Nothing when none. */
export async function LatestCertificate({ actor }: { actor: Actor }) {
  const { t, lang } = await getT();
  const c = (await studentCertificates(repo, actor, lang).catch(() => []))[0];
  if (!c) return null;
  return (
    <Link prefetch={false} href="/student/certificates" data-testid="latest-certificate" className="mt-3 flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4 py-2.5 ring-1 ring-slate-200/80 transition hover:ring-brand-teal/60">
      <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200/70"><LineIcon name="award" className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-medium text-slate-500">{t("My Certificates")}</span><span className="block truncate font-semibold text-brand-navy"><bdi>{t(c.title)}</bdi></span></span>
      <span className="shrink-0 text-sm font-semibold text-brand-navy">{t("See all")} <span aria-hidden="true" className="inline-block rtl:rotate-180">›</span></span>
    </Link>
  );
}
