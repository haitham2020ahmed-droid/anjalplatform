import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { ClassDiagnosticView, DownloadBar } from "@/components/diagnostic/class-report";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { classDiagnosticReport } from "@/server/diagnostic/report";

export const metadata = { title: "Diagnostic Analysis" };

/** 📊 The Diagnostic analysis of a class (teachers) or of the whole grade (admins). Preview, PDF, Excel, CSV, share. */
export default async function DiagnosticReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { id } = await params;
  const sp = await searchParams;
  let r;
  try { r = await classDiagnosticReport(repo, actor, id, sp.classId || null); }
  catch (e) { if (!(e instanceof ForbiddenError)) throw e; return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">{e.message}</p></AppShell>; }
  const back = `/diagnostic/${id}/report${r.classId ? `?classId=${r.classId}` : ""}`;
  const isTeacher = actor.role === "TEACHER";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: isTeacher ? "/teacher/diagnostic" : "/admin/diagnostic", label: "Diagnostic Test" }} icon="📊" title={`${r.title}`} subtitle={`Analysis · ${r.scope} · ${r.summary.assessed} of ${r.summary.roster} students assessed`}>
        <DownloadBar testId={id} classId={r.classId} /><PrintButton label="🖨 Print this page" />
      </PageHeader>
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}
      <nav aria-label="Classes" className="mb-5 flex flex-wrap gap-2 print:hidden">
        {!isTeacher && <Link href={`/diagnostic/${id}/report`} aria-current={!r.classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${!r.classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>All classes</Link>}
        {r.classes.map((c) => <Link key={c.id} href={`/diagnostic/${id}/report?classId=${c.id}`} aria-current={r.classId === c.id ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${r.classId === c.id ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{c.name}</Link>)}
      </nav>
      <ClassDiagnosticView r={r} canShare back={back} />
    </AppShell>
  );
}
