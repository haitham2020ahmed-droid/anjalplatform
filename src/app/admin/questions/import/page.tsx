import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { card, h2 } from "@/components/admin/styles";
import { env } from "@/lib/env";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { importChoices, listImportJobs } from "@/server/admin/question-import";
import { ImportUpload } from "./upload-form";

const STATUS: Record<string, string> = { AWAITING_CONFIRMATION: "Waiting for review", IMPORTING: "Importing", COMPLETED: "Completed", CANCELLED: "Cancelled", FAILED: "Failed" };

export default async function ImportQuestionsPage() {
  const actor = await requireActor({ permission: "questions:edit" });
  const me = (await getActor())!.user;
  const [grades, jobs] = await Promise.all([importChoices(repo, actor), listImportJobs(repo, actor)]);
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/admin/questions" className="text-brand-teal hover:underline">← Questions</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Import questions</h1>
      <p className="mt-1 max-w-3xl text-slate-600">Upload any question-bank file. The format is detected automatically; you see every question before anything is added, and imported questions go through the normal review before students see them.</p>
      <section className={card}><ImportUpload grades={grades} aiReady={Boolean(env.ANTHROPIC_API_KEY)} /></section>
      <section className={card}>
        <h2 className={h2}>Import history</h2>
        {jobs.length === 0 ? <p className="text-slate-600">No imports yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-2">File</th><th>Type</th><th>Date</th><th>By</th><th>Questions</th><th>Result</th><th>Status</th></tr></thead>
              <tbody>{jobs.map((j) => (
                <tr key={j.id} className="border-b last:border-0">
                  <td className="py-2"><Link className="font-semibold text-brand-teal hover:underline" href={`/admin/questions/import/${j.id}`}>{j.fileName}</Link></td>
                  <td className="uppercase">{j.kind}</td><td>{j.createdAt.slice(0, 10)}</td><td>{j.uploadedBy}</td>
                  <td>{j.totals.total} ({j.totals.valid} valid · {j.totals.invalid} with errors · {j.totals.duplicates} duplicates)</td>
                  <td>{j.summary ? `${j.summary.imported + j.summary.replaced} imported · ${j.summary.skipped} skipped · ${j.summary.failed} failed` : "—"}</td>
                  <td>{STATUS[j.status] ?? j.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
