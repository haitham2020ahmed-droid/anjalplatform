import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { UploadForm } from "@/components/imports/upload-form";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listImports } from "@/server/imports/pipeline";

const STATUS: Record<string, string> = { AWAITING_CONFIRMATION: "Waiting for your review", COMPLETED: "Imported", FAILED: "Could not be used", CANCELLED: "Cancelled", VALIDATING: "Checking", IMPORTING: "Importing" };

export default async function ImportsPage() {
  const actor = await requireActor({ permission: "imports:run" });
  const me = (await getActor())!.user;
  const jobs = await listImports(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <h1 className="text-3xl font-bold text-brand-navy">Import Results</h1>
      <p className="mt-1 text-slate-600">Bring in MAP Growth and other assessment results. Official values are stored exactly as in the file.</p>
      <div className="mt-6"><UploadForm /></div>
      <h2 className="mt-10 text-xl font-bold text-brand-navy">Recent Imports</h2>
      <ul className="mt-3 divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
        {jobs.length === 0 && <li className="p-4 text-slate-600">No imports yet.</li>}
        {jobs.map((j) => (
          <li key={String(j.id)} className="grid gap-1 p-4 md:grid-cols-[minmax(0,1fr)_12rem_10rem]">
            <Link href={`/admin/imports/${String(j.id)}`} className="font-medium text-brand-navy hover:text-brand-teal">{String(j.fileName)}</Link>
            <span className="text-slate-600">{j.kind === "MAP_RESULTS" ? "MAP results" : "Other results"}</span>
            <span className="text-slate-600">{STATUS[String(j.status)] ?? String(j.status)}</span>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
