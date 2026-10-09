"use client";
import { useRef, useState, type FormEvent } from "react";

type Result = { ok: boolean; message: string; created: { name: string; username: string; password: string }[] };

/** 📥 MAP scores import on the page; new students' sign-ins are shown once (and can be downloaded). */
export function MapImportBox({ classId, className, run }: { classId: string | null; className: string | null; run: (f: FormData) => Promise<Result> }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.current) return;
    setBusy(true); setRes(null);
    const r = await run(new FormData(form.current));
    setBusy(false); setRes(r);
    if (r.ok) form.current.reset();
  };
  const csv = (rows: Result["created"]) => URL.createObjectURL(new Blob(["\ufeffName,Username,Temporary password\n" + rows.map((r) => [r.name, r.username, r.password].map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" }));
  return (
    <form ref={form} onSubmit={send} className="mt-4 rounded-3xl bg-gradient-to-br bg-linear-to-br from-emerald-50 to-white p-5 ring-1 ring-emerald-200">
      <h2 className="text-lg font-bold text-brand-navy">📥 Import MAP scores (Fall RIT + Spring Projection)</h2>
      <p className="text-sm text-slate-600">1. Download the template · 2. Fill “Fall RIT”, “Spring Projection” (and “Fall Lexile” if you have it) · 3. Upload.{classId ? ` Students of the file who are not on the platform yet are added to ${className} automatically (Student Number + Student Name).` : " Choose a class above to also add new students automatically."}</p>
      {classId && <input type="hidden" name="classId" value={classId} />}
      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <a href={`/api/map-scores-template${classId ? `?classId=${classId}` : ""}`} className="rounded-xl bg-white px-3 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ Template</a>
        <label className="flex flex-col">Fall of year<input type="number" name="year" min={2000} max={2100} defaultValue={new Date().getFullYear()} className="w-28 rounded-xl border border-slate-300 px-3 py-2" /></label>
        <label className="flex flex-col">File (template, NWEA CSV export, or ASG report PDF)<input type="file" name="file" accept=".csv,.xlsx,.pdf" required className="text-sm" /></label>
        <button disabled={busy} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{busy ? "Importing…" : "Import"}</button>
      </div>
      {res && <p role="status" className={`animate-pop mt-3 rounded-xl px-3 py-2 text-sm ${res.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"}`}>{res.message}</p>}
      {res && res.created.length > 0 && (
        <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-amber-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold text-amber-900">🔑 New students’ sign-ins (shown once)</p>
            <a href={csv(res.created)} download="new-students-sign-ins.csv" className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-300">⬇ Download CSV</a>
          </div>
          <table className="mt-2 w-full text-left text-sm"><thead><tr className="text-slate-500"><th className="py-1">Name</th><th>Username</th><th>Temporary password</th></tr></thead>
            <tbody>{res.created.map((c) => <tr key={c.username} className="border-t"><td className="py-1">{c.name}</td><td className="font-mono">{c.username}</td><td className="font-mono">{c.password}</td></tr>)}</tbody></table>
          <p className="mt-1 text-xs text-slate-500">Students change the password at their first sign-in.</p>
        </div>
      )}
    </form>
  );
}
