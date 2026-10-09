"use client";
import { useState } from "react";
import { AnswerInput, isAnswerReady, type AnswerValue } from "@/components/practice/answer-input";
import type { ClientQuestion } from "@/server/practice/items";
import type { Graded } from "@/server/teacher/worksheet";
import { answerQotdAction } from "@/app/student/qotd-actions";

/** ☀️ The question of the day: one question, one try, a few points. */
export function QuestionOfTheDay({ q, area, answered }: { q: ClientQuestion; area: string; answered: boolean }) {
  const [v, setV] = useState<AnswerValue>(null);
  const [res, setRes] = useState<Graded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (answered && !res) return <section className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-yellow-50 to-white p-5 ring-1 ring-yellow-200"><h2 className="font-bold text-brand-navy">☀️ Question of the Day</h2><p className="mt-1 text-slate-700">Done for today ✓ Come back tomorrow for a new one!</p></section>;
  return (
    <section className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-yellow-50 to-white p-5 ring-1 ring-yellow-200">
      <h2 className="font-bold text-brand-navy">☀️ Question of the day <span className="text-sm font-normal text-slate-500">· {area} · +5 points</span></h2>
      {q.passage && <details className="mt-2 rounded-xl bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">📖 {q.passage.title || "Read the text"}</summary><p className="mt-2 whitespace-pre-line">{q.passage.text}</p></details>}
      {q.type !== "DROPDOWN" && q.type !== "FILL_BLANK" && <p className="mt-2 text-lg font-medium text-slate-900">{q.stem}</p>}
      <div className="mt-3"><AnswerInput q={q} value={v} onChange={setV} disabled={Boolean(res) || busy} /></div>
      {res ? <p className={`mt-3 font-semibold ${res.correct ? "text-emerald-700" : "text-red-700"}`}>{res.correct ? "🎉 Correct! +5 points" : `Not this time. The answer: ${res.correctAnswer}`} <span className="font-normal text-slate-600">{res.why}</span></p>
        : <button type="button" disabled={busy || !isAnswerReady(q, v)} onClick={async () => { setBusy(true); const r = await answerQotdAction(q.questionId, (q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") && !Array.isArray(v) ? q.elements : v); setBusy(false); if (r.ok) setRes(r.value); else setErr(r.error); }} className="mt-3 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Checking…" : "Check"}</button>}
      {err && <p role="alert" className="mt-2 text-red-700">{err}</p>}
    </section>
  );
}
