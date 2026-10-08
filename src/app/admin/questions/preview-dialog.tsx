"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { questionPreviewAction, type QuestionPreview } from "./preview-actions";

/** 👁 Preview: the question as students see it, with its correct answer marked. */
export function PreviewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [p, setP] = useState<QuestionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    let live = true;
    void questionPreviewAction(id).then((r) => { if (!live) return; if (r.error) setError(r.error); else setP(r.preview!); });
    return () => { live = false; };
  }, [id]);
  return (
    <dialog ref={ref} onClose={onClose} className="w-full max-w-3xl rounded-2xl p-0 backdrop:bg-slate-900/40" aria-label="Question preview">
      <div className="max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-brand-navy">Preview</h2>
          <button type="button" onClick={() => ref.current?.close()} className="rounded-lg px-3 py-1 font-semibold text-brand-navy ring-1 ring-slate-300">Close</button>
        </div>
        {!p && !error && <p className="mt-4 text-slate-600">Loading…</p>}
        {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
        {p && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-500">{p.type.replace(/_/g, " ").toLowerCase()} · level {p.level} · {p.status.toLowerCase().replace(/_/g, " ")}</p>
            {p.passage && (
              <article className="max-h-72 overflow-y-auto rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" aria-label="Passage">
                {p.passage.split(/\n\n+/).map((para, i) => <p key={i} className="mt-2 whitespace-pre-line leading-relaxed text-slate-800 first:mt-0">{para}</p>)}
              </article>
            )}
            {p.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image.url} alt={p.image.alt} className="max-h-72 w-auto max-w-full rounded-xl ring-1 ring-slate-200" />
            )}
            <p className="text-lg font-medium text-slate-900">{p.stem}</p>
            {p.options.length > 0 && (
              <ul className="space-y-2">
                {p.options.map((o) => (
                  <li key={o.label} className={`flex gap-3 rounded-xl px-4 py-2 ring-1 ${o.correct ? "bg-teal-50 ring-teal-400" : "ring-slate-200"}`}>
                    <span className="font-semibold">{o.label}.</span><span className="flex-1">{o.text}</span>{o.correct && <span className="font-semibold text-teal-800">✓ correct</span>}
                  </li>
                ))}
              </ul>
            )}
            {p.answer && <p className="rounded-xl bg-teal-50 px-4 py-2 text-teal-900 ring-1 ring-teal-300"><span className="font-semibold">Answer:</span> {p.answer}</p>}
            <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <p className="text-sm font-semibold text-slate-700">Why it is correct</p>
              <p className="mt-1 text-slate-800">{p.whyCorrect}</p>
              {p.tip && <p className="mt-2 text-sm text-slate-600"><span className="font-semibold">Tip:</span> {p.tip}</p>}
            </div>
            <Link href={`/admin/questions/${p.id}`} className="inline-block rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">Open / edit</Link>
          </div>
        )}
      </div>
    </dialog>
  );
}
