import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { ParentReportView } from "@/components/insights/parent-report-view";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { parentReport } from "@/server/insights/parent-report";

export const metadata = { title: "Progress report" };

/** 👪 The report the teacher shared (parents only see it once shared). */
export default async function ParentReportForParent({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["PARENT"] });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  try {
    const r = await parentReport(repo, actor, studentId);
    return <AppShell name={String(me.displayName)}><div className="mb-4 flex justify-between gap-2 print:hidden"><Link href="/parent" className="font-semibold text-brand-teal">← My children</Link><PrintButton /></div><ParentReportView r={r} /></AppShell>;
  } catch (e) {
    if (!(e instanceof ForbiddenError)) throw e;
    return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">{e.message}</p><Link href="/parent" className="mt-4 inline-block font-semibold text-brand-teal">← My children</Link></AppShell>;
  }
}
