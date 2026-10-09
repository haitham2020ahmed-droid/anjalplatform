"use client";
import { useActionState } from "react";
import { quickAddAction, type QuickState } from "./actions";

/** Paste names → accounts in the class → printable sign-in cards. */
export function QuickAddForm({ classes }: { classes: { id: string; name: string; grade: number }[] }) {
  const [state, action, pending] = useActionState<QuickState, FormData>(quickAddAction, {});
  const r = state.result;
  return (
    <>
      <form action={action} className="space-y-3 print:hidden">
        <label className="block text-sm font-semibold text-slate-700">Class
          <select name="classId" required className="mt-1 block rounded-lg border border-slate-300 px-3 py-2">{classes.map((c) => <option key={c.id} value={c.id}>{c.name} · Grade {c.grade}</option>)}</select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">Student names — one per line (add “, number” if the school already has student numbers)
          <textarea name="names" required rows={12} dir="auto" placeholder={"Abdulaziz Borsais\nOmar Al Harbi, 1023\n…"} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" />
        </label>
        <button disabled={pending} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{pending ? "Adding…" : "⚡ Add the students"}</button>
        {state.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{state.error}</p>}
      </form>
      {r && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p role="status" className="rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">✓ {r.created.length} student(s) added to {r.className}.{r.skipped.length > 0 && ` Skipped ${r.skipped.length}: ${r.skipped.map((x) => `${x.name} (${x.reason})`).join(", ")}.`} The passwords are shown only now: print or save them.</p>
            {r.created.length > 0 && <button type="button" onClick={() => window.print()} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">🖨 Print sign-in cards</button>}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
            {r.created.map((c) => (
              <div key={c.username} className="break-inside-avoid rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-sm">
                <p className="font-bold text-brand-navy">{c.name}</p>
                <p className="text-slate-500">{r.className} · {c.number}</p>
                <p className="mt-2">Username: <b className="font-mono">{c.username}</b></p>
                <p>Password: <b className="font-mono">{c.password}</b></p>
                <p className="mt-1 text-xs text-slate-500">Change the password at the first sign-in.</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
