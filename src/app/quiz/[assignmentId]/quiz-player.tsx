"use client";
import Link from "next/link";
import { useState } from "react";
import { AnswerInput, isAnswerReady, type AnswerValue } from "@/components/practice/answer-input";
import { FeedbackPanel } from "@/components/practice/feedback-panel";
import type { Feedback, QuizView } from "@/server/practice/session";
import { submitQuizAnswerAction } from "./actions";
import { PassageText, plainPassage } from "@/components/passage-text";

/** The teacher's chosen questions, one by one; the correct answer after each; a report at the end. */
export function QuizPlayer({ initial }: { initial: QuizView }) {
  const [view, setView] = useState(initial);
  const [shown, setShown] = useState(initial.question);
  const [value, setValue] = useState<AnswerValue>(null);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const q = shown;
  async function submit() {
    if (!q) return;
    setPending(true); setError(null);
    const r = await submitQuizAnswerAction({ assignmentId: view.assignmentId, questionId: q.questionId, response: value });
    setPending(false);
    if (r.error) return setError(r.error);
    setFb(r.feedback!); setView(r.view!);
  }
  function next() { setFb(null); setValue(null); setShown(view.question); }
  if (!q) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-brand-navy">Finished! 🎉</h1>
        <p className="mt-2 text-lg text-slate-700">{view.title}: {view.correct} of {view.total} correct.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href={`/student/assignments/${view.assignmentId}/report`} className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">View report</Link>
          <Link href="/student" className="rounded-xl px-6 py-3 font-semibold text-brand-navy ring-1 ring-slate-300">My assigned work</Link>
        </div>
      </div>
    );
  }
  const shownIndex = fb ? view.answered : view.index;
  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-brand-navy">{view.title}</h1><p className="text-slate-600">Question {shownIndex} of {view.total}</p></div>
        <div className="h-2.5 w-48 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={view.total} aria-valuenow={view.answered} aria-label="Questions answered">
          <div className="h-full bg-brand-teal" style={{ width: `${Math.round((100 * view.answered) / Math.max(1, view.total))}%` }} />
        </div>
      </header>
      <div className={["mt-6 grid gap-8", q.passage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""].join(" ")}>
        {q.passage && (
          <article className="max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-6 ring-1 ring-slate-200 lg:sticky lg:top-4" aria-label="Reading passage">
            <h2 className="text-xl font-bold text-brand-navy">{q.passage.title}</h2>
            <PassageText text={q.passage.text} paraClassName="mt-3 whitespace-pre-line text-lg leading-relaxed text-slate-800" />
          </article>
        )}
        <div>
          {q.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.image.url} alt={q.image.alt} className="mb-4 max-h-[50vh] w-auto max-w-full rounded-xl bg-white ring-1 ring-slate-200" />
          )}
          {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="text-xl font-medium leading-relaxed text-slate-900">{q.stem}</p>}
          <div className="mt-5"><AnswerInput q={q} value={value} onChange={setValue} disabled={!!fb || pending} /></div>
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          <div className="mt-6">{fb && <FeedbackPanel fb={fb} />}</div>
          <div className="mt-6">
            {!fb ? <button type="button" disabled={pending || !isAnswerReady(q, value)} onClick={() => void submit()} className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white disabled:opacity-50">{pending ? "Checking…" : "Check answer"}</button>
              : <button type="button" onClick={next} className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">{view.question ? "Next question" : "Finish"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
