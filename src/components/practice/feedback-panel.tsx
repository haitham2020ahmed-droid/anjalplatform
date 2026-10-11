/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
import { useState } from "react";
import type { Feedback } from "../../server/practice/session";
import { ExplainButton } from "./explain-button";
import { AnswerFx } from "../feedback-fx/answer-fx";

/**
 * Immediate feedback after every answer: reinforcement when right. When wrong, the 🧑‍🏫 tutor speaks first: it names
 * the mistake, asks a guiding question and offers a hint and an example; the correct answer is shown only when the
 * student asks for it (guide first, then tell).
 */
export function FeedbackPanel({ fb, questionId, fxKey }: { fb: Feedback; questionId?: string; /** one answer (sound + phrase once) */ fxKey?: string }) {
  const ok = fb.correct;
  const [reveal, setReveal] = useState(!fb.tutor);
  const [more, setMore] = useState(false);
  return (
    <>
    <AnswerFx correct={ok} answerKey={fxKey ?? `${questionId ?? ""}|${fb.masteryBefore}|${fb.masteryAfter}|${fb.xp}`} className="mb-3" />
    <section role="status" aria-live="polite"
      className={["rounded-2xl border-2 p-5 shadow-sm", ok ? "animate-pop border-teal-300 bg-gradient-to-br bg-linear-to-br from-teal-50 to-white" : "animate-shake border-amber-300 bg-gradient-to-br bg-linear-to-br from-amber-50 to-white"].join(" ")}>
      <h2 className={["flex items-center gap-2 text-2xl font-bold", ok ? "text-teal-800" : "text-amber-900"].join(" ")}>
        <span aria-hidden="true">{ok ? "✓" : fb.credit > 0 ? "◐" : "✗"}</span>{ok ? "Correct!" : fb.credit > 0 ? "Partly right." : "Not quite."}
      </h2>
      {ok ? (
        <p className="mt-2 text-lg text-slate-800">{fb.whyCorrect}</p>
      ) : (
        <>
          {fb.tutor && (
            <div className="mt-3 rounded-2xl bg-white/80 p-4 ring-1 ring-indigo-200" data-testid="tutor">
              <p className="text-sm font-bold uppercase tracking-wider text-indigo-700">🧑‍🏫 Your tutor</p>
              <p className="mt-1 text-lg text-slate-900">{fb.tutor.message}</p>
              <p className="mt-2 font-semibold text-brand-navy">🤔 {fb.tutor.guidingQuestion}</p>
              {more ? (
                <div className="mt-2 space-y-1.5 text-slate-800">
                  <p><span className="font-semibold text-brand-purple">💡 Hint: </span>{fb.tutor.hint}</p>
                  <p><span className="font-semibold text-brand-purple">📘 Example: </span>{fb.tutor.example}</p>
                  <p><span className="font-semibold text-brand-purple">🧭 Next time: </span>{fb.tutor.strategy}</p>
                </div>
              ) : (
                <button type="button" onClick={() => setMore(true)} className="mt-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-800 ring-1 ring-indigo-200">💡 Hint and an example</button>
              )}
            </div>
          )}
          {reveal ? (
            <dl className="mt-3 space-y-3 text-lg">
              <div><dt className="text-sm font-semibold text-slate-600">Your answer</dt><dd className="text-slate-900">{fb.yourAnswer}</dd></div>
              <div><dt className="text-sm font-semibold text-slate-600">Correct answer</dt><dd className="font-semibold text-brand-navy">{fb.correctAnswer}</dd></div>
              <div><dt className="text-sm font-semibold text-slate-600">Why</dt><dd className="text-slate-900">{fb.whyCorrect}</dd></div>
              {fb.whyYoursIsWrong && !fb.tutor && <div><dt className="text-sm font-semibold text-slate-600">Why your answer doesn&apos;t fit</dt><dd className="text-slate-900">{fb.whyYoursIsWrong}</dd></div>}
            </dl>
          ) : (
            <button type="button" onClick={() => setReveal(true)} className="mt-3 rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">I thought about it — show the answer</button>
          )}
        </>
      )}
      {fb.tip && (ok || reveal) && <p className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-slate-800"><span className="font-semibold text-brand-purple">Tip: </span>{fb.tip}</p>}
      {!ok && reveal && questionId && <ExplainButton key={questionId} questionId={questionId} />}
      {fb.rapidGuess && <p className="mt-3 text-slate-700">That was very quick. Take your time to read each question; careful answers count more.</p>}
      <p className="mt-4 text-sm text-slate-600">
        Mastery {fb.masteryBefore} → <span className="font-semibold text-brand-navy">{fb.masteryAfter}</span>{fb.xp > 0 ? `, +${fb.xp} XP` : ""}
      </p>
    </section>
    </>
  );
}
