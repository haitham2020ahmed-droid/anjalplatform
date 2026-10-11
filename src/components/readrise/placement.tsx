"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { PlacementView } from "@/server/readrise/placement";
import { answerPlacementAction, startPlacementAction } from "@/app/student/readrise/actions";
import { paragraphsOf } from "./text";
import { LevelBadge } from "./widgets";

/**
 * 🚀 The ReadRise placement runner: intro → one passage at a time (3 questions) → the result.
 * The server picks every next passage; no right/wrong is shown during the test (like a LevelSet).
 */
export function PlacementRunner({ view, level }: { view: PlacementView; level: number | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [finished, setFinished] = useState<{ result: number; note: string | null } | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  if (finished || view.state === "DONE") {
    const result = finished?.result ?? view.result ?? level;
    return (
      <section className="rounded-3xl bg-gradient-to-br from-emerald-50 to-white p-6 ring-1 ring-emerald-200" aria-live="polite">
        <h2 className="text-2xl font-bold text-brand-navy">🎉 {finished ? "You finished the placement!" : "Your placement is done"}</h2>
        {result !== null && result !== undefined && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-lg text-slate-800">My starting ReadRise Level: <LevelBadge level={Number(result)} /></p>
        )}
        {finished?.note && <p className="mt-2 text-sm text-slate-600">We also looked at your MAP reading result to make this fair.</p>}
        {level !== null && result !== null && Number(result) !== level && <p className="mt-2 text-sm text-slate-600">Your level now is {level} — it has changed as you read.</p>}
        <p className="mt-3 text-slate-700">Every article will now be written at a level that is just right for you. Read, score 75% or more, and watch your level rise!</p>
        {!finished && <p className="mt-2 text-sm text-slate-500">You can take the placement again only when your teacher allows it.</p>}
        <Link href="/student/readrise" className="mt-5 inline-block rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">Start reading ▶</Link>
      </section>
    );
  }

  if (view.state === "NOT_AVAILABLE") {
    return (
      <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="text-xl font-bold text-brand-navy">The placement is not ready yet</h2>
        <p className="mt-2 text-slate-700">No problem — you can already read articles at your starting level. Check back later.</p>
        <Link href="/student/readrise" className="mt-4 inline-block rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">Go to the library ▶</Link>
      </section>
    );
  }

  if (view.state === "READY" || !view.passage || !view.placementId) {
    return (
      <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="text-xl font-bold text-brand-navy">{view.retake ? "Ready for a fresh start?" : "Let's find the articles that fit you"}</h2>
        <ul className="mt-3 space-y-2 text-slate-700">
          <li>📖 Read a short passage, then answer 3 questions.</li>
          <li>🔀 The next passage gets harder or easier depending on your answers.</li>
          <li>⏱ Up to {view.maxSteps} passages, about 15–20 minutes. Your answers are saved — you can stop and come back.</li>
          <li>💡 There is no pass or fail. Just do your best, on your own.</li>
        </ul>
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-rose-800 ring-1 ring-rose-200">{error}</p>}
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError(null);
          try { const r = await startPlacementAction(); if (!r.ok) setError(r.error); else refresh(); }
          catch { setError("Something went wrong. Check your connection and try again."); }
          finally { setBusy(false); }
        }} className="mt-5 rounded-xl bg-brand-navy px-6 py-3 text-lg font-bold text-white hover:bg-brand-purple disabled:opacity-60">{busy ? "Starting…" : "Start ▶"}</button>
      </section>
    );
  }

  return (
    <PassageForm key={view.passage.id} view={view} busy={busy} error={error}
      onSubmit={async (answers) => {
        setBusy(true); setError(null);
        try {
          const r = await answerPlacementAction(view.placementId!, view.passage!.id, answers);
          if (!r.ok) { setError(r.error); return; }
          if (r.data.done && r.data.result !== null) setFinished({ result: r.data.result, note: r.data.note });
          else refresh();
        } catch { setError("Something went wrong. Check your connection and try again."); }
        finally { setBusy(false); }
      }} />
  );
}

function PassageForm({ view, busy, error, onSubmit }: { view: PlacementView; busy: boolean; error: string | null; onSubmit: (a: string[]) => void }) {
  const p = view.passage!;
  const [a, setA] = useState<string[]>(p.questions.map(() => ""));
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus(); window.scrollTo({ top: 0 }); }, [p.id]);
  const left = a.filter((x) => !x).length;
  const pct = Math.round(((view.stepNumber - 1) / view.maxSteps) * 100);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!left) onSubmit(a); }}>
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span>Passage {view.stepNumber} <span className="text-slate-400">(up to {view.maxSteps})</span></span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Placement progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span className="block h-full rounded-full bg-brand-teal transition-all" style={{ width: `${pct}%` }} />
        </span>
      </div>
      <article lang="en" className="reading mt-4 rounded-3xl bg-white p-5 text-lg leading-relaxed text-slate-900 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <h2 ref={head} tabIndex={-1} className="text-2xl font-bold text-brand-navy outline-none">{p.title || `Passage ${view.stepNumber}`}</h2>
        {paragraphsOf(p.text).map((t, i) => <p key={i} className="mt-4">{t}</p>)}
      </article>
      <ol className="mt-5 space-y-4">
        {p.questions.map((q, qi) => (
          <li key={qi} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <fieldset>
              <legend className="font-semibold text-slate-900">{qi + 1}. {q.stem}</legend>
              <div className="mt-2 grid gap-2">
                {q.options.map((o, i) => {
                  const l = "ABCD"[i];
                  return (
                    <label key={l} className={`flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2.5 ring-1 ${a[qi] === l ? "bg-teal-50 ring-brand-teal" : "ring-slate-200 hover:ring-slate-300"}`}>
                      <input type="radio" name={`q${qi}`} value={l} checked={a[qi] === l} onChange={() => setA((x) => x.map((v, j) => (j === qi ? l : v)))} className="mt-1 h-4 w-4 accent-teal-600" />
                      <span><strong>{l}.</strong> {o}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-rose-800 ring-1 ring-rose-200">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || left > 0} className="rounded-xl bg-brand-navy px-6 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">{busy ? "Saving…" : "Next passage ▶"}</button>
        {left > 0 && <span className="text-sm text-slate-600">{left} question{left === 1 ? "" : "s"} left</span>}
      </div>
    </form>
  );
}
