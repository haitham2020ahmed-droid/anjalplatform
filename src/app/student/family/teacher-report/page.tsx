import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { ParentReportView } from "@/components/insights/parent-report-view";
import { repo, requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";
import { PreviewFrame } from "@/components/student/preview-frame";
import { ForbiddenError } from "@/server/auth/rbac";
import { parentReport } from "@/server/insights/parent-report";

export const metadata = { title: "Report from My Teacher" };

/** 📄 The report my teacher shared with my family (the same one my parents see). */
export default async function MyTeacherReport({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { actor, me, preview } = await studentPage((await searchParams).preview, () => requireActor({ roles: ["STUDENT"] }));
  const back = <Link href="/student/reports?view=family" className="inline-flex min-h-11 items-center font-semibold text-brand-teal">← For my family</Link>;
  try {
    const r = await parentReport(repo, actor, actor.studentId!);
    return <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}><div className="mb-4 flex justify-between gap-2 print:hidden">{back}<PrintButton /></div><ParentReportView r={r} /></PreviewFrame></AppShell>;
  } catch (e) {
    if (!(e instanceof ForbiddenError)) throw e;
    return <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}><p className="text-lg text-slate-700">{e.message}</p><div className="mt-4">{back}</div></PreviewFrame></AppShell>;
  }
}
