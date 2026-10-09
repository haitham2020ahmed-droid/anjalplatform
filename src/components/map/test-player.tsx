"use client";
import Link from "next/link";
import { useState } from "react";
import { AnswerInput, isAnswerReady, type AnswerValue } from "@/components/practice/answer-input";
import { PassageText } from "@/components/passage-text";
import type { TestScreen } from "@/server/map/sim";
import { answerTestAction } from "@/app/student/map-test/actions";

/**
 * The MAP practice test screen: one question at a time, no going back, no right / wrong, no dictionary or
 * read-aloud (like the real MAP Growth). “Pause” keeps the place; the same question comes back.
 */
export function TestPlayer({ initial }: { initial: TestScreen }) {
  const [sc, setSc] = useState(initial);
  const [value, setValue] = useState<AnswerValue>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = sc.question;
  const send = async () => {
    if (!q) return;
    setBusy(true); setError(null);
    const response = (q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") && !Array.isArray(value) ? q.elements : value;
    // a weak connection: try again twice before showing an error (the answer is accepted only once)
    let r: Awaited<ReturnType<typeof answerTestAction>> | null = null;
    for (let i = 0; i < 3 && !r; i++) { try { r = await answerTestAction(sc.sessionId, q.questionId, response); } catch { await new Promise((ok) => setTimeout(ok, 1200)); } }
    setBusy(false);
    if (!r) return setError("No connection. Your answer was not sent: check the internet and press Next again.");
    if (!r.ok) return setError(r.error);
    setSc(r.screen); setValue(null); window.scrollTo({ top: 0 });
  };
  const subject = sc.subject === "LANGUAGE" ? "Language Usage" : "Reading";
  if (sc.done) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-6xl" aria-hidden="true">🎉</p>
        <h1 className="mt-2 text-3xl font-extrabold text-brand-navy">{sc.kind === "WARMUP" ? "Warm-up finished!" : `${subject}: finished!`}</h1>
        {sc.result ? <><p className="mt-4 text-slate-600">My practice score (about)</p><p className="text-6xl font-extrabold text-brand-navy">{sc.result.rit}</p><p className="mt-1 text-slate-600">most likely between {sc.result.low} and {sc.result.high}</p><p className="mt-3 text-sm text-slate-500">This is a practice estimate. Your teacher will use it to help you before the real MAP test.</p></>
          : <p className="mt-3 text-slate-700">Now you know how the test works. When your teacher opens the practice test, you are ready!</p>}
        <Link href="/student/map-test" className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">Back</Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-teal">{sc.kind === "WARMUP" ? "Warm-up" : "MAP practice test"} · {subject}</p>
          <h1 className="text-2xl font-bold text-brand-navy">Question {sc.n} of {sc.total}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-48 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={sc.total} aria-valuenow={sc.n - 1} aria-label="Progress"><div className="h-full bg-brand-teal transition-all" style={{ width: `${Math.round((100 * (sc.n - 1)) / sc.total)}%` }} /></div>
          <Link href="/student/map-test" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300">⏸ Pause</Link>
        </div>
      </header>
      {sc.warning && <p role="alert" className="mt-4 rounded-2xl bg-amber-100 px-5 py-3 text-lg font-semibold text-amber-900 ring-1 ring-amber-300">{sc.warning}</p>}
      {q && (
        <div className={["mt-6 grid gap-8", q.passage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""].join(" ")}>
          {q.passage && (
            <article className="max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-6 ring-1 ring-slate-200 lg:sticky lg:top-4" aria-label="Reading passage">
              <h2 className="text-xl font-bold text-brand-navy">{q.passage.title}</h2>
              <PassageText text={q.passage.text} />
            </article>
          )}
          <div>
            {q.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.image.url} alt={q.image.alt} className="mb-4 max-h-[50vh] w-auto max-w-full rounded-xl bg-white ring-1 ring-slate-200" />
            )}
            {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="text-xl font-medium leading-relaxed text-slate-900">{q.stem}</p>}
            <div className="mt-5"><AnswerInput key={q.questionId} q={q} value={value} onChange={setValue} disabled={busy} /></div>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
            <button type="button" onClick={() => void send()} disabled={busy || !isAnswerReady(q, value)} className="mt-6 rounded-xl bg-brand-navy px-8 py-3 text-lg font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : sc.n === sc.total ? "Finish ✓" : "Next ▶"}</button>
            <p className="mt-3 text-sm text-slate-500">You cannot go back to a question. Take your time: there is no time limit.</p>
          </div>
        </div>
      )}
    </div>
  );
}
