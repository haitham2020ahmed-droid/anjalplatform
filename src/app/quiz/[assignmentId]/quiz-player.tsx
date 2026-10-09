"use client";
import Link from "next/link";
import { useState } from "react";
import { AnswerInput, isAnswerReady, type AnswerValue } from "@/components/practice/answer-input";
import { FeedbackPanel } from "@/components/practice/feedback-panel";
import type { Feedback, QuizView } from "@/server/practice/session";
import { submitQuizAnswerAction } from "./actions";
import { PassageText, plainPassage } from "@/components/passage-text";
import { ListenButton } from "@/components/listen-button";
import { WordLookup } from "@/components/learn/word-lookup";
import { FlagButton } from "@/components/learn/flag-button";

/** The teacher's chosen questions, one by one; the correct answer after each; a report at the end. */
export function QuizPlayer({ initial }: { initial: QuizView }) {
  const [view, setView] = useState(initial);
  const [shown, setShown] = useState(initial.question);
  const [value, setValue] = useState<AnswerValue>(null);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const q = shown;
  const g = view.goal;
  async function submit() {
    if (!q) return;
    setPending(true); setError(null);
    const r = await submitQuizAnswerAction({ assignmentId: view.assignmentId, questionId: q.questionId, response: value });
    setPending(false);
    if (r.error) return setError(r.error);
    setFb(r.feedback!); setView(r.view!);
    if (r.feedback!.next.endReason === "GOAL") setCelebrate(true);
  }
  const nextHref = view.nextHref ?? "/student/plans";
  function next() { setFb(null); setValue(null); setShown(view.question); }
  if (!q) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-brand-navy">Finished! 🎉</h1>
        <p className="mt-2 text-lg text-slate-700">{g ? `${view.title}: ${g.correct} correct answers${g.reached ? " — goal reached ✅" : ` of the ${g.target} needed`}.` : `${view.title}: ${view.correct} of ${view.total} correct.`}</p>
        {g && !g.reached && <p className="mt-2 text-slate-600">You answered every question of this place. Your teacher will help you with what was hard.</p>}
        <div className="mt-6 flex justify-center gap-3">
          <Link href={`/student/assignments/${view.assignmentId}/report`} className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">View report</Link>
          {g ? <Link href={nextHref} className="rounded-xl px-6 py-3 font-semibold text-brand-navy ring-1 ring-slate-300">Next ▶</Link> : <Link href="/student" className="rounded-xl px-6 py-3 font-semibold text-brand-navy ring-1 ring-slate-300">My assigned work</Link>}
        </div>
      </div>
    );
  }
  const shownIndex = fb ? view.answered : view.index;
  return (
    <WordLookup>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-brand-navy">{view.title}</h1><p className="text-slate-600">{g ? <>Question {shownIndex}{g.reached ? " · ✅ done — practising more" : ""}</> : <>Question {shownIndex} of {view.total}</>}</p></div>
        {g ? (
          <div className="min-w-[13rem]">
            <p className="text-end text-sm font-semibold text-brand-navy">🎯 {Math.min(g.correct, g.target)} / {g.target} correct</p>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={Math.min(g.correct, g.target)} aria-label="Correct answers toward the goal">
              <div className={`h-full transition-all ${g.reached ? "bg-emerald-500" : "bg-brand-teal"}`} style={{ width: `${Math.round((100 * Math.min(g.correct, g.target)) / g.target)}%` }} />
            </div>
          </div>
        ) : (
          <div className="h-2.5 w-48 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={view.total} aria-valuenow={view.answered} aria-label="Questions answered">
            <div className="h-full bg-brand-teal" style={{ width: `${Math.round((100 * view.answered) / Math.max(1, view.total))}%` }} />
          </div>
        )}
      </header>
      {view.breakHint && <p role="status" className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-sky-200">⏸️ You have practised more than 25 minutes today. Take a short break if you like — your progress is saved and you continue from here.</p>}
      {g?.struggling && !fb && <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">💡 This one is tricky. Read the question slowly, use 🔊 Listen, and look back at the explanation of the last answer. The questions you missed will come back so you can get them right.</p>}
      {celebrate && g && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="goal-h">
          <div className="animate-pop w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-2xl">
            <p className="text-5xl" aria-hidden="true">{g.early ? "⭐" : "🎉"}</p>
            <h2 id="goal-h" className="mt-2 text-2xl font-bold text-brand-navy">{g.early ? "You mastered it fast!" : "Well done! You finished this part"}</h2>
            <p className="mt-2 text-slate-700">{g.early ? `${g.correct} correct and a long run of right answers at your level.` : `${g.target} correct answers.`} It now shows ✅ in your plan.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href={nextHref} className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">Next ▶</Link>
              <button type="button" onClick={() => setCelebrate(false)} className="rounded-xl px-6 py-3 font-semibold text-brand-navy ring-1 ring-slate-300">Keep practising</button>
            </div>
          </div>
        </div>
      )}
      <div className={["mt-6 grid gap-8", q.passage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""].join(" ")}>
        {q.passage && (
          <article className="max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-6 ring-1 ring-slate-200 lg:sticky lg:top-4" aria-label="Reading passage">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold text-brand-navy">{q.passage.title}</h2><ListenButton text={`${q.passage.title}. ${plainPassage(q.passage.text)}`} label="Listen to the text" /></div>
            <PassageText text={q.passage.text} paraClassName="mt-3 whitespace-pre-line text-lg leading-relaxed text-slate-800" />
          </article>
        )}
        <div>
          {q.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.image.url} alt={q.image.alt} className="mb-4 max-h-[50vh] w-auto max-w-full rounded-xl bg-white ring-1 ring-slate-200" />
          )}
          {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="text-xl font-medium leading-relaxed text-slate-900">{q.stem}</p>}
          <ListenButton text={[q.stem, ...(q.options ?? []).map((o) => `${o.label}. ${o.text}`)].join(". ")} label="Listen to the question" className="mt-2" />
          <div className="mt-5"><AnswerInput q={q} value={value} onChange={setValue} disabled={!!fb || pending} /></div>
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          <div className="mt-6">{fb && <FeedbackPanel fb={fb} />}</div>
          <FlagButton key={q.questionId} questionId={q.questionId} />
          <div className="mt-6">
            {!fb ? <button type="button" disabled={pending || !isAnswerReady(q, value)} onClick={() => void submit()} className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white disabled:opacity-50">{pending ? "Checking…" : "Check answer"}</button>
              : <button type="button" onClick={next} className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">{view.question ? "Next question" : "Finish"}</button>}
          </div>
        </div>
      </div>
    </WordLookup>
  );
}
