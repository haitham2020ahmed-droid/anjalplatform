import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ActionForm } from "@/components/admin/action-form";
import { card } from "@/components/admin/styles";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { getImportJob, type ImportJobView } from "@/server/admin/question-import";
import { schoolOf } from "@/server/admin/users";
import { editorOptions } from "../../editor-data";
import { cancelImportAction } from "../../../actions";
import { ImportPreview } from "./preview";

export default async function ImportJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const actor = await requireActor({ permission: "questions:edit" });
  const me = (await getActor())!.user;
  const { jobId } = await params;
  let job: ImportJobView;
  try { job = await getImportJob(repo, actor, jobId); } catch { notFound(); }
  const { skills, standards } = await editorOptions(repo, schoolOf(actor));
  const done = job.summary;
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/admin/questions/import" className="text-brand-teal hover:underline">← Import questions</Link></p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-navy">{job.fileName}</h1>
        {job.status === "AWAITING_CONFIRMATION" && (
          <ActionForm action={cancelImportAction} submit="Cancel this import" danger><input type="hidden" name="jobId" value={job.id} /></ActionForm>
        )}
      </div>
      <section className={card}>
        <p className="text-sm text-slate-600">
          {job.kind.toUpperCase()} file · uploaded {job.createdAt.slice(0, 10)} by {job.uploadedBy}
          {job.options.aiUsed ? " · AI helped read and map the questions" : ""}
          {job.options.redactions ? ` · ${job.options.redactions} personal detail(s) removed before AI` : ""}
          {job.options.notes?.length ? ` · ${job.options.notes.join("; ")}` : ""}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {[["Questions found", job.totals.total, "text-brand-navy"], ["Ready", job.totals.valid, "text-brand-teal"], ["With errors", job.totals.invalid, "text-red-700"], ["Possible duplicates", job.totals.duplicates, "text-amber-800"]].map(([l, v, c]) => (
            <div key={String(l)} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{l}</p><p className={`text-2xl font-bold ${c}`}>{v}</p></div>
          ))}
        </div>
        {done && <p className="mt-3 font-semibold text-brand-navy">Result: {done.imported} imported · {done.replaced} replaced · {done.skipped} skipped · {done.failed} failed. <Link className="text-brand-teal hover:underline" href="/admin/questions?status=DRAFT">Review the new drafts →</Link></p>}
        {job.status === "CANCELLED" && <p className="mt-3 text-slate-600">This import was cancelled. Nothing was added.</p>}
      </section>
      <div className="mt-6"><ImportPreview job={job} skills={skills} standards={standards} canPublish={can(actor, "questions:publish")} /></div>
    </AppShell>
  );
}
