import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { skillPlanForStudent, type StudentPlanView } from "@/server/curriculum-map/plans";
import { CERTIFICATE_CSS, certificateBody } from "@/components/print/certificate";
import { printDate } from "@/components/print/tokens";
import { getT } from "@/i18n/server";

export const metadata = { title: "Unit Certificate" };

/** 🏅 A printable certificate for a unit of my plan that I finished. */
export default async function UnitCertificate({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ unit?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { planId } = await params;
  const unit = String((await searchParams).unit ?? "");
  let p: StudentPlanView | null = null;
  try { p = await skillPlanForStudent(repo, actor, planId); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
  const parts = p?.places.filter((x) => x.unit === unit) ?? [];
  const earned = parts.length > 0 && parts.every((x) => x.status === "COMPLETED");
  const back = <Link href={`/student/plans/${planId}`} className="font-semibold text-brand-teal">← My plan</Link>;
  if (!p || !earned) return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">Finish every part of this unit to get its certificate.</p><div className="mt-4">{back}</div></AppShell>;
  const skills = [...new Set(parts.map((x) => x.label))];
  const { t, lang } = await getT();
  const school = actor.schoolId ? String((await repo.findUnique("School", { id: actor.schoolId }))?.name ?? "") : "";
  const html = certificateBody({
    lang, title: t("Certificate of Achievement"), presented: t("This certificate is proudly presented to"), forWord: t("for"),
    studentName: String(me.displayName), achievement: t("Finished every part of {unit}", { unit }), detail: `${p.className} · ${skills.slice(0, 6).join(" · ")}`,
    date: printDate(new Date()), dateLabel: t("Date"), signLabel: t("Teacher's signature"), school,
  });
  return (
    <AppShell name={String(me.displayName)}>
      <div className="mb-4 flex justify-between gap-2 print:hidden">{back}<PrintButton /></div>
      <iframe title={t("Certificate of Achievement")} srcDoc={`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${CERTIFICATE_CSS}</style></head><body style="margin:0">${html}</body></html>`} className="aspect-[297/210] w-full rounded-3xl border-0 bg-white shadow-sm ring-1 ring-slate-200 print:rounded-none print:shadow-none print:ring-0" />
    </AppShell>
  );
}
