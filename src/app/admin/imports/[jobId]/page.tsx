import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import type { RowIssue } from "@/server/imports/pipeline";
import { cancelImportAction, confirmImportAction } from "./actions";

/** Review an import: totals, every problem by row, a preview, then confirm or cancel. */
export default async function ImportJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const actor = await requireActor({ permission: "imports:run" });
  const me = (await getActor())!.user;
  const { jobId } = await params;
  const job = await repo.findUnique("ImportJob", { id: jobId });
  if (!job || (actor.role !== "SUPER_ADMIN" && (job.options as { schoolId?: string })?.schoolId !== actor.schoolId)) notFound();
  const issues = (job.errors ?? []) as RowIssue[];
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const preview = (job.preview ?? []) as Record<string, unknown>[];
  const cols = preview.length ? Object.keys(preview[0]).filter((k) => !["dupInFile", "dupInDb"].includes(k)) : [];
  const summary = job.summary as { written: number; skippedDuplicates: number; replaced: number } | null;
  return (
    <AppShell name={String(me.displayName)}>
      <Link href="/admin/imports" className="text-sm font-medium text-brand-teal hover:underline">All imports</Link>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">{String(job.fileName)}</h1>
      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Rows in file", job.totalRows], ["Ready to import", job.validRows], ["Rows with problems", job.errorRows], ["Already imported", job.duplicateRows]].map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><dt className="text-sm text-slate-500">{String(l)}</dt><dd className="text-2xl font-bold tabular-nums text-brand-navy">{String(v)}</dd></div>
        ))}
      </dl>
      {summary && <p role="status" className="mt-6 rounded-xl bg-teal-50 p-4 text-teal-900">Imported {summary.written} results{summary.replaced ? `, replaced ${summary.replaced}` : ""}{summary.skippedDuplicates ? `, skipped ${summary.skippedDuplicates} already imported` : ""}.</p>}
      {job.status === "AWAITING_CONFIRMATION" && (
        <form action={confirmImportAction} className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <input type="hidden" name="jobId" value={String(job.id)} />
          {Number(job.duplicateRows) > 0 && (
            <fieldset className="flex flex-wrap gap-4"><legend className="sr-only">Results already imported</legend>
              <label className="flex items-center gap-2"><input type="radio" name="duplicates" value="skip" defaultChecked />Skip results already imported</label>
              <label className="flex items-center gap-2"><input type="radio" name="duplicates" value="replace" />Replace them with this file</label>
            </fieldset>
          )}
          <button className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white hover:bg-brand-purple">Import {String(job.validRows)} rows</button>
          <button formAction={cancelImportAction} className="rounded-xl border-2 border-slate-300 px-6 py-3 font-semibold text-slate-700">Cancel</button>
        </form>
      )}
      {issues.length > 0 && (
        <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-brand-navy">{errors.length} problems, {warnings.length} notes</h2>
            <a href={`/api/imports/${String(job.id)}/errors`} className="font-medium text-brand-teal hover:underline">Download all as a spreadsheet</a>
          </div>
          <table className="mt-3 min-w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="px-2 py-1">Row</th><th className="px-2 py-1">Column</th><th className="px-2 py-1">What to fix</th></tr></thead>
            <tbody>{issues.slice(0, 200).map((i, k) => (
              <tr key={k} className="border-t border-slate-100"><td className="px-2 py-1.5 tabular-nums">{i.row || ""}</td><td className="px-2 py-1.5">{i.column}</td><td className={["px-2 py-1.5", i.severity === "error" ? "text-red-800" : "text-slate-600"].join(" ")}>{i.message}</td></tr>
            ))}</tbody>
          </table>
        </section>
      )}
      {preview.length > 0 && job.status === "AWAITING_CONFIRMATION" && (
        <section className="mt-6 overflow-x-auto rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Preview (first {preview.length})</h2>
          <table className="mt-3 min-w-full text-sm">
            <thead className="text-left text-slate-500"><tr>{cols.map((c) => <th key={c} className="px-2 py-1">{c}</th>)}</tr></thead>
            <tbody>{preview.map((r, k) => <tr key={k} className="border-t border-slate-100">{cols.map((c) => <td key={c} className="px-2 py-1.5">{r[c] === null || r[c] === undefined ? "–" : String(r[c])}</td>)}</tr>)}</tbody>
          </table>
        </section>
      )}
    </AppShell>
  );
}
