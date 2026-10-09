import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { DownloadBar } from "@/components/diagnostic/class-report";
import { StudentDiagnosticView } from "@/components/diagnostic/student-report";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { studentDiagnosticReport } from "@/server/diagnostic/report";
import { shareDiagnosticAction } from "@/app/diagnostic/actions";

export const metadata = { title: "Diagnostic Report" };

/** 📄 One student's Diagnostic report (staff): preview, download, and send it to the student and family with a note. */
export default async function StaffStudentReport({ params, searchParams }: { params: Promise<{ id: string; studentId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { id, studentId } = await params;
  const sp = await searchParams;
  let r;
  try { r = await studentDiagnosticReport(repo, actor, studentId, id); }
  catch (e) { if (!(e instanceof ForbiddenError)) throw e; return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">{e.message}</p></AppShell>; }
  if (!r) return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">This student has not finished the Diagnostic yet.</p></AppShell>;
  const back = `/diagnostic/${id}/student/${studentId}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/diagnostic/${id}/report`, label: "Class analysis" }} icon="📄" title="Diagnostic Report" subtitle={r.shared ? `✅ Shared with the student and family on ${r.sharedAt}` : "Not shared yet — the student and family cannot see it."}>
        <DownloadBar testId={id} studentId={studentId} /><PrintButton label="🖨 Print this page" />
      </PageHeader>
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}
      <form action={shareDiagnosticAction} className="mx-auto mb-5 flex max-w-4xl flex-wrap items-end gap-3 rounded-3xl bg-white p-4 ring-1 ring-slate-200 print:hidden">
        <input type="hidden" name="testId" value={id} /><input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="back" value={back} />
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm font-semibold text-slate-700">Note for the student and family (optional)<textarea name="note" rows={2} maxLength={1000} defaultValue={r.note ?? ""} className="rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
        {r.shared ? (
          <><button name="shared" value="1" className="rounded-xl bg-brand-navy px-4 py-2 font-bold text-white">Save note</button><button name="shared" value="0" className="rounded-xl px-4 py-2 font-semibold text-red-700 ring-1 ring-red-300">Stop sharing</button></>
        ) : <button name="shared" value="1" className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white hover:bg-emerald-700">📤 Send to the student &amp; family</button>}
      </form>
      <StudentDiagnosticView r={r} family={false} />
    </AppShell>
  );
}
