"use client";
import { useState } from "react";

/**
 * 🧰 Nov 2026 fix: posts to /api/admin/bulk-map-import (a plain route with its own 20 MB cap) instead of a Server
 * Action, which shared the app's global 4 MB body limit — too small for real multi-page NWEA PDFs. See that route
 * and bulk-map-import/actions.ts for the full story.
 */
export function MapUploadBox() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/bulk-map-import", { method: "POST", body: new FormData(e.currentTarget) });
      const body = await res.json().catch(() => ({ error: "Upload failed." }));
      setResult(res.ok ? body.message : body.error);
      if (res.ok) e.currentTarget.reset();
    } catch {
      setResult("The upload was interrupted. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="mb-3 text-sm font-semibold text-brand-navy">📤 Upload PDF(s) to import now</p>
      <input type="hidden" name="year" value={2026} />
      <input type="file" name="files" accept="application/pdf" multiple required disabled={busy}
        className="block w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-navy file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-brand-purple disabled:opacity-60" />
      <button disabled={busy} className="mt-3 rounded-xl bg-brand-navy px-6 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{busy ? "Importing…" : "Import uploaded file(s)"}</button>
      <p className="mt-2 text-xs text-slate-500">Choose one or more NWEA PDF reports (Achievement Status and Growth, or Class Profile), up to 20 MB total. Nothing is saved to the repo — they're read once and processed.</p>
      {result && <pre role="status" className="mt-3 whitespace-pre-wrap rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-200">{result}</pre>}
    </form>
  );
}
