import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { DownloadBar } from "@/components/diagnostic/class-report";
import { StudentDiagnosticView } from "@/components/diagnostic/student-report";
import { repo, requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";
import { PreviewFrame } from "@/components/student/preview-frame";
import { studentDiagnosticReport } from "@/server/diagnostic/report";

export const metadata = { title: "My Diagnostic Report" };

/** 📄 My Diagnostic report, once my teacher shared it. */
export default async function MyDiagnosticReport({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { actor, me, preview } = await studentPage((await searchParams).preview, () => requireActor({ roles: ["STUDENT"] }));
  const r = await studentDiagnosticReport(repo, actor, actor.studentId!);
  const back = <Link href="/student/reports?view=family" className="inline-flex min-h-11 items-center font-semibold text-brand-teal">← For my family</Link>;
  if (!r) return <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}><p className="text-lg text-slate-700">Your Diagnostic report appears here when your teacher shares it.</p><div className="mt-4">{back}</div></PreviewFrame></AppShell>;
  return <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}><div className="mx-auto mb-4 flex max-w-4xl flex-wrap justify-between gap-2 print:hidden">{back}<span className="flex gap-2"><DownloadBar testId={r.testId} studentId={r.student.id} /><PrintButton label="🖨 Print this page" /></span></div><StudentDiagnosticView r={r} family /></PreviewFrame></AppShell>;
}
