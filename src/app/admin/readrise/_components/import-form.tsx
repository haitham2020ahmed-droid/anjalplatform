"use client";
/** 🚀 ReadRise import: upload (xlsx or JSON) → preview (estimated vs target per version, every problem) → import. */
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { importReadRiseAction, previewReadRiseAction, type PreviewState } from "../actions";

function Submit({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className={`${className} disabled:opacity-60`}>{pending ? "Working…" : children}</button>;
}

export function ImportForm({ base, canPublish }: { base: string; canPublish: boolean }) {
  const [st, preview] = useActionState<PreviewState, FormData>(previewReadRiseAction, {});
  const errors = st.errors ?? [], warnings = st.warnings ?? [], checks = st.checks ?? [];
  return (
    <div className="space-y-5">
      <form action={preview} className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm font-semibold text-slate-700">Filled template (.xlsx) or article (.json)
          <input type="file" name="file" accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="block w-full text-sm font-normal" />
        </label>
        <Submit className="rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-purple">🔍 Check the file</Submit>
      </form>
      {st.error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-red-900 ring-1 ring-red-200">{st.error}</p>}

      {st.fileName && (
        <section aria-live="polite" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div>
              <p className="text-sm text-slate-500">{st.fileName}</p>
              {st.article
                ? <p className="text-lg font-bold text-brand-navy">{st.article.title} <span className="text-sm font-semibold text-slate-500">· {st.article.code} · {st.article.topic} · {st.article.keyWords} key words · {st.article.questions} questions</span></p>
                : <p className="text-lg font-bold text-red-800">Not ready to import</p>}
            </div>
            <p className={`rounded-full px-3 py-1 text-sm font-semibold ${errors.length ? "bg-red-100 text-red-900" : "bg-teal-100 text-teal-900"}`}>{errors.length ? `${errors.length} problem${errors.length === 1 ? "" : "s"} to fix` : "✓ No errors"}{warnings.length ? ` · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}</p>
          </div>

          {checks.length > 0 && (
            <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
              <table className="w-full text-left text-sm">
                <caption className="p-3 text-left font-semibold text-brand-navy">Each version: estimated ReadRise Level against its target</caption>
                <thead><tr className="border-y bg-slate-50 text-xs text-slate-500"><th className="p-2">Version</th><th className="p-2">Title</th><th className="p-2">Estimated</th><th className="p-2">Words (target)</th><th className="p-2">Hint</th></tr></thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.level} className="border-b last:border-0">
                      <td className="p-2 font-bold tabular-nums">{c.level}</td>
                      <td className="p-2">{c.title}</td>
                      <td className={`p-2 font-semibold tabular-nums ${c.levelOk ? "text-teal-800" : "text-amber-800"}`}>{c.levelOk ? "✓" : "⚠"} {c.estLevel}</td>
                      <td className={`p-2 tabular-nums ${c.wordsOk ? "" : "font-semibold text-amber-800"}`}>{c.wordsOk ? "✓" : "⚠"} {c.wordCount} <span className="text-xs text-slate-400">({c.target.min}–{c.target.max})</span></td>
                      <td className="p-2 text-xs text-slate-600">{c.hint ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
              <h3 className="font-semibold text-red-900">Fix these, then upload again</h3>
              <ul className="mt-2 space-y-1 text-sm">{errors.map((e, i) => <li key={i}><b className="text-red-900">{e.where}:</b> <span className="text-red-800">{e.message}</span></li>)}</ul>
            </div>
          )}
          {warnings.length > 0 && (
            <details className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200" open={!errors.length}>
              <summary className="cursor-pointer font-semibold text-amber-900">Warnings ({warnings.length}) — you can still import</summary>
              <ul className="mt-2 space-y-1 text-sm">{warnings.map((w, i) => <li key={i}><b className="text-amber-900">{w.where}:</b> <span className="text-amber-800">{w.message}</span></li>)}</ul>
            </details>
          )}

          {st.payload && (
            <form action={importReadRiseAction} className="flex flex-wrap items-center gap-4 rounded-2xl bg-teal-50 p-4 ring-1 ring-teal-200">
              <input type="hidden" name="payload" value={st.payload} />
              <input type="hidden" name="base" value={base} />
              <p className="me-auto text-sm text-teal-900">The article is imported as a <b>draft</b>. You review the 12 versions, then publish. Importing the same code again updates it.</p>
              {canPublish && <label className="flex items-center gap-2 text-sm font-semibold text-teal-900"><input type="checkbox" name="publish" value="1" className="h-4 w-4 accent-teal-600" /> Publish right away</label>}
              <Submit className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-800">📥 Import</Submit>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
