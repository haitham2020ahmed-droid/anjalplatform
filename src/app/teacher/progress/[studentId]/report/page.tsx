import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { ParentReportView } from "@/components/insights/parent-report-view";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { parentReport } from "@/server/insights/parent-report";
import { shareReportAction } from "./actions";

export const metadata = { title: "Parent report" };

/** 👪 The parent report: preview, PDF, and share with the parent when the teacher decides. */
export default async function ParentReportPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  const sp = await searchParams;
  const r = await parentReport(repo, actor, studentId);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/progress/${studentId}`, label: r.name }} icon="👪" title="Parent Report" subtitle={r.share.shared ? `✅ Shared with the parent on ${r.share.sharedAt?.slice(0, 10)}.` : "Not shared yet. The parent sees it only after you share it."}><PrintButton /></PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}
      {actor.role === "TEACHER" && (
        <form action={shareReportAction} className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 print:hidden">
          <input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="shared" value={r.share.shared ? "0" : "1"} />
          {!r.share.shared && <label className="flex min-w-[18rem] flex-1 flex-col text-sm font-semibold text-slate-700">A short note to the parent (optional)<input name="note" maxLength={1000} defaultValue={r.share.note ?? ""} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>}
          <button className={`rounded-xl px-5 py-2.5 font-semibold text-white ${r.share.shared ? "bg-slate-600 hover:bg-slate-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>{r.share.shared ? "Stop sharing" : "👪 Share with the parent"}</button>
        </form>
      )}
      <ParentReportView r={r} />
    </AppShell>
  );
}
