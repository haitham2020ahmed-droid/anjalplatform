import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentCertificates } from "@/server/student/certificates";
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "My Certificates" };
const ICON = { LEVEL_UP: "🚀", PLAN: "🗂️", MANUAL: "🌟" } as const;

/** 📜 My Certificates: every certificate I earned (newest first), each with View (print) and PDF. Own only (server-checked). */
export default async function MyCertificatesPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { t, lang } = await getT();
  const list = await studentCertificates(repo, actor, lang);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My Work" }} icon="📜" title="My Certificates" subtitle={t("Certificates you earned. Open one to print it.")} />
      {!list.length ? <EmptyState icon="📜" title="No certificates yet" text="No certificates yet. Move up a level or finish a plan to get one!" action={{ href: "/student", label: "My Work" }} /> : (
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="my-certificates">
          {list.map((c, i) => (
            <li key={c.id} className="lift relative flex flex-col gap-3 overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 via-white to-sky-50 p-5 shadow-card ring-1 ring-amber-200">
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-300 via-brand-gold to-teal-300" />
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-3xl shadow-card ring-1 ring-amber-200">{ICON[c.kind]}</span>
                <span className="min-w-0">
                  <span className="block text-lg font-semibold text-brand-navy"><bdi>{t(c.title)}</bdi></span>
                  <span className="block text-sm text-slate-600">{c.detail ? <><bdi>{c.detail}</bdi> · </> : null}<span dir="ltr">{c.date}</span>{c.byTeacher ? <> · {t("From my teacher")}</> : null}</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={c.viewHref} target="_blank" rel="noopener" className={`${i === 0 ? BTN_PRIMARY : BTN_SECONDARY} flex-1 rounded-2xl`}>{t("View / Print")}</a>
                <a href={c.pdfHref} className={`${BTN_SECONDARY} flex-1 rounded-2xl`}>PDF</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
