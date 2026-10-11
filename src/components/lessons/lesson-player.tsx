/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
/**
 * 🧩 The lesson screen: I do (model) → we do (guided, with the hint ladder) → you do (on your own) → quick check.
 * Every step calls the server; the browser never holds an answer key or decides a phase.
 */
import { useState, useTransition } from "react";
import type { ClientQuestion } from "../../server/practice/items";
import type { Feedback } from "../../server/practice/session";
import type { LessonView } from "../../server/lessons/run";
import type { HintStep } from "../../tutor/tutor";
import { AnswerInput, isAnswerReady, type AnswerValue } from "../practice/answer-input";
import { FeedbackPanel } from "../practice/feedback-panel";
import { ListenButton } from "../listen-button";
import { LessonPassage } from "./lesson-passage";
import { Organizer } from "./organizer";

type Err = { error: string };
type Actions = {
  model: (runId: string, pick: number) => Promise<{ view: LessonView } | Err>;
  begin: (runId: string) => Promise<{ view: LessonView } | Err>;
  hint: (runId: string, questionId: string) => Promise<{ hint: HintStep; view: LessonView } | Err>;
  answer: (input: { runId: string; questionId: string; response: unknown }) => Promise<{ feedback: Feedback; lessonCredit: number; view: LessonView } | Err>;
  organizer: (runId: string, value: { head: string; rows: string[][]; foot: string }) => Promise<{ complete: boolean; missing: string[]; view: LessonView } | Err>;
};

const STEPS: { phase: LessonView["phase"]; label: string }[] = [
  { phase: "MODEL", label: "1 · Watch and learn" }, { phase: "GUIDED", label: "2 · Try with help" },
  { phase: "INDEPENDENT", label: "3 · On your own" }, { phase: "CHECK", label: "4 · Quick check" }, { phase: "DONE", label: "Done" },
];
const PHASE_NAME: Record<string, string> = { GUIDED: "Try with help", INDEPENDENT: "On your own", CHECK: "Quick check" };
const isErr = (r: unknown): r is Err => Boolean(r && typeof r === "object" && "error" in r);

export function LessonPlayer({ initial, actions, listHref }: { initial: LessonView; actions: Actions; listHref: string }) {
  const [view, setView] = useState(initial);
  const [shown, setShown] = useState<ClientQuestion | null>(initial.question);
  const [hints, setHints] = useState<HintStep[]>(initial.hints);
  const [value, setValue] = useState<AnswerValue>(null);
  const [feedback, setFeedback] = useState<{ fb: Feedback; credit: number } | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<T | Err>, ok: (r: T) => void) => start(async () => {
    try { const r = await fn(); if (isErr(r)) setError(r.error); else { setError(null); ok(r as T); } } catch { setError("No connection. Please try again."); }
  });
  const adopt = (v: LessonView) => { setView(v); if (!feedback) { setShown(v.question); setHints(v.hints); } };
  const next = () => { setFeedback(null); setValue(null); setShown(view.question); setHints(view.hints); window.scrollTo({ top: 0 }); };

  const c = view.content;
  const idx = STEPS.findIndex((x) => x.phase === view.phase);
  const organizerGate = view.organizer?.required && !view.organizer.value?.complete;
  const lastHint = hints[hints.length - 1];
  const highlight = lastHint?.sentence ? [lastHint.sentence] : [];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="border-b border-slate-200 pb-4">
        <a href={listHref} className="text-sm font-medium text-brand-teal hover:underline">← My lessons</a>
        <h1 className="text-2xl font-bold text-brand-navy">🧩 {view.skillName}</h1>
        <ol className="mt-3 flex flex-wrap gap-2" aria-label="Lesson steps">
          {STEPS.map((x, i) => <li key={x.phase} aria-current={i === idx ? "step" : undefined} className={`rounded-full px-3 py-1 text-sm font-semibold ${i === idx ? "bg-brand-navy text-white" : i < idx ? "bg-teal-100 text-teal-900" : "bg-slate-100 text-slate-500"}`}>{x.label}</li>)}
        </ol>
      </header>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}

      {view.lastResult && !feedback && view.phase !== "DONE" && view.lastResult.phase !== "GUIDED" && (
        <p role="status" className={`mt-4 rounded-xl p-3 ${view.lastResult.passed ? "bg-teal-50 text-teal-900" : "bg-amber-50 text-amber-900"}`}>
          {PHASE_NAME[view.lastResult.phase]}: {view.lastResult.correct} of {view.lastResult.total} correct. {view.lastResult.passed ? "Great, keep going!" : "Let's learn it a new way and try again."}
        </p>
      )}

      {view.reteach && view.phase !== "DONE" && (
        <section className="mt-4 rounded-2xl bg-indigo-50 p-4 ring-1 ring-indigo-200">
          <p className="text-sm font-bold uppercase tracking-wide text-indigo-700">A new way to learn it</p>
          <h2 className="text-lg font-bold text-indigo-950">{view.reteach.title}</h2>
          <p className="mt-1 text-slate-800">{view.reteach.how}</p>
        </section>
      )}

      {view.phase === "MODEL" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="text-xl font-bold text-brand-navy">What is it?</h2>
              <p className="mt-2 text-lg text-slate-800">{c.definition}</p>
              <ListenButton text={c.definition} label="Listen" className="mt-2" />
              <h3 className="mt-4 font-bold text-brand-navy">Steps</h3>
              <ol className="mt-2 list-decimal space-y-1 ps-6 text-slate-800">{c.steps.map((x) => <li key={x}>{x}</li>)}</ol>
              <h3 className="mt-4 font-bold text-brand-navy">Signal words</h3>
              <ul className="mt-2 flex flex-wrap gap-2">{c.signalWords.map((w) => <li key={w} className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">{w}</li>)}</ul>
            </section>
            <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="text-xl font-bold text-brand-navy">🧠 Listen to me think</h2>
              <ul className="mt-2 space-y-2 text-slate-800">{c.thinkAloud.map((x) => <li key={x} className="rounded-lg bg-slate-50 p-2">💭 {x}</li>)}</ul>
            </section>
          </div>
          <div className="min-w-0 space-y-4">
            <LessonPassage title={c.passage.title} text={c.passage.text} clues={view.model.answered ? c.passage.clues : []} numbered />
            <section className="rounded-2xl bg-white p-5 ring-1 ring-brand-teal/40">
              <h2 className="text-lg font-bold text-brand-navy">Your turn: {c.workedQuestion}</h2>
              {!view.model.answered ? (
                <>
                  <p className="mt-1 text-slate-700">Which sentence from the text helps you answer? Choose one.</p>
                  <fieldset className="mt-3 space-y-2" disabled={pending}>
                    <legend className="sr-only">Choose the clue sentence</legend>
                    {view.model.sentences.map((x, i) => (
                      <label key={i} className={`flex gap-2 rounded-xl border-2 px-3 py-2 ${pick === i ? "border-brand-teal bg-brand-teal/10" : "border-slate-200"}`}>
                        <input type="radio" name="clue" checked={pick === i} onChange={() => setPick(i)} className="mt-1 accent-brand-teal" /><span>{x}</span>
                      </label>
                    ))}
                  </fieldset>
                  <button type="button" disabled={pick === null || pending} onClick={() => run(() => actions.model(view.runId, pick!), (r) => adopt(r.view))} className="mt-3 rounded-xl bg-brand-navy px-6 py-2.5 font-semibold text-white disabled:opacity-40">Check</button>
                </>
              ) : (
                <div className="mt-2 space-y-2">
                  <p className={`font-semibold ${view.model.correct ? "text-teal-800" : "text-amber-800"}`}>{view.model.correct ? "✓ Yes! That sentence is a clue." : "Good try. The highlighted sentences are the clues."}</p>
                  <p><span className="font-semibold text-brand-navy">Answer: </span>{view.model.answer}</p>
                  <p><span className="font-semibold text-brand-navy">Why: </span>{view.model.why}</p>
                  <button type="button" disabled={pending} onClick={() => run(() => actions.begin(view.runId), (r) => adopt(r.view))} className="rounded-xl bg-brand-navy px-6 py-2.5 font-semibold text-white">Start trying with help →</button>
                </div>
              )}
            </section>
            {view.organizer && (
              <details className="rounded-2xl bg-indigo-50/50 p-2"><summary className="cursor-pointer p-2 font-semibold text-indigo-900">🗂️ Try the organizer with this text (optional)</summary>
                <Organizer spec={view.organizer.spec} initial={view.organizer.value} save={async (v) => { const r = await actions.organizer(view.runId, v); if (!isErr(r)) setView(r.view); return r; }} />
              </details>
            )}
          </div>
        </div>
      )}

      {(view.phase === "GUIDED" || view.phase === "INDEPENDENT" || view.phase === "CHECK" || feedback) && view.phase !== "MODEL" && (
        <div className="mt-6 space-y-4">
          {view.organizer && (organizerGate || view.phase !== "CHECK") && (
            organizerGate ? (
              <div><p className="mb-2 font-semibold text-indigo-900">First, fill in the organizer. Then the questions open.</p>
                <Organizer spec={view.organizer.spec} initial={view.organizer.value} save={async (v) => { const r = await actions.organizer(view.runId, v); if (!isErr(r)) { setView(r.view); setShown(r.view.question); } return r; }} /></div>
            ) : (
              <details className="rounded-2xl bg-indigo-50/50 p-2"><summary className="cursor-pointer p-2 font-semibold text-indigo-900">🗂️ My organizer</summary>
                <Organizer spec={view.organizer.spec} initial={view.organizer.value} save={async (v) => { const r = await actions.organizer(view.runId, v); if (!isErr(r)) setView(r.view); return r; }} />
              </details>
            )
          )}
          {view.showFrames && !organizerGate && (
            <p className="rounded-xl bg-amber-50 p-3 text-slate-800 ring-1 ring-amber-200"><span className="font-semibold">Sentence frames: </span>{c.frames.map((f) => `“${f}”`).join("  ·  ")}</p>
          )}
          {shown && !organizerGate && (
            <>
              {view.progress && !feedback && <p className="text-sm font-semibold text-slate-600">{PHASE_NAME[view.phase]} · question {view.progress.index} of {view.progress.total}</p>}
              <div className={shown.passage ? "grid gap-6 lg:grid-cols-2" : ""}>
                {shown.passage && <div className="min-w-0 lg:sticky lg:top-4 lg:max-h-[75vh] lg:overflow-y-auto"><LessonPassage title={shown.passage.title} text={shown.passage.text} clues={highlight} paragraph={lastHint?.paragraph ?? null} numbered /></div>}
                <div className="min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {shown.image && <img src={shown.image.url} alt={shown.image.alt} className="mb-4 max-h-[40vh] w-auto max-w-full rounded-xl ring-1 ring-slate-200" />}
                  {shown.type !== "DROPDOWN" && shown.type !== "FILL_BLANK" && <p className="text-xl font-medium leading-relaxed text-slate-900">{shown.stem}</p>}
                  <div className="mt-4"><AnswerInput q={shown} value={value} onChange={setValue} disabled={Boolean(feedback) || pending} /></div>
                  {!feedback && hints.length > 0 && (
                    <div className="mt-4 space-y-2">{hints.map((h) => <p key={h.level} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">💡 <span className="font-semibold">Hint {h.level}:</span> {h.text}</p>)}</div>
                  )}
                  {!feedback && (
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button type="button" disabled={!isAnswerReady(shown, value) || pending} onClick={() => run(() => actions.answer({ runId: view.runId, questionId: shown.questionId, response: (shown.type === "SENTENCE_ORDER" || shown.type === "WORD_ORDER") && !Array.isArray(value) ? shown.elements : value }), (r) => { setFeedback({ fb: r.feedback, credit: r.lessonCredit }); setView(r.view); })}
                        className="rounded-xl bg-brand-navy px-8 py-3 text-lg font-semibold text-white hover:bg-brand-purple disabled:opacity-40">{pending ? "Checking…" : "Check answer"}</button>
                      {view.canHint && view.phase === "GUIDED" && (
                        <button type="button" disabled={pending} onClick={() => run(() => actions.hint(view.runId, shown.questionId), (r) => { setHints((h) => [...h.filter((x) => x.level !== r.hint.level), r.hint]); setView(r.view); })}
                          className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-amber-900 hover:bg-amber-50">💡 {hints.length ? "Next hint" : "Hint"} <span className="text-xs">(each hint lowers the points)</span></button>
                      )}
                    </div>
                  )}
                  {feedback && (
                    <div className="mt-5">
                      <FeedbackPanel fb={feedback.fb} questionId={shown.questionId} />
                      {feedback.credit < feedback.fb.credit && <p className="mt-2 text-sm text-slate-600">Points for this answer: {Math.round(feedback.credit * 100)}% (hints used).</p>}
                      <button type="button" autoFocus onClick={next} className="mt-4 rounded-xl bg-brand-navy px-8 py-3 text-lg font-semibold text-white hover:bg-brand-purple">{view.phase === "DONE" ? "See my result" : "Next"}</button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {view.phase === "DONE" && !feedback && (
        <section className="mt-8 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          {view.outcome === "PASSED" ? (
            <><h2 className="text-2xl font-bold text-teal-800">🎉 You passed the quick check!</h2><p className="mt-2 text-lg">Quick check: {view.checkPct}%. You can use this skill on your own now.</p></>
          ) : (
            <><h2 className="text-2xl font-bold text-amber-900">You worked hard on this skill.</h2><p className="mt-2 text-lg">Your teacher will help you with it in a small group. Last quick check: {view.checkPct ?? "—"}%.</p></>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={listHref} className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">My lessons</a>
            <a href={`/practice/${view.skillId}`} className="rounded-xl border-2 border-slate-300 px-6 py-3 font-semibold text-brand-navy">Practise this skill</a>
            <a href={`${listHref}?skillId=${encodeURIComponent(view.skillId)}&again=1`} className="rounded-xl border-2 border-slate-300 px-6 py-3 font-semibold text-brand-navy">Take the lesson again</a>
          </div>
        </section>
      )}
    </div>
  );
}
