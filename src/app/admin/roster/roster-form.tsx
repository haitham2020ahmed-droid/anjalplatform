"use client";
import { useState } from "react";
import type { RosterPlan } from "@/server/admin/roster-import";
import { applyRosterAction, previewRosterAction } from "../actions";

/** Check → review → import. The same file (checked by SHA-256) must be imported. */
export function RosterForm() {
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<RosterPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ summary: string; csv: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fd = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("file", file!);
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };
  async function check() {
    if (!file) return;
    setBusy(true); setError(null); setPlan(null); setDone(null);
    const r = await previewRosterAction(fd());
    setBusy(false);
    if (r.error) setError(r.error); else setPlan(r.plan!);
  }
  async function apply() {
    if (!file || !plan) return;
    setBusy(true); setError(null);
    const r = await applyRosterAction(fd({ sha256: plan.sha256 }));
    setBusy(false);
    if (r.error) return setError(r.error);
    setDone({ summary: r.summary!, csv: r.credentialsCsv! });
    setPlan(null);
  }
  function download() {
    const url = URL.createObjectURL(new Blob([done!.csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "new-accounts-temporary-passwords.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <input type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPlan(null); setDone(null); }} />
        <button onClick={check} disabled={!file || busy} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white disabled:opacity-60">{busy && !plan ? "Checking…" : "Check the file"}</button>
        <a href="/api/admin/roster-template" className="text-brand-teal hover:underline">Download the template</a>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      {plan && (
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <p className="font-semibold text-brand-navy">{plan.summary.create} new · {plan.summary.update} updated{plan.newClasses.length ? ` · new classes: ${plan.newClasses.map((c) => `${c.name} (G${c.grade})`).join(", ")}` : ""}</p>
          {plan.problems.length > 0 ? (
            <>
              <p className="mt-2 text-red-700">{plan.problems.length} problem(s). Nothing will be imported until the file is fixed.</p>
              <table className="mt-2 w-full text-left text-sm"><thead><tr className="text-slate-500"><th>Line</th><th>Column</th><th>Problem</th></tr></thead>
                <tbody>{plan.problems.slice(0, 200).map((p, i) => <tr key={i} className="border-t"><td className="py-1">{p.line}</td><td>{p.column}</td><td>{p.message}</td></tr>)}</tbody></table>
            </>
          ) : (
            <button onClick={apply} disabled={busy} className="mt-3 rounded-xl bg-brand-teal px-5 py-2.5 font-semibold text-white disabled:opacity-60">{busy ? "Importing…" : `Import ${plan.lines.length} rows`}</button>
          )}
        </div>
      )}
      {done && (
        <div role="status" className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
          <p className="font-semibold">Import complete: {done.summary}</p>
          <p className="mt-1 text-sm">Download the temporary passwords now. They are shown only once and are not stored. Share them securely; every new user must choose a new password at first sign-in.</p>
          <button onClick={download} className="mt-3 rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white">Download temporary passwords (CSV)</button>
        </div>
      )}
    </div>
  );
}
