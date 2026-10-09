/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { Feedback } from "../../server/practice/session";
import { ExplainButton } from "./explain-button";

/** Immediate feedback after every answer: reinforcement when right, a full explanation when not. */
export function FeedbackPanel({ fb, questionId }: { fb: Feedback; questionId?: string }) {
  const ok = fb.correct;
  return (
    <section role="status" aria-live="polite"
      className={["rounded-2xl border-2 p-5 shadow-sm", ok ? "animate-pop border-teal-300 bg-gradient-to-br bg-linear-to-br from-teal-50 to-white" : "animate-shake border-amber-300 bg-gradient-to-br bg-linear-to-br from-amber-50 to-white"].join(" ")}>
      <h2 className={["flex items-center gap-2 text-2xl font-bold", ok ? "text-teal-800" : "text-amber-900"].join(" ")}>
        <span aria-hidden="true">{ok ? "✓" : "✗"}</span>{ok ? "Correct!" : "Not quite."}
      </h2>
      {ok ? (
        <p className="mt-2 text-lg text-slate-800">{fb.whyCorrect}</p>
      ) : (
        <dl className="mt-3 space-y-3 text-lg">
          <div><dt className="text-sm font-semibold text-slate-600">Your answer</dt><dd className="text-slate-900">{fb.yourAnswer}</dd></div>
          <div><dt className="text-sm font-semibold text-slate-600">Correct answer</dt><dd className="font-semibold text-brand-navy">{fb.correctAnswer}</dd></div>
          <div><dt className="text-sm font-semibold text-slate-600">Why</dt><dd className="text-slate-900">{fb.whyCorrect}</dd></div>
          {fb.whyYoursIsWrong && <div><dt className="text-sm font-semibold text-slate-600">Why your answer doesn&apos;t fit</dt><dd className="text-slate-900">{fb.whyYoursIsWrong}</dd></div>}
        </dl>
      )}
      {fb.tip && <p className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-slate-800"><span className="font-semibold text-brand-purple">Tip: </span>{fb.tip}</p>}
      {!ok && questionId && <ExplainButton key={questionId} questionId={questionId} />}
      {fb.rapidGuess && <p className="mt-3 text-slate-700">That was very quick. Take your time to read each question; careful answers count more.</p>}
      <p className="mt-4 text-sm text-slate-600">
        Mastery {fb.masteryBefore} → <span className="font-semibold text-brand-navy">{fb.masteryAfter}</span>{fb.xp > 0 ? `, +${fb.xp} XP` : ""}
      </p>
    </section>
  );
}
