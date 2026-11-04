import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { AutoPrint } from "@/components/plans/auto-print";
import { EmptyState } from "@/components/ui-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { printQrPanel, type PrintQrView } from "@/server/auth/class-print-qr";
import { STRIP_STEPS } from "@/lib/class-signin-strip";
import { qrPath } from "@/lib/qr";
import { getT } from "@/i18n/server";
import { makeT } from "@/i18n";

export const metadata = { title: "Print QR card" };
export const dynamic = "force-dynamic";

/**
 * 🖨 r85: the class's QR card to print (one A4 page: two identical cards to cut, for the board and the weekly plan):
 * the class name, the printable QR, "Class code: 7351" and the steps in English and Arabic. The class's own teacher only.
 */
export default async function PrintQrCardPage({ searchParams }: { searchParams: Promise<{ classId?: string; print?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  let v: PrintQrView | null = null;
  try { v = await printQrPanel(repo, actor, String(sp.classId ?? "")); } catch (e) { if (!(e instanceof ForbiddenError || (e as { status?: number })?.status === 403)) throw e; }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = (process.env.APP_URL ?? `${proto}://${host}`).replace(/\/$/, "");
  const url = v?.active && v.path ? `${base}${v.path}` : "";
  let qr: { total: number; d: string } | null = null;
  try { qr = url ? qrPath(url) : null; } catch { qr = null; }
  const en = makeT("en"), ar = makeT("ar");
  const card = (k: number) => v && qr && (
    <article key={k} className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-slate-400 bg-white p-6 text-center text-slate-900 break-inside-avoid">
      <h2 className="text-3xl font-bold text-brand-navy"><bdi>{v.className}</bdi></h2>
      <svg viewBox={`0 0 ${qr.total} ${qr.total}`} className="h-60 w-60" shapeRendering="crispEdges" role="img" aria-label={t("QR code to sign in to {name}", { name: v.className })}>
        <rect width="100%" height="100%" fill="#fff" /><path d={qr.d} fill="#000" />
      </svg>
      <p className="text-2xl font-bold">{en("Class code: {code}", { code: "" })}<span dir="ltr" className="font-mono tracking-[0.3em]">{v.code}</span></p>
      <p className="text-2xl font-bold" dir="rtl" lang="ar">{ar("Class code: {code}", { code: "" })}<span dir="ltr" className="font-mono tracking-[0.3em]">{v.code}</span></p>
      <p className="text-lg" lang="en" dir="ltr">{en(STRIP_STEPS)}</p>
      <p className="text-lg" lang="ar" dir="rtl">{ar(STRIP_STEPS)}</p>
    </article>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <PageHeader back={{ href: `/teacher/class-signin${v ? `?classId=${encodeURIComponent(v.classId)}` : ""}`, label: "Class sign-in" }} icon="🖨" title="Print QR card"
          subtitle={t("Students scan it at school or at home and tap their name. It keeps working week after week.")}><PrintButton /></PageHeader>
      </div>
      {!v && <EmptyState icon="🔒" title="Only the class's own teacher can do this." />}
      {v && !qr && <EmptyState icon="⏸" title="The printed QR is off. Students cannot sign in with it." />}
      {v && qr && <div className="grid gap-6 print:gap-10">{[0, 1].map(card)}</div>}
      {v && qr && sp.print === "1" && <AutoPrint />}
    </AppShell>
  );
}
