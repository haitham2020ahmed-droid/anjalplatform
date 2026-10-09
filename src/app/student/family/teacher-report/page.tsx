import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { ParentReportView } from "@/components/insights/parent-report-view";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { parentReport } from "@/server/insights/parent-report";

export const metadata = { title: "Report from My Teacher" };

/** 📄 The report my teacher shared with my family (the same one my parents see). */
export default async function MyTeacherReport() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const back = <Link href="/student/family" className="font-semibold text-brand-teal">← Family Report</Link>;
  try {
    const r = await parentReport(repo, actor, actor.studentId!);
    return <AppShell name={String(me.displayName)}><div className="mb-4 flex justify-between gap-2 print:hidden">{back}<PrintButton /></div><ParentReportView r={r} /></AppShell>;
  } catch (e) {
    if (!(e instanceof ForbiddenError)) throw e;
    return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">{e.message}</p><div className="mt-4">{back}</div></AppShell>;
  }
}
