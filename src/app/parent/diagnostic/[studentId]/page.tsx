import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { DownloadBar } from "@/components/diagnostic/class-report";
import { StudentDiagnosticView } from "@/components/diagnostic/student-report";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { studentDiagnosticReport } from "@/server/diagnostic/report";

export const metadata = { title: "Diagnostic Report" };

/** 📄 My child's Diagnostic report, once the teacher shared it. */
export default async function ParentDiagnostic({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["PARENT"] });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  const back = <Link href="/parent" className="font-semibold text-brand-teal">← My children</Link>;
  let r = null;
  try { r = await studentDiagnosticReport(repo, actor, studentId); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
  if (!r) return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">The Diagnostic report appears here when the teacher shares it.</p><div className="mt-4">{back}</div></AppShell>;
  return <AppShell name={String(me.displayName)}><div className="mx-auto mb-4 flex max-w-4xl flex-wrap justify-between gap-2 print:hidden">{back}<span className="flex gap-2"><DownloadBar testId={r.testId} studentId={r.student.id} /><PrintButton label="🖨 Print this page" /></span></div><StudentDiagnosticView r={r} family /></AppShell>;
}
