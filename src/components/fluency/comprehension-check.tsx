"use client";
import { useState } from "react";
import { answerComprehensionAction, startComprehensionAction } from "@/app/student/fluency-coach/actions";
import type { ClientQuiz, ComprehensionResult } from "@/server/fluency/comprehension";

/** 🧠 2–3 quick questions after a reading: reading is for understanding, not only for speed. */
export function ComprehensionCheck({ practiceId }: { practiceId: string }) {
  const [quiz, setQuiz] = useState<ClientQuiz | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<ComprehensionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setBusy(true); setError("");
    const r = await startComprehensionAction(practiceId).catch(() => ({ ok: false as const, error: "No connection. Try again." }));
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setQuiz(r.quiz); setAnswers(r.quiz.questions.map(() => null));
  }
  async function submit() {
    if (answers.some((a) => a === null)) { setError("Answer every question first."); return; }
    setBusy(true); setError("");
    const r = await answerComprehensionAction(practiceId, answers as number[]).catch(() => ({ ok: false as const, error: "No connection. Try again." }));
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setResult(r.result);
  }

  return (
    <section className="rounded-3xl bg-violet-50 p-6 ring-1 ring-violet-200">
      <h2 className="text-lg font-bold text-violet-900">🧠 Did you understand it?</h2>
      {!quiz && !result && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-violet-900">Answer 2–3 quick questions about what you just read. Good readers read to understand!</p>
          <button onClick={open} disabled={busy} className="rounded-2xl bg-violet-700 px-5 py-2.5 font-bold text-white hover:bg-violet-800 disabled:opacity-60">{busy ? "Getting the questions…" : "Start the questions"}</button>
        </div>
      )}
      {quiz && !result && (
        <div className="mt-3 space-y-4">
          {quiz.questions.map((q, i) => (
            <fieldset key={i} className="rounded-2xl bg-white p-4 ring-1 ring-violet-100">
              <legend className="sr-only">Question {i + 1}</legend>
              <p className="font-semibold text-slate-900">{i + 1}. {q.stem}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {q.options.map((o, k) => (
                  <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 ring-1 ${answers[i] === k ? "bg-violet-100 ring-violet-400" : "ring-slate-200 hover:ring-violet-300"}`}>
                    <input type="radio" name={`q${i}`} className="mt-1" checked={answers[i] === k} onChange={() => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))} />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button onClick={submit} disabled={busy} className="rounded-2xl bg-violet-700 px-6 py-2.5 font-bold text-white hover:bg-violet-800 disabled:opacity-60">{busy ? "Checking…" : "Check my answers"}</button>
        </div>
      )}
      {result && (
        <div className="mt-3 space-y-3">
          <p className="text-2xl font-extrabold text-violet-900">{result.correct} of {result.total} correct <span className="text-lg font-semibold">({result.pct}%)</span></p>
          <p className={`rounded-xl px-3 py-2 text-sm ${result.flag ? "bg-amber-100 text-amber-950" : "bg-white text-violet-900"}`}>{result.flag ? "⚠️ " : "✅ "}{result.message}</p>
          <ul className="space-y-1 text-sm">{result.review.map((r, i) => <li key={i} className="rounded-xl bg-white px-3 py-2 ring-1 ring-violet-100">{r.right ? "✅" : "❌"} {r.stem} <span className="block text-xs text-slate-600">Answer: <b>{r.answer}</b></span></li>)}</ul>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-rose-700">{error}</p>}
    </section>
  );
}
