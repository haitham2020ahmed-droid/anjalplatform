"use client";
import { useEffect } from "react";

/** A friendly page when something fails (instead of a technical error). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // tell the school's error log (message and page only)
    try { void fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: error.message, digest: error.digest, path: window.location.pathname }) }); } catch { /* offline */ }
  }, [error]);
  const stale = /Failed to find Server Action|older or newer deployment/i.test(error.message);
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="animate-pop w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg ring-1 ring-slate-200">
        <p className="text-5xl" aria-hidden="true">{stale ? "🔄" : "😕"}</p>
        <h1 className="mt-3 text-2xl font-extrabold text-brand-navy">{stale ? "The platform was just updated" : "Something went wrong"}</h1>
        <p className="mt-2 text-slate-600">{stale ? "Reload the page to get the new version. Your work is saved." : "Please try again. If it keeps happening, tell your teacher."}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => (stale ? window.location.reload() : reset())} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">{stale ? "Reload" : "Try again"}</button>
          <a href="/" className="rounded-xl px-5 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300">Home</a>
        </div>
        {error.digest && <p className="mt-4 text-xs text-slate-400">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
