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
import { archiveImportAction, cancelImportAction } from "../../../actions";
import { ImportPreview } from "./preview";

export default async function ImportJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const actor = await requireActor({ permission: "questions:edit" });
  const me = (await getActor())!.user;
  const { jobId } = await params;
  let job: ImportJobView;
  try { job = await getImportJob(repo, actor, jobId); } catch { notFound(); }
  const { skills, standards } = await editorOptions(repo, schoolOf(actor));
  const done = job.summary;
  const problems = job.rows.some((r) => r.errors.length || r.warnings.length) || job.errors.length > 0;
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
          {job.kind === "xlsx" ? "Excel" : job.kind === "csv" ? "CSV" : "Unknown"} file, uploaded {job.createdAt.slice(0, 10)} by {job.uploadedBy}.
          {job.options.notes?.length ? ` ${job.options.notes.map((n) => n.charAt(0).toUpperCase() + n.slice(1)).join(". ")}.` : ""}
        </p>

        {job.status === "FAILED" ? (
          <div role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">
            <p className="font-semibold">This file could not be imported. Nothing was added to the question bank.</p>
            <ul className="mt-2 list-disc space-y-0.5 ps-5 text-sm">{job.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            <p className="mt-2 text-sm">Fix the file and <Link className="underline" href="/admin/questions/import">upload it again</Link>.</p>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {([["Rows read", job.totals.total, "text-brand-navy"], ["Ready to import", job.totals.valid, "text-brand-teal"], ["With errors", job.totals.invalid, "text-red-700"], ["Already in the bank or repeated", job.totals.duplicates, "text-amber-800"]] as const).map(([l, v, c]) => (
              <div key={l} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{l}</p><p className={`text-2xl font-bold ${c}`}>{v}</p></div>
            ))}
          </div>
        )}
        {problems && <p className="mt-3 text-sm"><a className="font-semibold text-brand-teal hover:underline" href={`/api/question-imports/${job.id}/problems`}>Download the list of problems (CSV, by row number)</a> to fix them in your file.</p>}
        {done && (
          <p className="mt-3 font-semibold text-brand-navy">
            Result: {done.imported} imported, {done.replaced} replaced, {done.skipped} skipped, {done.failed} failed.{" "}
            <Link className="text-brand-teal hover:underline" href={`/admin/questions?status=${job.options.publish ? "PUBLISHED" : "DRAFT"}`}>Open the imported questions</Link>
          </p>
        )}
        {done && done.imported > 0 && can(actor, "questions:publish") && (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-sm text-slate-700"><b>Replacing this file with a newer version?</b> Archive the questions of this import first, then import the new file. Students' past answers are kept.</p>
            <ActionForm action={archiveImportAction} submit={`🗄 Archive the ${done.imported} question(s) of this import`} danger className="mt-2">
              <input type="hidden" name="jobId" value={job.id} />
            </ActionForm>
          </div>
        )}
        {done && job.errors.length > 0 && (
          <details className="mt-2 text-sm text-red-800"><summary className="cursor-pointer">Rows that failed ({job.errors.length})</summary><ul className="mt-1 list-disc ps-5">{job.errors.map((e) => <li key={e}>{e}</li>)}</ul></details>
        )}
        {job.status === "CANCELLED" && <p className="mt-3 text-slate-600">This import was cancelled. Nothing was added.</p>}
      </section>
      {job.status !== "FAILED" && <div className="mt-6"><ImportPreview job={job} skills={skills} standards={standards} canPublish={can(actor, "questions:publish")} /></div>}
    </AppShell>
  );
}
