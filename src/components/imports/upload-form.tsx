"use client";
import { useState } from "react";

/** Upload → validation. The server checks every row before anything is saved. */
export function UploadForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("MAP_RESULTS");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/imports", { method: "POST", body: new FormData(e.currentTarget) });
    const body = await res.json().catch(() => ({ error: "Upload failed." }));
    setBusy(false);
    if (!res.ok) return setError(body.error);
    window.location.href = `/admin/imports/${body.jobId}`;
  }
  const field = "w-full rounded-lg border border-slate-300 px-3 py-2";
  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <label className="block font-medium">What are you importing?
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          <option value="MAP_RESULTS">MAP Growth results (NWEA export or our template)</option>
          <option value="EXTERNAL_RESULTS">Other practice results (for example IXL)</option>
        </select>
      </label>
      {kind === "EXTERNAL_RESULTS" && <label className="block font-medium">Source name<input name="source" defaultValue="IXL" maxLength={40} className={field} /></label>}
      <fieldset>
        <legend className="font-medium">How are dates written in the file?</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          <label className="flex items-center gap-2"><input type="radio" name="dateOrder" value="MDY" defaultChecked />Month/day/year (NWEA exports)</label>
          <label className="flex items-center gap-2"><input type="radio" name="dateOrder" value="DMY" />Day/month/year</label>
        </div>
      </fieldset>
      <label className="block font-medium">File (.csv or .xlsx, up to 10 MB)<input type="file" name="file" accept=".csv,.xlsx" required className="mt-1 block" /></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      <button disabled={busy} className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{busy ? "Checking the file…" : "Check the file"}</button>
      <p className="text-sm text-slate-600">Templates: <a className="text-brand-teal hover:underline" href="/api/imports/templates/MAP_RESULTS">MAP results</a>, <a className="text-brand-teal hover:underline" href="/api/imports/templates/EXTERNAL_RESULTS">other results</a>. Nothing is saved until you review and confirm.</p>
    </form>
  );
}
